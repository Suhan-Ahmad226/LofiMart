import { getCache, setCache } from '@/src/services/cache/store';
import { BKASH_TOKEN_CACHE_KEY, BKASH_TOKEN_SKEW_MS } from './constants';
import type { BkashTokenCache } from './types';

export async function readBkashTokenCache() {
  const cached = await getCache<BkashTokenCache>(BKASH_TOKEN_CACHE_KEY);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now() + BKASH_TOKEN_SKEW_MS) {
    return null;
  }

  return cached;
}

export async function writeBkashTokenCache(token: BkashTokenCache, ttlSeconds: number) {
  await setCache(BKASH_TOKEN_CACHE_KEY, token, ttlSeconds);
}
