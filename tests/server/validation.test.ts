import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  commonSchemas,
} from '@/server/middleware/validation';

function createMockReq(data: any, source: 'body' | 'query' | 'params' = 'body') {
  const req: any = {};
  if (source === 'body') req.body = data;
  if (source === 'query') req.query = data;
  if (source === 'params') req.params = data;
  return req;
}

function createMockRes() {
  return { setHeader: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
}

describe('validate middleware', () => {
  it('calls next on valid data', () => {
    const schema = z.object({ name: z.string() });
    const req = createMockReq({ name: 'test' });
    const res = createMockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body.name).toBe('test');
  });

  it('calls next with ValidationError on invalid data', () => {
    const schema = z.object({ name: z.string() });
    const req = createMockReq({ name: 123 });
    const res = createMockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].constructor.name).toBe('ValidationError');
    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });
});

describe('validateBody', () => {
  it('validates req.body', () => {
    const schema = z.object({ email: z.string().email() });
    const req = createMockReq({ email: 'bad' });
    const res = createMockRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].details.email).toBeDefined();
  });
});

describe('validateQuery', () => {
  it('validates req.query', () => {
    const schema = z.object({ page: z.coerce.number() });
    const req = createMockReq({ page: '5' }, 'query');
    const res = createMockRes();
    const next = vi.fn();

    validateQuery(schema)(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('validateParams', () => {
  it('validates req.params', () => {
    const schema = z.object({ id: z.string().uuid() });
    const req = createMockReq({ id: 'not-a-uuid' }, 'params');
    const res = createMockRes();
    const next = vi.fn();

    validateParams(schema)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe('VALIDATION_ERROR');
  });
});

describe('commonSchemas', () => {
  it('idParam validates string id', () => {
    expect(commonSchemas.idParam.safeParse({ id: '123' }).success).toBe(true);
    expect(commonSchemas.idParam.safeParse({ id: '' }).success).toBe(false);
  });

  it('paginationQuery has defaults', () => {
    const result = commonSchemas.paginationQuery.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sort).toBe('desc');
    }
  });

  it('searchQuery requires q parameter', () => {
    expect(commonSchemas.searchQuery.safeParse({ q: 'test' }).success).toBe(true);
    expect(commonSchemas.searchQuery.safeParse({}).success).toBe(false);
  });

  it('emailBody validates email format', () => {
    expect(commonSchemas.emailBody.safeParse({ email: 'test@example.com' }).success).toBe(true);
    expect(commonSchemas.emailBody.safeParse({ email: 'bad' }).success).toBe(false);
  });

  it('uuidParam validates UUID format', () => {
    expect(commonSchemas.uuidParam.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000' }).success).toBe(true);
    expect(commonSchemas.uuidParam.safeParse({ id: 'not-uuid' }).success).toBe(false);
  });

  it('slugParam validates slug string', () => {
    expect(commonSchemas.slugParam.safeParse({ slug: 'my-product' }).success).toBe(true);
    expect(commonSchemas.slugParam.safeParse({ slug: '' }).success).toBe(false);
  });
});
