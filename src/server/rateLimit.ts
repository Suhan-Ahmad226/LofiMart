import { getServerEnv } from '../lib/env';
import { ensureRedis } from '../services/messaging/redis';

export type RateBucket = { timestamps: number[] };

export const rateLimits: Record<string, RateBucket> = {};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('rate_limit_timeout')), timeoutMs);
    }),
  ]);
}

async function takeRedisToken(key: string, limit: number, windowMs: number) {
  const redis = await ensureRedis();
  const namespacedKey = `${getServerEnv().REDIS_PREFIX}:${getServerEnv().RATE_LIMIT_PREFIX}:${key}`;
  const total = await redis.incr(namespacedKey);

  if (total === 1) {
    await redis.pexpire(namespacedKey, windowMs);
  }

  const ttl = await redis.pttl(namespacedKey);

  return {
    allowed: total <= limit,
    total,
    resetAfterMs: ttl > 0 ? ttl : windowMs,
  };
}

function takeMemoryToken(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = rateLimits[key] || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    return {
      allowed: false,
      total: bucket.timestamps.length,
      resetAfterMs: windowMs - (now - bucket.timestamps[0]),
    };
  }

  bucket.timestamps.push(now);
  rateLimits[key] = bucket;

  return {
    allowed: true,
    total: bucket.timestamps.length,
    resetAfterMs: windowMs,
  };
}

export async function takeRateLimitToken(key: string, limit: number, windowMs: number) {
  try {
    return await withTimeout(takeRedisToken(key, limit, windowMs), 1_500);
  } catch {
    return takeMemoryToken(key, limit, windowMs);
  }
}

export function rateLimit(keyPrefix: string, limit = 10, windowMs = 60_000) {
  return async (req: any, res: any, next: any) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;

    const result = await takeRateLimitToken(key, limit, windowMs);
    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil(result.resetAfterMs / 1000));
      return res.status(429).json({ error: 'Too many requests, please slow down.' });
    }

    return next();
  };
}
