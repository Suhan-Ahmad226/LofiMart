import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumePasswordResetSession,
  createPasswordResetSession,
} from '@/features/auth/server/reset-session';
import { resetPasswordWithVerifiedSession } from '@/features/auth/server/auth-service';

const redisStore = vi.hoisted(() => new Map<string, string>());
const prismaMock = vi.hoisted(() => ({
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  loginActivity: {
    updateMany: vi.fn(),
  },
}));
const syncSupabasePasswordMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/shared/services/messaging/redis', () => ({
  ensureRedis: vi.fn(async () => ({
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    getdel: vi.fn(async (key: string) => {
      const value = redisStore.get(key) ?? null;
      redisStore.delete(key);
      return value;
    }),
    del: vi.fn(async (key: string) => {
      const existed = redisStore.delete(key);
      return existed ? 1 : 0;
    }),
  })),
}));

vi.mock('@/lib/env', () => ({
  getServerEnv: vi.fn(() => ({
    APP_ENV: 'development',
    REDIS_PREFIX: 'test',
    RATE_LIMIT_PREFIX: 'ratelimit',
  })),
}));

vi.mock('@/lib/server', () => ({
  prisma: prismaMock,
}));

vi.mock('@/features/auth/services/password-sync', () => ({
  syncSupabasePassword: syncSupabasePasswordMock,
}));

describe('password reset sessions', () => {
  beforeEach(() => {
    redisStore.clear();
    vi.clearAllMocks();
    prismaMock.loginActivity.updateMany.mockResolvedValue({ count: 0 });
  });

  it('creates an opaque single-use reset session', async () => {
    const session = await createPasswordResetSession({
      email: 'buyer@example.com',
      supabaseAuthId: 'supabase-user-1',
    });

    expect(session.token).not.toContain('buyer@example.com');
    expect(session.expiresInSeconds).toBe(300);

    const consumed = await consumePasswordResetSession({
      token: session.token,
      email: 'buyer@example.com',
    });

    expect(consumed).toMatchObject({
      email: 'buyer@example.com',
      supabaseAuthId: 'supabase-user-1',
    });

    await expect(
      consumePasswordResetSession({
        token: session.token,
        email: 'buyer@example.com',
      }),
    ).resolves.toBeNull();
  });

  it('does not allow reset without a verified reset session', async () => {
    const result = await resetPasswordWithVerifiedSession({
      identifier: 'buyer@example.com',
      resetSessionToken: null,
      newPassword: 'Newpass123',
    });

    expect(result).toEqual({
      success: false,
      error: 'Your password reset session has expired. Please request a new verification code.',
      code: 'RESET_SESSION_INVALID',
    });
    expect(syncSupabasePasswordMock).not.toHaveBeenCalled();
  });

  it('updates the Supabase password after consuming a valid reset session', async () => {
    const session = await createPasswordResetSession({
      email: 'buyer@example.com',
      supabaseAuthId: 'supabase-user-1',
    });

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      supabaseAuthId: 'supabase-user-1',
    });
    syncSupabasePasswordMock.mockResolvedValue({ ok: true });

    const result = await resetPasswordWithVerifiedSession({
      identifier: 'buyer@example.com',
      resetSessionToken: session.token,
      newPassword: 'Newpass123',
    });

    expect(result).toEqual({ success: true });
    expect(syncSupabasePasswordMock).toHaveBeenCalledWith({
      supabaseAuthId: 'supabase-user-1',
      newPassword: 'Newpass123',
    });
    expect(prismaMock.loginActivity.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    await expect(
      resetPasswordWithVerifiedSession({
        identifier: 'buyer@example.com',
        resetSessionToken: session.token,
        newPassword: 'Another123',
      }),
    ).resolves.toMatchObject({
      success: false,
      code: 'RESET_SESSION_INVALID',
    });
  });

  it('supports phone identifiers by binding the reset session to the account email', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ email: 'buyer@example.com' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      supabaseAuthId: 'supabase-user-1',
    });
    syncSupabasePasswordMock.mockResolvedValue({ ok: true });

    const session = await createPasswordResetSession({
      email: 'buyer@example.com',
      supabaseAuthId: 'supabase-user-1',
    });

    const result = await resetPasswordWithVerifiedSession({
      identifier: '01712345678',
      resetSessionToken: session.token,
      newPassword: 'Newpass123',
    });

    expect(result).toEqual({ success: true });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { phone: '01712345678' },
      select: { email: true },
    });
  });
});
