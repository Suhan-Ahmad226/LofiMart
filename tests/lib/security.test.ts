import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  RateLimitError,
} from '@/server/middleware/errorHandler';

describe('AppError', () => {
  it('creates error with default status 500', () => {
    const err = new AppError('test');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).toBe('test');
    expect(err.isOperational).toBe(true);
  });

  it('creates error with custom status and code', () => {
    const err = new AppError('custom', 418, 'TEAPOT');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
  });
});

describe('NotFoundError', () => {
  it('returns 404 with NOT_FOUND code', () => {
    const err = new NotFoundError('Product');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Product not found');
  });
});

describe('UnauthorizedError', () => {
  it('returns 401 with default message', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Unauthorized');
  });
});

describe('ForbiddenError', () => {
  it('returns 403 with default message', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Forbidden');
  });
});

describe('ValidationError', () => {
  it('returns 400 with details', () => {
    const details = { email: ['Invalid email'] };
    const err = new ValidationError('Bad input', details);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual(details);
  });
});

describe('ConflictError', () => {
  it('returns 409', () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});

describe('RateLimitError', () => {
  it('returns 429 with retryAfterMs', () => {
    const err = new RateLimitError(30_000);
    expect(err.statusCode).toBe(429);
    expect(err.retryAfterMs).toBe(30_000);
  });

  it('defaults to 60s retry', () => {
    const err = new RateLimitError();
    expect(err.retryAfterMs).toBe(60_000);
  });
});
