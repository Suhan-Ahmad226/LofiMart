import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { createClient, findUser } = vi.hoisted(() => ({
  createClient: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock('@/lib/server', () => ({
  createClient,
  prisma: { user: { findUnique: findUser } },
}));

import { getCurrentUser, requireApiUser } from '@/server/auth';

const AUTH_UID = 'auth-uid-1';

function mockSupabase(result: { user?: { id: string } | null; error?: unknown }) {
  const getUser = vi.fn(async () => ({
    data: { user: result.user ?? null },
    error: result.error ?? null,
  }));
  createClient.mockResolvedValue({ auth: { getUser } });
  return getUser;
}

function mockDbUser(overrides: Record<string, unknown> = {}) {
  findUser.mockResolvedValue({
    id: 'user-1',
    role: 'seller',
    email: 'seller@example.com',
    phone: null,
    name: 'Seller',
    tenantId: null,
    isBlocked: false,
    deactivatedAt: null,
    ...overrides,
  });
}

function apiRequest(init?: { bearer?: string; cookieToken?: string }) {
  const headers = new Headers();
  if (init?.bearer) headers.set('authorization', `Bearer ${init.bearer}`);
  if (init?.cookieToken) headers.set('cookie', `access_token=${init.cookieToken}`);
  return new NextRequest('http://localhost/api/seller/stats', { headers });
}

describe('getCurrentUser bearer token support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbUser();
  });

  it('validates the Authorization bearer token against Supabase', async () => {
    const getUser = mockSupabase({ user: { id: AUTH_UID } });

    const user = await getCurrentUser(apiRequest({ bearer: 'jwt-abc' }));

    expect(getUser).toHaveBeenCalledWith('jwt-abc');
    expect(findUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: { supabaseAuthId: AUTH_UID } }),
    );
    expect(user).toMatchObject({ id: 'user-1', role: 'seller' });
  });

  it('prefers the bearer header over the access_token cookie', async () => {
    const getUser = mockSupabase({ user: { id: AUTH_UID } });

    await getCurrentUser(apiRequest({ bearer: 'jwt-header', cookieToken: 'jwt-cookie' }));

    expect(getUser).toHaveBeenCalledWith('jwt-header');
  });

  it('ignores the legacy access_token cookie when no bearer header is sent', async () => {
    const getUser = mockSupabase({ user: { id: AUTH_UID } });

    await getCurrentUser(apiRequest({ cookieToken: 'jwt-cookie' }));

    expect(getUser).toHaveBeenCalledWith();
  });

  it('falls back to the cookie session when called with no request', async () => {
    const getUser = mockSupabase({ user: { id: AUTH_UID } });

    await getCurrentUser();

    expect(getUser).toHaveBeenCalledWith();
  });

  it('ignores a non-bearer authorization scheme', async () => {
    const getUser = mockSupabase({ user: { id: AUTH_UID } });

    await getCurrentUser(apiRequest({ cookieToken: 'jwt-cookie' }));
    const req = new NextRequest('http://localhost/api/seller/stats', {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    await getCurrentUser(req);

    expect(getUser).toHaveBeenLastCalledWith();
  });

  it('returns null when Supabase rejects the token', async () => {
    mockSupabase({ user: null, error: { message: 'invalid jwt' } });

    await expect(getCurrentUser(apiRequest({ bearer: 'expired' }))).resolves.toBeNull();
  });

  it('returns null for a blocked seller', async () => {
    mockSupabase({ user: { id: AUTH_UID } });
    mockDbUser({ isBlocked: true });

    await expect(getCurrentUser(apiRequest({ bearer: 'jwt-abc' }))).resolves.toBeNull();
  });

  it('returns null for a deactivated seller', async () => {
    mockSupabase({ user: { id: AUTH_UID } });
    mockDbUser({ deactivatedAt: new Date() });

    await expect(getCurrentUser(apiRequest({ bearer: 'jwt-abc' }))).resolves.toBeNull();
  });

  it('returns null for a role the app does not recognise', async () => {
    mockSupabase({ user: { id: AUTH_UID } });
    mockDbUser({ role: 'superuser' });

    await expect(getCurrentUser(apiRequest({ bearer: 'jwt-abc' }))).resolves.toBeNull();
  });

  it('resolves the seller for requireApiUser with a bearer token', async () => {
    mockSupabase({ user: { id: AUTH_UID } });

    const result = await requireApiUser(apiRequest({ bearer: 'jwt-abc' }));

    expect(result).toMatchObject({ id: 'user-1', role: 'seller' });
  });

  it('responds 401 through requireApiUser when the token is missing', async () => {
    mockSupabase({ user: null });

    const result = await requireApiUser(apiRequest());

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    await expect((result as Response).json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
