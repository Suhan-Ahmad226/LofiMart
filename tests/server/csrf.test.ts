import { describe, it, expect } from 'vitest';
import { issueCsrfToken, validateCsrfToken, csrfCookieName, csrfHeaderName } from '@/server/security/csrf';

describe('CSRF', () => {
  it('issues a hex token', () => {
    const token = issueCsrfToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBe(48);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it('validates matching header and cookie tokens', () => {
    const token = issueCsrfToken();
    const req = {
      headers: { 'x-csrf-token': token, cookie: `csrf-token=${token}` },
    };
    expect(validateCsrfToken(req)).toBe(true);
  });

  it('rejects mismatched tokens', () => {
    const req = {
      headers: { 'x-csrf-token': 'aaa', cookie: 'csrf-token=bbb' },
    };
    expect(validateCsrfToken(req)).toBe(false);
  });

  it('rejects missing header token', () => {
    const req = {
      headers: { cookie: 'csrf-token=aaa' },
    };
    expect(validateCsrfToken(req)).toBe(false);
  });

  it('rejects missing cookie token', () => {
    const req = {
      headers: { 'x-csrf-token': 'aaa' },
    };
    expect(validateCsrfToken(req)).toBe(false);
  });

  it('exports cookie and header names', () => {
    expect(csrfCookieName).toBe('csrf-token');
    expect(csrfHeaderName).toBe('x-csrf-token');
  });

  it('handles multiple cookie parts correctly', () => {
    const token = issueCsrfToken();
    const req = {
      headers: { 'x-csrf-token': token, cookie: `other=value; csrf-token=${token}; another=test` },
    };
    expect(validateCsrfToken(req)).toBe(true);
  });
});
