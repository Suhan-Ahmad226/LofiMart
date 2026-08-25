export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational: boolean;
  readonly details?: Record<string, unknown>;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    options: {
      isOperational?: boolean;
      details?: Record<string, unknown>;
      retryAfterMs?: number;
    } = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;
    this.retryAfterMs = options.retryAfterMs;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ValidationError extends AppError {
  constructor(
    message = 'Validation failed',
    details?: Record<string, unknown>,
  ) {
    super(message, 400, 'VALIDATION_ERROR', { details });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs = 60_000) {
    super('Too many requests', 429, 'RATE_LIMITED', { retryAfterMs });
    this.retryAfterMs = retryAfterMs;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toErrorResponse(error: unknown): {
  statusCode: number;
  body: { error: string; code: string; details?: Record<string, unknown> };
} {
  if (isAppError(error)) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  return { statusCode: 500, body: { error: message, code: 'INTERNAL_ERROR' } };
}

type NextFunction = (error?: unknown) => void;

interface ExpressLikeRequest {
  method?: string;
  path?: string;
}

interface ExpressLikeResponse {
  headersSent?: boolean;
  setHeader(name: string, value: string): unknown;
  status(code: number): { json(payload: unknown): unknown };
}

export function errorHandlerMiddleware(
  error: unknown,
  req: ExpressLikeRequest,
  res: ExpressLikeResponse,
  next: NextFunction,
): void {
  const { statusCode, body } = toErrorResponse(error);

  if (!Number.isFinite(statusCode) || res.headersSent) {
    next(error);
    return;
  }

  if (statusCode >= 500) {
    console.error(`[error] ${req.method ?? ''} ${req.path ?? ''}:`, error);
  }

  res.setHeader('Content-Type', 'application/json');
  if (error instanceof RateLimitError) {
    res.setHeader('Retry-After', String(Math.ceil(error.retryAfterMs / 1000)));
  }
  res.status(statusCode).json(body);
}
