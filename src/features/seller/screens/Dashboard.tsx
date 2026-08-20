import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Clock3,
  DollarSign,
  Eye,
  LayoutDashboard,
  Loader2,
  Package,
  ShoppingBag,
  Settings2,
  Store,
  TrendingUp,
  Truck,
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
import { ProductCard } from '@/features/shop/components/ProductCard';
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

type FlashSaleCampaign = {
  id: string;
  title: string;
  status: string;
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

type SellerFlashSaleResponse = {
  campaigns?: FlashSaleCampaign[];
  entries?: FlashSaleEntry[];
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

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-border bg-white shadow-sm">
        <div className="relative min-h-[260px] overflow-hidden bg-slate-950">
          {bannerUrl ? (
            <OptimizedImage
              src={bannerUrl}
              alt={`${storeName} storefront banner`}
              eager
              widthHint={1600}
              heightHint={640}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <div
            className="absolute inset-0"
            style={{
              background: bannerUrl
                ? 'linear-gradient(180deg, rgba(2, 6, 23, 0.08), rgba(2, 6, 23, 0.62))'
                : 'linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(15, 118, 110, 0.82))',
            }}
          />
          {!bannerUrl ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white/75">
              Upload a storefront banner from settings to preview it here.
            </div>
          ) : null}
          <div className="relative flex min-h-[260px] flex-col justify-between gap-5 px-5 py-5 text-white sm:px-6 sm:py-6">
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 section-kicker backdrop-blur">
                <Store size={14} />
                Uploaded storefront banner
              </span>
              {storefrontPath ? (
                <Link
                  to={storefrontPath}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/15"
                >
                  <Eye size={14} />
                  Open storefront
                </Link>
              ) : null}
            </div>

            <div className="flex items-end gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.25rem] border border-white/15 bg-white/10 text-2xl font-bold uppercase backdrop-blur">
                {avatarUrl ? (
                  <OptimizedImage
                    src={avatarUrl}
                    alt={storeName}
                    eager
                    widthHint={160}
                    heightHint={160}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  storeName[0] || 'S'
                )}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-bold sm:text-3xl">{storeName}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/84 sm:text-base">
                  {headline || 'Your public storefront preview appears here exactly where shoppers first notice your brand.'}
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                  {storefrontPath ? `Public shop: ${storefrontPath}` : 'Public shop link not set yet'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {previewCoupons.length > 0 ? (
        <section className="rounded-[2rem] border border-border bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-kicker text-primary/70">Store promotions</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Coupons customers can use now</h2>
            </div>
            <Link to="/seller/marketing" className="text-sm font-semibold text-primary hover:text-primary-dark">
              Manage coupons
            </Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {previewCoupons.map((coupon) => {
              const discountLabel =
                coupon.discount_type === 'percentage'
                  ? `${coupon.discount_value}% off`
                  : `${formatPrice(coupon.discount_value)} off`;
              return (
                <div key={coupon.id} className="rounded-[1.5rem] border border-border bg-secondary/20 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary/70">Coupon code</p>
                      <h3 className="mt-2 text-xl font-black tracking-[0.16em] text-slate-950">{coupon.code}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          const copied = await copyText(coupon.code);
                          if (copied) {
                            toast.success(`Coupon ${coupon.code} copied.`);
                            return;
                          }
                          toast.error('Could not copy this coupon on this device.');
                        })();
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary/20 hover:text-primary"
                    >
                      <Copy size={13} />
                      Copy
                    </button>
                  </div>
                  <p className="mt-4 text-base font-semibold text-slate-900">{discountLabel}</p>
                  <div className="mt-3 space-y-1 text-sm text-slate-500">
                    <p>Minimum order: {formatPrice(coupon.min_order_value)}</p>
                    <p>Valid until: {new Date(coupon.expiry_date).toLocaleDateString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {flashProducts.length > 0 ? (
        <section className="rounded-[2rem] border border-border bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 section-kicker text-accent/80">
                <Zap size={14} className="fill-accent text-accent" />
                Flash sale
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Approved sale picks</h2>
            </div>
            <Link to="/seller/flash-sale" className="text-sm font-semibold text-primary hover:text-primary-dark">
              Manage flash sale
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4">
            {flashProducts.map((entry) => (
              <ProductCard key={entry.id} product={entry.product as Product} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-border bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker text-primary/70">Featured products</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Storefront highlights</h2>
          </div>
          <Link to="/seller/products" className="text-sm font-semibold text-primary hover:text-primary-dark">
            See full catalog
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4">
          {featuredProducts.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-10 text-center text-sm text-muted-foreground">
              Add products to see your storefront preview cards here.
            </div>
          ) : (
            featuredProducts.map((product) => <ProductCard key={product.id} product={product} />)
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-border bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker text-primary/70">Latest products</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Newest catalog entries</h2>
          </div>
          <Link to="/seller/products/add" className="text-sm font-semibold text-primary hover:text-primary-dark">
            Add another product
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4">
          {latestProducts.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-10 text-center text-sm text-muted-foreground">
              Your latest products will appear here once you add them.
            </div>
          ) : (
            latestProducts.map((product) => <ProductCard key={product.id} product={product} />)
          )}
        </div>
      </section>

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
                        ? `Next: ${onboarding.next_step.title}`
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
  const [manageMode, setManageMode] = useState(false);
  const [stats, setStats] = useState<SellerStatsResponse>({
    totalProducts: 0,
    totalOrders: 0,
    totalEarnings: 0,
    topProducts: [],
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [flashSaleEntries, setFlashSaleEntries] = useState<FlashSaleEntry[]>([]);
  const [coupons, setCoupons] = useState<SellerCoupon[]>([]);
  const [insights, setInsights] = useState<SellerDashboardInsights>(emptyInsights);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onboarding, setOnboarding] = useState<SellerOnboardingStatus | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncManageMode = () => {
      setManageMode(window.localStorage.getItem(manageModeStorageKey) === 'true');
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
    const fetchDashboard = async () => {
      if (!token) {
        setError('Please log in as a seller to view your store performance.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const [statsResult, insightsResult, onboardingResult, productsResult, flashResult, couponsResult] = await Promise.allSettled([
          fetch('/api/seller/stats', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/seller/dashboard-insights', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/seller/onboarding-status', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/seller/products', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/seller/flash-sale', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/seller/coupons', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (statsResult.status !== 'fulfilled') {
          throw new Error('Failed to load seller stats');
        }

        const statsPayload = await statsResult.value.json().catch(() => null);
        if (!statsResult.value.ok) {
          throw new Error(statsPayload?.error || 'Failed to load seller stats');
        }

        setStats({
          totalProducts: Number(statsPayload.totalProducts || 0),
          totalOrders: Number(statsPayload.totalOrders || 0),
          totalEarnings: Number(statsPayload.totalEarnings || 0),
          topProducts: Array.isArray(statsPayload.topProducts) ? statsPayload.topProducts : [],
        });

        if (insightsResult.status === 'fulfilled' && insightsResult.value.ok) {
          const insightsPayload = (await insightsResult.value.json()) as SellerDashboardInsights;
          setInsights({
            salesSeries: Array.isArray(insightsPayload.salesSeries) ? insightsPayload.salesSeries : [],
            lowStockProducts: Array.isArray(insightsPayload.lowStockProducts) ? insightsPayload.lowStockProducts : [],
            recentShipments: Array.isArray(insightsPayload.recentShipments) ? insightsPayload.recentShipments : [],
            activeShipments: Number(insightsPayload.activeShipments || 0),
            deliveredShipments: Number(insightsPayload.deliveredShipments || 0),
          });
        } else {
          setInsights(emptyInsights);
        }

        if (onboardingResult.status === 'fulfilled' && onboardingResult.value.ok) {
          const onboardingPayload = (await onboardingResult.value.json()) as SellerOnboardingStatus;
          setOnboarding(onboardingPayload);
        } else {
          setOnboarding(null);
        }

        if (productsResult.status === 'fulfilled' && productsResult.value.ok) {
          const productsPayload = await productsResult.value.json().catch(() => []);
          setProducts(Array.isArray(productsPayload) ? productsPayload : []);
        } else {
          setProducts([]);
        }

        if (flashResult.status === 'fulfilled' && flashResult.value.ok) {
          const flashPayload = (await flashResult.value.json().catch(() => null)) as SellerFlashSaleResponse | null;
          setFlashSaleEntries(Array.isArray(flashPayload?.entries) ? flashPayload!.entries! : []);
        } else {
          setFlashSaleEntries([]);
        }

        if (couponsResult.status === 'fulfilled' && couponsResult.value.ok) {
          const couponsPayload = await couponsResult.value.json().catch(() => []);
          setCoupons(Array.isArray(couponsPayload) ? couponsPayload : []);
        } else {
          setCoupons([]);
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load seller dashboard.');
        setStats({
          totalProducts: 0,
          totalOrders: 0,
          totalEarnings: 0,
          topProducts: [],
        });
        setProducts([]);
        setFlashSaleEntries([]);
        setCoupons([]);
        setInsights(emptyInsights);
        setOnboarding(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchDashboard();
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
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
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
      ) : (
        <SellerStorefrontPreview
          storeName={storeName}
          bannerUrl={user?.storefront_banner_url}
          avatarUrl={user?.avatar_url}
          headline={user?.storefront_headline || user?.bio}
          storefrontSlug={user?.storefront_slug}
          products={products}
          bestSellers={bestSellerProducts}
          flashSaleEntries={flashSaleEntries}
          coupons={coupons}
        />
      )}
    </div>
  );
};
