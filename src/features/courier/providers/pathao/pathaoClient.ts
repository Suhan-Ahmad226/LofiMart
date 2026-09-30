/**
 * Pathao Merchant API HTTP client.
 *
 * Owns the OAuth handshake and every outbound call. Two behaviours here are
 * load-bearing for data integrity:
 *
 *  1. **Single-flight token issuance.** Pathao's access tokens last one hour.
 *     Without a lock, the first request after expiry causes every concurrent
 *     request to issue its own token, which burns the refresh-token grant and
 *     can trip rate limiting. A promise lock collapses them into one call.
 *
 *  2. **Writes are not network-retried.** A POST to the booking endpoint
 *     creates a consignment. A timeout or 5xx leaves the outcome unknown, so
 *     the caller must reconcile instead of retrying. The only exception is a
 *     401, which proves the courier rejected the request before doing any work
 *     and is therefore safe to replay once.
 *
 * Credentials never appear in a log line, an error message, or a thrown body.
 */

import { getServerEnv } from '../../../../lib/env';
import { ensureRedis } from '../../../shared/services/messaging/redis';
import { CourierConfigurationError } from '../../core/errors';
import { logger } from '../../../../lib/logger';
import {
  COURIER_DEFAULT_TIMEOUT_MS,
  fetchWithTimeout,
  findMissingKeys,
  isTransientError,
  normalizeUrl,
  toCourierError,
  withRetry,
} from '../../core/http';
import {
  PATHAO_ALLOWED_BASE_HOSTS,
  PATHAO_ENDPOINTS,
  PATHAO_PROVIDER_CODE,
  pathaoAreaListEndpoint,
  pathaoOrderInfoEndpoint,
  pathaoZoneListEndpoint,
} from './pathaoConstants';
import type { PathaoTokenBundle, PathaoTokenGrantMode } from './pathaoTypes';
import { parsePathaoToken } from './pathaoSchemas';

/** Refresh this far ahead of true expiry so an in-flight request cannot expire mid-flight. */
const TOKEN_EXPIRY_SAFETY_MS = 120_000;
const MIN_TOKEN_TTL_SECONDS = 60;

const OAUTH_REQUIRED_KEYS = [
  'PATHAO_CLIENT_ID',
  'PATHAO_CLIENT_SECRET',
  'PATHAO_BASE_URL',
] as const;

const PASSWORD_GRANT_KEYS = [...OAUTH_REQUIRED_KEYS, 'PATHAO_USERNAME', 'PATHAO_PASSWORD'] as const;

type PathaoEnv = Record<string, string | undefined>;

/**
 * Builds an outbound URL, refusing to send credentials to an unlisted host.
 *
 * Every request here carries either a bearer token or the client secret, so the
 * base URL is a trust boundary, not just configuration. A `PATHAO_BASE_URL` that
 * does not resolve to a documented Pathao host is refused before the fetch rather
 * than after, because after the fetch the credentials have already left.
 *
 * `PATHAO_ALLOW_CUSTOM_BASE_URL=1` is the escape hatch for a self-hosted Pathao
 * gateway. It is opt-in and explicit so it cannot be switched on by accident.
 */
function resolvePathaoUrl(env: PathaoEnv, endpoint: string): string {
  const baseUrl = String(env.PATHAO_BASE_URL || '').trim();
  const url = normalizeUrl(baseUrl, endpoint);

  if (isTrustedPathaoBaseUrl(env)) return url;

  logger.error('Refusing to send Pathao credentials to an unrecognised host.', {
    baseUrl,
  });
  throw new CourierConfigurationError(PATHAO_PROVIDER_CODE, ['PATHAO_BASE_URL']);
}

/**
 * Whether a refresh token has been observed. Set by the first successful token
 * response, and read by `getPathaoMissingConfig()` to decide whether a missing
 * merchant password is fatal.
 */
let hasRefreshToken = false;

/* --------------------------------------------------------------- diagnostics */

/**
 * Reads the server environment defensively.
 *
 * `getServerEnv()` throws when any required variable is missing, which is the
 * right behaviour for a request handler and the wrong behaviour for
 * `getStatus()`. The registry calls `getStatus()` on every provider lookup, and
 * the admin diagnostics screen calls it directly, so a partially configured
 * deployment would get a 500 from the very screen meant to explain the problem.
 *
 * Returning an empty record instead makes the provider report
 * `missing_config`, which is the truthful answer.
 */
function readEnv(): PathaoEnv {
  try {
    return getServerEnv() as unknown as PathaoEnv;
  } catch {
    return {};
  }
}

/**
 * Missing credential names, for `getStatus()` and the admin diagnostics screen.
 *
 * A missing merchant password is reported only when the refresh grant is
 * unusable too, because the password is the fallback: a deployment holding a
 * valid refresh token can still authenticate without it.
 */
export function getPathaoMissingConfig(): string[] {
  const env = readEnv();
  const missingOAuth = findMissingKeys(env, OAUTH_REQUIRED_KEYS);
  if (missingOAuth.length > 0) return missingOAuth;

  const missingPassword = hasRefreshToken ? [] : findMissingKeys(env, PASSWORD_GRANT_KEYS);
  if (missingPassword.length > 0) return missingPassword;

  // A present but unrecognised base URL is the same class of problem as a missing
  // one for our purposes: the provider is not usable. Reporting it here means the
  // admin diagnostics screen says so, instead of the first sign of trouble being
  // merchant credentials POSTed somewhere unexpected.
  if (!isTrustedPathaoBaseUrl(env)) return ['PATHAO_BASE_URL'];

  return [];
}

/**
 * Whether `PATHAO_BASE_URL` is a base we are willing to authenticate against.
 * Shared with the request path so the status shown to an operator and the check
 * that guards the fetch can never disagree.
 *
 * Both the host and the protocol are checked. A host-only check is not enough:
 * `file://api-hermes.pathao.com/etc/passwd` has the expected host but is not a
 * network request, and `http://` would put a bearer token on the wire in clear.
 * Only `https` is accepted because both documented bases are `https`.
 */
function isTrustedPathaoBaseUrl(env: PathaoEnv): boolean {
  if (String(env.PATHAO_ALLOW_CUSTOM_BASE_URL || '').trim() === '1') return true;

  const raw = String(env.PATHAO_BASE_URL || '').trim();
  if (!raw) return false;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return false;
    return PATHAO_ALLOWED_BASE_HOSTS.includes(parsed.host.toLowerCase());
  } catch {
    return false;
  }
}

function requireConfig(keys: readonly string[]): void {
  const missing = findMissingKeys(readEnv(), keys);
  if (missing.length > 0) {
    throw new CourierConfigurationError(PATHAO_PROVIDER_CODE, [...missing]);
  }
}

/* ---------------------------------------------------------------- token cache */

function tokenCacheKey(): string {
  const env = readEnv();
  return `${env.QUEUE_PREFIX || 'lofimart'}:courier:pathao:oauth:${String(
    env.PATHAO_BASE_URL || '',
  )
    .trim()
    .toLowerCase()}:${String(env.PATHAO_CLIENT_ID || '').trim().toLowerCase()}`;
}

async function readCachedToken(): Promise<PathaoTokenBundle | null> {
  const raw = await ensureRedis().then((redis) => redis.get(tokenCacheKey()));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PathaoTokenBundle;
    return parsed?.accessToken ? parsed : null;
  } catch {
    // A corrupt cache entry must not wedge the integration: treat it as absent.
    return null;
  }
}

async function writeCachedToken(bundle: PathaoTokenBundle): Promise<void> {
  const ttlSeconds = Math.max(
    MIN_TOKEN_TTL_SECONDS,
    Math.floor(bundle.expiresIn - TOKEN_EXPIRY_SAFETY_MS / 1000),
  );
  await ensureRedis().then((redis) =>
    redis.set(tokenCacheKey(), JSON.stringify(bundle), 'EX', ttlSeconds),
  );
}

async function clearCachedToken(): Promise<void> {
  await ensureRedis()
    .then((redis) => redis.del(tokenCacheKey()))
    // A cache eviction failure must not mask the original auth error.
    .catch(() => undefined);
}

function isTokenFresh(bundle: PathaoTokenBundle | null | undefined): boolean {
  if (!bundle?.accessToken) return false;
  const expiryMs = bundle.issuedAt + bundle.expiresIn * 1000;
  return expiryMs - Date.now() > TOKEN_EXPIRY_SAFETY_MS;
}

/**
 * In-process single-flight lock.
 *
 * Scoped to this process. Across processes the Redis cache plus the short
 * expiry window absorbs the overlap, which is sufficient because Pathao tolerates
 * a small number of concurrent token issuances.
 */
let inFlightTokenRequest: Promise<PathaoTokenBundle> | null = null;

async function requestToken(payload: Record<string, unknown>): Promise<PathaoTokenBundle> {
  const env = readEnv();
  const url = resolvePathaoUrl(env, PATHAO_ENDPOINTS.ISSUE_TOKEN);

  const response = await fetchWithTimeout(
    PATHAO_PROVIDER_CODE,
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    COURIER_DEFAULT_TIMEOUT_MS,
  );

  const responsePayload = await response.json().catch(() => null);

  if (!response.ok) {
    // Deliberately does not include `payload`: it holds the client secret and
    // the merchant password.
    throw toCourierError(
      PATHAO_PROVIDER_CODE,
      response.status,
      responsePayload,
      'Pathao token request',
      response.headers,
    );
  }

  const bundle = parsePathaoToken(responsePayload);

  hasRefreshToken = Boolean(bundle.refreshToken);
  await writeCachedToken(bundle);
  return bundle;
}

/**
 * Issues an access token, preferring the refresh grant.
 *
 * Falls back to the password grant when the refresh token has itself expired,
 * because a merchant that cannot authenticate at all cannot ship at all.
 */
export async function issuePathaoAccessToken(options?: {
  mode?: PathaoTokenGrantMode;
  refreshToken?: string | null;
  force?: boolean;
}): Promise<PathaoTokenBundle> {
  const env = readEnv();
  const force = options?.force === true;

  // `force` bypasses only the freshness check. It must not bypass the grant
  // choice, or an explicit refresh would silently need the merchant password.
  const existing = force ? null : await readCachedToken();

  if (
    !force &&
    !options?.mode &&
    isTokenFresh(existing) &&
    hasRefreshToken
  ) {
    return existing as PathaoTokenBundle;
  }

  if (inFlightTokenRequest) return inFlightTokenRequest;

  const wantsRefresh = options?.mode !== 'password' && Boolean(options?.refreshToken || hasRefreshToken);

  inFlightTokenRequest = (async () => {
    if (wantsRefresh) {
      requireConfig(OAUTH_REQUIRED_KEYS);
      const refreshToken = options?.refreshToken || (await readCachedToken())?.refreshToken;

      if (refreshToken) {
        try {
          return await requestToken({
            client_id: env.PATHAO_CLIENT_ID,
            client_secret: env.PATHAO_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          });
        } catch {
          // The refresh grant expires independently of the access token, so fall
          // through to the password grant instead of leaving the merchant unable
          // to authenticate.
        }
      }
    }

    requireConfig(PASSWORD_GRANT_KEYS);
    return requestToken({
      client_id: env.PATHAO_CLIENT_ID,
      client_secret: env.PATHAO_CLIENT_SECRET,
      grant_type: 'password',
      username: env.PATHAO_USERNAME,
      password: env.PATHAO_PASSWORD,
    });
  })().finally(() => {
    inFlightTokenRequest = null;
  });

  return inFlightTokenRequest;
}

export async function getPathaoAccessToken(): Promise<PathaoTokenBundle> {
  return issuePathaoAccessToken();
}

/** Drops the cached token and re-issues. Used after a 401 and by diagnostics. */
export async function forcePathaoTokenRefresh(): Promise<PathaoTokenBundle> {
  const cached = await readCachedToken();
  await clearCachedToken();
  return issuePathaoAccessToken({
    mode: cached?.refreshToken ? 'refresh_token' : 'password',
    refreshToken: cached?.refreshToken,
    force: true,
  });
}

/* ------------------------------------------------------------------ requests */

async function executeRequest(
  endpoint: string,
  context: string,
  init?: RequestInit,
): Promise<{ payload: unknown; status: number }> {
  const env = readEnv();
  const token = await getPathaoAccessToken();
  const url = resolvePathaoUrl(env, endpoint);

  const response = await fetchWithTimeout(
    PATHAO_PROVIDER_CODE,
    url,
    {
      ...init,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
        ...(init?.headers || {}),
      },
    },
    COURIER_DEFAULT_TIMEOUT_MS,
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw toCourierError(
      PATHAO_PROVIDER_CODE,
      response.status,
      payload,
      context,
      response.headers,
    );
  }

  return { payload, status: response.status };
}

/** True when the failure proves the courier did no work, so a replay is safe. */
function isAuthRejection(error: unknown): boolean {
  if (error instanceof Error && error.name === 'CourierAuthenticationError') return true;
  if (error instanceof Error && error.name === 'CourierAuthorizationError') return false;
  return false;
}

/**
 * Issues an authenticated request with one auth retry.
 *
 * `retriesOnTransport` exists to distinguish reads from writes. A read may be
 * retried on a timeout or 5xx because re-reading a parcel has no side effect.
 * A write may not, because the first attempt may already have created a
 * consignment; only a 401 is replayed, and only once.
 */
async function pathaoRequest(
  endpoint: string,
  context: string,
  init?: RequestInit,
  options?: { retriesOnTransport?: boolean },
): Promise<unknown> {
  const retriesOnTransport = options?.retriesOnTransport ?? true;
  let authRetries = 0;

  const run = async (): Promise<unknown> => {
    const { payload } = await executeRequest(endpoint, context, init);
    return payload;
  };

  const attempt = async (): Promise<unknown> => {
    if (!retriesOnTransport) {
      try {
        return await run();
      } catch (error) {
        if (!isAuthRejection(error)) throw error;
        // Awaited so the new token cannot be wiped by a late delete from the
        // attempt that observed the stale one.
        await clearCachedToken();
        return run();
      }
    }

    return withRetry(run, {
      retries: 2,
      baseDelayMs: 300,
      shouldRetry: async (error: unknown) => {
        if (isAuthRejection(error)) {
          if (authRetries >= 1) return false;
          authRetries += 1;
          await clearCachedToken();
          return true;
        }
        return isTransientError(error);
      },
    });
  };

  return attempt();
}

/* ---------------------------------------------------------------- API calls */

export async function listPathaoCities(): Promise<unknown> {
  return pathaoRequest(PATHAO_ENDPOINTS.CITY_LIST, 'Pathao city list');
}

export async function listPathaoZones(cityId: number): Promise<unknown> {
  return pathaoRequest(
    pathaoZoneListEndpoint(cityId),
    'Pathao zone list',
  );
}

export async function listPathaoAreas(zoneId: number): Promise<unknown> {
  return pathaoRequest(
    pathaoAreaListEndpoint(zoneId),
    'Pathao area list',
  );
}

export async function listPathaoStores(): Promise<unknown> {
  return pathaoRequest(PATHAO_ENDPOINTS.STORES, 'Pathao store list');
}

/**
 * Registers a pickup point.
 *
 * `retriesOnTransport: false`, same reasoning as `createPathaoOrder`: a timed-out
 * store creation may still have registered a store, and a blind replay would give
 * the merchant two pickup points for one warehouse. The caller reconciles by
 * re-listing stores and matching on name before creating a replacement.
 */
export async function createPathaoStore(payload: unknown): Promise<unknown> {
  return pathaoRequest(
    PATHAO_ENDPOINTS.STORES,
    'Pathao store creation',
    { method: 'POST', body: JSON.stringify(payload) },
    { retriesOnTransport: false },
  );
}

/**
 * Creates one consignment.
 *
 * `retriesOnTransport: false` is the important part: no blind retry after a
 * timeout or 5xx, because a replay here is a second physical parcel.
 */
export async function createPathaoOrder(payload: unknown): Promise<unknown> {
  const env = readEnv();
  const endpoint = env.PATHAO_BOOKING_ENDPOINT || PATHAO_ENDPOINTS.ORDERS;

  return pathaoRequest(
    endpoint,
    'Pathao order creation',
    { method: 'POST', body: JSON.stringify(payload) },
    { retriesOnTransport: false },
  );
}

export async function getPathaoOrderInfo(consignmentId: string): Promise<unknown> {
  return pathaoRequest(
    pathaoOrderInfoEndpoint(consignmentId),
    'Pathao order info',
  );
}

export async function calculatePathaoPrice(payload: unknown): Promise<unknown> {
  return pathaoRequest(
    PATHAO_ENDPOINTS.PRICE_PLAN,
    'Pathao price calculation',
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

/**
 * The shared secret for inbound webhooks.
 *
 * Returns an empty string when unset so signature comparison fails closed. A
 * webhook endpoint with no configured secret must reject, never accept.
 */
export function getPathaoWebhookSecret(): string {
  return String(readEnv().PATHAO_WEBHOOK_TOKEN || '').trim();
}

/** Non-secret state for the admin diagnostics screen. Never includes a token. */
export async function getPathaoTokenDiagnostics(): Promise<Record<string, unknown>> {
  const env = readEnv();
  const bundle = await readCachedToken();
  const expiresAt = bundle ? bundle.issuedAt + bundle.expiresIn * 1000 : null;

  return {
    baseUrl: env.PATHAO_BASE_URL || null,
    oauthConfigured: findMissingKeys(env, OAUTH_REQUIRED_KEYS).length === 0,
    hasCachedToken: Boolean(bundle?.accessToken),
    tokenType: bundle?.tokenType || null,
    issuedAt: bundle ? new Date(bundle.issuedAt).toISOString() : null,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    expiresInSeconds: expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : null,
    refreshTokenAvailable: Boolean(bundle?.refreshToken),
    webhookSecretConfigured: Boolean(getPathaoWebhookSecret()),
  };
}

/** Drops the cached token so the next request re-authenticates. */
export async function invalidatePathaoTokenCache(): Promise<void> {
  hasRefreshToken = false;
  await clearCachedToken();
}
