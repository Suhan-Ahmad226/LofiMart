import { describe, it, expect } from 'vitest';

describe('Environment Validation', () => {
  it('env.ts exports validation functions', async () => {
    const env = await import('@/lib/env');
    expect(typeof env.getPublicEnv).toBe('function');
    expect(typeof env.getServerEnv).toBe('function');
  });
});

describe('Client Cache', () => {
  it('exports cache function', async () => {
    const cache = await import('@/lib/client-cache');
    expect(typeof cache.getCachedClientValue).toBe('function');
  });
});

describe('Navigation', () => {
  it('exports navigation utilities', async () => {
    const nav = await import('@/lib/navigation');
    expect(nav.Link).toBeDefined();
  });
});

describe('Logger', () => {
  it('exports logger with levels', async () => {
    const { logger } = await import('@/lib/logger');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });
});
