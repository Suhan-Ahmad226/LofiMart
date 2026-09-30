import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Pathao base URL is a trust boundary.
 *
 * Every outbound request carries a bearer token or the client secret, so a base
 * URL that resolves anywhere else is not a misconfiguration that produces a
 * confusing 404 — it is the merchant's credentials leaving for a third party.
 * These tests assert the refusal, including the prefix-confusion case that a
 * naive `startsWith` check would let through.
 */

const env: Record<string, string | undefined> = {};

vi.mock('../../../../lib/env', () => ({
  getServerEnv: () => env,
}));

vi.mock('../../../shared/services/messaging/redis', () => ({
  ensureRedis: async () => ({
    get: async () => null,
    set: async () => 'OK',
    del: async () => 0,
  }),
}));

vi.mock('../../../../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const fetchSpy = vi.fn();
vi.stubGlobal('fetch', fetchSpy);

const { getPathaoMissingConfig, getPathaoTokenDiagnostics } = await import('./pathaoClient');
const { PATHAO_ENVIRONMENTS } = await import('./pathaoConstants');
const { CourierConfigurationError } = await import('../../core/errors');

const CREDENTIALS = {
  PATHAO_CLIENT_ID: 'client-id',
  PATHAO_CLIENT_SECRET: 'client-secret',
  PATHAO_USERNAME: 'merchant',
  PATHAO_PASSWORD: 'merchant-password',
};

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, CREDENTIALS);
  fetchSpy.mockReset();
});

describe('PATHAO_BASE_URL host allowlist', () => {
  it('accepts the documented production host', async () => {
    env.PATHAO_BASE_URL = PATHAO_ENVIRONMENTS.production;

    expect(getPathaoMissingConfig()).toEqual([]);
    await expect(getPathaoTokenDiagnostics()).resolves.toMatchObject({
      baseUrl: PATHAO_ENVIRONMENTS.production,
      oauthConfigured: true,
    });
  });

  it('accepts the documented sandbox host', async () => {
    env.PATHAO_BASE_URL = PATHAO_ENVIRONMENTS.sandbox;

    expect(getPathaoMissingConfig()).toEqual([]);
  });

  it('reports an unrecognised host as missing config rather than trusting it', () => {
    env.PATHAO_BASE_URL = 'https://merchant-api-live.pathao.com';

    expect(getPathaoMissingConfig()).toContain('PATHAO_BASE_URL');
  });

  it('rejects a host that merely contains a documented host as a prefix', async () => {
    // The attack this blocks: a URL that passes a `startsWith('https://api-hermes.
    // pathao.com')` check while resolving to an entirely different server.
    env.PATHAO_BASE_URL = 'https://api-hermes.pathao.com.attacker.test';

    expect(getPathaoMissingConfig()).toContain('PATHAO_BASE_URL');

    const { getPathaoAccessToken } = await import('./pathaoClient');
    await expect(getPathaoAccessToken()).rejects.toBeInstanceOf(CourierConfigurationError);

    // The refusal must happen before the network, not after it.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('permits a custom host only when the opt-in flag is exactly "1"', async () => {
    env.PATHAO_BASE_URL = 'https://gateway.internal.example';
    expect(getPathaoMissingConfig()).toContain('PATHAO_BASE_URL');

    // Truthy but not "1" must not be treated as consent.
    env.PATHAO_ALLOW_CUSTOM_BASE_URL = 'true';
    expect(getPathaoMissingConfig()).toContain('PATHAO_BASE_URL');

    env.PATHAO_ALLOW_CUSTOM_BASE_URL = '1';
    expect(getPathaoMissingConfig()).toEqual([]);
  });

  it('rejects a non-http scheme even when the host looks right', async () => {
    // `file://api-hermes.pathao.com/...` parses with the expected host but is not a
    // network request at all, so a host-only check is not sufficient.
    env.PATHAO_BASE_URL = 'file://api-hermes.pathao.com/etc/passwd';

    expect(getPathaoMissingConfig()).toContain('PATHAO_BASE_URL');

    const { getPathaoAccessToken } = await import('./pathaoClient');
    await expect(getPathaoAccessToken()).rejects.toBeInstanceOf(CourierConfigurationError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats the opt-in flag as a full opt-out, since that is what it documents', () => {
    // Recorded deliberately: the flag disables the allowlist rather than adding a
    // narrower scheme check, so an operator enabling it inherits the risk.
    env.PATHAO_BASE_URL = 'https://gateway.internal.example';
    env.PATHAO_ALLOW_CUSTOM_BASE_URL = '1';

    expect(getPathaoMissingConfig()).toEqual([]);
  });
});
