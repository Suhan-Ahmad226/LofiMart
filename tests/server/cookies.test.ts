import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { getSecureCookieOptions } from '@/server/security/cookies';

describe('getSecureCookieOptions', () => {
  it('returns httpOnly cookie', () => {
    const opts = getSecureCookieOptions(3600);
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe('/');
    expect(opts.maxAge).toBe(3600);
  });

  it('uses strict sameSite', () => {
    const opts = getSecureCookieOptions(60);
    expect(opts.sameSite).toBe('strict');
  });

  it('sets secure based on NODE_ENV', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(getSecureCookieOptions(60).secure).toBe(true);
    process.env.NODE_ENV = 'development';
    expect(getSecureCookieOptions(60).secure).toBe(false);
    process.env.NODE_ENV = original;
  });
});
