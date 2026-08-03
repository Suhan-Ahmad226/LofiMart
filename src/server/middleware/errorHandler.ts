import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ValidationError extends AppError {
  public readonly details: Record<string, string[]>;

  constructor(message: string = 'Validation failed', details: Record<string, string[]> = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number = 60_000) {
    super('Too many requests', 429, 'RATE_LIMITED');
    this.retryAfterMs = retryAfterMs;
  }
}

function handlePrismaError(error: Error): AppError {
  const message = error.message.toLowerCase();

  if (message.includes('record to update not found') || message.includes('record to connect not found')) {
    return new NotFoundError('Record');
  }

  if (message.includes('unique constraint') || message.includes('uniqueviolation')) {
    return new ConflictError('A record with this data already exists');
  }

  if (message.includes('foreign key constraint') || message.includes('foreignkeyviolation')) {
    return new ValidationError('Referenced record does not exist');
  }

  if (message.includes('invalid input') || message.includes('invalidcolumntype')) {
    return new ValidationError('Invalid data format');
  }

  return new AppError('Database error', 500, 'DATABASE_ERROR');
}

function handleJsonParseError(_error: Error): AppError {
  return new ValidationError('Invalid JSON in request body');
}

export function centralizedErrorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if ('type' in err && (err as Record<string, unknown>).type === 'entity.parse.failed') {
    appError = handleJsonParseError(err);
  } else if (err.name === 'PrismaClientKnownRequestError' || err.constructor?.name === 'PrismaClientKnownRequestError') {
    appError = handlePrismaError(err);
  } else if (err.message?.includes('ECONNREFUSED') || err.message?.includes('ETIMEDOUT')) {
    appError = new AppError('Service temporarily unavailable', 503, 'SERVICE_UNAVAILABLE');
  } else {
    appError = new AppError(
      process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      500,
      'INTERNAL_ERROR',
    );
  }

  const logPayload = {
    statusCode: appError.statusCode,
    code: appError.code,
    message: appError.message,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    requestId: req.headers['x-request-id'],
    ...(appError.statusCode >= 500 && { stack: err.stack }),
  };

  if (appError.statusCode >= 500) {
    logger.error('server.error', logPayload);
  } else {
    logger.warn('client.error', logPayload);
  }

  const responseBody: Record<string, unknown> = {
    error: appError.message,
    code: appError.code,
  };

  if (appError instanceof ValidationError && Object.keys(appError.details).length > 0) {
    responseBody.details = appError.details;
  }

  const responseHeaders: Record<string, string> = {};
  if (appError instanceof RateLimitError) {
    responseHeaders['Retry-After'] = String(Math.ceil(appError.retryAfterMs / 1000));
  }

  res.status(appError.statusCode).set(responseHeaders).json(responseBody);
}
