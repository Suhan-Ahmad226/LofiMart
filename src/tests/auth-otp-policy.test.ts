import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The OTP policy is the server-side guard around every verification code:
 * 6 digits, a five minute life, five guesses and a sixty second resend
 * cooldown. These tests pin that behaviour plus the post-auth redirect rules.
 */

const limiter = vi.hoisted(() => {
  const marks = new Map<string, number>();
  const counters = new Map<string, { count: number; resetAt: number }>();

  return { marks, counters };
});

vi.mock('@/features/auth/services/rateLimit', () => ({
  markRateLimit: vi.fn(async (key: string, options: { windowMs?: number } = {}) => {
    limiter.marks.set(key, Date.now() + (options.windowMs ?? 60_000));
  }),
  peekRateLimit: vi.fn(async (key: string) => {
    const resetAt = limiter.marks.get(key);
    if (!resetAt || resetAt <= Date.now()) return { present: false, resetAfterMs: 0 };
    return { present: true, resetAfterMs: resetAt - Date.now() };
  }),
  takeRateLimit: vi.fn(async (key: string, options: { limit?: number; windowMs?: number } = {}) => {
    const limit = options.limit ?? 5;
    const windowMs = options.windowMs ?? 60_000;
    const entry = limiter.counters.get(key);
    const now = Date.now();

    if (!entry || entry.resetAt <= now) {
      limiter.counters.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, resetAfterMs: windowMs };
    }

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, resetAfterMs: entry.resetAt - now };
    }

    entry.count += 1;
    return { allowed: true, remaining: Math.max(0, limit - entry.count), resetAfterMs: entry.resetAt - now };
  }),
}));

import {
  evaluateOtpVerification,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MS,
  recordOtpIssued,
} from '@/features/auth/server/otp-policy';
import { normalizeRedirectTarget, resolvePostAuthDestination } from '@/lib/auth-ui';

describe('otp policy', () => {
  beforeEach(() => {
    limiter.marks.clear();
    limiter.counters.clear();
    vi.clearAllMocks();
  });

  it('uses the documented limits', () => {
    expect(OTP_TTL_MS).toBe(5 * 60 * 1000);
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });

  it('allows verification of a freshly issued code', async () => {
    await recordOtpIssued('register', 'user@example.com');

    await expect(evaluateOtpVerification({ purpose: 'register', identifier: 'user@example.com' })).resolves.toEqual({
      allowed: true,
    });
  });

  it('refuses a code that was never issued in this window', async () => {
    const decision = await evaluateOtpVerification({ purpose: 'register', identifier: 'ghost@example.com' });

    expect(decision).toMatchObject({ allowed: false, code: 'EXPIRED' });
  });

  it('stops guessing after five attempts', async () => {
    await recordOtpIssued('register', 'user@example.com');

    for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
      const decision = await evaluateOtpVerification({ purpose: 'register', identifier: 'user@example.com' });
      expect(decision.allowed).toBe(true);
    }

    const blocked = await evaluateOtpVerification({ purpose: 'register', identifier: 'user@example.com' });
    expect(blocked).toMatchObject({ allowed: false, code: 'MAX_ATTEMPTS' });
    expect(blocked.allowed === false && blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('treats each purpose as its own attempt budget', async () => {
    await recordOtpIssued('register', 'user@example.com');
    await recordOtpIssued('reset_password', 'user@example.com');

    for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
      await evaluateOtpVerification({ purpose: 'register', identifier: 'user@example.com' });
    }

    const blocked = await evaluateOtpVerification({ purpose: 'register', identifier: 'user@example.com' });
    expect(blocked.allowed).toBe(false);

    const other = await evaluateOtpVerification({ purpose: 'reset_password', identifier: 'user@example.com' });
    expect(other.allowed).toBe(true);
  });

  it('refreshes the window when a new code is sent', async () => {
    await recordOtpIssued('register', 'user@example.com');
    await evaluateOtpVerification({ purpose: 'register', identifier: 'user@example.com' });

    // A resend starts a fresh five minute life for the identifier.
    await recordOtpIssued('register', 'user@example.com');
    const afterResend = await evaluateOtpVerification({ purpose: 'register', identifier: 'user@example.com' });

    expect(afterResend.allowed).toBe(true);
  });
});

describe('post-auth redirect safety', () => {
  it('keeps only same-origin relative paths', () => {
    expect(normalizeRedirectTarget('/product/123')).toBe('/product/123');
    expect(normalizeRedirectTarget('/cart?ref=email')).toBe('/cart?ref=email');
    expect(normalizeRedirectTarget('https://evil.example/steal')).toBeNull();
    expect(normalizeRedirectTarget('//evil.example/steal')).toBeNull();
    expect(normalizeRedirectTarget('/\\evil.example')).toBeNull();
    expect(normalizeRedirectTarget(null)).toBeNull();
  });

  it('returns the intended destination when the role may use it', () => {
    expect(resolvePostAuthDestination('customer', '/product/123')).toBe('/product/123');
    expect(resolvePostAuthDestination('customer', '/cart')).toBe('/cart');
    expect(resolvePostAuthDestination('customer', '/wishlist')).toBe('/wishlist');
    expect(resolvePostAuthDestination('customer', '/account')).toBe('/account');
  });

  it('falls back to the role home when the destination is not allowed', () => {
    expect(resolvePostAuthDestination('customer', '/admin/dashboard')).toBe('/account/dashboard');
    expect(resolvePostAuthDestination('seller', '/reseller-dashboard/overview')).toBe('/seller/dashboard');
    expect(resolvePostAuthDestination('reseller', '/admin/users')).toBe('/reseller-dashboard/overview');
    expect(resolvePostAuthDestination('admin', 'https://evil.example')).toBe('/admin/dashboard');
  });

  it('sends each role to its own dashboard when there is no destination', () => {
    expect(resolvePostAuthDestination('customer', null)).toBe('/account/dashboard');
    expect(resolvePostAuthDestination('seller', null)).toBe('/seller/dashboard');
    expect(resolvePostAuthDestination('reseller', null)).toBe('/reseller-dashboard/overview');
    expect(resolvePostAuthDestination('admin', null)).toBe('/admin/dashboard');
  });
});