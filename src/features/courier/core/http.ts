/**
 * Provider-agnostic HTTP primitives for courier integrations.
 *
 * Shared by every provider adapter. Contains no Pathao (or any other
 * provider) knowledge: no endpoint names, no field names, no magic numbers.
 *
 * Responsibilities:
 *  - time out a hung request instead of holding a request handler open;
 *  - classify a transport failure into `CourierNetworkError` /
 *    `CourierTimeoutError` so the retry policy never string-matches;
 *  - classify an HTTP status into the courier error taxonomy;
 *  - apply bounded exponential backoff with jitter to reads only.
 *
 * Writes (`createShipment`) are never wrapped in `withRetry` here. The booking
 * service owns that decision because a retried POST creates a second parcel.
 */

import {
  CourierAuthenticationError,
  CourierAuthorizationError,
  CourierNetworkError,
  CourierRateLimitError,
  CourierResponseError,
  CourierTimeoutError,
  CourierValidationError,
  asCourierError,
  describeCourierError,
  isCourierError,
} from './errors';

export const COURIER_DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Normalises a Bangladeshi mobile number to the 11-digit local form
 * (`01XXXXXXXXX`). Accepts 11-digit local numbers and 13-digit `880`-prefixed
 * E.164 values. Returns an empty string when the value is not a usable local
 * number, so callers must check rather than forward it.
 */
export function normalizeBdPhone(phone: string | null | undefined): string {
  const raw = String(phone || '').replace(/\D+/g, '');
  if (raw.length === 11 && raw.startsWith('01')) return raw;
  if (raw.length === 13 && raw.startsWith('8801')) return `0${raw.slice(3)}`;
  return '';
}

export function normalizeUrl(baseUrl: string, endpoint: string) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
}

/**
 * Returns the missing subset of `keys` for a resolved env record, so provider
 * code raises one actionable configuration error instead of failing later
 * against an opaque API response.
 */
export function findMissingKeys(
  env: Record<string, string | undefined>,
  keys: readonly string[],
): string[] {
  return keys.filter((key) => !String(env[key] ?? '').trim());
}

/**
 * Extracts a human-readable message from a courier error body.
 *
 * Never echoes the full payload, so provider internals, SQL fragments and
 * credentials cannot leak into logs or customer-facing errors.
 */
export function extractApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.message,
    record.error,
    record.error_message,
    record.description,
    record.detail,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().slice(0, 300);
    }
  }

  if (Array.isArray(record.errors)) {
    const firstError = record.errors.find(
      (entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()),
    );
    if (firstError) return firstError.trim().slice(0, 300);
  }

  return fallback;
}

/** Recursively finds the first string value whose key matches one of `fragments`. */
export function findValueByKeyFragment(
  payload: unknown,
  fragments: readonly string[],
): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = findValueByKeyFragment(item, fragments);
      if (nested) return nested;
    }
    return null;
  }

  for (const [key, nestedValue] of Object.entries(payload as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();
    if (fragments.some((fragment) => normalizedKey.includes(fragment))) {
      if (typeof nestedValue === 'string' && nestedValue.trim()) return nestedValue.trim();
      if (typeof nestedValue === 'number' && Number.isFinite(nestedValue)) return String(nestedValue);
    }

    const nested = findValueByKeyFragment(nestedValue, fragments);
    if (nested) return nested;
  }

  return null;
}

/** Parses `Retry-After` into milliseconds. Returns null when absent or unparseable. */
export function parseRetryAfterMs(headers: Headers | undefined): number | null {
  const value = headers?.get('retry-after');
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());

  return null;
}

/**
 * Issues a request that aborts after `timeoutMs`.
 *
 * A timeout is deliberately reported as `uncertain`, because on a write the
 * courier may have created the consignment before the response was lost. The
 * booking service relies on that flag to reconcile instead of retrying.
 */
export async function fetchWithTimeout(
  provider: string,
  url: string,
  init?: RequestInit,
  timeoutMs: number = COURIER_DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CourierTimeoutError(provider, timeoutMs, error);
    }

    // DNS failure, connection refused, TLS failure, socket reset. All are
    // transport-level and all leave the request outcome unknown.
    throw new CourierNetworkError(
      provider,
      `${provider} request failed at the transport layer: ${
        error instanceof Error ? error.message : 'unknown network error'
      }`,
      error,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** True for a read that can be retried without creating a duplicate side effect. */
export function isTransientError(error: unknown): boolean {
  // A normalized error already carries the answer. Never fall through to
  // string matching once a provider error has been classified: a 400 whose
  // body happens to contain the word "timeout" must not become retryable.
  if (isCourierError(error)) return error.retryable;

  if (error instanceof Error) {
    // A typed status takes priority: a 4xx is a client-side validation/auth
    // problem and must never be retried, whatever wording the provider chose.
    const status = 'status' in error ? Number((error as { status?: unknown }).status) : Number.NaN;
    if (Number.isFinite(status)) {
      return status === 408 || status === 429 || (status >= 500 && status <= 599);
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('econnrefused') ||
      message.includes('aborted')
    );
  }

  return false;
}

/**
 * Exponential backoff with jitter.
 *
 * Jitter matters here: several workers retrying the same failing courier in
 * lockstep would produce a thundering herd against the provider. The delay is
 * `base * 2^attempt` with up to 50% random spread.
 */
export function computeBackoffDelayMs(attempt: number, baseDelayMs: number): number {
  const exponential = baseDelayMs * 2 ** Math.max(0, attempt);
  const jitter = Math.random() * exponential * 0.5;
  return Math.round(exponential + jitter);
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    maxRetries?: number;
    backoffMs?: number;
    baseDelayMs?: number;
    /**
     * May be async so a caller can perform cleanup (for example evicting a
     * cached credential) before the next attempt. It is awaited, which also
     * stops an async predicate from being treated as always-truthy.
     */
    shouldRetry?: (error: unknown) => boolean | Promise<boolean>;
    signal?: AbortSignal;
  },
): Promise<T> {
  const retries = options?.retries ?? options?.maxRetries ?? 2;
  const baseDelayMs = options?.backoffMs ?? options?.baseDelayMs ?? 500;
  const shouldRetry = options?.shouldRetry ?? isTransientError;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !(await shouldRetry(error))) {
        throw error;
      }

      const delay = computeBackoffDelayMs(attempt, baseDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Maps a non-2xx courier response onto the courier error taxonomy.
 *
 * This is the single place HTTP status becomes a retry decision, so no
 * provider adapter has to re-derive it and the booking queue's policy stays
 * consistent across every courier.
 *
 * Retryability by status:
 *   400/422 validation      -> never retryable (bad data would fail again)
 *   401/403 credentials     -> never retryable (a retry storm cannot fix creds)
 *   429 rate limit          -> retryable, honouring `Retry-After`
 *   5xx provider failure    -> retryable
 *   other 4xx               -> not retryable
 */
export function toCourierError(
  provider: string,
  status: number,
  payload: unknown,
  context: string,
  headers?: Headers,
): Error {
  const message = extractApiErrorMessage(payload, `${context} failed with status ${status}`);

  if (status === 401) {
    return new CourierAuthenticationError(provider, status);
  }

  if (status === 403) {
    return new CourierAuthorizationError(provider, status);
  }

  if (status === 429) {
    return new CourierRateLimitError(provider, parseRetryAfterMs(headers), null);
  }

  if (status === 400 || status === 422) {
    return new CourierValidationError(provider, message, { status, context });
  }

  if (status >= 500) {
    return new CourierResponseError(
      provider,
      `${provider} is unavailable (HTTP ${status}).`,
      { status, context },
      null,
      { retryable: true },
    );
  }

  return new CourierResponseError(provider, `${context} was rejected (HTTP ${status}).`, {
    status,
    context,
  });
}

/** Never log the raw cause chain; use the normalized description instead. */
export { describeCourierError, asCourierError };
