/* @vitest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, supabaseMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    loginActivity: {
      updateMany: vi.fn(),
    },
  },
  supabaseMock: {
    auth: {
      admin: {
        createUser: vi.fn(),
        updateUserById: vi.fn(),
        deleteUser: vi.fn(),
      },
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      getUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock('@/lib/server', () => ({ prisma: prismaMock }));
vi.mock('@/app/api/auth/supabase/shared', () => ({
  createSupabaseServerClient: vi.fn(() => supabaseMock),
}));
vi.mock('@/features/auth/services/password-sync', () => ({
  syncSupabasePassword: vi.fn(),
}));
vi.mock('@/features/auth/server/reset-session', () => ({
  consumePasswordResetSession: vi.fn(),
}));
vi.mock('@/lib/client', () => ({
  createClient: vi.fn(),
}));

import { registerUser, isAuthPurpose, AUTH_PURPOSES } from '@/features/auth/server/auth-service';
import { createClient } from '@/lib/client';
import { UserProvider, useUser } from '@/features/shared/state/UserContext';

function AuthProbe() {
  const { user, token, refreshToken, isAuthenticated, isReady } = useUser();

  return (
    <div>
      <span data-testid="ready">{String(isReady)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{user?.name ?? ''}</span>
      <span data-testid="token">{token ?? ''}</span>
      <span data-testid="refresh">{refreshToken ?? ''}</span>
    </div>
  );
}

describe('auth hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'local-user-1' });

    supabaseMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'supabase-user-1' } },
      error: null,
    });
    supabaseMock.auth.admin.deleteUser.mockResolvedValue({ error: null });

    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'supabase-user-1' } },
      error: null,
    });
    supabaseMock.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token-1',
          refresh_token: 'refresh-token-1',
          user: { id: 'supabase-user-1' },
        },
      },
      error: null,
    });
    supabaseMock.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            user: {
              id: 'local-user-1',
              name: 'Fresh Server Profile',
              email: 'fresh@example.com',
              role: 'customer',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
  });

  it('removes the newly created Supabase user when local profile creation fails', async () => {
    prismaMock.user.create.mockRejectedValue(new Error('database unavailable'));

    await expect(
      registerUser({
        email: 'new@example.com',
        name: 'New User',
        role: 'customer',
        phone: '01712345678',
        password: 'Password123',
      }),
    ).rejects.toThrow('database unavailable');

    expect(supabaseMock.auth.admin.deleteUser).toHaveBeenCalledWith('supabase-user-1');
  });

  it('also cleans up the Supabase user on a local unique constraint race', async () => {
    prismaMock.user.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      registerUser({
        email: 'raced@example.com',
        name: 'Raced User',
        role: 'customer',
        phone: '01712345678',
        password: 'Password123',
      }),
    ).resolves.toMatchObject({
      success: false,
      code: 'ACCOUNT_EXISTS',
    });

    expect(supabaseMock.auth.admin.deleteUser).toHaveBeenCalledWith('supabase-user-1');
  });

  it('accepts only the six supported OTP purposes at runtime', () => {
    expect(AUTH_PURPOSES).toEqual([
      'register',
      'verify_email',
      'reset_password',
      'set_password',
      'verify_phone',
      'guest_claim',
    ]);

    for (const purpose of AUTH_PURPOSES) {
      expect(isAuthPurpose(purpose)).toBe(true);
    }

    expect(isAuthPurpose('admin')).toBe(false);
    expect(isAuthPurpose('reset')).toBe(false);
    expect(isAuthPurpose('')).toBe(false);
  });

  it('uses the fresh server profile and in-memory Supabase session instead of custom localStorage auth state', async () => {
    const staleUser = {
      id: 'stale-user',
      name: 'Stale Local User',
      email: 'stale@example.com',
      role: 'admin',
    };

    localStorage.setItem('user', JSON.stringify(staleUser));
    localStorage.setItem('token', 'stale-token');
    localStorage.setItem('refreshToken', 'stale-refresh-token');

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

    vi.mocked(createClient).mockReturnValue(supabaseMock as never);

    render(
      <UserProvider>
        <AuthProbe />
      </UserProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
      expect(screen.getByTestId('user')).toHaveTextContent('Fresh Server Profile');
      expect(screen.getByTestId('token')).toHaveTextContent('access-token-1');
      expect(screen.getByTestId('refresh')).toHaveTextContent('refresh-token-1');
    });

    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user')).not.toHaveTextContent('Stale Local User');
    expect(localStorage.getItem('user')).toBe(JSON.stringify(staleUser));
    expect(localStorage.getItem('token')).toBe('stale-token');
    expect(localStorage.getItem('refreshToken')).toBe('stale-refresh-token');
    expect(setItemSpy).not.toHaveBeenCalledWith('user', expect.anything());
    expect(setItemSpy).not.toHaveBeenCalledWith('token', expect.anything());
    expect(setItemSpy).not.toHaveBeenCalledWith('refreshToken', expect.anything());
    expect(removeItemSpy).not.toHaveBeenCalledWith('user');
    expect(removeItemSpy).not.toHaveBeenCalledWith('token');
    expect(removeItemSpy).not.toHaveBeenCalledWith('refreshToken');

    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });
});
