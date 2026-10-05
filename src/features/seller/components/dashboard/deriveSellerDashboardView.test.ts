import { describe, expect, it } from 'vitest';
import { deriveSellerDashboardView } from './deriveSellerDashboardView';
import {
  EMPTY_SELLER_INSIGHTS,
  type SellerStatsResponse,
} from './useSellerDashboardData';
import { formatRelativeTime, formatStatusLabel, toneForOrderStatus } from './sellerStatus';

const baseStats: SellerStatsResponse = {
  totalProducts: 0,
  totalOrders: 0,
  totalEarnings: 0,
  topProducts: [],
};

function stats(overrides: Partial<SellerStatsResponse> = {}): SellerStatsResponse {
  return { ...baseStats, ...overrides };
}

function onboardingSummary(progress: number, completed: number, total: number) {
  return {
    completed_steps: completed,
    total_steps: total,
    progress_percent: progress,
    ready_for_admin_review: progress === 100,
  };
}

describe('deriveSellerDashboardView', () => {
  it('omits the revenue trend pill when there is no prior period to compare', () => {
    const view = deriveSellerDashboardView({
      stats: stats({ revenue30d: 5000, revenuePrev30d: 0, revenueTrendPct: null }),
      insights: EMPTY_SELLER_INSIGHTS,
      onboarding: null,
      storeName: 'GadgetZone BD',
    });

    const earnings = view.kpis.find((kpi) => kpi.key === 'earnings');
    expect(earnings?.trend).toBeUndefined();
    expect(earnings?.value).toBe('৳ 5,000');
  });

  it('keeps a real zero in the 30-day revenue KPI instead of showing the lifetime total', () => {
    const view = deriveSellerDashboardView({
      stats: stats({ revenue30d: 0, revenuePrev30d: 0, revenueTrendPct: null, totalEarnings: 90_000 }),
      insights: EMPTY_SELLER_INSIGHTS,
      onboarding: null,
      storeName: 'GadgetZone BD',
    });

    const earnings = view.kpis.find((kpi) => kpi.key === 'earnings');
    expect(earnings?.value).toBe('৳ 0');
    expect(earnings?.hint).toBe('Last 30 days gross');
  });

  it('falls back to lifetime gross with an all-time hint when the API omits the 30-day field', () => {
    const view = deriveSellerDashboardView({
      stats: stats({ totalEarnings: 90_000 }),
      insights: EMPTY_SELLER_INSIGHTS,
      onboarding: null,
      storeName: 'GadgetZone BD',
    });

    const earnings = view.kpis.find((kpi) => kpi.key === 'earnings');
    expect(earnings?.value).toBe('৳ 90,000');
    expect(earnings?.hint).toBe('All time gross');
  });

  it('labels the revenue average per hour and derives the window from the hourly bucket count', () => {
    const view = deriveSellerDashboardView({
      stats: stats({ revenue30d: 168_000 }),
      insights: {
        ...EMPTY_SELLER_INSIGHTS,
        salesSeries: Array.from({ length: 24 * 7 }, (_, index) => ({
          label: new Date(Date.UTC(2026, 0, 1, index % 24)).toISOString(),
          revenue: 1000,
        })),
      },
      onboarding: null,
      storeName: 'GadgetZone BD',
    });

    expect(view.revenueSummary.headline).toBe('Average ৳ 1,000 / hour');
    expect(view.revenueSummary.subline).toBe('Gross revenue across the last 7 days in hourly buckets');
    expect(view.revenueSummary.peakLabel).toBe('৳ 1,000 peak');
  });

  it('reports a signed revenue trend when the API supplies one', () => {
    const view = deriveSellerDashboardView({
      stats: stats({ revenue30d: 5500, revenuePrev30d: 5000, revenueTrendPct: 10 }),
      insights: EMPTY_SELLER_INSIGHTS,
      onboarding: null,
      storeName: 'GadgetZone BD',
    });

    const earnings = view.kpis.find((kpi) => kpi.key === 'earnings');
    expect(earnings?.trend).toEqual({ value: '+10%', tone: 'success' });
  });

  it('prefers the authoritative low-stock count over the truncated insights list', () => {
    const view = deriveSellerDashboardView({
      stats: stats({ lowStockCount: 12, outOfStockCount: 2, liveProducts: 40 }),
      insights: {
        ...EMPTY_SELLER_INSIGHTS,
        lowStockProducts: [{ id: 'p1', name: 'ANC Earbuds', stock: 1 }],
      },
      onboarding: null,
      storeName: 'GadgetZone BD',
    });

    const products = view.kpis.find((kpi) => kpi.key === 'products');
    expect(products?.value).toBe('40');
    expect(products?.trend).toEqual({ value: '12 items low', tone: 'warning' });
  });

  it('falls back to insights-derived pending orders when the KPI is missing', () => {
    const view = deriveSellerDashboardView({
      stats: stats({ pendingOrders: null }),
      insights: { ...EMPTY_SELLER_INSIGHTS, activeShipments: 5, deliveredShipments: 2 },
      onboarding: null,
      storeName: 'GadgetZone BD',
    });

    expect(view.kpis.find((kpi) => kpi.key === 'pending')?.value).toBe('3');
  });

  it('surfaces the pending order queue as an attention item with a danger tone when it grows', () => {
    const view = deriveSellerDashboardView({
      stats: stats({ pendingOrders: 12 }),
      insights: EMPTY_SELLER_INSIGHTS,
      onboarding: null,
      storeName: 'GadgetZone BD',
    });

    const pending = view.attention.find((item) => item.id === 'pending-orders');
    expect(pending?.tone).toBe('danger');
    expect(pending?.to).toBe('/seller/orders');
  });

  it('flags an unapproved seller account so the review queue is visible', () => {
    const view = deriveSellerDashboardView({
      stats: stats(),
      insights: EMPTY_SELLER_INSIGHTS,
      onboarding: {
        approval: {
          status: 'pending_review',
          missing_requirements: [{ id: 'trade_license', label: 'Trade license' }],
        },
      },
      storeName: 'GadgetZone BD',
    });

    const approval = view.attention.find((item) => item.id === 'approval');
    expect(approval?.description).toContain('Trade license');
  });

  it('does not raise an approval attention item once the seller is approved', () => {
    const view = deriveSellerDashboardView({
      stats: stats(),
      insights: EMPTY_SELLER_INSIGHTS,
      onboarding: { approval: { status: 'approved' } },
      storeName: 'GadgetZone BD',
    });

    expect(view.attention.find((item) => item.id === 'approval')).toBeUndefined();
  });

  it('marks setup complete only at 100 percent', () => {
    const partial = deriveSellerDashboardView({
      stats: stats(),
      insights: EMPTY_SELLER_INSIGHTS,
      onboarding: { summary: onboardingSummary(66, 4, 6) },
      storeName: 'GadgetZone BD',
    });
    const done = deriveSellerDashboardView({
      stats: stats(),
      insights: EMPTY_SELLER_INSIGHTS,
      onboarding: { summary: onboardingSummary(100, 6, 6) },
      storeName: 'GadgetZone BD',
    });

    expect(partial.setup.isComplete).toBe(false);
    expect(partial.setup.completedSteps).toBe(4);
    expect(done.setup.isComplete).toBe(true);
  });

  it('computes top-product share against the strongest product', () => {
    const view = deriveSellerDashboardView({
      stats: stats({
        topProducts: [
          { id: 'a', name: 'A', sales: 10, revenue: 1000 },
          { id: 'b', name: 'B', sales: 5, revenue: 500 },
        ],
      }),
      insights: EMPTY_SELLER_INSIGHTS,
      onboarding: null,
      storeName: 'GadgetZone BD',
    });

    expect(view.topProducts[0].maxRevenue).toBe(1000);
    expect(view.topProducts[1].revenueLabel).toBe('৳ 500');
  });

  it('returns an empty attention list when operations are healthy', () => {
    const view = deriveSellerDashboardView({
      stats: stats({ lowStockCount: 0, outOfStockCount: 0, pendingOrders: 0 }),
      insights: EMPTY_SELLER_INSIGHTS,
      onboarding: {
        approval: { status: 'approved' },
        summary: onboardingSummary(100, 6, 6),
      },
      storeName: 'GadgetZone BD',
    });

    expect(view.attention).toHaveLength(0);
    expect(view.summary).toContain('healthy');
  });
});

describe('seller status presentation', () => {
  it('maps known statuses to design-system tones and falls back to neutral', () => {
    expect(toneForOrderStatus('delivered')).toBe('success');
    expect(toneForOrderStatus('cancelled')).toBe('danger');
    expect(toneForOrderStatus('in_transit')).toBe('pending');
    expect(toneForOrderStatus('processing')).toBe('info');
    expect(toneForOrderStatus('pending')).toBe('warning');
    expect(toneForOrderStatus('teleported')).toBe('neutral');
  });

  it('title-cases snake_case status labels', () => {
    expect(formatStatusLabel('ready_for_pickup')).toBe('Ready For Pickup');
    expect(formatStatusLabel('')).toBe('');
  });

  it('formats relative time and rejects unparseable timestamps', () => {
    const now = Date.parse('2026-10-05T12:00:00.000Z');
    expect(formatRelativeTime('2026-10-05T11:30:00.000Z', now)).toBe('30 min ago');
    expect(formatRelativeTime('not-a-date', now)).toBe('');
  });
});
