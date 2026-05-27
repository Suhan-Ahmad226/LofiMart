import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/src/services/database/prisma';
import { checkRedisHealth } from '@/src/services/messaging/redis';
import { getQueueHealth } from '@/src/workers/queue';
import { secureApiRoute } from '@/src/server/next/apiSecurity';
import { apiSuccess } from '@/src/lib/api-response';

export const runtime = 'nodejs';

type HealthResult = {
  ok: boolean;
  latencyMs?: number;
  provider?: string;
  status?: string;
  queues?: Record<string, unknown>;
  error?: string;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

export async function GET(req: Request) {
  const securityResult = await secureApiRoute(req, {
    keyPrefix: 'api:health',
    limit: 30,
    enforceOriginForMutations: false,
  });
  if (securityResult instanceof NextResponse) return securityResult;

  const ts = Date.now();
  const [database, redis, queue]: [HealthResult, HealthResult, HealthResult] = await Promise.all([
    withTimeout<HealthResult>(checkDatabaseHealth(), 5_000, { ok: false, error: 'database_timeout' }),
    withTimeout<HealthResult>(checkRedisHealth(), 5_000, { ok: false, error: 'redis_timeout' }),
    withTimeout<HealthResult>(getQueueHealth(), 5_000, { ok: false, error: 'queue_timeout' }),
  ]);
  const ok = Boolean(database.ok && redis.ok && queue.ok);

  return apiSuccess(
    {
      service: 'lofimart',
      ts,
      ok,
      infrastructure: {
        database,
        redis,
        queue,
      },
    },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
