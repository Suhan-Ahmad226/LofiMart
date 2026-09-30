import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireAdminRole } from '@/app/api/_compat/shared';
import { ensureRedis } from '@/features/shared/services/messaging/redis';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleAuditLog(userId: string | null | undefined, action: string, entityType: string, entityId?: string | null, metadata?: Record<string, unknown>) {
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  try {
    const body = await request.json().catch(() => ({})) || {};
    const ts = Number(body?.ts);
    const route = typeof body?.route === 'string' ? body.route : '';
    const metric = typeof body?.metric === 'string' ? body.metric : '';

    if (!Number.isFinite(ts) || !route || !metric) {
      return NextResponse.json({ error: 'Invalid alert acknowledgement payload' }, { status: 400 });
    }

    const env = getServerEnv();
    const PERFORMANCE_ALERTS_KEY = `${env.QUEUE_PREFIX}:analytics:web-vitals:alerts`;
    const redis = await ensureRedis();
    const rawAlerts = await redis.lrange(PERFORMANCE_ALERTS_KEY, 0, 49);
    const remainingAlerts = rawAlerts.filter((entry) => {
      try {
        const parsed = JSON.parse(entry);
        return !(
          Number(parsed?.ts) === ts &&
          String(parsed?.route || '') === route &&
          String(parsed?.metric || '') === metric
        );
      } catch {
        return false;
      }
    });

    const multi = redis.multi().del(PERFORMANCE_ALERTS_KEY);
    if (remainingAlerts.length > 0) {
      multi.rpush(PERFORMANCE_ALERTS_KEY, ...remainingAlerts).expire(PERFORMANCE_ALERTS_KEY, 60 * 60 * 24 * 14);
    }
    await multi.exec();

    await handleAuditLog(String(user.id), 'admin.performance.alert_acknowledged', 'performance_alert', `${metric}:${route}:${ts}`, {
      route,
      metric,
      ts,
    });

    return NextResponse.json({ success: true });
  } catch {
    console.error('POST /api/admin/performance/web-vitals/acknowledge error');
    return NextResponse.json({ error: 'Failed to acknowledge performance alert' }, { status: 500 });
  }
}
