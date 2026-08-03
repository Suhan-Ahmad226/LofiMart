'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Gauge, Loader2, RefreshCw, TimerReset, TriangleAlert } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';

type PerformanceMetricSummary = {
  name: string;
  average: number;
  samples: number;
  poor: number;
  needsImprovement: number;
};

type PerformanceRouteSummary = {
  route: string;
  samples: number;
  poor: number;
  avgLcp: number;
  avgInp: number;
};

type PerformanceSummaryResponse = {
  windowHours: number;
  totalEvents: number;
  lastUpdated: number | null;
  metrics: PerformanceMetricSummary[];
  routes: PerformanceRouteSummary[];
  timeline: Array<{
    label: string;
    samples: number;
    poor: number;
  }>;
  alerts: Array<{
    ts: number;
    route: string;
    metric: string;
    poorSamples: number;
    routePoorSamples: number;
    value?: number;
  }>;
  alert?: {
    severity: 'healthy' | 'warning' | 'critical';
    title: string;
    message: string;
  };
};

const emptySummary: PerformanceSummaryResponse = {
  windowHours: 24,
  totalEvents: 0,
  lastUpdated: null,
  metrics: [],
  routes: [],
  timeline: [],
  alerts: [],
};

const windowOptions = [
  { label: '1H', value: 1 },
  { label: '6H', value: 6 },
  { label: '24H', value: 24 },
  { label: '7D', value: 168 },
];

function getMetricUnit(name: string) {
  if (name === 'CLS') return '';
  return 'ms';
}

function getMetricStatus(metric: PerformanceMetricSummary) {
  if (metric.poor > 0) return { label: 'Needs attention', tone: 'text-rose-600 bg-rose-50 border-rose-200' };
  if (metric.needsImprovement > 0) return { label: 'Watch closely', tone: 'text-amber-700 bg-amber-50 border-amber-200' };
  return { label: 'Healthy', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
}

export const AdminPerformancePage = () => {
  const { token } = useUser();
  const [summary, setSummary] = useState<PerformanceSummaryResponse>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acknowledgingKey, setAcknowledgingKey] = useState('');
  const [acknowledgingAll, setAcknowledgingAll] = useState(false);
  const [error, setError] = useState('');
  const [windowHours, setWindowHours] = useState(24);

  const loadSummary = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!token) {
      setError('Please log in as an admin to view performance telemetry.');
      setLoading(false);
      return;
    }

    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      setError('');
      const response = await fetch(`/api/admin/performance/web-vitals?hours=${windowHours}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load performance telemetry');
      }

      setSummary({
        windowHours: Number(payload?.windowHours || windowHours),
        totalEvents: Number(payload?.totalEvents || 0),
        lastUpdated: payload?.lastUpdated ? Number(payload.lastUpdated) : null,
        metrics: Array.isArray(payload?.metrics) ? payload.metrics : [],
        routes: Array.isArray(payload?.routes) ? payload.routes : [],
        timeline: Array.isArray(payload?.timeline) ? payload.timeline : [],
        alerts: Array.isArray(payload?.alerts) ? payload.alerts : [],
        alert: payload?.alert,
      });
    } catch (requestError) {
      setSummary(emptySummary);
      setError(requestError instanceof Error ? requestError.message : 'Performance telemetry is unavailable right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadSummary('initial');
  }, [token, windowHours]);

  useEffect(() => {
    if (!token) return;

    const timer = window.setInterval(() => {
      void loadSummary('refresh');
    }, 60000);

    return () => window.clearInterval(timer);
  }, [token]);

  const metricCards = useMemo(
    () => summary.metrics.filter((metric) => ['LCP', 'CLS', 'INP', 'FCP', 'TTFB'].includes(metric.name)),
    [summary.metrics],
  );

  const routeCards = useMemo(() => summary.routes.slice(0, 12), [summary.routes]);

  const acknowledgeAlert = async (alert: PerformanceSummaryResponse['alerts'][number]) => {
    if (!token) return;

    const key = `${alert.ts}-${alert.route}-${alert.metric}`;
    setAcknowledgingKey(key);

    try {
      const response = await fetch('/api/admin/performance/web-vitals/acknowledge', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ts: alert.ts,
          route: alert.route,
          metric: alert.metric,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to acknowledge alert');
      }

      setSummary((current) => ({
        ...current,
        alerts: current.alerts.filter((item) => !(item.ts === alert.ts && item.route === alert.route && item.metric === alert.metric)),
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to acknowledge alert');
    } finally {
      setAcknowledgingKey('');
    }
  };

  const acknowledgeAllVisibleAlerts = async () => {
    if (!token || summary.alerts.length === 0) return;

    setAcknowledgingAll(true);
    setError('');

    try {
      for (const alert of summary.alerts) {
        const response = await fetch('/api/admin/performance/web-vitals/acknowledge', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ts: alert.ts,
            route: alert.route,
            metric: alert.metric,
          }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to acknowledge all alerts');
        }
      }

      setSummary((current) => ({
        ...current,
        alerts: [],
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to acknowledge all alerts');
    } finally {
      setAcknowledgingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performance Telemetry</h1>
          <p className="text-gray-500">
            Real browser vitals from live users, grouped into practical route health summaries for operators.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1">
            {windowOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setWindowHours(option.value)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  windowHours === option.value
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
            {summary.totalEvents} live samples
          </div>
          <button
            type="button"
            onClick={() => void loadSummary('refresh')}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-primary hover:text-primary disabled:opacity-60"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>
      ) : null}

      {summary.alert ? (
        <div
          className={`rounded-2xl border p-5 ${
            summary.alert.severity === 'critical'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : summary.alert.severity === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <p className="font-semibold">{summary.alert.title}</p>
          <p className="mt-1 text-sm">{summary.alert.message}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metricCards.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 xl:col-span-5">
            Waiting for live browser vitals to arrive from real traffic.
          </div>
        ) : (
          metricCards.map((metric) => {
            const status = getMetricStatus(metric);
            return (
              <div key={metric.name} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                    <Gauge className="h-5 w-5" />
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${status.tone}`}>
                    {status.label}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{metric.name}</p>
                <p className="mt-1 text-3xl font-bold text-slate-950">
                  {metric.average}
                  <span className="ml-1 text-base font-semibold text-slate-400">{getMetricUnit(metric.name)}</span>
                </p>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{metric.samples} samples</span>
                  <span>{metric.poor} poor</span>
                  <span>{metric.needsImprovement} watch</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Recent telemetry timeline</h2>
            <p className="text-sm text-slate-500">
              Rolling sample flow across the last {summary.windowHours} hour{summary.windowHours > 1 ? 's' : ''}.
            </p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {summary.timeline.length === 0 ? (
            <p className="text-sm text-slate-500 xl:col-span-6">Timeline buckets will appear after real visits.</p>
          ) : (
            summary.timeline.map((bucket) => {
              const barHeight = Math.max(12, Math.min(100, bucket.samples * 8));
              return (
                <div key={bucket.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-end gap-2">
                    <div className="flex h-24 items-end">
                      <div
                        className="w-8 rounded-t-xl bg-slate-900/85"
                        style={{ height: `${barHeight}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500">
                      <p className="font-semibold text-slate-900">{bucket.samples}</p>
                      <p>{bucket.poor} poor</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{bucket.label}</p>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Slow route watchlist</h2>
              <p className="text-sm text-slate-500">
                Highest-friction routes ordered by poor samples and slower contentful paint.
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              Top {routeCards.length}
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {routeCards.length === 0 ? (
              <p className="text-sm text-slate-500">Route-level telemetry will appear after real visits.</p>
            ) : (
              routeCards.map((route) => (
                <div key={route.route} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="truncate font-semibold text-slate-950">{route.route}</p>
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
                      {route.poor} poor
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-600 sm:grid-cols-3">
                    <div className="rounded-xl bg-white px-3 py-2">Samples: {route.samples}</div>
                    <div className="rounded-xl bg-white px-3 py-2">Avg LCP: {route.avgLcp}ms</div>
                    <div className="rounded-xl bg-white px-3 py-2">Avg INP: {route.avgInp}ms</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                  <TriangleAlert className="h-5 w-5 text-amber-600" />
                  Recent triggered alerts
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Cooldown-aware incidents raised from real poor vitals bursts.
                </p>
              </div>
              {summary.alerts.length > 1 ? (
                <button
                  type="button"
                  onClick={() => void acknowledgeAllVisibleAlerts()}
                  disabled={acknowledgingAll}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary hover:text-primary disabled:opacity-60"
                >
                  {acknowledgingAll ? 'Saving...' : 'Acknowledge all visible'}
                </button>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {summary.alerts.length === 0 ? (
                <p className="text-sm text-slate-500">No triggered incidents in this window.</p>
              ) : (
                summary.alerts.map((item) => (
                  <div key={`${item.ts}-${item.route}-${item.metric}`} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-950">{item.metric} alert on {item.route}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {item.poorSamples} poor samples in the last 10 minutes, including {item.routePoorSamples} on this route.
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="whitespace-nowrap text-xs font-semibold text-amber-700">
                          {new Date(item.ts).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => void acknowledgeAlert(item)}
                          disabled={acknowledgingKey === `${item.ts}-${item.route}-${item.metric}`}
                          className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:text-primary disabled:opacity-60"
                        >
                          {acknowledgingKey === `${item.ts}-${item.route}-${item.metric}` ? 'Saving...' : 'Acknowledge'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                      <span className="rounded-full bg-white px-3 py-1">Route poor: {item.routePoorSamples}</span>
                      <span className="rounded-full bg-white px-3 py-1">Window poor: {item.poorSamples}</span>
                      {typeof item.value === 'number' ? (
                        <span className="rounded-full bg-white px-3 py-1">Latest value: {Math.round(item.value)}</span>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <Activity className="h-5 w-5 text-primary" />
              Operator notes
            </h2>
            <div className="mt-5 space-y-4 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">Focus on LCP first</p>
                <p className="mt-1 leading-6">
                  When slow route samples cluster, improving above-the-fold rendering usually gives the fastest user-facing win.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">Watch INP for interaction-heavy pages</p>
                <p className="mt-1 leading-6">
                  Product, community, and dashboard routes benefit most from lower interaction delay after bundle trimming.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">Keep collecting live traffic</p>
                <p className="mt-1 leading-6">
                  This view improves as more real sessions land. Low sample counts are useful, but trends become stronger with production traffic.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <TimerReset className="h-5 w-5 text-primary" />
              Last collection window
            </h2>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              {summary.lastUpdated ? (
                <p>
                  Latest browser sample received at{' '}
                  <span className="font-semibold text-slate-900">{new Date(summary.lastUpdated).toLocaleString()}</span>.
                </p>
              ) : (
                <p>No live performance sample has been received yet.</p>
              )}
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Telemetry is lightweight and rolling. The latest summaries keep recent browser events instead of storing unlimited history.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPerformancePage;
