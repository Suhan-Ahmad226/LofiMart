import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import dynamic from 'next/dynamic';
import { Activity, DollarSign, Loader2, ShieldCheck, ShoppingBag, Store, Users } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { formatPrice } from '../../lib/utils';

const SalesChart = dynamic(() => import('../../components/analytics/SalesChart'), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full animate-pulse rounded-2xl border border-black/5 bg-white p-4 shadow-sm" />
  ),
});

const ActivityHeatmap = dynamic(() => import('../../components/analytics/ActivityHeatmap'), {
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

interface AdminOperationsSummaryItem {
  key: string;
  label: string;
  count: number;
  tone: 'healthy' | 'warning' | 'critical';
  description: string;
  href: string;
  actionLabel: string;
}

interface AdminOperationsSummary {
  updatedAt: string;
  items: AdminOperationsSummaryItem[];
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

export const AdminDashboard = () => {
  const { token } = useUser();
  const [stats, setStats] = useState<AdminStats>(emptyStats);
  const [insights, setInsights] = useState<AdminDashboardInsights>({
    salesSeries: [],
    activityHeatmap: [],
    lowStockProducts: [],
    activeShipments: 0,
    activeRiskFlags: 0,
    readinessSummary: {
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
    },
  });
  const [performanceSummary, setPerformanceSummary] = useState<PerformanceSummaryResponse | null>(null);
  const [operationsSummary, setOperationsSummary] = useState<AdminOperationsSummary | null>(null);
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
        const [statsResponse, performanceResponse, insightsResponse, operationsResponse] = await Promise.all([
          fetch('/api/admin/stats', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/admin/performance/web-vitals', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/admin/dashboard-insights', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/admin/operations-summary', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!statsResponse.ok) {
          const payload = await statsResponse.json().catch(() => null);
          throw new Error(payload?.error || 'Failed to load admin statistics');
        }

        const payload = (await statsResponse.json()) as AdminStats;
        setStats({
          totalUsers: Number(payload.totalUsers || 0),
          totalSellers: Number(payload.totalSellers || 0),
          totalOrders: Number(payload.totalOrders || 0),
          totalRevenue: Number(payload.totalRevenue || 0),
          recentOrders: Array.isArray(payload.recentOrders) ? payload.recentOrders : [],
        });

        if (performanceResponse.ok) {
          const performancePayload = (await performanceResponse.json()) as PerformanceSummaryResponse;
          setPerformanceSummary(performancePayload);
        } else {
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
            readinessSummary: insightsPayload.readinessSummary || {
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
            },
          });
        } else {
          setInsights({
            salesSeries: [],
            activityHeatmap: [],
            lowStockProducts: [],
            activeShipments: 0,
            activeRiskFlags: 0,
            readinessSummary: {
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
            },
          });
        }

        if (operationsResponse.ok) {
          const operationsPayload = (await operationsResponse.json()) as AdminOperationsSummary;
          setOperationsSummary({
            updatedAt: operationsPayload.updatedAt,
            items: Array.isArray(operationsPayload.items) ? operationsPayload.items : [],
          });
        } else {
          setOperationsSummary(null);
        }
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Live platform analytics could not be loaded right now. Please try again shortly.',
        );
        setStats(emptyStats);
        setInsights({
          salesSeries: [],
          activityHeatmap: [],
          lowStockProducts: [],
          activeShipments: 0,
          activeRiskFlags: 0,
          readinessSummary: {
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
          },
        });
        setOperationsSummary(null);
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
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      {performanceSummary?.alert ? (
        <div
          className={`rounded-xl border p-4 text-sm ${
            performanceSummary.alert.severity === 'critical'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : performanceSummary.alert.severity === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <p className="font-semibold">{performanceSummary.alert.title}</p>
          <p className="mt-1">{performanceSummary.alert.message}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center space-x-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:space-x-4 sm:p-6"
          >
            <div className="rounded-xl bg-gray-50 p-2.5 sm:p-3">{stat.icon}</div>
            <div>
              <p className="text-xs text-gray-500 sm:text-sm">{stat.label}</p>
              <p className="text-lg font-bold sm:text-2xl">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-bold">Action needed</h3>
            <p className="text-sm text-gray-500">
              {operationsSummary?.updatedAt
                ? `Operational queues updated ${new Date(operationsSummary.updatedAt).toLocaleString()}`
                : 'Live admin backlog summary'}
            </p>
          </div>
          <a href="/admin/users" className="text-sm font-semibold text-primary hover:underline">
            Open admin tools
          </a>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(operationsSummary?.items ?? []).map((item) => (
            <a
              key={item.key}
              href={item.href}
              className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${
                item.tone === 'critical'
                  ? 'border-rose-200 bg-rose-50'
                  : item.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-950">{item.count}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    item.tone === 'critical'
                      ? 'bg-rose-100 text-rose-700'
                      : item.tone === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {item.tone === 'critical' ? 'Urgent' : item.tone === 'warning' ? 'Needs review' : 'Stable'}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{item.description}</p>
              <p className="mt-4 text-sm font-semibold text-primary">{item.actionLabel}</p>
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-bold">Seller & reseller readiness</h3>
            <p className="text-sm text-gray-500">
              Review which partner accounts are still missing identity, payout, pickup, courier, or catalog setup.
            </p>
          </div>
          <a href="/admin/users" className="text-sm font-semibold text-primary hover:underline">
            Open partner review
          </a>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
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

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
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
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesChart title="Revenue trend (recent hours)" data={insights.salesSeries} />
        </div>
        <div>
          <ActivityHeatmap data={insights.activityHeatmap} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="mb-8 flex items-center justify-between">
            <h3 className="text-lg font-bold">Recent Orders</h3>
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <Activity size={14} className="animate-pulse text-primary" />
              <span>Latest orders</span>
            </div>
          </div>

          <div className="space-y-6">
            {stats.recentOrders.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No recent order activity yet.</p>
            ) : (
              stats.recentOrders.map((order, index) => (
                <div key={order.id} className="flex items-start space-x-4">
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
                    <p className="text-xs text-gray-400">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h3 className="mb-6 flex items-center space-x-2 text-lg font-bold">
            <ShieldCheck size={20} className="text-emerald-600" />
            <span>Operations Health</span>
          </h3>

          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="mb-1 text-sm font-bold text-emerald-700">Active shipment queue</p>
              <p className="text-xs text-emerald-800/80">
                {insights.activeShipments} shipment{insights.activeShipments === 1 ? '' : 's'} currently moving through pickup, transit, or last-mile delivery.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="mb-1 text-sm font-bold text-slate-700">Risk review snapshot</p>
              <p className="text-xs text-slate-600">
                {insights.activeRiskFlags} active risk flag{insights.activeRiskFlags === 1 ? '' : 's'} currently require admin attention across the marketplace.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="mb-2 text-sm font-bold text-slate-700">Low stock watchlist</p>
              {insights.lowStockProducts.length > 0 ? (
                <div className="space-y-2">
                  {insights.lowStockProducts.slice(0, 3).map((product) => (
                    <div key={product.id} className="rounded-lg border border-slate-100 bg-white/70 px-3 py-2">
                      <div className="flex items-center justify-between text-xs text-slate-700">
                        <span className="truncate pr-3">{product.name}</span>
                        <span className="font-semibold">{product.stock} left</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold">
                        <a
                          href={`/admin/products?search=${encodeURIComponent(String(product.id))}&product=${encodeURIComponent(String(product.id))}`}
                          className="text-primary hover:underline"
                        >
                          Open product
                        </a>
                        <a
                          href={`/admin/inventory?product=${encodeURIComponent(String(product.id))}`}
                          className="text-slate-600 hover:text-primary hover:underline"
                        >
                          Open inventory
                        </a>
                        <a
                          href={`/admin/inventory?section=po&product=${encodeURIComponent(String(product.id))}`}
                          className="text-amber-700 hover:text-amber-800 hover:underline"
                        >
                          Restock workflow
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600">No low-stock products are currently below the platform threshold.</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-700">Recent performance incidents</p>
                <a href="/admin/performance" className="text-xs font-semibold text-primary hover:underline">
                  Open
                </a>
              </div>
              {performanceSummary?.alerts && performanceSummary.alerts.length > 0 ? (
                <div className="space-y-3">
                  {performanceSummary.alerts.slice(0, 3).map((incident) => (
                    <div
                      key={`${incident.ts}-${incident.route}-${incident.metric}`}
                      className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2"
                    >
                      <p className="text-xs font-semibold text-slate-800">
                        {incident.metric} on {incident.route}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {incident.routePoorSamples} route poor, {incident.poorSamples} poor in window
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600">No triggered incidents in the current telemetry window.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Real performance vitals</h3>
              <p className="text-sm text-gray-500">
                {performanceSummary?.lastUpdated
                  ? `Updated ${new Date(performanceSummary.lastUpdated).toLocaleString()}`
                  : 'Waiting for live browser vitals'}
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {performanceSummary?.totalEvents ?? 0} samples
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {metricCards.length === 0 ? (
              <p className="text-sm text-gray-500">No vitals have been collected yet from live traffic.</p>
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
        </div>

        <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">Slow route watchlist</h3>
          <div className="mt-5 space-y-4">
            {(performanceSummary?.routes ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">Route-level vitals will appear here after real visits.</p>
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
        </div>
      </div>
    </div>
  );
};
