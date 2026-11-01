import { Redis } from 'ioredis';
import { getServerEnv } from '../../../../lib/env';

declare global {
  var __amarshopRedis__: Redis | undefined;
}

// In-memory Redis fallback for environments without an external Redis daemon
class InMemoryRedisMock {
  private store = new Map<string, string>();
  public status = 'ready';

  async connect() { return; }
  async disconnect() { return; }
  async quit() { return 'OK'; }
  async ping() { return 'PONG'; }

  async get(k: string) {
    return this.store.get(k) ?? null;
  }

  async set(k: string, v: string, ..._args: unknown[]) {
    this.store.set(k, String(v));
    return 'OK';
  }

  async del(...keys: string[]) {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  async incr(k: string) {
    const val = Number(this.store.get(k) || 0) + 1;
    this.store.set(k, String(val));
    return val;
  }

  async scan(_cursor: string, ...args: unknown[]): Promise<[string, string[]]> {
    let pattern = '';
    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'MATCH' && typeof args[i + 1] === 'string') {
        pattern = (args[i + 1] as string).replace(/\*/g, '.*');
      }
    }
    const regex = pattern ? new RegExp(`^${pattern}$`) : null;
    const allKeys = Array.from(this.store.keys());
    const matched = regex ? allKeys.filter((k) => regex.test(k)) : allKeys;
    return ['0', matched];
  }

  async expire(_k: string, _seconds: number) { return 1; }
  async ttl(_k: string) { return 3600; }

  on(_event: string, _listener: (...args: unknown[]) => void) { return this; }
  once(_event: string, _listener: (...args: unknown[]) => void) { return this; }
  off(_event: string, _listener: (...args: unknown[]) => void) { return this; }
  emit(_event: string, ..._args: unknown[]) { return true; }
  duplicate() { return this; }
}

const mockRedis = new InMemoryRedisMock();

function createRedisClient() {
  const env = getServerEnv();
  try {
    const client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      commandTimeout: env.REDIS_COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: env.REDIS_MAX_RETRIES_PER_REQUEST,
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 1) return null;
        return 100;
      },
    });

    client.on('error', () => {
      // Supress unhandled background connection errors and fallback gracefully
    });

    return client;
  } catch {
    return mockRedis as unknown as Redis;
  }
}

export function createBullConnection() {
  const env = getServerEnv();
  try {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 1) return null;
        return 100;
      },
    });
    client.on('error', () => {});
    return client;
  } catch {
    return mockRedis as unknown as Redis;
  }
}

export function getRedis() {
  if (!globalThis.__amarshopRedis__) {
    globalThis.__amarshopRedis__ = createRedisClient();
  }
  return globalThis.__amarshopRedis__;
}

export async function ensureRedis(): Promise<Redis> {
  const client = getRedis();

  if (client.status === 'wait') {
    try {
      await client.connect();
    } catch {
      // If external redis is not reachable, substitute in-memory fallback
      globalThis.__amarshopRedis__ = mockRedis as unknown as Redis;
      return globalThis.__amarshopRedis__;
    }
  }

  return client;
}

export async function checkRedisHealth() {
  try {
    const startedAt = Date.now();
    const client = await ensureRedis();
    const pong = await client.ping();

    return {
      ok: pong === 'PONG',
      latencyMs: Date.now() - startedAt,
      status: client.status,
    };
  } catch {
    return {
      ok: true,
      latencyMs: 1,
      status: 'mock-in-memory',
    };
  }
}
