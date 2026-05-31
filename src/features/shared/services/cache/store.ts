import { getServerEnv } from '@/src/lib/env';
import { ensureRedis } from '@/src/services/messaging/redis';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

function prefixKey(key: string) {
  const { REDIS_PREFIX } = getServerEnv();
  return `${REDIS_PREFIX}:cache:${key}`;
}

function getMemoryValue<T>(key: string) {
  const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (!cached) return null;

  if (cached.expiresAt < Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return cached.value;
}

function setMemoryValue<T>(key: string, value: T, ttlSeconds: number) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function getCache<T>(key: string) {
  try {
    const redis = await ensureRedis();
    const payload = await redis.get(prefixKey(key));
    return payload ? (JSON.parse(payload) as T) : null;
  } catch {
    return getMemoryValue<T>(key);
  }
}

export async function setCache<T>(key: string, value: T, ttlSeconds?: number) {
  const ttl = ttlSeconds ?? getServerEnv().CACHE_TTL_SECONDS;

  try {
    const redis = await ensureRedis();
    await redis.set(prefixKey(key), JSON.stringify(value), 'EX', ttl);
    return;
  } catch {
    setMemoryValue(key, value, ttl);
  }
}

export async function deleteCache(key: string) {
  try {
    const redis = await ensureRedis();
    await redis.del(prefixKey(key));
  } catch {
    memoryCache.delete(key);
  }
}

export async function deleteCacheByPrefix(prefix: string) {
  try {
    const redis = await ensureRedis();
    const pattern = `${getServerEnv().REDIS_PREFIX}:cache:${prefix}*`;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch {
    for (const key of Array.from(memoryCache.keys())) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
      }
    }
  }
}

export async function getOrSetCache<T>(key: string, loader: () => Promise<T>, ttlSeconds?: number) {
  const existing = await getCache<T>(key);
  if (existing !== null) {
    return existing;
  }

  const loaded = await loader();
  await setCache(key, loaded, ttlSeconds);
  return loaded;
}
