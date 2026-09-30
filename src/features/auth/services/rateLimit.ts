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