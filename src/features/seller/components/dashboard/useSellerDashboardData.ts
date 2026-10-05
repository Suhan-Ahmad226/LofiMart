'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/features/shared/state/UserContext';
import type { Product } from '@/types';

export type SellerTopProductStat = {
  id: string;
  name: string;
  image?: string | null;
  sales: number;
  revenue: number;
};

/**
 * Response shape of GET /api/seller/stats.
 *
 * The first four fields are the original contract; everything after them is the
 * additive KPI block. New KPI fields are typed as nullable so a stale or
 * partially-deployed API never crashes the dashboard.
 */
export type SellerStatsResponse = {
  totalProducts: number;
  totalOrders: number;
  totalEarnings: number;
  topProducts: SellerTopProductStat[];
  liveProducts?: number | null;
  lowStockCount?: number | null;
  outOfStockCount?: number | null;
  pendingOrders?: number | null;
  deliveredOrders30d?: number | null;
  cancelledOrders30d?: number | null;
  activeShipments?: number | null;
  deliveredShipments?: number | null;
  settledOrders30d?: number | null;
  resolvedOrders30d?: number | null;
  resolutionRate30d?: number | null;
  revenue30d?: number | null;
  revenuePrev30d?: number | null;
  revenueTrendPct?: number | null;
  averageOrderValue30d?: number | null;
};

export type SellerLowStockProduct = {
  id: string;
  name: string;
  stock: number;
  warehouse_id?: string | null;
  warehouse_name?: string | null;
};

export type SellerRecentShipment = {
  id: string;
  order_id: string;
  created_at: string;
  total: number;
  status: string;
};

export type SellerDashboardInsights = {
  salesSeries: Array<{ label: string; revenue: number }>;
  lowStockProducts: SellerLowStockProduct[];
  recentShipments: SellerRecentShipment[];
  activeShipments: number;
  deliveredShipments: number;
};

export type SellerOnboardingStatus = {
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

export const EMPTY_SELLER_INSIGHTS: SellerDashboardInsights = {
  salesSeries: [],
  lowStockProducts: [],
  recentShipments: [],
  activeShipments: 0,
  deliveredShipments: 0,
};

const EMPTY_SELLER_STATS: SellerStatsResponse = {
  totalProducts: 0,
  totalOrders: 0,
  totalEarnings: 0,
  topProducts: [],
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStats(payload: unknown): SellerStatsResponse {
  if (!payload || typeof payload !== 'object') return EMPTY_SELLER_STATS;
  const raw = payload as Record<string, unknown>;

  return {
    totalProducts: toNumber(raw.totalProducts),
    totalOrders: toNumber(raw.totalOrders),
    totalEarnings: toNumber(raw.totalEarnings),
    topProducts: Array.isArray(raw.topProducts) ? (raw.topProducts as SellerTopProductStat[]) : [],

    liveProducts: toNullableNumber(raw.liveProducts),
    lowStockCount: toNullableNumber(raw.lowStockCount),
    outOfStockCount: toNullableNumber(raw.outOfStockCount),
    pendingOrders: toNullableNumber(raw.pendingOrders),
    deliveredOrders30d: toNullableNumber(raw.deliveredOrders30d),
    cancelledOrders30d: toNullableNumber(raw.cancelledOrders30d),
    activeShipments: toNullableNumber(raw.activeShipments),
    deliveredShipments: toNullableNumber(raw.deliveredShipments),
    settledOrders30d: toNullableNumber(raw.settledOrders30d),
    resolvedOrders30d: toNullableNumber(raw.resolvedOrders30d),
    resolutionRate30d: toNullableNumber(raw.resolutionRate30d),
    revenue30d: toNullableNumber(raw.revenue30d),
    revenuePrev30d: toNullableNumber(raw.revenuePrev30d),
    revenueTrendPct: toNullableNumber(raw.revenueTrendPct),
    averageOrderValue30d: toNullableNumber(raw.averageOrderValue30d),
  };
}

function parseInsights(payload: unknown): SellerDashboardInsights {
  if (!payload || typeof payload !== 'object') return EMPTY_SELLER_INSIGHTS;
  const raw = payload as Record<string, unknown>;

  return {
    salesSeries: Array.isArray(raw.salesSeries) ? (raw.salesSeries as Array<{ label: string; revenue: number }>) : [],
    lowStockProducts: Array.isArray(raw.lowStockProducts) ? (raw.lowStockProducts as SellerLowStockProduct[]) : [],
    recentShipments: Array.isArray(raw.recentShipments) ? (raw.recentShipments as SellerRecentShipment[]) : [],
    activeShipments: toNumber(raw.activeShipments),
    deliveredShipments: toNumber(raw.deliveredShipments),
  };
}

export type SellerDashboardData = {
  stats: SellerStatsResponse;
  insights: SellerDashboardInsights;
  onboarding: SellerOnboardingStatus | null;
  products: Product[];
  loading: boolean;
  error: string;
};

/**
 * Loads the seller dashboard payload.
 *
 * /api/seller/stats is the only blocking call: it gates the first paint. The
 * insights, onboarding and product payloads enrich sections that can render
 * without them, so they resolve independently and degrade to empty state.
 */
export function useSellerDashboardData(): SellerDashboardData {
  const { token } = useUser();
  const [stats, setStats] = useState<SellerStatsResponse>(EMPTY_SELLER_STATS);
  const [insights, setInsights] = useState<SellerDashboardInsights>(EMPTY_SELLER_INSIGHTS);
  const [onboarding, setOnboarding] = useState<SellerOnboardingStatus | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!token) {
      setError('Please log in as a seller to view your store performance.');
      setLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const requestOptions: RequestInit = {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    };

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const statsResponse = await fetch('/api/seller/stats', requestOptions);
        const statsPayload = await statsResponse.json().catch(() => null);

        if (!statsResponse.ok) {
          const message =
            statsPayload && typeof statsPayload === 'object' && 'error' in statsPayload
              ? String((statsPayload as { error?: unknown }).error || '')
              : '';
          throw new Error(message || 'Failed to load seller stats');
        }

        if (!active) return;

        setStats(parseStats(statsPayload));
        setLoading(false);

        const results = await Promise.allSettled([
          fetch('/api/seller/dashboard-insights', requestOptions),
          fetch('/api/seller/onboarding-status', requestOptions),
          fetch('/api/seller/products', requestOptions),
        ]);

        if (!active) return;

        const [insightsResult, onboardingResult, productsResult] = results;

        if (insightsResult.status === 'fulfilled' && insightsResult.value.ok) {
          const payload = await insightsResult.value.json().catch(() => null);
          if (active) setInsights(parseInsights(payload));
        }

        if (onboardingResult.status === 'fulfilled' && onboardingResult.value.ok) {
          const payload = (await onboardingResult.value.json().catch(() => null)) as SellerOnboardingStatus | null;
          if (active) setOnboarding(payload);
        }

        if (productsResult.status === 'fulfilled' && productsResult.value.ok) {
          const payload = await productsResult.value.json().catch(() => []);
          if (active) setProducts(Array.isArray(payload) ? (payload as Product[]) : []);
        }
      } catch (fetchError) {
        if (!active || controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load seller dashboard.');
        setStats(EMPTY_SELLER_STATS);
        setInsights(EMPTY_SELLER_INSIGHTS);
        setOnboarding(null);
        setProducts([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [token]);

  return { stats, insights, onboarding, products, loading, error };
}
