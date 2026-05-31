import { Redis } from 'ioredis';
import { getServerEnv } from '@/src/lib/env';

declare global {
  var __amarshopRedis__: Redis | undefined;
}

function createRedisClient() {
  const { REDIS_URL, REDIS_COMMAND_TIMEOUT_MS, REDIS_CONNECT_TIMEOUT_MS, REDIS_MAX_RETRIES_PER_REQUEST } =
    getServerEnv();

  return new Redis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
    maxRetriesPerRequest: REDIS_MAX_RETRIES_PER_REQUEST,
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 2) return null;
      return Math.min(times * 250, 1000);
    },
  });
}

export function getRedis() {
  if (!globalThis.__amarshopRedis__) {
    globalThis.__amarshopRedis__ = createRedisClient();
  }

  return globalThis.__amarshopRedis__;
}

export async function ensureRedis() {
  const client = getRedis();

  if (client.status === 'wait') {
    await client.connect();
  }

  return client;
}

export async function checkRedisHealth() {
  const startedAt = Date.now();
  const client = await ensureRedis();
  const pong = await client.ping();

  return {
    ok: pong === 'PONG',
    latencyMs: Date.now() - startedAt,
    status: client.status,
  };
}
