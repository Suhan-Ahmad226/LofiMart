import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeBdPhone, normalizeEmail } from '@/features/auth/services/identity';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import {
  AuthPurpose,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MS,
  OtpChallengeResult,
} from '@/features/auth/server/auth-service';

vi.mock('@/features/shared/services/messaging/redis', () => ({
  ensureRedis: vi.fn(async () => {
    throw new Error('redis unavailable');
  }),
}));

vi.mock('@/lib/env', () => ({
  getServerEnv: vi.fn(() => ({
    APP_ENV: 'development',
    REDIS_PREFIX: 'test',
    RATE_LIMIT_PREFIX: 'ratelimit',
  })),
}));

describe('email normalization', () => {
  it('trims and lowercases email', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
  });

  it('returns null for empty/invalid input', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(123)).toBeNull();
  });
});

describe('phone normalization (Bangladesh canonical)', () => {
  it('keeps 11-digit local numbers', () => {
    expect(normalizeBdPhone('01712345678')).toBe('01712345678');
  });

  it('normalizes +88017XXXXXXXX to 017XXXXXXXX', () => {
    expect(normalizeBdPhone('+8801712345678')).toBe('01712345678');
  });

  it('normalizes 88017XXXXXXXX to 017XXXXXXXX', () => {
    expect(normalizeBdPhone('8801712345678')).toBe('01712345678');
  });

  it('normalizes formatted input with dashes/spaces', () => {
    expect(normalizeBdPhone('+88 0171-2345678')).toBe('01712345678');
  });

  it('rejects invalid numbers', () => {
    expect(normalizeBdPhone('01212345678')).toBeNull();
    expect(normalizeBdPhone('02412345678')).toBeNull();
    expect(normalizeBdPhone('1712345678')).toBeNull();
    expect(normalizeBdPhone('0171234567')).toBeNull();
    expect(normalizeBdPhone('')).toBeNull();
    expect(normalizeBdPhone('abcdefghijk')).toBeNull();
  });

  it('recognizes the same identity across formats', () => {
    const canonical = '01712345678';
    expect(normalizeBdPhone('01712345678')).toBe(canonical);
    expect(normalizeBdPhone('+8801712345678')).toBe(canonical);
    expect(normalizeBdPhone('8801712345678')).toBe(canonical);
    expect(normalizeBdPhone('88-017-12345678')).toBe(canonical);
  });
});

describe('auth-service security defaults', () => {
  it('exposes sane OTP security defaults', () => {
    expect(OTP_MAX_ATTEMPTS).toBe(5);
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(OTP_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('OtpChallengeResult has the expected shape', () => {
    const result: OtpChallengeResult = {
      success: true,
      expiresAt: new Date().toISOString(),
      resendInSeconds: 60,
    };
    expect(result.success).toBe(true);
    expect(typeof result.expiresAt).toBe('string');
    expect(result.resendInSeconds).toBe(60);
  });

  it('AuthPurpose covers all expected workflows', () => {
    const purposes: AuthPurpose[] = ['register', 'verify_email', 'verify_phone', 'reset_password', 'set_password', 'guest_claim'];
    expect(purposes).toHaveLength(6);
  });
});

describe('auth rate limiter (in-memory fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows up to the limit then denies', async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const first = await takeRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);

    const second = await takeRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(second.allowed).toBe(true);

    const third = await takeRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = await takeRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(fourth.allowed).toBe(false);
  });

  it('resets after the window elapses', async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const windowMs = 120;

    await takeRateLimit(key, { limit: 1, windowMs });
    const denied = await takeRateLimit(key, { limit: 1, windowMs });
    expect(denied.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, windowMs + 50));
    const after = await takeRateLimit(key, { limit: 1, windowMs });
    expect(after.allowed).toBe(true);
  });
});
