import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createServerClient, getClaims } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({ createServerClient }));

import { middleware } from '@/middleware';

describe('middleware Supabase session refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });
    createServerClient.mockReturnValue({ auth: { getClaims } });
  });

  it('does not repeat Supabase claims verification for bearer-authenticated dashboard APIs', async () => {
    const request = new NextRequest('http://localhost/api/admin/stats', {
      headers: { authorization: 'Bearer verified-by-the-route' },
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
  });

  it('keeps Supabase cookie claims refresh for requests without a bearer token', async () => {
    const request = new NextRequest('http://localhost/seller/dashboard', {
      headers: { cookie: 'sb-example-auth-token=valid-session-cookie' },
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(createServerClient).toHaveBeenCalledOnce();
    expect(getClaims).toHaveBeenCalledOnce();
  });
});
