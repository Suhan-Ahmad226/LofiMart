import { describe, it, expect } from 'vitest';
import { edgeCacheControl, privateNoStore } from '@/server/httpCache';

describe('edgeCacheControl', () => {
  it('returns default cache headers', () => {
    const headers = edgeCacheControl();
    expect(headers).toContain('public');
    expect(headers).toContain('max-age=60');
    expect(headers).toContain('s-maxage=300');
    expect(headers).toContain('stale-while-revalidate=600');
  });

  it('accepts custom TTLs', () => {
    const headers = edgeCacheControl({
      browserTtlSeconds: 120,
      edgeTtlSeconds: 600,
      staleWhileRevalidateSeconds: 1200,
    });
    expect(headers).toContain('max-age=120');
    expect(headers).toContain('s-maxage=600');
    expect(headers).toContain('stale-while-revalidate=1200');
  });
});

describe('privateNoStore', () => {
  it('returns private no-store', () => {
    expect(privateNoStore()).toBe('private, no-store, max-age=0');
  });
});
