import { formatPrice } from '@/lib/utils';
import {
  type SellerAttentionItem,
  type SellerIconName,
  type SellerQuickAction,
  type SellerRecentOrder,
  type SellerTopProduct,
} from './DashboardSections';
import type {
  SellerDashboardInsights,
  SellerOnboardingStatus,
  SellerStatsResponse,
} from './useSellerDashboardData';

export type SellerKpiView = {
  key: string;
  label: string;
  value: string;
  icon: SellerIconName;
  trend?: { value: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'neutral' | 'primary' };
  hint?: string;
  iconTone?: 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'neutral' | 'primary';
};

export type SellerDashboardView = {
  storeName: string;
  setup: {
    completedSteps: number;
    totalSteps: number;
    progressPercent: number;
    nextStepTitle: string | null;
    nextStepPath: string;
    isComplete: boolean;
  };
  quickActions: SellerQuickAction[];
  kpis: SellerKpiView[];
  recentOrders: SellerRecentOrder[];
  topProducts: SellerTopProduct[];
  attention: SellerAttentionItem[];
  revenueSummary: {
    headline: string;
    subline: string;
    peakLabel: string;
  };
  summary: string;
};

/**
 * Formats a signed percentage for a trend pill.
 *
 * Returns null when there is no comparison value, so the UI can omit the pill
 * rather than render a fabricated "+100%".
 */
function formatTrendPct(value: number | null | undefined): { value: string; tone: 'success' | 'warning' | 'neutral' } | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;

  const rounded = Math.round(value * 10) / 10;
  const prefix = rounded > 0 ? '+' : '';

  return {
    value: `${prefix}${rounded}%`,
    tone: rounded > 0 ? 'success' : rounded < 0 ? 'warning' : 'neutral',
  };
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Pure derivation of every value the seller dashboard renders.
 *
 * Kept out of the component tree so the KPI/attention rules can be reasoned
 * about (and unit tested) without rendering, and so the screen file stays a
 * thin composition of the Stitch dashboard sections.
 */
export function deriveSellerDashboardView(input: {
  stats: SellerStatsResponse;
  insights: SellerDashboardInsights;
  onboarding: SellerOnboardingStatus | null;
  storeName: string;
}): SellerDashboardView {
  const { stats, insights, onboarding, storeName } = input;

  const onboardingProgress = toPercent(onboarding?.summary?.progress_percent);
  const setupIsComplete = onboardingProgress >= 100;
  const completedSteps = Math.max(0, Number(onboarding?.summary?.completed_steps || 0));
  const totalSteps = Math.max(0, Number(onboarding?.summary?.total_steps || 0));

  // Prefer the authoritative low-stock count from the stats endpoint. The
  // insights payload only returns the five most urgent items, so its length
  // understates the real number.
  const lowStockCount = stats.lowStockCount ?? insights.lowStockProducts.length;
  const outOfStockCount = stats.outOfStockCount ?? insights.lowStockProducts.filter((item) => item.stock <= 0).length;
  const pendingOrders = stats.pendingOrders ?? Math.max(0, insights.activeShipments - insights.deliveredShipments);

  // The stats endpoint gained `revenue30d` after `totalEarnings` existed, so it
  // is optional. A real 0 must stay 0 instead of silently falling back to the
  // lifetime figure under a "last 30 days" label.
  const hasWindowRevenue = stats.revenue30d !== null && stats.revenue30d !== undefined;
  const revenue30d = stats.revenue30d ?? 0;
  const revenueValue = hasWindowRevenue ? revenue30d : stats.totalEarnings;
  const revenueHint = hasWindowRevenue ? 'Last 30 days gross' : 'All time gross';
  const peakRevenue = insights.salesSeries.reduce((max, point) => Math.max(max, Number(point.revenue || 0)), 0);
  // `salesSeries` is hourly (7 days => 168 buckets), so the mean is per bucket.
  const bucketCount = insights.salesSeries.length;
  const windowDays = Math.max(1, Math.round(bucketCount / 24));
  const averagePerBucket = bucketCount > 0
    ? insights.salesSeries.reduce((sum, point) => sum + Number(point.revenue || 0), 0) / bucketCount
    : 0;

  const kpis: SellerKpiView[] = [
    {
      key: 'orders',
      label: 'Orders',
      value: String(stats.totalOrders),
      icon: 'orders',
      hint: 'All time',
      iconTone: 'info',
    },
    {
      key: 'earnings',
      label: 'Total sales',
      value: formatPrice(revenueValue),
      icon: 'earnings',
      trend: formatTrendPct(stats.revenueTrendPct),
      hint: revenueHint,
      iconTone: 'success',
    },
    {
      key: 'products',
      label: 'Active products',
      value: String(stats.liveProducts ?? stats.totalProducts),
      icon: 'products',
      trend: lowStockCount > 0 ? { value: pluralize(lowStockCount, 'item') + ' low', tone: 'warning' } : undefined,
      hint: lowStockCount > 0 ? undefined : 'In active stock',
      iconTone: lowStockCount > 0 ? 'warning' : 'success',
    },
    {
      key: 'pending',
      label: 'Pending dispatch',
      value: String(pendingOrders),
      icon: 'pending',
      trend: stats.resolutionRate30d !== null && stats.resolutionRate30d !== undefined
        ? { value: `${stats.resolutionRate30d}% resolved`, tone: 'info' }
        : undefined,
      hint: stats.resolvedOrders30d ? `of ${pluralize(stats.resolvedOrders30d, 'order')} in 30d` : 'Awaiting fulfilment',
      iconTone: pendingOrders > 6 ? 'danger' : pendingOrders > 0 ? 'warning' : 'success',
    },
  ];

  const maxTopRevenue = Math.max(...stats.topProducts.map((product) => Number(product.revenue || 0)), 1);

  const topProducts: SellerTopProduct[] = stats.topProducts.slice(0, 5).map((product) => ({
    ...product,
    revenueLabel: formatPrice(Number(product.revenue || 0)),
    maxRevenue: maxTopRevenue,
  }));

  const recentOrders: SellerRecentOrder[] = insights.recentShipments.slice(0, 5).map((shipment) => ({
    id: shipment.id,
    orderId: shipment.order_id || shipment.id.slice(0, 8),
    createdAt: shipment.created_at,
    total: formatPrice(Number(shipment.total || 0)),
    status: shipment.status,
  }));

  const attention = buildAttentionItems({
    pendingOrders,
    lowStockCount,
    outOfStockCount,
    criticalLowStock: insights.lowStockProducts.find((item) => item.stock <= 2) ?? insights.lowStockProducts[0] ?? null,
    approvalStatus: onboarding?.approval?.status ?? null,
    missingRequirements: onboarding?.approval?.missing_requirements ?? [],
  });

  return {
    storeName,
    setup: {
      completedSteps,
      totalSteps,
      progressPercent: onboardingProgress,
      nextStepTitle: onboarding?.next_step?.title ?? null,
      nextStepPath: onboarding?.next_step?.action_path || '/seller/onboarding',
      isComplete: setupIsComplete,
    },
    quickActions: [
      { title: 'Add product', description: 'Launch a new SKU', to: '/seller/products/add', icon: 'add-product' },
      { title: 'Manage orders', description: 'Prioritise fulfilment', to: '/seller/orders', icon: 'orders' },
      { title: 'Stock adjustment', description: 'Update inventory', to: '/seller/inventory', icon: 'stock' },
      { title: 'Delivery shipments', description: 'Track couriers', to: '/seller/courier', icon: 'shipment' },
      { title: 'Request payout', description: 'Withdraw balance', to: '/seller/earnings', icon: 'payout' },
    ],
    kpis,
    recentOrders,
    topProducts,
    attention,
    revenueSummary: {
      headline: bucketCount > 0 ? `Average ${formatPrice(Math.round(averagePerBucket))} / hour` : 'No revenue trend yet',
      subline: `Gross revenue across the last ${windowDays} ${windowDays === 1 ? 'day' : 'days'} in hourly buckets`,
      peakLabel: peakRevenue > 0 ? `${formatPrice(Math.round(peakRevenue))} peak` : 'No peak recorded',
    },
    summary: buildSummary({ setupIsComplete, pendingOrders, lowStockCount, attentionCount: attention.length }),
  };
}

function toPercent(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildSummary(input: {
  setupIsComplete: boolean;
  pendingOrders: number;
  lowStockCount: number;
  attentionCount: number;
}): string {
  if (!input.setupIsComplete) {
    return 'Your store is still in setup mode. Finish the remaining publish steps before pushing more traffic.';
  }

  if (input.attentionCount > 0) {
    return 'Some items need your attention today. Work through the queue below to keep operations healthy.';
  }

  if (input.pendingOrders > 0) {
    return `Sales are moving with ${pluralize(input.pendingOrders, 'order')} still to dispatch. Keep the courier flow clear.`;
  }

  if (input.lowStockCount > 0) {
    return 'Operations look healthy, but inventory is tightening. Restock before running new promotions.';
  }

  return 'Operations look healthy right now. This is a strong window to launch products or scale promotions.';
}

function buildAttentionItems(input: {
  pendingOrders: number;
  lowStockCount: number;
  outOfStockCount: number;
  criticalLowStock: { id: string; name: string; stock: number; warehouse_name?: string | null } | null;
  approvalStatus: string | null;
  missingRequirements: Array<{ id: string; label: string }>;
}): SellerAttentionItem[] {
  const items: SellerAttentionItem[] = [];

  if (input.pendingOrders > 0) {
    items.push({
      id: 'pending-orders',
      tone: input.pendingOrders > 6 ? 'danger' : 'warning',
      title: `${pluralize(input.pendingOrders, 'order')} need processing`,
      description:
        input.pendingOrders > 6
          ? 'Fulfilment pressure is building up. Clear the queue before adding more campaign pressure.'
          : 'Review the queue so orders do not age before dispatch.',
      ctaLabel: 'Process',
      to: '/seller/orders',
      icon: 'orders',
    });
  }

  if (input.criticalLowStock) {
    const item = input.criticalLowStock;
    items.push({
      id: 'low-stock',
      tone: item.stock <= 2 ? 'danger' : 'warning',
      title: `${item.name} is low in stock`,
      description: `${pluralize(item.stock, 'unit')} left${
        item.warehouse_name ? ` in ${item.warehouse_name}` : ''
      }${input.outOfStockCount > 0 ? `. ${pluralize(input.outOfStockCount, 'product')} fully out of stock.` : '.'}`,
      ctaLabel: 'Restock',
      to: `/seller/products/edit/${encodeURIComponent(String(item.id))}`,
      icon: 'stock',
    });
  }

  if (input.approvalStatus && input.approvalStatus !== 'approved') {
    const requirementLabel = input.missingRequirements[0]?.label;
    items.push({
      id: 'approval',
      tone: input.approvalStatus === 'suspended' ? 'danger' : 'info',
      title:
        input.approvalStatus === 'rejected'
          ? 'Seller account needs updates'
          : input.approvalStatus === 'suspended'
            ? 'Selling privileges are suspended'
            : 'Verification still in progress',
      description: requirementLabel
        ? `Outstanding: ${requirementLabel}.`
        : 'Admin review is required before publishing and fulfilment unlock.',
      ctaLabel: 'Open onboarding',
      to: '/seller/onboarding',
      icon: 'verification',
    });
  }

  return items.slice(0, 4);
}
