import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../lib/logger';

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

function defaultSettingsPayload() {
  return {
    platform_name: 'LofiMart',
    support_email: 'support@lofimart.com',
    commission_rate: '12',
    currency: 'BDT',
    require2fa: 'true',
    autoApproveSellers: 'false',
    exit_intent_enabled: 'true',
    exit_intent_title: 'Keep your shortlist moving with a softer first order',
    exit_intent_message: 'Use code',
    exit_intent_code: 'WELCOME10',
    exit_intent_primary_cta: 'Review cart',
    exit_intent_secondary_cta: 'Keep browsing',
    enabled_checkout_payment_methods: 'cod',
    enabled_manual_order_payment_methods: 'cod',
    enabled_courier_providers: 'pathao',
  };
}

function emptyAccountingPayload() {
  return {
    updatedAt: nowIso(),
    summary: {
      assets: 0,
      liabilities: 0,
      equity: 0,
      revenue: 0,
      expenses: 0,
      accounts: 0,
      journal_entries: 0,
      net_income: 0,
    },
    reports: {
      trial_balance: { debit_total: 0, credit_total: 0, balanced: true },
      profit_and_loss: { revenue: 0, expenses: 0, net_income: 0 },
      cash_summary: { cash_on_hand: 0, stripe_clearing: 0, accounts_receivable: 0 },
      payable_summary: { customer_wallet_liability: 0, seller_payout_payable: 0, reseller_payout_payable: 0 },
    },
    accounts: [],
    journalEntries: [],
  };
}

function emptyPosPayload() {
  return {
    updatedAt: nowIso(),
    summary: {
      today_sales: 0,
      today_orders: 0,
      average_ticket: 0,
    },
    shift_summary: {
      cashier_sales: 0,
      cashier_orders: 0,
      cash_sales: 0,
      non_cash_sales: 0,
    },
    close_summary: {
      generated_at: nowIso(),
      cashier_name: 'Admin',
      total_sales: 0,
      total_orders: 0,
      cash_sales: 0,
      non_cash_sales: 0,
      top_items: [],
    },
    warehouses: [],
    products: [],
    recentOrders: [],
  };
}

function emptyOnboardingPayload() {
  return {
    status: 'draft',
    steps: [],
    missing: [],
    canSubmit: true,
    summary: {
      completed_steps: 0,
      total_steps: 0,
      progress_percent: 100,
    },
    next_step: null,
  };
}

function emptyCommerceConfigPayload() {
  return {
    currency: 'BDT',
    locale: 'bn-BD',
    free_shipping_threshold: 2500,
    freeShippingThreshold: 2500,
    cartRecoveryDelayMins: 30,
    signupBonusCoins: 0,
    orderCashbackBps: 0,
    spinEnabled: false,
    enabled_checkout_payment_methods: ['cod'],
    enabled_manual_order_payment_methods: ['cod'],
    enabled_courier_providers: ['pathao'],
  };
}

function emptyManualOrderCatalogPayload() {
  return {
    products: [],
    categories: [],
    refCode: '',
  };
}

function defaultLogisticsProviders() {
  return [
    {
      code: 'pathao',
      name: 'Pathao',
      mode: 'manual',
      supportsCod: true,
      supportsTrackingSync: false,
      supportsPickupBooking: false,
      setupStatus: 'manual_ready',
      setupMessage: 'Manual courier workflow is available.',
      brandColor: '#e11d48',
      shortLabel: 'Pathao',
    },
  ];
}

function getQueryNumber(request: NextRequest, key: string, fallback: number) {
  const value = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function legacyGetPayload(path: string, request: NextRequest) {
  if (path === 'admin/accounting') {
    return emptyAccountingPayload();
  }

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

  if (path === 'admin/settings') {
    return defaultSettingsPayload();
  }

  if (path === 'admin/integrations/status') {
    return {
      updatedAt: nowIso(),
      items: [],
      summary: { ready: 0, partial: 0, sandbox: 0, missing: 0 },
    };
  }

  if (path === 'admin/pos') {
    return emptyPosPayload();
  }

  if (path.includes('manual-orders/catalog')) {
    return emptyManualOrderCatalogPayload();
  }

  if (path.includes('manual-orders')) {
    return [];
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

  if (path === 'reseller/stats') {
    return {
      totalEarnings: 0,
      pendingEarnings: 0,
      productsShared: 0,
      successfulReferrals: 0,
      conversionRate: '0%',
      referralCode: '',
      referralClicks: 0,
    };
  }

  if (path === 'reseller/network') {
    return {
      directReferrals: 0,
      networkSize: 0,
      networkSales: 0,
      activeToday: 0,
      downline: [],
    };
  }

  if (path === 'reseller/referral-link') {
    return {
      code: '',
      url: '',
    };
  }

  if (path === 'reseller/my-products') {
    return {
      products: [],
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

  if (path.includes('missions')) {
    return {
      missions: [],
      claimed: true,
      points: 0,
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
    return emptyOnboardingPayload();
  }

  if (path.includes('commerce-config') || path.includes('config/public')) {
    return emptyCommerceConfigPayload();
  }

  if (path === 'shop-page') {
    return {
      products: [],
      categories: [],
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
    if (path === 'logistics/providers') {
      return defaultLogisticsProviders();
    }

    if (path === 'seller/logistics/pathao-readiness') {
      return {
        updatedAt: nowIso(),
        envReady: false,
        warehouseBlockers: [],
        bookingCandidates: [],
      };
    }

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

  if (path === 'search/discovery') {
    return {
      trending: ['Fashion', 'Electronics', 'Home Decor', 'Beauty'],
      categories: [],
    };
  }

  if (path === 'search/products') {
    return [];
  }

  if (path === 'categories/tree') {
    return [];
  }

  if (path === 'community/feed') {
    return {
      items: [],
      trending_topics: [],
      top_contributors: [],
      stats: {
        weekly_interactions: 0,
        average_rating: 0,
        fresh_updates_label: 'No updates yet',
        verified_partners: 0,
      },
    };
  }

  if (path.includes('categories') || path.includes('banners') || path.includes('blog') || path.includes('reviews')) {
    return [];
  }

  if (path === 'shipping/preview') {
    return {
      shipping_cost: 0,
      courier_provider: 'manual',
      estimated_delivery: '2-5 business days',
    };
  }

  if (path === 'coupons/validate') {
    return {
      code: '',
      discount: 0,
      discount_amount: 0,
      discountAmount: 0,
      type: 'fixed',
    };
  }

  if (path.includes('orders')) {
    if (path.startsWith('orders/track')) {
      return {
        order: null,
        timeline: [],
      };
    }

    return {
      orders: [],
      items: [],
      order: null,
    };
  }

  if (path.includes('about-page')) {
    return {
      title: 'LofiMart',
      content: '',
      sections: [],
    };
  }

  if (path.includes('ai/recommendations')) {
    return {
      recommendations: [],
      products: [],
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

  logger.warn('api-compat-fallback', { method, path: `/api/${path}` });

  if (method === 'GET' || method === 'HEAD') {
    const payload = legacyGetPayload(path, request);
    return NextResponse.json(payload);
  }

  if (path === 'admin/performance/web-vitals/acknowledge') {
    return NextResponse.json({ success: true, acknowledged: true });
  }

  if (path === 'coupons/validate') {
    return NextResponse.json({
      code: '',
      discount: 0,
      discount_amount: 0,
      discountAmount: 0,
      type: 'fixed',
    });
  }

  if (path === 'shipping/preview') {
    return NextResponse.json({
      shipping_cost: 0,
      courier_provider: 'manual',
      estimated_delivery: '2-5 business days',
    });
  }

  if (path === 'admin/pos/checkout') {
    const orderId = `POS-${Date.now()}`;
    return NextResponse.json({
      success: true,
      orderId,
      receipt: {
        id: orderId,
        total: 0,
        payment_method: 'cash',
        payment_status: 'paid',
        customer_name: 'Walk-in Customer',
        customer_phone: null,
        created_at: nowIso(),
        items: [],
      },
    });
  }

  if (path.includes('manual-orders')) {
    const orderId = `MO-${Date.now()}`;
    return NextResponse.json({
      success: true,
      id: orderId,
      orderId,
      orderCode: orderId,
      order_code: orderId,
      status: path.endsWith('/cancel') ? 'cancelled' : 'pending',
    });
  }

  if (path.includes('spin-wheel/spin')) {
    return NextResponse.json({
      success: true,
      reward: null,
      points: 0,
    });
  }

  if (path.includes('missions')) {
    return NextResponse.json({
      success: true,
      claimed: true,
      points: 0,
    });
  }

  if (path.includes('courier/bookings')) {
    return NextResponse.json({
      success: true,
      booking: {
        providerName: 'Manual courier',
        trackingId: null,
      },
      shipment: {
        status: 'pickup_requested',
        courier_provider: 'manual',
        tracking_id: null,
      },
    });
  }

  if (path.includes('shipments') || path.includes('logistics')) {
    return NextResponse.json({
      success: true,
      shipment: {
        status: 'processing',
      },
      data: {},
    });
  }

  if (path.includes('orders')) {
    return NextResponse.json({
      success: true,
      id: `ORD-${Date.now()}`,
      orderId: `ORD-${Date.now()}`,
      order_code: `ORD-${Date.now()}`,
      status: path.endsWith('/cancel') ? 'cancelled' : 'pending',
    });
  }

  if (path.includes('storefront-domain')) {
    return NextResponse.json({
      success: true,
      verified: false,
      token: '',
    });
  }

  if (path.includes('users/profile/avatar')) {
    return NextResponse.json({
      success: true,
      avatar_url: null,
    });
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
