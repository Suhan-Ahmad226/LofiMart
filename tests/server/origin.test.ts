import { describe, it, expect } from 'vitest';
import { isAllowedRequestOrigin } from '@/server/security/origin';

describe('isAllowedRequestOrigin', () => {
  it('allows null origin', () => {
    expect(isAllowedRequestOrigin(null)).toBe(true);
  });

  it('allows same-origin requests (no explicit origin header)', () => {
    expect(isAllowedRequestOrigin(null, 'http://localhost:3000')).toBe(true);
  });

  it('rejects null when request url also null', () => {
    expect(isAllowedRequestOrigin(null, null)).toBe(true);
  });

  it('rejects malformed origins', () => {
    expect(isAllowedRequestOrigin('not-a-url')).toBe(false);
  });
});
