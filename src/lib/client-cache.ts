type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  inflight?: Promise<T>;
};

const clientCache = new Map<string, CacheEntry<unknown>>();
const MAX_CACHE_ENTRIES = 120;

function pruneClientCache(now: number) {
  for (const [key, entry] of clientCache.entries()) {
    if (!entry.inflight && entry.expiresAt <= now) {
      clientCache.delete(key);
    }
  }

  if (clientCache.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const keys = Array.from(clientCache.keys());
  const overflow = clientCache.size - MAX_CACHE_ENTRIES;
  for (let index = 0; index < overflow; index += 1) {
    clientCache.delete(keys[index]);
  }
}

export async function getCachedClientValue<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  pruneClientCache(now);
  const existing = clientCache.get(key) as CacheEntry<T> | undefined;

  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing?.inflight) {
    return existing.inflight.catch(() => fetcher());
  }

  const inflight = fetcher()
    .then((value) => {
      clientCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .catch((error) => {
      clientCache.delete(key);
      throw error;
    });

  clientCache.set(key, {
    expiresAt: now + ttlMs,
    inflight,
  });

  inflight
    .finally(() => {
      const current = clientCache.get(key);

      if (current && current.inflight === inflight && !current.value) {
        clientCache.delete(key);
      }
    })
    .catch(() => {});

  inflight.catch(() => {});

  return inflight;
}


