import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ compat?: string[] }>;

const nowIso = () => new Date().toISOString();

function emptyReadinessSummary() {
  return {
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
}

function emptyPerformanceSummary(windowHours = 24) {
  return {
    windowHours,
    totalEvents: 0,
    lastUpdated: null,
    metrics: [],
    routes: [],
    timeline: [],
    alerts: [],
    alert: {
      severity: 'healthy',
      title: 'No telemetry yet',
      message: 'Web vitals events will appear here after visitors browse the storefront.',
    },
  };
}

function getQueryNumber(request: NextRequest, key: string, fallback: number) {
  const value = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function legacyGetPayload(path: string, request: NextRequest) {
  if (path === 'admin/stats') {
    return {
      totalUsers: 0,
      totalSellers: 0,
      totalOrders: 0,
      totalRevenue: 0,
      recentOrders: [],
    };
  }

  if (path === 'admin/performance/web-vitals') {
    return emptyPerformanceSummary(getQueryNumber(request, 'hours', 24));
  }

  if (path === 'admin/dashboard-insights' || path === 'seller/dashboard-insights') {
    return {
      salesSeries: [],
      activityHeatmap: [],
      lowStockProducts: [],
      activeShipments: 0,
      deliveredShipments: 0,
      activeRiskFlags: 0,
      readinessSummary: emptyReadinessSummary(),
    };
  }

  if (path === 'admin/operations-summary') {
    return {
      updatedAt: nowIso(),
      items: [],
    };
  }

  if (path.endsWith('/earnings')) {
    return {
      totalEarnings: 0,
      availableBalance: 0,
      pendingClearance: 0,
      transactions: [],
    };
  }

  if (path.endsWith('/payouts')) {
    return {
      payouts: [],
      requests: [],
    };
  }

  if (path.includes('wallet')) {
    return {
      balance: 0,
      wallet_balance: 0,
      transactions: [],
    };
  }

  if (path.includes('points') || path.includes('engagement/overview')) {
    return {
      points: 0,
      wallet_balance: 0,
      streak: null,
      missions: [],
      recentRewards: [],
    };
  }

  if (path.includes('storefront-settings')) {
    return {
      settings: {
        storefront_slug: null,
        storefront_headline: null,
        storefront_banner_url: null,
        storefront_accent_color: null,
        storefront_custom_domain: null,
        storefront_published: true,
      },
    };
  }

  if (path.includes('onboarding-status')) {
    return {
      status: 'draft',
      steps: [],
      missing: [],
      canSubmit: true,
    };
  }

  if (path.includes('commerce-config') || path.includes('config/public')) {
    return {
      currency: 'BDT',
      locale: 'bn-BD',
      freeShippingThreshold: 0,
      cartRecoveryDelayMins: 30,
      signupBonusCoins: 0,
      orderCashbackBps: 0,
      spinEnabled: false,
    };
  }

  if (path.includes('flash-sale')) {
    return {
      campaign: null,
      campaigns: [],
      entries: [],
      products: [],
    };
  }

  if (path.includes('logistics') || path.includes('shipments') || path.includes('courier')) {
    return {
      providers: [],
      shipments: [],
      bookings: [],
      diagnostics: {},
      readiness: {
        ready: false,
        missing: [],
      },
    };
  }

  if (path.includes('categories') || path.includes('banners') || path.includes('blog') || path.includes('reviews')) {
    return [];
  }

  if (path.includes('orders')) {
    return {
      orders: [],
      items: [],
      order: null,
    };
  }

  if (
    path.includes('products') ||
    path.includes('coupons') ||
    path.includes('notifications') ||
    path.includes('addresses') ||
    path.includes('messages') ||
    path.includes('community') ||
    path.includes('search') ||
    path.includes('recommendations') ||
    path.includes('feed') ||
    path.includes('manual-orders') ||
    path.includes('inventory') ||
    path.includes('users') ||
    path.includes('sellers') ||
    path.includes('reseller')
  ) {
    return [];
  }

  return {};
}

async function handle(request: NextRequest, params: Params) {
  const { compat = [] } = await params;
  const path = compat.join('/');
  const method = request.method.toUpperCase();

  console.warn(`[api-compat-fallback] ${method} /api/${path}`);

  if (method === 'GET' || method === 'HEAD') {
    const payload = legacyGetPayload(path, request);
    return NextResponse.json(payload);
  }

  if (path === 'admin/performance/web-vitals/acknowledge') {
    return NextResponse.json({ success: true, acknowledged: true });
  }

  return NextResponse.json({
    success: true,
    ok: true,
    id: null,
    updatedAt: nowIso(),
  });
}

export function GET(request: NextRequest, context: { params: Params }) {
  return handle(request, context.params);
}

export function POST(request: NextRequest, context: { params: Params }) {
  return handle(request, context.params);
}

export function PUT(request: NextRequest, context: { params: Params }) {
  return handle(request, context.params);
}

export function PATCH(request: NextRequest, context: { params: Params }) {
  return handle(request, context.params);
}

export function DELETE(request: NextRequest, context: { params: Params }) {
  return handle(request, context.params);
}
