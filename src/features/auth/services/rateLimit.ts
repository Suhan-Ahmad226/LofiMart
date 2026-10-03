import type { Redis } from 'ioredis';
import { getServerEnv } from '@/lib/env';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAfterMs: number;
}

const inMemoryStore = new Map<string, { count: number; resetAt: number }>();
let warnedRedisFallback = false;

function getPrefixes(): { prefix: string; rateLimitPrefix: string } {
  try {
    const env = getServerEnv();
    return { prefix: env.REDIS_PREFIX, rateLimitPrefix: env.RATE_LIMIT_PREFIX };
  } catch {
    return { prefix: 'lofimart', rateLimitPrefix: 'ratelimit' };
  }
}

function buildKey(key: string): string {
  const { prefix, rateLimitPrefix } = getPrefixes();
  return `${prefix}:${rateLimitPrefix}:${key}`;
}

function inMemoryDecision(key: string, limit: number, windowMs: number): RateLimitDecision {
  const now = Date.now();
  const entry = inMemoryStore.get(key);

  if (!entry || entry.resetAt <= now) {
    inMemoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAfterMs: windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAfterMs: entry.resetAt - now };
}

async function redisDecision(client: Redis, key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
  const count = await client.incr(key);

  if (count === 1) {
    await client.pexpire(key, windowMs).catch(() => undefined);
  }

  const pttl = await client.pttl(key).catch(() => windowMs);
  const resetAfterMs = pttl && pttl > 0 ? pttl : windowMs;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAfterMs,
  };
}

function isProductionEnv(): boolean {
  try {
    const env = getServerEnv();
    return env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

function failClosedDecision(windowMs: number): RateLimitDecision {
  return { allowed: false, remaining: 0, resetAfterMs: windowMs };
}

export async function takeRateLimit(
  key: string,
  options: { limit?: number; windowMs?: number } = {},
): Promise<RateLimitDecision> {
  const limit = options.limit ?? 5;
  const windowMs = options.windowMs ?? 60_000;
  const redisKey = buildKey(key);

  try {
    const { ensureRedis } = await import('@/features/shared/services/messaging/redis');
    const client = await ensureRedis();
    return await redisDecision(client, redisKey, limit, windowMs);
  } catch (error) {
    if (!warnedRedisFallback) {
      warnedRedisFallback = true;
      console.warn('[auth:rate-limit] Redis unavailable; failing closed in production, in-memory fallback elsewhere.', error);
    }

    // In production a limiter outage must NOT open the floodgates: the policy is
    // fail-closed (deny) so an attacker cannot bypass throttling by exhausting
    // Redis. Non-production environments keep the in-memory fallback so local
    // development without Redis still works.
    if (isProductionEnv()) {
      return failClosedDecision(windowMs);
    }

    return inMemoryDecision(redisKey, limit, windowMs);
  }
}

/**
 * Starts (or refreshes) a window for a key without consuming a counter.
 *
 * Used for "something happened at T" markers such as an OTP send, where the
 * only thing that matters is how long ago it happened.
 */
export async function markRateLimit(key: string, options: { windowMs?: number } = {}): Promise<void> {
  const windowMs = options.windowMs ?? 60_000;
  const redisKey = buildKey(key);

  try {
    const { ensureRedis } = await import('@/features/shared/services/messaging/redis');
    const client = await ensureRedis();
    await client.set(redisKey, '1', 'PX', windowMs).catch(() => undefined);
    return;
  } catch (error) {
    if (!warnedRedisFallback) {
      warnedRedisFallback = true;
      console.warn('[auth:rate-limit] Redis unavailable; using in-memory markers.', error);
    }
  }

  const now = Date.now();
  inMemoryStore.set(redisKey, { count: 1, resetAt: now + windowMs });
}

/**
 * Reads a marker's remaining lifetime without consuming it.
 *
 * `present` is false when the key is unknown or already expired, which is how
 * callers detect that a time-boxed event (such as an OTP send) has lapsed.
 */
export async function peekRateLimit(key: string): Promise<{ present: boolean; resetAfterMs: number }> {
  const redisKey = buildKey(key);

  try {
    const { ensureRedis } = await import('@/features/shared/services/messaging/redis');
    const client = await ensureRedis();
    const pttl = await client.pttl(redisKey);
    if (typeof pttl !== 'number' || pttl < 0) {
      return { present: false, resetAfterMs: 0 };
    }
    return { present: true, resetAfterMs: pttl };
  } catch {
    const entry = inMemoryStore.get(redisKey);
    if (!entry || entry.resetAt <= Date.now()) {
      return { present: false, resetAfterMs: 0 };
    }
    return { present: true, resetAfterMs: entry.resetAt - Date.now() };
  }
}