export type SellerDashboardIntelligenceInput = {
  stats: {
    totalProducts: number;
    totalOrders: number;
    totalEarnings: number;
    topProducts: Array<{ id: string; name: string; sales: number; revenue: number }>;
  };
  insights: {
    salesSeries: Array<{ label: string; revenue: number }>;
    lowStockProducts: Array<{ id: string; name: string; stock: number; warehouse_name?: string | null }>;
    recentShipments: Array<{ id: string; order_id: string; created_at: string; total: number; status: string }>;
    activeShipments: number;
    deliveredShipments: number;
  };
  onboarding?: {
    summary?: {
      progress_percent?: number | null;
      completed_steps?: number | null;
      total_steps?: number | null;
      ready_for_admin_review?: boolean | null;
    } | null;
    next_step?: {
      title?: string | null;
      action_path?: string | null;
    } | null;
    approval?: {
      status?: string | null;
    } | null;
  } | null;
  products?: Array<{ id: number | string; name: string; stock?: number | null }>;
};

export type SellerDashboardIntelligence = {
  executiveSummary: string;
  focusAction: {
    title: string;
    description: string;
    tone: 'critical' | 'warning' | 'info' | 'success';
    to: string;
    ctaLabel: string;
  };
  healthSignals: Array<{ label: string; value: string; tone: 'good' | 'warning' | 'critical' }>;
  aiInsights: string[];
  quickActions: Array<{ title: string; description: string; to: string }>;
};

export function buildSellerDashboardIntelligence(input: SellerDashboardIntelligenceInput): SellerDashboardIntelligence {
  const lowStockCount = input.insights.lowStockProducts.length;
  const criticalLowStockItem = input.insights.lowStockProducts.find((item) => item.stock <= 2) ?? input.insights.lowStockProducts[0] ?? null;
  const pendingOrders = Math.max(0, input.insights.activeShipments - input.insights.deliveredShipments);
  const publishReady = Number(input.onboarding?.summary?.progress_percent || 0) >= 100;
  const todaySales = input.insights.salesSeries[input.insights.salesSeries.length - 1]?.revenue || 0;
  const previousSales = input.insights.salesSeries[input.insights.salesSeries.length - 2]?.revenue || 0;

  const aiInsights: string[] = [];
  if (lowStockCount > 0) {
    aiInsights.push(`Restock ${lowStockCount} low-stock product${lowStockCount === 1 ? '' : 's'} before launching new promotions.`);
  }
  if (!publishReady) {
    aiInsights.push('Complete onboarding and branding to strengthen storefront trust before pushing more traffic.');
  }
  if (todaySales < previousSales && previousSales > 0) {
    aiInsights.push('Today sales are softer than the previous period. Highlight your best sellers and active coupons.');
  }
  if (input.stats.topProducts.length > 0) {
    aiInsights.push(`Your top mover is ${input.stats.topProducts[0].name}. Feature it higher in your storefront and campaigns.`);
  }
  if (input.insights.activeShipments > input.insights.deliveredShipments + 4) {
    aiInsights.push('Shipment backlog is building up. Prioritize pickup-needed orders before adding new campaigns.');
  }

  const focusAction =
    criticalLowStockItem && criticalLowStockItem.stock <= 2
      ? {
          title: 'Restock the hottest SKU now',
          description: `${criticalLowStockItem.name} is running low${criticalLowStockItem.warehouse_name ? ` in ${criticalLowStockItem.warehouse_name}` : ''}.`,
          tone: 'critical' as const,
          to: `/seller/products/edit/${encodeURIComponent(String(criticalLowStockItem.id))}`,
          ctaLabel: 'Fix stock',
        }
      : pendingOrders > 6
        ? {
            title: 'Clear the fulfillment queue',
            description: 'Packing and courier attention is building up. Review fresh orders before they age.',
            tone: 'warning' as const,
            to: '/seller/orders',
            ctaLabel: 'Open orders',
          }
        : !publishReady
          ? {
              title: 'Finish store setup',
              description: 'Complete storefront readiness so promotion and traffic conversion feel more trustworthy.',
              tone: 'info' as const,
              to: input.onboarding?.next_step?.action_path || '/seller/onboarding',
              ctaLabel: 'Continue setup',
            }
          : {
              title: 'Grow the store with confidence',
              description: 'Operations are stable and this is a strong window to launch more products or promotions.',
              tone: 'success' as const,
              to: '/seller/marketing',
              ctaLabel: 'Grow sales',
            };

  const healthSignals: SellerDashboardIntelligence['healthSignals'] = [
    {
      label: 'Publish readiness',
      value: publishReady ? 'Ready' : `${Number(input.onboarding?.summary?.progress_percent || 0)}% complete`,
      tone: publishReady ? 'good' : 'warning',
    },
    {
      label: 'Inventory risk',
      value: lowStockCount === 0 ? 'Healthy' : `${lowStockCount} item${lowStockCount === 1 ? '' : 's'} low`,
      tone: lowStockCount === 0 ? 'good' : criticalLowStockItem?.stock && criticalLowStockItem.stock <= 2 ? 'critical' : 'warning',
    },
    {
      label: 'Courier load',
      value: input.insights.activeShipments === 0 ? 'Calm' : `${input.insights.activeShipments} active`,
      tone: input.insights.activeShipments > input.insights.deliveredShipments + 4 ? 'warning' : 'good',
    },
  ];

  const executiveSummary = !publishReady
    ? 'Your store is still in setup mode. Finish the remaining publish steps before pushing more traffic.'
    : pendingOrders > 6
      ? 'Demand is active, but fulfillment pressure is rising. Clear the order queue before promoting more products.'
      : lowStockCount > 0
        ? 'Sales are moving, but inventory risk is visible. Restock key SKUs to avoid losing conversion.'
        : 'Operations look healthy right now. This is a strong window to launch products or scale promotions.';

  const quickActions = [
    { title: 'Add product', description: 'Launch a new SKU quickly', to: '/seller/products/add' },
    { title: 'Review orders', description: 'Prioritize fulfillment tasks', to: '/seller/orders' },
    { title: 'Courier panel', description: 'Check pickup and shipment flow', to: '/seller/courier' },
    { title: 'View earnings', description: 'Track balances and settlement', to: '/seller/earnings' },
  ];

  return {
    executiveSummary,
    focusAction,
    healthSignals,
    aiInsights: aiInsights.slice(0, 4),
    quickActions,
  };
}
