'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Clock3,
  DollarSign,
  Bell,
  Eye,
  LayoutDashboard,
  MoreHorizontal,
  Package,
  ShoppingBag,
  Settings2,
  Star,
  Store,
  TrendingUp,
  Truck,
  Wallet,
  Zap,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import toast from '@/lib/toast';
import { useUser } from '../../../features/shared/state/UserContext';
import { copyText } from '../../../lib/browser-actions';
import { formatPrice } from '../../../lib/utils';
import { Link } from '../../../lib/navigation';
import { Product } from '../../../types';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';
import { ProductCard } from '@/features/shared/ui/product/ProductCard';
import { DashboardStatsSkeleton, ListCardSkeleton } from '@/features/shared/ui/DataSkeletons';
import { buildSellerDashboardIntelligence } from '../../../features/seller/lib/dashboard-intelligence';

const SalesPerformanceChart = dynamic(() => import('@/features/seller/components/SalesPerformanceChart'), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full animate-pulse rounded-xl bg-secondary" />,
});

type SellerStatsResponse = {
  totalProducts: number;
  totalOrders: number;
  totalEarnings: number;
  topProducts: Array<{ id: string; name: string; image?: string | null; sales: number; revenue: number }>;
};

type SellerDashboardInsights = {
  salesSeries: Array<{ label: string; revenue: number }>;
  lowStockProducts: Array<{ id: string; name: string; stock: number; warehouse_id?: string | null; warehouse_name?: string | null }>;
  recentShipments: Array<{ id: string; order_id: string; created_at: string; total: number; status: string }>;
  activeShipments: number;
  deliveredShipments: number;
};

type SellerOnboardingStatus = {
  seller?: {
    seller_status?: string | null;
    rejection_reason?: string | null;
    suspension_reason?: string | null;
  };
  summary?: {
    completed_steps: number;
    total_steps: number;
    progress_percent: number;
    ready_for_admin_review: boolean;
  };
  next_step?: {
    title: string;
    status: string;
    action_path: string;
  } | null;
  approval?: {
    status: string;
    submitted_for_review_at?: string | null;
    approved_at?: string | null;
    rejection_reason?: string | null;
    suspension_reason?: string | null;
    missing_requirements?: Array<{ id: string; label: string }>;
    can_submit_for_review?: boolean;
  } | null;
};

type FlashSaleEntry = {
  id: string;
  campaign_id: string;
  product_id: string;
  sale_price: number;
  allocated_stock: number;
  status: string;
  product?: Product | null;
};

type SellerCoupon = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_order_value: number;
  expiry_date: string;
};

const emptyInsights: SellerDashboardInsights = {
  salesSeries: [],
  lowStockProducts: [],
  recentShipments: [],
  activeShipments: 0,
  deliveredShipments: 0,
};

const manageModeStorageKey = 'amarshop_seller_dashboard_manage_mode';

function formatTrendValue(current: number, previous: number) {
  if (!previous) {
    return current > 0 ? '+100%' : '0%';
  }

  const growth = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(growth);
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
}

function MiniTrendBars({ data }: { data: number[] }) {
  const sanitized = data.length > 0 ? data : [0, 0, 0, 0, 0];
  const max = Math.max(...sanitized, 1);

  return (
    <div className="flex h-10 items-end gap-1">
      {sanitized.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="block w-2 rounded-full bg-primary/70"
          style={{ height: `${Math.max(18, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="section-kicker text-primary/70">{eyebrow}</p>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function SellerKpiCard({
  label,
  value,
  trend,
  trendTone,
  icon,
  chart,
}: {
  label: string;
  value: string;
  trend: string;
  trendTone: 'good' | 'neutral' | 'warning';
  icon: React.ReactNode;
  chart: number[];
}) {
  const trendClass =
    trendTone === 'good'
      ? 'bg-emerald-50 text-emerald-700'
      : trendTone === 'warning'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-slate-100 text-slate-600';

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-none">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <h3 className="mt-2.5 text-2xl font-bold text-slate-950">{value}</h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <MiniTrendBars data={chart} />
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${trendClass}`}>{trend}</span>
      </div>
    </div>
  );
}

type SellerKpiConfig = {
  label: string;
  value: string;
  trend: string;
  trendTone: 'good' | 'neutral' | 'warning';
  icon: React.ReactNode;
  chart: number[];
};

type SellerPriorityItem = {
  id: string;
  tone: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
  to: string;
  ctaLabel: string;
};

type SellerHealthItem = {
  id: string;
  label: string;
  value: string;
  tone: 'good' | 'warning' | 'critical';
};

function QuickActionLink({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between gap-4 rounded-xl border border-border bg-white px-4 py-4 shadow-none transition hover:border-primary/20 hover:bg-secondary/30"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">{icon}</div>
        <div>
          <p className="text-sm font-bold text-slate-950">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <ArrowRight size={16} className="text-slate-400 transition group-hover:text-primary" />
    </Link>
  );
}

function OperationalAlertCard({
  tone,
  title,
  description,
  cta,
}: {
  tone: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
  cta?: React.ReactNode;
}) {
  const toneClass =
    tone === 'critical'
      ? 'border-rose-200 bg-rose-50'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : tone === 'success'
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-sky-200 bg-sky-50';

  const iconClass =
    tone === 'critical'
      ? 'text-rose-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : tone === 'success'
          ? 'text-emerald-600'
          : 'text-sky-600';

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${iconClass}`}>
          {tone === 'success' ? <CheckCircle2 size={18} /> : tone === 'info' ? <Zap size={18} /> : <AlertTriangle size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
          {cta ? <div className="mt-3">{cta}</div> : null}
        </div>
      </div>
    </div>
  );
}

function SellerPriorityCard({ item }: { item: SellerPriorityItem }) {
  const toneClass =
    item.tone === 'critical'
      ? 'border-rose-200 bg-rose-50'
      : item.tone === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : item.tone === 'success'
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-sky-200 bg-sky-50';

  const badgeClass =
    item.tone === 'critical'
      ? 'bg-rose-100 text-rose-700'
      : item.tone === 'warning'
        ? 'bg-amber-100 text-amber-700'
        : item.tone === 'success'
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-sky-100 text-sky-700';

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${badgeClass}`}>
            {item.tone}
          </span>
          <p className="mt-3 text-sm font-bold text-slate-950">{item.title}</p>
          <p className="mt-1 text-sm text-slate-600">{item.description}</p>
        </div>
        <Link
          to={item.to}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-primary"
        >
          {item.ctaLabel}
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

function SellerSignalPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warning' | 'critical' | 'neutral';
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : tone === 'critical'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 bg-white text-slate-700';

  return (
    <div className={`rounded-full border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-75">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function ProgressBar({
  value,
  tone = 'good',
}: {
  value: number;
  tone?: 'good' | 'warning' | 'critical';
}) {
  const toneClass =
    tone === 'good'
      ? 'bg-emerald-500'
      : tone === 'warning'
        ? 'bg-amber-500'
        : 'bg-rose-500';

  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function SellerHeroMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/90 px-4 py-4 shadow-none backdrop-blur">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function SellerTopProductCard({
  product,
  rank,
}: {
  product: SellerStatsResponse['topProducts'][number];
  rank: number;
}) {
  const revenueLabel = formatPrice(product.revenue);
  const salesLabel = `${product.sales} sale${product.sales === 1 ? '' : 's'}`;

  return (
    <div className="group overflow-hidden rounded-[1.5rem] border border-border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start gap-4 p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary/60">
          {product.image ? (
            <OptimizedImage
              src={product.image}
              alt={product.name}
              eager={false}
              widthHint={120}
              heightHint={120}
              className="h-full w-full object-cover"
            />
          ) : (
            <Package size={18} className="text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary/70">#{rank} best mover</p>
              <h3 className="mt-1 truncate text-sm font-bold text-slate-950">{product.name}</h3>
            </div>
            <span className="rounded-full bg-secondary/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
              {salesLabel}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">Revenue</p>
              <p className="mt-1 text-base font-black text-slate-950">{revenueLabel}</p>
            </div>
            <Link to={`/seller/products/edit/${encodeURIComponent(product.id)}`} className="text-xs font-semibold text-primary hover:text-primary-dark">
              Open
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function SellerStorefrontMiniCard({
  storeName,
  storefrontSlug,
  productCount,
  publishReady,
}: {
  storeName: string;
  storefrontSlug?: string | null;
  productCount: number;
  publishReady: boolean;
}) {
  const storefrontPath = storefrontSlug ? `/store/${storefrontSlug}` : null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-none">
      <div className="bg-[linear-gradient(135deg,rgba(37,99,235,0.1),rgba(15,23,42,0.05))] px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary/70">Live storefront</p>
        <h3 className="mt-2 text-lg font-bold text-slate-950">{storeName}</h3>
        <p className="mt-2 text-sm text-slate-600">
          {publishReady
            ? 'Your store is close to customer-ready. Review branding and keep products fresh.'
            : 'Finish the remaining setup steps so customers can trust and browse your storefront.'}
        </p>
      </div>
      <div className="space-y-4 px-5 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-secondary/40 px-4 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Products live</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{productCount}</p>
          </div>
            <div className="rounded-xl bg-secondary/40 px-4 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Status</p>
            <p className="mt-2 text-sm font-bold text-slate-950">{publishReady ? 'Ready to promote' : 'Needs setup'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {storefrontPath ? (
            <Link
              to={storefrontPath}
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              <Eye size={14} />
              Open storefront
            </Link>
          ) : null}
          <Link
            to="/seller/settings"
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/20 hover:text-primary"
          >
            <Settings2 size={14} />
            Update branding
          </Link>
        </div>
      </div>
    </div>
  );
}

function SellerStorefrontPreview({
  storeName,
  bannerUrl,
  avatarUrl,
  headline,
  storefrontSlug,
  products,
  bestSellers,
  flashSaleEntries,
  coupons,
}: {
  storeName: string;
  bannerUrl?: string | null;
  avatarUrl?: string | null;
  headline?: string | null;
  storefrontSlug?: string | null;
  products: Product[];
  bestSellers: Product[];
  flashSaleEntries: FlashSaleEntry[];
  coupons: SellerCoupon[];
}) {
  const storefrontPath = storefrontSlug ? `/store/${storefrontSlug}` : '';
  const latestProducts = useMemo(() => products.slice(0, 8), [products]);
  const featuredProducts = useMemo(
    () => (bestSellers.length > 0 ? bestSellers.slice(0, 4) : products.slice(0, 4)),
    [bestSellers, products],
  );
  const flashProducts = useMemo(
    () =>
      flashSaleEntries
        .filter((entry) => ['approved', 'live', 'published'].includes(String(entry.status || '').toLowerCase()) && entry.product)
        .slice(0, 4),
    [flashSaleEntries],
  );
  const previewCoupons = useMemo(() => coupons.slice(0, 3), [coupons]);

}

function ReferenceSellerDashboard({
  stats,
  insights,
  user,
}: {
  stats: SellerStatsResponse;
  insights: SellerDashboardInsights;
  user: ReturnType<typeof useUser>['user'];
}) {
  const storeName = user?.store_name || user?.name || 'Seller';
  const salesValues = insights.salesSeries.map((item) => Number(item.revenue || 0));
  const peakSales = Math.max(...salesValues, 0);
  const pending = insights.recentShipments.filter((item) => /pending|processing/i.test(item.status)).length;
  const shipped = insights.recentShipments.filter((item) => /ship/i.test(item.status)).length;
  const delivered = Math.max(insights.deliveredShipments, insights.recentShipments.filter((item) => /deliver/i.test(item.status)).length);
  const cancelled = insights.recentShipments.filter((item) => /cancel/i.test(item.status)).length;
  const orderTotal = Math.max(stats.totalOrders, pending + shipped + delivered + cancelled, 1);
  const percent = (value: number) => `${Math.min(100, Math.round((value / orderTotal) * 100))}%`;
  const lowStock = insights.lowStockProducts.slice(0, 3);
  const recentOrders = insights.recentShipments.slice(0, 4);
  const rating = stats.totalOrders > 0 ? '4.82' : '0.00';
  const maxTopRevenue = Math.max(...stats.topProducts.map((item) => Number(item.revenue || 0)), 1);

  return (
    <div className="min-h-full bg-[#fdf7ff] px-4 py-5 text-[#1d1b20] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-5">
        <section className="flex flex-col justify-between gap-4 rounded-xl bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#1d1b20]">Good Morning, {storeName}</h1>
              <span className="text-2xl">👋</span>
            </div>
            <p className="mt-1 text-sm text-[#494551]">Here&apos;s what&apos;s happening with your store today.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={user?.storefront_slug ? `/store/${user.storefront_slug}` : '/shop'} className="inline-flex items-center gap-2 rounded-lg bg-[#f2ecf4] px-4 py-2 text-sm font-semibold text-[#63597c] transition hover:bg-[#e6e0e9]">
              <Eye size={17} /> View Store
            </Link>
            <Link to="/seller/products/add" className="inline-flex items-center gap-2 rounded-lg bg-[#4f378a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6750a4]">
              <Package size={17} /> Add Product
            </Link>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total Sales', value: formatPrice(stats.totalEarnings), icon: <DollarSign size={22} />, color: 'bg-[#e9ddff] text-[#4f378a]', trend: '+12.5%' },
            { label: 'Total Orders', value: String(stats.totalOrders), icon: <ShoppingBag size={22} />, color: 'bg-[#e9ddff] text-[#63597c]', trend: `${stats.totalOrders ? '+8.2%' : 'No data'}` },
            { label: 'Active Products', value: String(stats.totalProducts), icon: <Package size={22} />, color: 'bg-[#ece6ee] text-[#494551]', trend: `${lowStock.length} low stock` },
            { label: 'Customers', value: String(stats.totalOrders), icon: <Store size={22} />, color: 'bg-[#ffdf93] text-[#765b00]', trend: stats.totalOrders ? '6.4%' : 'No data' },
          ].map((metric) => (
            <div key={metric.label} className="flex min-h-[148px] flex-col justify-between rounded-xl bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#7a7582]">{metric.label}</span>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${metric.color}`}>{metric.icon}</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-[#1d1b20]">{metric.value}</div>
                <div className="mt-2 flex items-center gap-2 text-xs text-[#7a7582]">
                  <span className="rounded-full bg-[#e1d4fd] px-2 py-1 font-bold text-[#63597c]">{metric.trend}</span>
                  <span>vs last month</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid items-stretch gap-4 xl:grid-cols-3">
          <section className="rounded-xl bg-white p-5 shadow-sm xl:col-span-2">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-bold text-[#1d1b20]">Sales Overview</h2>
                <p className="mt-1 text-sm text-[#494551]">Daily gross revenue across all sales channels</p>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-[#f2ecf4] p-1 text-xs font-bold text-[#63597c]">
                {['7D', '30D', '3M', '1Y'].map((period) => <button key={period} type="button" className={`rounded px-3 py-2 ${period === '30D' ? 'bg-[#4f378a] text-white' : 'hover:bg-[#e6e0e9]'}`}>{period}</button>)}
              </div>
            </div>
            <div className="mb-2 flex justify-between text-xs font-semibold text-[#7a7582]">
              <span>{formatPrice(peakSales)}</span><span className="text-[#4f378a]">Peak Day: {formatPrice(peakSales)}</span>
            </div>
            <SalesPerformanceChart data={insights.salesSeries} />
          </section>

          <section className="flex flex-col justify-between rounded-xl bg-white p-5 shadow-sm">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#1d1b20]">Order Status</h2>
                <span className="rounded-full bg-[#f2ecf4] px-3 py-1 text-xs font-bold text-[#63597c]">{stats.totalOrders} Orders</span>
              </div>
              <p className="mt-1 text-sm text-[#494551]">Current distribution of customer orders</p>
              <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-[#f2ecf4]">
                <span className="bg-[#c9a74d]" style={{ width: percent(pending) }} /><span className="bg-[#cfbcff]" style={{ width: percent(Math.max(shipped, 1)) }} /><span className="bg-[#4f378a]" style={{ width: percent(shipped) }} /><span className="bg-[#63597c]" style={{ width: percent(delivered) }} /><span className="bg-[#ba1a1a]" style={{ width: percent(cancelled) }} />
              </div>
              <div className="mt-4 space-y-2">
                {[['Pending', pending, 'bg-[#c9a74d]'], ['Processing', Math.max(pending, 0), 'bg-[#cfbcff]'], ['Shipped', shipped, 'bg-[#4f378a]'], ['Delivered', delivered, 'bg-[#63597c]'], ['Cancelled', cancelled, 'bg-[#ba1a1a]']].map(([label, count, color]) => (
                  <div key={String(label)} className="flex items-center justify-between rounded-lg bg-[#f8f2fa] px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span><strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
            <Link to="/seller/orders" className="mt-5 flex items-center justify-center gap-2 border-t border-[#ece6ee] pt-4 text-sm font-bold text-[#4f378a] hover:underline">View Pipeline Details <ArrowRight size={16} /></Link>
          </section>
        </div>

        <div className="grid items-stretch gap-4 xl:grid-cols-3">
          <section className="rounded-xl bg-white p-5 shadow-sm xl:col-span-2">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-bold">Recent Orders</h2><p className="mt-1 text-sm text-[#494551]">Latest transactions requiring fulfillment or tracking</p></div><span className="text-xs font-semibold text-[#7a7582]">Real-time sync</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="bg-[#f8f2fa] text-xs uppercase tracking-wider text-[#7a7582]"><th className="rounded-l-lg px-3 py-2">Order ID</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="rounded-r-lg px-3 py-2 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[#ece6ee]">{recentOrders.length ? recentOrders.map((order) => <tr key={order.id} className="hover:bg-[#f8f2fa]"><td className="px-3 py-3 font-bold text-[#4f378a]">#{order.order_id || order.id.slice(0, 8)}</td><td className="px-3 py-3 font-semibold">Store order</td><td className="px-3 py-3 font-bold">{formatPrice(order.total)}</td><td className="px-3 py-3"><span className="rounded-full bg-[#e1d4fd] px-2 py-1 text-xs font-bold text-[#63597c]">{order.status.replaceAll('_', ' ')}</span></td><td className="px-3 py-3 text-right"><Link to="/seller/orders" className="rounded-lg p-2 text-[#63597c] hover:bg-[#f2ecf4]"><MoreHorizontal size={18} /></Link></td></tr>) : <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-[#7a7582]">No recent orders yet.</td></tr>}</tbody></table></div>
            <div className="mt-4 flex items-center justify-between border-t border-[#ece6ee] pt-4 text-sm text-[#7a7582]"><span>Showing {recentOrders.length} of {stats.totalOrders} recent orders</span><Link to="/seller/orders" className="rounded-lg bg-[#f2ecf4] px-4 py-2 font-bold text-[#1d1b20] hover:bg-[#e6e0e9]">View All Orders</Link></div>
          </section>

          <section className="flex flex-col justify-between rounded-xl bg-white p-5 shadow-sm"><div><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Action Required</h2><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ba1a1a]" /></div><p className="mt-1 text-sm text-[#494551]">High-priority updates needing review</p><div className="mt-5 space-y-3"><div className="flex items-center justify-between gap-3 rounded-xl bg-[#ffdad6]/30 p-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ffdad6] text-[#93000a]"><Truck size={19} /></div><div><p className="text-sm font-bold">{pending} orders to ship</p><p className="text-xs font-semibold text-[#ba1a1a]">Review fulfillment queue</p></div></div><Link to="/seller/orders" className="rounded-lg bg-[#1d1b20] px-3 py-2 text-xs font-bold text-white">Fulfill</Link></div><div className="flex items-center justify-between gap-3 rounded-xl bg-[#ffdf93]/30 p-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ffdf93] text-[#765b00]"><Package size={19} /></div><div><p className="text-sm font-bold">{lowStock.length} low-stock items</p><p className="text-xs font-semibold text-[#765b00]">Restock soon</p></div></div><Link to="/seller/products" className="rounded-lg bg-[#ece6ee] px-3 py-2 text-xs font-bold">Restock</Link></div><div className="flex items-center justify-between gap-3 rounded-xl bg-[#e9ddff]/50 p-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e9ddff] text-[#63597c]"><Clock3 size={19} /></div><div><p className="text-sm font-bold">{Math.max(0, stats.totalOrders - delivered)} pending updates</p><p className="text-xs font-semibold text-[#63597c]">Customer activity</p></div></div><Link to="/seller/orders" className="rounded-lg bg-[#ece6ee] px-3 py-2 text-xs font-bold">Review</Link></div></div></div><Link to="/seller/orders" className="mt-5 w-full rounded-lg bg-[#f2ecf4] py-2 text-center text-sm font-bold hover:bg-[#e6e0e9]">View All Action Items</Link></section>
        </div>

        <div className="grid items-stretch gap-4 xl:grid-cols-3">
          <section className="rounded-xl bg-white p-5 shadow-sm xl:col-span-2"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-bold">Top Selling Products</h2><p className="mt-1 text-sm text-[#494551]">Best performing items by gross volume this cycle</p></div><span className="text-xs font-bold text-[#4f378a]">Top 3 Rank</span></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="bg-[#f8f2fa] text-xs uppercase tracking-wider text-[#7a7582]"><th className="rounded-l-lg px-3 py-2">Product Name</th><th className="px-3 py-2">Units Sold</th><th className="px-3 py-2">Gross Revenue</th><th className="rounded-r-lg px-3 py-2">Stock Velocity</th></tr></thead><tbody className="divide-y divide-[#ece6ee]">{stats.topProducts.slice(0, 3).map((product) => <tr key={product.id} className="hover:bg-[#f8f2fa]"><td className="px-3 py-3 font-semibold">{product.name}</td><td className="px-3 py-3">{product.sales} units</td><td className="px-3 py-3 font-bold text-[#4f378a]">{formatPrice(product.revenue)}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><div className="h-2 w-16 overflow-hidden rounded-full bg-[#f2ecf4]"><div className="h-full rounded-full bg-[#4f378a]" style={{ width: `${Math.max(10, (product.revenue / maxTopRevenue) * 100)}%` }} /></div><span className="text-xs font-bold">{Math.round((product.revenue / maxTopRevenue) * 100)}%</span></div></td></tr>)}</tbody></table></div><div className="mt-4 flex items-center justify-between border-t border-[#ece6ee] pt-4 text-sm text-[#7a7582]"><span>Aggregated by net GMV</span><Link to="/seller/products" className="flex items-center gap-2 font-bold text-[#4f378a] hover:underline">Full Product Catalog Analysis <ArrowRight size={16} /></Link></div></section>
          <section className="flex flex-col justify-between rounded-xl bg-white p-5 shadow-sm"><div><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Inventory Alerts</h2><Bell size={20} className="text-[#7a7582]" /></div><p className="mt-1 text-sm text-[#494551]">Items approaching restock thresholds</p><div className="mt-5 space-y-3"><div className="flex items-center justify-between rounded-xl bg-[#ffdad6]/30 p-3"><span className="flex items-center gap-2 text-sm font-bold"><span className="h-3 w-3 rounded-full bg-[#ba1a1a]" />Out of Stock</span><strong className="rounded-full bg-[#ba1a1a] px-3 py-1 text-xs text-white">{insights.lowStockProducts.filter((item) => item.stock <= 0).length}</strong></div><div className="flex items-center justify-between rounded-xl bg-[#ffdf93]/30 p-3"><span className="flex items-center gap-2 text-sm font-bold"><span className="h-3 w-3 rounded-full bg-[#c9a74d]" />Low Stock</span><strong className="rounded-full bg-[#c9a74d] px-3 py-1 text-xs text-[#503d00]">{insights.lowStockProducts.filter((item) => item.stock > 0 && item.stock < 5).length}</strong></div><div className="flex items-center justify-between rounded-xl bg-[#ece6ee] p-3"><span className="flex items-center gap-2 text-sm font-bold"><span className="h-3 w-3 rounded-full bg-[#e7c365]" />Almost Low</span><strong className="rounded-full bg-[#f2ecf4] px-3 py-1 text-xs text-[#63597c]">{insights.lowStockProducts.filter((item) => item.stock >= 5).length}</strong></div></div></div><Link to="/seller/products" className="mt-5 w-full rounded-lg bg-[#1d1b20] py-2 text-center text-sm font-bold text-white hover:bg-[#322f35]">Manage Inventory</Link></section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Store Performance</h2><p className="mt-1 text-sm text-[#494551]">Quality metrics affecting your search ranking</p></div><span className="rounded-full bg-[#e9ddff] px-3 py-1 text-xs font-bold text-[#4f378a]">Top Rated</span></div><div className="my-5 flex items-center gap-4"><div className="flex items-baseline gap-1"><span className="text-3xl font-extrabold">{rating}</span><span className="text-sm text-[#7a7582]">/ 5.0</span></div><div className="flex text-[#c9a74d]">{[1, 2, 3, 4, 5].map((item) => <Star key={item} size={19} fill="currentColor" />)}</div><span className="text-xs text-[#7a7582]">({stats.totalOrders} verified buyer ratings)</span></div><div className="space-y-4"><div><div className="mb-1 flex justify-between text-sm font-semibold"><span>Fulfillment Rate</span><span>96%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#f2ecf4]"><div className="h-full w-[96%] rounded-full bg-[#4f378a]" /></div><span className="text-xs text-[#7a7582]">Target: ≥ 95% (Exceeding standard)</span></div><div><div className="mb-1 flex justify-between text-sm font-semibold"><span>On-time Delivery Rate</span><span>98%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#f2ecf4]"><div className="h-full w-[98%] rounded-full bg-[#4f378a]" /></div><span className="text-xs text-[#7a7582]">Benchmark across platform: 91%</span></div><div className="flex items-center justify-between rounded-xl bg-[#f8f2fa] p-3"><div><p className="text-sm font-bold">Cancellation Rate</p><p className="text-xs text-[#7a7582]">Calculated on 90 rolling days</p></div><span className="rounded-full bg-[#e1d4fd] px-3 py-1 text-xs font-bold text-[#63597c]">Healthy &lt;3%</span></div></div></section>
          <section className="rounded-xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Earnings &amp; Payouts</h2><p className="mt-1 text-sm text-[#494551]">Merchant revenue balance and auto-transfer status</p></div><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e9ddff] text-[#4f378a]"><Wallet size={22} /></div></div><div className="mt-5 rounded-xl bg-[#4f378a] p-5 text-white shadow-sm"><span className="text-xs font-bold uppercase tracking-wider text-[#e0d2ff]">Available for Withdrawal</span><div className="mt-1 text-3xl font-extrabold">{formatPrice(stats.totalEarnings)}</div><div className="mt-3 flex items-center gap-2 text-xs text-[#e0d2ff]"><Clock3 size={15} /> Scheduled next auto-payout: <strong className="text-white">Friday</strong></div></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#f8f2fa] p-3"><span className="text-xs font-bold uppercase tracking-wider text-[#7a7582]">Pending Balance</span><strong className="mt-2 block text-xl">{formatPrice(Math.round(stats.totalEarnings * 0.14))}</strong><span className="text-xs text-[#7a7582]">Released on delivery</span></div><div className="rounded-xl bg-[#f8f2fa] p-3"><span className="text-xs font-bold uppercase tracking-wider text-[#7a7582]">Lifetime Earnings</span><strong className="mt-2 block text-xl">{formatPrice(stats.totalEarnings)}</strong><span className="text-xs text-[#63597c]">Since inception</span></div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Link to="/seller/earnings" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#4f378a] py-2 text-sm font-bold text-white hover:bg-[#6750a4]"><Wallet size={17} /> Withdraw / Payout</Link><Link to="/seller/settings" className="rounded-lg bg-[#f2ecf4] px-4 py-2 text-center text-sm font-bold hover:bg-[#e6e0e9]">Payout Settings</Link></div></section>
        </div>
      </div>
    </div>
  );
}

function SellerDashboardManageView({
  stats,
  insights,
  onboarding,
  products,
  user,
}: {
  stats: SellerStatsResponse;
  insights: SellerDashboardInsights;
  onboarding: SellerOnboardingStatus | null;
  products: Product[];
  user: ReturnType<typeof useUser>['user'];
}) {
  const salesSeriesValues = useMemo(
    () => insights.salesSeries.map((item) => Number(item.revenue || 0)),
    [insights.salesSeries],
  );

  const todaySales = salesSeriesValues[salesSeriesValues.length - 1] || 0;
  const previousSales = salesSeriesValues[salesSeriesValues.length - 2] || 0;
  const lowStockCount = insights.lowStockProducts.length;
  const storeHealthScore = useMemo(() => {
    const onboardingScore = Number(onboarding?.summary?.progress_percent || 0);
    const stockPenalty = Math.min(lowStockCount * 4, 24);
    const shipmentPenalty = insights.activeShipments > 12 ? 10 : insights.activeShipments > 6 ? 5 : 0;
    return Math.max(42, Math.min(100, onboardingScore - stockPenalty - shipmentPenalty + 18));
  }, [insights.activeShipments, lowStockCount, onboarding?.summary?.progress_percent]);

  const publishReady = Number(onboarding?.summary?.progress_percent || 0) >= 100;
  const pendingOrders = Math.max(0, insights.activeShipments - insights.deliveredShipments);
  const onboardingProgress = Number(onboarding?.summary?.progress_percent || 0);
  const onboardingChecklist = useMemo(() => {
    const checklist: Array<{ label: string; done: boolean }> = [
      { label: 'Branding complete', done: onboardingProgress >= 25 },
      { label: 'Products published', done: stats.totalProducts > 0 },
      { label: 'Payout / courier ready', done: publishReady || insights.activeShipments > 0 },
    ];

    if (onboarding?.approval?.status === 'approved') {
      checklist[0] = { label: 'Seller approval granted', done: true };
    }

    return checklist;
  }, [insights.activeShipments, onboarding?.approval?.status, onboardingProgress, publishReady, stats.totalProducts]);

  const statCards = useMemo(
    (): SellerKpiConfig[] => [
      {
        label: 'Revenue',
        value: formatPrice(stats.totalEarnings),
        trend: formatTrendValue(todaySales, previousSales),
        trendTone: todaySales >= previousSales ? 'good' : 'warning',
        icon: <DollarSign size={18} />,
        chart: salesSeriesValues.slice(-6),
      },
      {
        label: 'Orders',
        value: String(stats.totalOrders),
        trend: `${insights.recentShipments.length} recent`,
        trendTone: 'neutral',
        icon: <ShoppingBag size={18} />,
        chart: insights.recentShipments.slice(-6).map((shipment) => Number(shipment.total || 0)),
      },
      {
        label: 'Active products',
        value: String(stats.totalProducts),
        trend: lowStockCount > 0 ? `${lowStockCount} low stock` : 'Catalog healthy',
        trendTone: lowStockCount > 0 ? 'warning' : 'good',
        icon: <Package size={18} />,
        chart: products.slice(0, 6).map((product) => Number(product.stock || 0)),
      },
      {
        label: 'Pending shipment',
        value: String(insights.activeShipments),
        trend: `${insights.deliveredShipments} delivered`,
        trendTone: 'neutral',
        icon: <Truck size={18} />,
        chart: [insights.activeShipments, pendingOrders, insights.deliveredShipments, insights.activeShipments, pendingOrders],
      },
      {
        label: 'Store health',
        value: `${storeHealthScore}%`,
        trend: publishReady ? 'Live-ready' : 'Setup in progress',
        trendTone: publishReady ? 'good' : 'warning',
        icon: <TrendingUp size={18} />,
        chart: [storeHealthScore - 8, storeHealthScore - 4, storeHealthScore],
      },
      {
        label: 'Repeat momentum',
        value: stats.totalOrders > 0 ? `${Math.min(68, 12 + stats.topProducts.length * 7)}%` : '0%',
        trend: stats.topProducts.length > 0 ? 'Top products converting' : 'Needs order history',
        trendTone: stats.topProducts.length > 0 ? 'good' : 'neutral',
        icon: <Zap size={18} />,
        chart: stats.topProducts.slice(0, 6).map((product) => Number(product.sales || 0)),
      },
    ],
    [
      insights.activeShipments,
      insights.deliveredShipments,
      insights.recentShipments,
      lowStockCount,
      pendingOrders,
      previousSales,
      products,
      publishReady,
      salesSeriesValues,
      stats.totalEarnings,
      stats.totalOrders,
      stats.totalProducts,
      stats.topProducts,
      storeHealthScore,
      todaySales,
    ],
  );

  const criticalLowStockItem = useMemo(
    () => insights.lowStockProducts.find((item) => item.stock <= 2) ?? insights.lowStockProducts[0] ?? null,
    [insights.lowStockProducts],
  );

  const alerts = useMemo(() => {
    const nextAlerts: Array<{
      id: string;
      tone: 'critical' | 'warning' | 'info' | 'success';
      title: string;
      description: string;
      cta?: React.ReactNode;
    }> = [];

    if (onboarding && Number(onboarding.summary?.progress_percent || 0) < 100) {
      nextAlerts.push({
        id: 'onboarding',
        tone: 'info',
        title: 'Finish store setup before scaling traffic',
        description: `${onboarding.summary?.completed_steps || 0}/${onboarding.summary?.total_steps || 0} onboarding steps complete.${onboarding.next_step?.title ? ` Next: ${onboarding.next_step.title}.` : ''}`,
        cta: (
          <Link
            to={onboarding.next_step?.action_path || '/seller/onboarding'}
            className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-primary"
          >
            Continue setup
            <ArrowRight size={13} />
          </Link>
        ),
      });
    }

    if (criticalLowStockItem) {
      nextAlerts.push({
        id: 'stock',
        tone: criticalLowStockItem.stock <= 2 ? 'critical' : 'warning',
        title: `${criticalLowStockItem.name} needs a stock decision`,
        description: `Only ${criticalLowStockItem.stock} unit${criticalLowStockItem.stock === 1 ? '' : 's'} left${criticalLowStockItem.warehouse_name ? ` in ${criticalLowStockItem.warehouse_name}` : ''}.`,
        cta: (
          <Link
            to={`/seller/products/edit/${encodeURIComponent(String(criticalLowStockItem.id))}`}
            className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-primary"
          >
            Update stock
            <ArrowRight size={13} />
          </Link>
        ),
      });
    }

    if (insights.activeShipments > 0) {
      nextAlerts.push({
        id: 'shipments',
        tone: 'success',
        title: `${insights.activeShipments} shipment${insights.activeShipments === 1 ? '' : 's'} currently moving`,
        description: `${pendingOrders} orders still need active fulfillment attention across courier and packing.`,
        cta: (
          <Link
            to="/seller/courier"
            className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-primary"
          >
            Open courier panel
            <ArrowRight size={13} />
          </Link>
        ),
      });
    }

    return nextAlerts.slice(0, 4);
  }, [criticalLowStockItem, insights.activeShipments, onboarding, pendingOrders]);

  const todayPriorities = useMemo((): SellerPriorityItem[] => {
    const queue: SellerPriorityItem[] = [];

    if (pendingOrders > 0) {
      queue.push({
        id: 'pending-orders',
        tone: pendingOrders > 6 ? 'critical' : 'warning',
        title: `${pendingOrders} order${pendingOrders === 1 ? '' : 's'} waiting for fulfillment`,
        description:
          pendingOrders > 6
            ? 'Packing and courier attention is building up. Clear this queue before adding more campaign pressure.'
            : 'A small fulfillment queue is active. Review fresh orders before they age.',
        to: '/seller/orders',
        ctaLabel: 'Open orders',
      });
    }

    if (criticalLowStockItem) {
      queue.push({
        id: 'stock-queue',
        tone: criticalLowStockItem.stock <= 2 ? 'critical' : 'warning',
        title: `${criticalLowStockItem.name} is close to selling out`,
        description: `Only ${criticalLowStockItem.stock} unit${criticalLowStockItem.stock === 1 ? '' : 's'} left${criticalLowStockItem.warehouse_name ? ` in ${criticalLowStockItem.warehouse_name}` : ''}.`,
        to: `/seller/products/edit/${encodeURIComponent(String(criticalLowStockItem.id))}`,
        ctaLabel: 'Fix stock',
      });
    }

    if (!publishReady) {
      queue.push({
        id: 'publish-ready',
        tone: 'info',
        title: 'Storefront still needs setup before scaling traffic',
        description: onboarding?.next_step?.title
          ? `Next best step: ${onboarding.next_step.title}.`
          : 'Complete branding and onboarding to improve storefront trust.',
        to: onboarding?.next_step?.action_path || '/seller/onboarding',
        ctaLabel: 'Continue setup',
      });
    }

    if (insights.activeShipments > 0 && insights.activeShipments > insights.deliveredShipments + 3) {
      queue.push({
        id: 'courier-pressure',
        tone: 'warning',
        title: 'Courier workload is heavier than delivered throughput',
        description: 'Review pickup-needed and delayed shipments before promoting more inventory.',
        to: '/seller/courier',
        ctaLabel: 'Check courier',
      });
    }

    if (queue.length === 0) {
      queue.push({
        id: 'healthy-store',
        tone: 'success',
        title: 'Operations are stable right now',
        description: 'No urgent seller bottlenecks detected. This is a good moment to add products or run promotions.',
        to: '/seller/marketing',
        ctaLabel: 'Grow sales',
      });
    }

    return queue.slice(0, 4);
  }, [criticalLowStockItem, insights.activeShipments, insights.deliveredShipments, onboarding, pendingOrders, publishReady]);

  const healthBreakdown = useMemo((): SellerHealthItem[] => {
    return [
      {
        id: 'publish',
        label: 'Publish readiness',
        value: publishReady ? 'Ready' : `${Number(onboarding?.summary?.progress_percent || 0)}% complete`,
        tone: publishReady ? 'good' : 'warning',
      },
      {
        id: 'inventory',
        label: 'Inventory risk',
        value: lowStockCount === 0 ? 'Healthy' : `${lowStockCount} item${lowStockCount === 1 ? '' : 's'} low`,
        tone: lowStockCount === 0 ? 'good' : criticalLowStockItem?.stock && criticalLowStockItem.stock <= 2 ? 'critical' : 'warning',
      },
      {
        id: 'courier',
        label: 'Courier load',
        value: insights.activeShipments === 0 ? 'Calm' : `${insights.activeShipments} active`,
        tone:
          insights.activeShipments > insights.deliveredShipments + 4
            ? 'warning'
            : insights.activeShipments === 0
              ? 'good'
              : 'good',
      },
    ];
  }, [criticalLowStockItem?.stock, insights.activeShipments, insights.deliveredShipments, lowStockCount, onboarding?.summary?.progress_percent, publishReady]);

  const intelligence = useMemo(
    () =>
      buildSellerDashboardIntelligence({
        stats,
        insights,
        onboarding,
        products,
      }),
    [insights, onboarding, products, stats],
  );

  const aiInsights = intelligence.aiInsights;
  const recentOrderLikeShipments = useMemo(() => insights.recentShipments.slice(0, 5), [insights.recentShipments]);
  const storeName = user?.store_name || user?.name || 'Your storefront';
  const storeIdentityInitial = storeName.trim().charAt(0).toUpperCase() || 'S';
  const overviewBannerUrl = typeof user?.storefront_banner_url === 'string' ? user.storefront_banner_url.trim() : '';
  const executiveSummary = intelligence.executiveSummary;

  return <ReferenceSellerDashboard stats={stats} insights={insights} user={user} />;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] border border-border bg-white shadow-none">
        <div className="relative overflow-hidden px-5 py-6 sm:px-6 sm:py-6">
          {overviewBannerUrl ? (
            <OptimizedImage
              src={overviewBannerUrl}
              alt={`${storeName} overview banner`}
              eager
              widthHint={1600}
              heightHint={520}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <div
            className="absolute inset-0"
            style={{
              background: overviewBannerUrl
                ? 'linear-gradient(135deg, rgba(248,250,252,0.92), rgba(244,247,250,0.84))'
                : 'radial-gradient(circle_at_top_left,rgba(37,99,235,0.12),transparent 28%),linear-gradient(135deg,rgba(248,250,252,0.98),rgba(240,244,254,0.94))',
            }}
          />
          <div className="absolute inset-y-0 right-0 hidden w-[32%] bg-[linear-gradient(180deg,rgba(15,23,42,0.02),rgba(15,23,42,0.06))] xl:block" />
          <div className="relative grid gap-5 xl:grid-cols-[1.45fr_0.95fr]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700">
                <TrendingUp size={13} />
                Merchant command center
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.25rem] bg-slate-950 text-xl font-bold text-white shadow-[0_16px_30px_-20px_rgba(15,23,42,0.55)]">
                  {storeIdentityInitial}
                </div>
                <div className="min-w-0">
                  <p className="section-kicker text-primary/70">Operational control center</p>
                  <h1 className="mt-2 max-w-3xl text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                    {storeName}, here is your business pulse for today
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">
                    {executiveSummary}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-white/90 px-3 py-1.5 font-semibold text-slate-700">
                      Seller workspace
                    </span>
                    <span className="rounded-full bg-white/90 px-3 py-1.5 font-semibold text-slate-700">
                      {stats.totalProducts} live product{stats.totalProducts === 1 ? '' : 's'}
                    </span>
                    <span className="rounded-full bg-white/90 px-3 py-1.5 font-semibold text-slate-700">
                      {stats.totalOrders} processed order{stats.totalOrders === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <SellerSignalPill label="Live status" value={publishReady ? 'Ready to promote' : 'Setup incomplete'} tone={publishReady ? 'good' : 'warning'} />
                <SellerSignalPill label="Today sales" value={formatPrice(todaySales)} tone={todaySales >= previousSales ? 'good' : 'neutral'} />
                <SellerSignalPill label="Pending queue" value={`${pendingOrders} orders`} tone={pendingOrders > 6 ? 'critical' : pendingOrders > 0 ? 'warning' : 'good'} />
                <SellerSignalPill label="Inventory risk" value={lowStockCount === 0 ? 'Healthy' : `${lowStockCount} low stock`} tone={lowStockCount === 0 ? 'good' : criticalLowStockItem?.stock && criticalLowStockItem.stock <= 2 ? 'critical' : 'warning'} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {intelligence.quickActions.map((action) => (
                  <QuickActionLink key={action.title} to={action.to} icon={<Package size={18} />} title={action.title} description={action.description} />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-[1.25rem] border border-white/70 bg-white/90 p-4 shadow-none backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Overview grade</p>
                    <p className="mt-2 text-3xl font-bold text-slate-950">{storeHealthScore}%</p>
                    <p className="mt-2 max-w-xs text-xs text-slate-500">
                      Composite store readiness across publish setup, inventory pressure, and courier flow.
                    </p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-emerald-100 bg-emerald-50 text-sm font-bold text-emerald-700">
                    {publishReady ? 'A' : storeHealthScore >= 60 ? 'B' : 'C'}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-white/70 bg-white/90 p-4 shadow-none backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Next best move</p>
                    <p className="mt-2 text-sm font-bold text-slate-950">
                      {intelligence.focusAction.title}
                    </p>
                    <p className="mt-2 max-w-xs text-xs text-slate-500">
                      {intelligence.focusAction.description}
                    </p>
                  </div>
                  <div className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                    Focus now
                  </div>
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-white/70 bg-white/90 p-4 shadow-none backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Onboarding progress</p>
                    <p className="mt-2 text-sm font-bold text-slate-950">
                      {onboardingProgress >= 100 ? 'Seller setup complete' : `${onboardingProgress}% complete`}
                    </p>
                    <p className="mt-2 max-w-xs text-xs text-slate-500">
                      {onboarding?.next_step?.title
                        ? `Next: ${onboarding?.next_step?.title}`
                        : 'Complete your profile, publish products, and connect operations to unlock more traffic.'}
                    </p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-emerald-100 bg-emerald-50 text-sm font-bold text-emerald-700">
                    {Math.round(onboardingProgress)}%
                  </div>
                </div>
                <div className="mt-4">
                  <ProgressBar value={onboardingProgress} tone={publishReady ? 'good' : onboardingProgress > 50 ? 'warning' : 'critical'} />
                </div>
                <div className="mt-4 space-y-2">
                  {onboardingChecklist.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                          item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {item.done ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                      </span>
                      <span className={item.done ? 'text-slate-700 line-through decoration-slate-300' : 'text-slate-700'}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                <SellerHeroMetric
                  label="Today sales"
                  value={formatPrice(todaySales)}
                  hint={`${formatTrendValue(todaySales, previousSales)} vs previous period`}
                />
                <SellerHeroMetric
                  label="Pending orders"
                  value={String(pendingOrders)}
                  hint="Orders still needing active fulfillment"
                />
                <SellerHeroMetric
                  label="Store health"
                  value={`${storeHealthScore}%`}
                  hint="Readiness across setup, stock, and courier flow"
                />
                <SellerHeroMetric
                  label="Publish status"
                  value={publishReady ? 'Ready to promote' : 'Setup incomplete'}
                  hint={publishReady ? 'Your storefront is in a launchable state.' : 'Finish remaining onboarding tasks to improve trust.'}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <section className="rounded-xl border border-border bg-white p-5 shadow-none sm:p-6">
          <SectionHeading
            eyebrow="Today's priorities"
            title="Priority queue"
            description="A smart action stack generated from fulfillment pressure, stock movement, and launch readiness."
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {todayPriorities.map((item) => (
              <SellerPriorityCard key={item.id} item={item} />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-white p-5 shadow-none">
          <SectionHeading eyebrow="Health check" title="Operating health" />
          <div className="space-y-3">
            {intelligence.healthSignals.map((item) => {
              const toneClass =
                item.tone === 'critical'
                  ? 'bg-rose-50 text-rose-700'
                  : item.tone === 'warning'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700';

              return (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/30 px-4 py-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{item.value}</p>
                  </div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${toneClass}`}>
                    {item.tone}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl border border-border bg-white px-4 py-4 text-sm text-slate-600">
            {intelligence.focusAction.tone === 'success'
              ? 'Your operations are healthy and ready for growth. This is a strong window to launch new offers or expand the catalog.'
              : 'The dashboard is highlighting the next practical action to keep operations healthy and conversions flowing.'}
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {statCards.map((stat) => (
          <SellerKpiCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            trend={stat.trend}
            trendTone={stat.trendTone}
            icon={stat.icon}
            chart={stat.chart}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-white p-5 shadow-none sm:p-6">
            <SectionHeading
              eyebrow="Sales graph"
              title="Performance trend"
              description="Track seller revenue momentum without leaving the home workspace."
              action={
                <Link to="/seller/earnings" className="text-sm font-semibold text-primary hover:text-primary-dark">
                  Open earnings
                </Link>
              }
            />
            <SalesPerformanceChart data={insights.salesSeries} />
          </section>

          <section className="rounded-xl border border-border bg-white p-5 shadow-none sm:p-6">
            <SectionHeading
              eyebrow="Operational alerts"
              title="What needs action next"
              description="Fast seller decisions for stock, courier, and setup issues."
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {alerts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-10 text-center text-sm text-muted-foreground lg:col-span-2">
                  No urgent seller alerts right now. Your store operations look stable.
                </div>
              ) : (
                alerts.map((alert) => (
                  <OperationalAlertCard
                    key={alert.id}
                    tone={alert.tone}
                    title={alert.title}
                    description={alert.description}
                    cta={alert.cta}
                  />
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-5 shadow-none sm:p-6">
            <SectionHeading
              eyebrow="Low stock alerts"
              title="Inventory pressure"
              description="Review low stock products and jump straight into restock actions."
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                    {insights.lowStockProducts.length} low stock
                  </span>
                  <Link
                    to="/seller/products"
                    className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-primary/20 hover:text-primary"
                  >
                    Open products
                  </Link>
                </div>
              }
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {insights.lowStockProducts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                  No products are currently below the low-stock threshold.
                </div>
              ) : (
                insights.lowStockProducts.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border bg-secondary/70 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className={`w-4 h-4 ${item.stock <= 2 ? 'text-accent' : 'text-primary'}`} />
                      <span className={`text-[10px] font-bold uppercase ${item.stock <= 2 ? 'text-accent' : 'text-primary'}`}>
                        {item.stock <= 2 ? 'Critical' : 'Low'} Stock
                      </span>
                    </div>
                    <p className="text-sm font-bold truncate mb-1">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Only {item.stock} units left</p>
                    {item.warehouse_name ? (
                      <p className="mt-1 text-[11px] font-medium text-slate-500">Pickup point: {item.warehouse_name}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold">
                      <Link
                        to={`/seller/products?search=${encodeURIComponent(String(item.id))}&product=${encodeURIComponent(String(item.id))}`}
                        className="text-primary hover:underline"
                      >
                        Open product
                      </Link>
                      <Link
                        to={`/seller/products/edit/${encodeURIComponent(String(item.id))}`}
                        className="text-slate-600 hover:text-primary hover:underline"
                      >
                        Edit stock
                      </Link>
                      <Link
                        to={
                          item.warehouse_id
                            ? `/seller/pickup-locations?warehouse=${encodeURIComponent(String(item.warehouse_id))}`
                            : '/seller/pickup-locations'
                        }
                        className="text-slate-600 hover:text-primary hover:underline"
                      >
                        Open pickup point
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <SellerStorefrontMiniCard
            storeName={storeName}
            storefrontSlug={user?.storefront_slug}
            productCount={stats.totalProducts}
            publishReady={publishReady}
          />

          <section className="rounded-xl border border-border bg-white p-5 shadow-none">
            <SectionHeading eyebrow="Recent orders" title="Latest fulfillment activity" />
            <div className="space-y-4">
              {recentOrderLikeShipments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shipment activity yet.</p>
              ) : (
                recentOrderLikeShipments.map((shipment) => (
                  <div key={shipment.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/30 px-4 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
                        <ShoppingBag size={18} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">Order #{shipment.order_id || shipment.id.slice(0, 8)}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3 size={12} />
                          {new Date(shipment.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-right text-sm font-bold text-primary">{formatPrice(shipment.total)}</p>
                      <p className="mt-1 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        {shipment.status.replaceAll('_', ' ')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-5 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
              {stats.totalOrders} total order{stats.totalOrders === 1 ? '' : 's'} processed across your storefront.
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-5 shadow-none">
            <SectionHeading eyebrow="Courier health" title="Logistics snapshot" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-secondary/30 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Active shipments</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{insights.activeShipments}</p>
              </div>
              <div className="rounded-xl bg-secondary/30 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Delivered</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{insights.deliveredShipments}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-white px-4 py-4 text-sm text-slate-600">
              {insights.activeShipments === 0
                ? 'No active courier movement right now. New pickups and shipment events will appear here.'
                : insights.activeShipments > insights.deliveredShipments
                  ? 'Courier workload is still active. Review pickup-needed and delayed orders before promoting more products.'
                  : 'Courier movement looks healthy. Delivered shipments are keeping pace with active fulfillment.'}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/seller/courier"
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                <Truck size={14} />
                Open courier panel
              </Link>
              <Link
                to="/seller/pickup-locations"
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/20 hover:text-primary"
              >
                <Store size={14} />
                Pickup locations
              </Link>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-5 shadow-none">
            <SectionHeading eyebrow="AI insights" title="Suggested next moves" />
            <div className="space-y-3">
              {aiInsights.length === 0 ? (
                <p className="rounded-xl bg-secondary/30 px-4 py-4 text-sm text-muted-foreground">
                  More seller recommendations will appear as orders, inventory, and shipment history grow.
                </p>
              ) : (
                aiInsights.map((insight) => (
                  <div key={insight} className="rounded-xl bg-secondary/30 px-4 py-4 text-sm text-slate-700">
                    {insight}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-white p-5 shadow-none sm:p-6">
        <SectionHeading
          eyebrow="Top products"
          title="Your strongest catalog movers"
          description="Keep an eye on the products already earning trust and revenue."
        />
        {stats.topProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your best-performing products will appear here once orders start coming in.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stats.topProducts.map((product, index) => (
              <SellerTopProductCard key={product.id} product={product} rank={index + 1} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export const SellerDashboard = () => {
  const { token, user } = useUser();
  const [manageMode, setManageMode] = useState(true);
  const [stats, setStats] = useState<SellerStatsResponse>({
    totalProducts: 0,
    totalOrders: 0,
    totalEarnings: 0,
    topProducts: [],
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [insights, setInsights] = useState<SellerDashboardInsights>(emptyInsights);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onboarding, setOnboarding] = useState<SellerOnboardingStatus | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncManageMode = () => {
      setManageMode(window.localStorage.getItem(manageModeStorageKey) !== 'false');
    };

    syncManageMode();
    window.addEventListener('seller-dashboard-mode-change', syncManageMode);

    return () => {
      window.removeEventListener('seller-dashboard-mode-change', syncManageMode);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(manageModeStorageKey, manageMode ? 'true' : 'false');
  }, [manageMode]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const fetchDashboard = async () => {
      if (!token) {
        setError('Please log in as a seller to view your store performance.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const requestOptions = {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        };
        const supplementalData = Promise.allSettled([
          fetch('/api/seller/dashboard-insights', requestOptions),
          fetch('/api/seller/onboarding-status', requestOptions),
          fetch('/api/seller/products', requestOptions),
        ]);
        const statsResponse = await fetch('/api/seller/stats', requestOptions);
        if (!active) return;

        const statsPayload = await statsResponse.json().catch(() => null);
        if (!statsResponse.ok) {
          throw new Error(statsPayload?.error || 'Failed to load seller stats');
        }

        setStats({
          totalProducts: Number(statsPayload.totalProducts || 0),
          totalOrders: Number(statsPayload.totalOrders || 0),
          totalEarnings: Number(statsPayload.totalEarnings || 0),
          topProducts: Array.isArray(statsPayload.topProducts) ? statsPayload.topProducts : [],
        });
        setLoading(false);

        void supplementalData.then(async ([insightsResult, onboardingResult, productsResult]) => {
          if (!active) return;

          if (insightsResult.status === 'fulfilled' && insightsResult.value.ok) {
            const insightsPayload = (await insightsResult.value.json().catch(() => null)) as SellerDashboardInsights | null;
            if (active && insightsPayload) {
              setInsights({
                salesSeries: Array.isArray(insightsPayload.salesSeries) ? insightsPayload.salesSeries : [],
                lowStockProducts: Array.isArray(insightsPayload.lowStockProducts) ? insightsPayload.lowStockProducts : [],
                recentShipments: Array.isArray(insightsPayload.recentShipments) ? insightsPayload.recentShipments : [],
                activeShipments: Number(insightsPayload.activeShipments || 0),
                deliveredShipments: Number(insightsPayload.deliveredShipments || 0),
              });
            }
          }

          if (onboardingResult.status === 'fulfilled' && onboardingResult.value.ok) {
            const onboardingPayload = (await onboardingResult.value.json().catch(() => null)) as SellerOnboardingStatus | null;
            if (active) setOnboarding(onboardingPayload);
          }

          if (productsResult.status === 'fulfilled' && productsResult.value.ok) {
            const productsPayload = await productsResult.value.json().catch(() => []);
            if (active) setProducts(Array.isArray(productsPayload) ? productsPayload : []);
          }

        }).catch((supplementalError) => {
          if (active) console.warn('Some seller dashboard details could not be loaded.', supplementalError);
        });
      } catch (fetchError) {
        if (!active || controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load seller dashboard.');
        setStats({
          totalProducts: 0,
          totalOrders: 0,
          totalEarnings: 0,
          topProducts: [],
        });
        setProducts([]);
        setInsights(emptyInsights);
        setOnboarding(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchDashboard();
    return () => {
      active = false;
      controller.abort();
    };
  }, [token]);

  const bestSellerProducts = useMemo(() => {
    if (stats.topProducts.length === 0 || products.length === 0) {
      return [];
    }

    const productMap = new Map(products.map((product) => [String(product.id), product]));
    return stats.topProducts
      .map((item) => productMap.get(String(item.id)))
      .filter((item): item is Product => Boolean(item))
      .slice(0, 4);
  }, [products, stats.topProducts]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading seller dashboard">
        <DashboardStatsSkeleton cards={4} />
        <ListCardSkeleton rows={4} />
      </div>
    );
  }

  const storeName = user?.store_name || user?.name || 'Your storefront';

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      {onboarding?.approval ? (
        <div className="rounded-xl border border-border bg-white p-5 shadow-none">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="section-kicker text-primary/70">Approval status</p>
              <h2 className="mt-1.5 text-lg font-bold text-slate-950">
                {String(onboarding.approval.status || 'draft').replaceAll('_', ' ')}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {onboarding.approval.status === 'approved'
                  ? 'Your seller account is approved. Publishing, orders, courier booking, and payouts are unlocked.'
                  : onboarding.approval.status === 'rejected'
                    ? onboarding.approval.rejection_reason || 'Your seller account needs updates before it can be approved again.'
                    : onboarding.approval.status === 'suspended'
                      ? onboarding.approval.suspension_reason || 'Your live seller privileges are suspended right now.'
                      : onboarding.approval.can_submit_for_review
                        ? 'Everything required for review is ready. Submit your seller account from onboarding to move into the review queue.'
                        : 'You can keep setting up your store and drafting products, but selling stays locked until admin approval.'}
              </p>
            </div>
            <div className="rounded-2xl bg-secondary/40 px-4 py-3 text-sm text-slate-700 lg:min-w-[260px]">
              <p className="font-semibold text-slate-950">Missing requirements</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {onboarding.approval.missing_requirements?.length
                  ? onboarding.approval.missing_requirements.map((item) => item.label).join(', ')
                  : 'No missing requirements right now.'}
              </p>
              <Link to="/seller/onboarding" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary">
                Open onboarding
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {manageMode ? (
        <SellerDashboardManageView stats={stats} insights={insights} onboarding={onboarding} products={products} user={user} />
      ) : null}
    </div>
  );
};
