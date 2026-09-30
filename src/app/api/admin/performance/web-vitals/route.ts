import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireAdminRole } from '@/app/api/_compat/shared';
import { ensureRedis } from '@/features/shared/services/messaging/redis';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleAuditLog(userId: string | null | undefined, action: string, entityType: string, entityId?: string | null, metadata?: Record<string, unknown>) {
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  try {
    const env = getServerEnv();
    const PERFORMANCE_EVENTS_KEY = `${env.QUEUE_PREFIX}:analytics:web-vitals`;
    const PERFORMANCE_ALERTS_KEY = `${env.QUEUE_PREFIX}:analytics:web-vitals:alerts`;

    const requestedHours = Number.parseInt(String(request.nextUrl.searchParams.get('hours') ?? '24'), 10);
    const windowHours = Number.isFinite(requestedHours)
      ? Math.min(Math.max(requestedHours, 1), 24 * 7)
      : 24;
    const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
    const redis = await ensureRedis();
    const [rawItems, rawAlerts] = await Promise.all([
      redis.lrange(PERFORMANCE_EVENTS_KEY, 0, 299),
      redis.lrange(PERFORMANCE_ALERTS_KEY, 0, 39),
    ]);
    const items = rawItems
      .map((entry) => {
        try {
          return JSON.parse(entry);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{
        name: string;
        value: number;
        rating?: string | null;
        route: string;
        ts?: number;
      }>;
    const alerts = rawAlerts
      .map((entry) => {
        try {
          return JSON.parse(entry);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((entry) => Number(entry.ts ?? 0) >= cutoff)
      .slice(0, 10) as Array<{
        ts: number;
        route: string;
        metric: string;
        poorSamples: number;
        routePoorSamples: number;
        value?: number;
      }>;
    const filteredItems = items
      .filter((item) => Number(item.ts ?? 0) >= cutoff);

    const metricSummary = new Map<string, { total: number; count: number; poor: number; needsImprovement: number }>();
    const routeSummary = new Map<string, { samples: number; poor: number; lcpTotal: number; inpTotal: number }>();
    const bucketCount = 6;
    const bucketSizeMs = Math.max(1, Math.floor((windowHours * 60 * 60 * 1000) / bucketCount));
    const timeline = Array.from({ length: bucketCount }, (_, index) => ({
      label:
        windowHours <= 6
          ? `${bucketCount - index - 1}h`
          : `B${index + 1}`,
      samples: 0,
      poor: 0,
    }));

    for (const item of filteredItems) {
      const metric = item.name.replace(/^web-vital:/, '');
      const metricEntry = metricSummary.get(metric) ?? { total: 0, count: 0, poor: 0, needsImprovement: 0 };
      metricEntry.total += Number(item.value) || 0;
      metricEntry.count += 1;
      if (item.rating === 'poor') metricEntry.poor += 1;
      if (item.rating === 'needs-improvement') metricEntry.needsImprovement += 1;
      metricSummary.set(metric, metricEntry);

      const routeEntry = routeSummary.get(item.route) ?? { samples: 0, poor: 0, lcpTotal: 0, inpTotal: 0 };
      routeEntry.samples += 1;
      if (item.rating === 'poor') routeEntry.poor += 1;
      if (metric === 'LCP') routeEntry.lcpTotal += Number(item.value) || 0;
      if (metric === 'INP') routeEntry.inpTotal += Number(item.value) || 0;
      routeSummary.set(item.route, routeEntry);

      const ts = Number(item.ts ?? 0);
      if (ts >= cutoff) {
        const bucketIndex = Math.min(
          bucketCount - 1,
          Math.max(0, Math.floor((ts - cutoff) / bucketSizeMs)),
        );
        timeline[bucketIndex].samples += 1;
        if (item.rating === 'poor') {
          timeline[bucketIndex].poor += 1;
        }
      }
    }

    const metrics = Array.from(metricSummary.entries()).map(([name, entry]) => ({
      name,
      average: entry.count ? Number((entry.total / entry.count).toFixed(name === 'CLS' ? 4 : 0)) : 0,
      samples: entry.count,
      poor: entry.poor,
      needsImprovement: entry.needsImprovement,
    }));

    const routes = Array.from(routeSummary.entries())
      .map(([route, entry]) => ({
        route,
        samples: entry.samples,
        poor: entry.poor,
        avgLcp: entry.samples ? Math.round(entry.lcpTotal / Math.max(1, entry.samples)) : 0,
        avgInp: entry.samples ? Math.round(entry.inpTotal / Math.max(1, entry.samples)) : 0,
      }))
      .sort((a, b) => b.poor - a.poor || b.avgLcp - a.avgLcp)
      .slice(0, 8);

    const poorSamples = metrics.reduce((sum, metric) => sum + metric.poor, 0);
    const warningSamples = metrics.reduce((sum, metric) => sum + metric.needsImprovement, 0);
    const slowRoutes = routes.filter((route) => route.poor > 0);
    const alert =
      poorSamples > 0
        ? {
            severity: 'critical',
            title: 'Performance issues detected',
            message: `${poorSamples} poor vitals and ${slowRoutes.length} affected routes need attention in the last ${windowHours}h.`,
          }
        : warningSamples > 0
          ? {
              severity: 'warning',
              title: 'Performance needs monitoring',
              message: `${warningSamples} vitals need improvement across recent traffic in the last ${windowHours}h.`,
            }
          : {
              severity: 'healthy',
              title: 'Performance is healthy',
              message: `Recent browser vitals are within healthy thresholds for the last ${windowHours}h.`,
            };

    return NextResponse.json({
      windowHours,
      totalEvents: filteredItems.length,
      lastUpdated: filteredItems[0]?.ts ?? null,
      metrics,
      routes,
      timeline,
      alert,
      alerts,
    });
  } catch {
    console.error('GET /api/admin/performance/web-vitals error');
    return NextResponse.json({ error: 'Failed to load performance vitals' }, { status: 500 });
  }
}
