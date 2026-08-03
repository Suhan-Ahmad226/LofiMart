import { describe, it, expect } from 'vitest';
import { apiSuccess, apiError } from '@/lib/api-response';

describe('apiSuccess', () => {
  it('returns NextResponse with ok=true and data', async () => {
    const response = apiSuccess({ name: 'test' });
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ name: 'test' });
  });

  it('includes meta when provided', async () => {
    const response = apiSuccess('created', undefined, { total: 10 });
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.meta).toEqual({ total: 10 });
  });

  it('excludes meta when not provided', async () => {
    const response = apiSuccess({ id: 1 });
    const body = await response.json();
    expect(body.meta).toBeUndefined();
  });
});

describe('apiError', () => {
  it('returns NextResponse with ok=false and error details', async () => {
    const response = apiError('NOT_FOUND', 'Something went wrong');
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Something went wrong');
  });

  it('includes details when provided', async () => {
    const response = apiError('VALIDATION', 'Bad input', 400, { field: 'email' });
    const body = await response.json();
    expect(body.error.details).toEqual({ field: 'email' });
  });

  it('defaults to 400 status', () => {
    const response = apiError('BAD_REQUEST', 'Invalid');
    expect(response.status).toBe(400);
  });

  it('uses custom status', () => {
    const response = apiError('NOT_FOUND', 'Missing', 404);
    expect(response.status).toBe(404);
  });
});
