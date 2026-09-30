'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { DollarSign, Loader2, ShoppingBag, Store, Users } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import { formatPrice } from '../../../lib/utils';
import { DashboardSection, DashboardKpiCard, DashboardAlert, DashboardStatsGrid } from '@/features/shared/ui/dashboard';

const SalesChart = dynamic(() => import('@/features/shared/analytics/SalesChart'), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full animate-pulse rounded-2xl border border-black/5 bg-white p-4 shadow-sm" />
  ),
});

const ActivityHeatmap = dynamic(() => import('@/features/shared/analytics/ActivityHeatmap'), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full animate-pulse rounded-2xl border border-black/5 bg-white p-4 shadow-sm" />
  ),
});

interface AdminRecentOrder {
  id: string | number;
  user_name?: string;
  customer_name?: string;
  total: number;
  created_at: string;
}

interface AdminStats {
  totalUsers: number;
  totalSellers: number;
  totalOrders: number;
  totalRevenue: number;
  recentOrders: AdminRecentOrder[];
}

interface AdminDashboardInsights {
  salesSeries: Array<{ label: string; revenue: number; orders: number }>;
  activityHeatmap: Array<{ day: string; hours: Array<{ hour: number; count: number }> }>;
  lowStockProducts: Array<{ id: string; name: string; stock: number }>;
  activeShipments: number;
  activeRiskFlags: number;
  readinessSummary?: {
    sellers: {
      identity_incomplete: number;
      verification_incomplete: number;
      pickup_incomplete: number;
      courier_unlinked: number;
      payout_missing: number;
    };
    resellers: {
      verification_incomplete: number;
      catalog_empty: number;
      payout_missing: number;
      no_clicks_yet: number;
    };
  };
}

interface PerformanceMetricSummary {
  name: string;
  average: number;
  samples: number;
  poor: number;
  needsImprovement: number;
}

interface PerformanceRouteSummary {
  route: string;
  samples: number;
  poor: number;
  avgLcp: number;
  avgInp: number;
}

interface PerformanceSummaryResponse {
  totalEvents: number;
  lastUpdated: number | null;
  metrics: PerformanceMetricSummary[];
  routes: PerformanceRouteSummary[];
  alerts?: Array<{
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
}

const emptyStats: AdminStats = {
  totalUsers: 0,
  totalSellers: 0,
  totalOrders: 0,
  totalRevenue: 0,
  recentOrders: [],
};

const emptyReadinessSummary: NonNullable<AdminDashboardInsights['readinessSummary']> = {
  sellers: {
    identity_incomplete: 0,
    verification_incomplete: 0,
    pickup_incomplete: 0,
    courier_unlinked: 0,
    payout_missing: 0,
  },
  resellers: {
    verification_incomplete: 0,
    catalog_empty: 0,
    payout_missing: 0,
    no_clicks_yet: 0,
  },
};

const emptyInsights: AdminDashboardInsights = {
  salesSeries: [],
  activityHeatmap: [],
  lowStockProducts: [],
  activeShipments: 0,
  activeRiskFlags: 0,
  readinessSummary: emptyReadinessSummary,
};

export const AdminDashboard = () => {
  const { token } = useUser();
  const [stats, setStats] = useState<AdminStats>(emptyStats);
  const [insights, setInsights] = useState<AdminDashboardInsights>(emptyInsights);
  const [performanceSummary, setPerformanceSummary] = useState<PerformanceSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      if (!token) {
        setError('Please log in as an admin to view platform analytics.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const headers = { Authorization: `Bearer ${token}` };
        const [statsResponse, performanceResponse, insightsResponse] = await Promise.all([
          fetch('/api/admin/stats', {
            cache: 'no-store',
            headers,
          }),
          fetch('/api/admin/performance/web-vitals', {
            cache: 'no-store',
            headers,
          }),
          fetch('/api/admin/dashboard-insights', {
            cache: 'no-store',
            headers,
          }),
        ]);

        const endpointWarnings: string[] = [];

        if (statsResponse.ok) {
          const payload = (await statsResponse.json()) as AdminStats;
          setStats({
            totalUsers: Number(payload.totalUsers || 0),
            totalSellers: Number(payload.totalSellers || 0),
            totalOrders: Number(payload.totalOrders || 0),
            totalRevenue: Number(payload.totalRevenue || 0),
            recentOrders: Array.isArray(payload.recentOrders) ? payload.recentOrders : [],
          });
        } else {
          const payload = await statsResponse.json().catch(() => null);
          endpointWarnings.push(payload?.error || 'Admin statistics could not be loaded.');
          setStats(emptyStats);
        }

        if (performanceResponse.ok) {
          const performancePayload = (await performanceResponse.json()) as PerformanceSummaryResponse;
          setPerformanceSummary(performancePayload);
        } else {
          endpointWarnings.push('Performance telemetry could not be loaded.');
          setPerformanceSummary(null);
        }

        if (insightsResponse.ok) {
          const insightsPayload = (await insightsResponse.json()) as AdminDashboardInsights;
          setInsights({
            salesSeries: Array.isArray(insightsPayload.salesSeries) ? insightsPayload.salesSeries : [],
            activityHeatmap: Array.isArray(insightsPayload.activityHeatmap) ? insightsPayload.activityHeatmap : [],
            lowStockProducts: Array.isArray(insightsPayload.lowStockProducts) ? insightsPayload.lowStockProducts : [],
            activeShipments: Number(insightsPayload.activeShipments || 0),
            activeRiskFlags: Number(insightsPayload.activeRiskFlags || 0),
            readinessSummary: insightsPayload.readinessSummary || emptyReadinessSummary,
          });
        } else {
          endpointWarnings.push('Marketplace insights could not be loaded.');
          setInsights(emptyInsights);
        }

        setError(endpointWarnings.join(' '));
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Live platform analytics could not be loaded right now. Please try again shortly.',
        );
        setStats(emptyStats);
        setInsights(emptyInsights);
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
  }, [token]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, icon: <Users className="text-blue-500" /> },
    { label: 'Total Sellers', value: stats.totalSellers, icon: <Store className="text-purple-500" /> },
    { label: 'Total Orders', value: stats.totalOrders, icon: <ShoppingBag className="text-primary" /> },
    { label: 'Total Revenue', value: formatPrice(stats.totalRevenue), icon: <DollarSign className="text-accent" /> },
  ];

  const metricCards = (performanceSummary?.metrics ?? [])
    .filter((metric) => ['LCP', 'CLS', 'INP', 'FCP'].includes(metric.name))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {error ? (
        <DashboardAlert tone="warning" title="Some data could not be loaded" description={error} />
      ) : null}

      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Here&apos;s what&apos;s happening with your marketplace today.</p>
          </div>
        </div>
      </div>

      <DashboardStatsGrid>
        {statCards.map((stat) => (
          <DashboardKpiCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
        ))}
      </DashboardStatsGrid>

      <DashboardSection
        title="Operations Health"
        description="Monitor marketplace queues and risk signals."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-emerald-700">Active Shipments</p>
              <p className="text-2xl font-bold text-slate-950">{insights.activeShipments}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-700">Risk Flags</p>
              <p className="text-2xl font-bold text-slate-950">{insights.activeRiskFlags}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-700">Low Stock Products</p>
              <p className="text-2xl font-bold text-slate-950">{insights.lowStockProducts.length}</p>
            </div>
          </div>
        </div>
      </DashboardSection>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardSection
          title="Revenue Overview"
          description="Sales trend across recent hours."
        >
          <SalesChart title="Revenue trend (recent hours)" data={insights.salesSeries} />
        </DashboardSection>

        <DashboardSection
          title="Order Statistics"
          description="Recent order activity breakdown."
        >
          <ActivityHeatmap data={insights.activityHeatmap} />
        </DashboardSection>
      </div>

      <DashboardSection
        title="Recent Orders"
        description="Latest marketplace orders."
      >
        {stats.recentOrders.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No recent order activity yet.</p>
        ) : (
          <div className="space-y-4">
            {stats.recentOrders.map((order, index) => (
              <div key={order.id} className="flex items-start gap-4">
                <div
                  className={`mt-2 h-2 w-2 rounded-full ${
                    index % 2 === 0 ? 'bg-primary' : 'bg-blue-500'
                  }`}
                />
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-bold">{order.customer_name || order.user_name || 'Customer'}</span>{' '}
                    placed order <span className="font-bold">#ASB-{order.id}</span> for{' '}
                    <span className="font-bold">{formatPrice(order.total)}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardSection>

      <DashboardSection
        title="Seller & Reseller Readiness"
        description="Review partner account setup status."
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <h4 className="text-sm font-bold text-slate-900">Seller readiness</h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <a href="/admin/users?role=seller" className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-primary/20 hover:shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Identity incomplete</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{insights.readinessSummary?.sellers.identity_incomplete || 0}</p>
              </a>
              <a href="/admin/users?role=seller" className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-primary/20 hover:shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Verification incomplete</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{insights.readinessSummary?.sellers.verification_incomplete || 0}</p>
              </a>
              <a href="/admin/users?role=seller" className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-primary/20 hover:shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Pickup incomplete</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{insights.readinessSummary?.sellers.pickup_incomplete || 0}</p>
              </a>
              <a href="/admin/logistics" className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-primary/20 hover:shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Courier unlinked</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{insights.readinessSummary?.sellers.courier_unlinked || 0}</p>
              </a>
              <a href="/admin/payments" className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-primary/20 hover:shadow-sm sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Payout missing</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{insights.readinessSummary?.sellers.payout_missing || 0}</p>
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <h4 className="text-sm font-bold text-slate-900">Reseller readiness</h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <a href="/admin/users?role=reseller" className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-primary/20 hover:shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Verification incomplete</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{insights.readinessSummary?.resellers.verification_incomplete || 0}</p>
              </a>
              <a href="/admin/users?role=reseller" className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-primary/20 hover:shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Catalog empty</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{insights.readinessSummary?.resellers.catalog_empty || 0}</p>
              </a>
              <a href="/admin/payments" className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-primary/20 hover:shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Payout missing</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{insights.readinessSummary?.resellers.payout_missing || 0}</p>
              </a>
              <a href="/admin/users?role=reseller" className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-primary/20 hover:shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">No clicks yet</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{insights.readinessSummary?.resellers.no_clicks_yet || 0}</p>
              </a>
            </div>
          </div>
        </div>
      </DashboardSection>

      {performanceSummary?.alert ? (
        <DashboardAlert
          tone={performanceSummary.alert.severity === 'critical' ? 'critical' : performanceSummary.alert.severity === 'warning' ? 'warning' : 'info'}
          title={performanceSummary.alert.title}
          description={performanceSummary.alert.message}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DashboardSection
            title="Real Performance Vitals"
            description={
              performanceSummary?.lastUpdated
                ? `Updated ${new Date(performanceSummary.lastUpdated).toLocaleString()}`
                : 'Waiting for live browser vitals'
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {metricCards.length === 0 ? (
                <p className="text-sm text-slate-500">No vitals have been collected yet from live traffic.</p>
              ) : (
                metricCards.map((metric) => (
                  <div key={metric.name} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{metric.name}</p>
                      <span className="text-xs text-slate-500">{metric.samples} samples</span>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-950">{metric.average}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {metric.poor} poor, {metric.needsImprovement} needs improvement
                    </p>
                  </div>
                ))
              )}
            </div>
          </DashboardSection>
        </div>

        <div>
          <DashboardSection
            title="Slow Route Watchlist"
            description="Routes with poor performance samples."
          >
            <div className="space-y-3">
              {(performanceSummary?.routes ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Route-level vitals will appear here after real visits.</p>
              ) : (
                performanceSummary?.routes.map((route) => (
                  <div key={route.route} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-semibold text-slate-900">{route.route}</p>
                      <span className="text-xs font-semibold text-rose-600">{route.poor} poor samples</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
                      <span>{route.samples} samples</span>
                      <span>Avg LCP {route.avgLcp}ms</span>
                      <span>Avg INP {route.avgInp}ms</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </DashboardSection>
        </div>
      </div>
    </div>
  );
};
