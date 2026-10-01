import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import {
  buildHourlySeriesFromOrders,
  buildWeeklyHeatmapFromOrders,
  requireAdminRole,
  requireApiUser,
} from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 5);

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const safe = async <T,>(label: string, fallback: T, query: Promise<T>) => {
    try {
      return await query;
    } catch (error) {
      console.error(`GET /api/admin/dashboard-insights ${label} error:`, error);
      return fallback;
    }
  };

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [recentOrders, lowStockProducts, activeShipments, riskFlags, sellers, resellers, payoutMethodCounts, warehouses, referrals, resellerMarkups] =
    await Promise.all([
      safe(
        'recentOrders',
        [],
        prisma.order.findMany({
          where: {
            createdAt: { gte: since },
            status: { not: 'cancelled' },
          },
          select: {
            createdAt: true,
            total: true,
          },
        }),
      ),
      safe(
        'lowStockProducts',
        [],
        prisma.product.findMany({
          where: { stock: { lte: LOW_STOCK_THRESHOLD } },
          orderBy: { stock: 'asc' },
          take: 5,
          select: { id: true, name: true, stock: true },
        }),
      ),
      safe(
        'activeShipments',
        0,
        prisma.orderShipment.count({
          where: {
            status: { in: ['processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery'] },
          },
        }),
      ),
      safe('riskFlags', 0, prisma.userRiskFlag.count({ where: { isActive: true } })),
      safe(
        'sellers',
        [],
        prisma.user.findMany({
          where: { role: 'seller' },
          select: { id: true, emailVerified: true, phoneVerified: true, storeName: true, storefrontSlug: true },
        }),
      ),
      safe(
        'resellers',
        [],
        prisma.user.findMany({
          where: { role: 'reseller' },
          select: { id: true, emailVerified: true, phoneVerified: true },
        }),
      ),
      safe(
        'payoutMethodCounts',
        [],
        prisma.payoutMethod.groupBy({
          by: ['userId'],
          where: { status: 'active' },
          _count: { _all: true },
        }),
      ),
      safe(
        'warehouses',
        [],
        prisma.warehouse.findMany({
          select: { id: true, managerId: true, address: true, city: true, phone: true, contactName: true, pathaoStoreId: true },
        }),
      ),
      safe('referrals', 0, prisma.resellerReferral.count({ where: { clicks: { gt: 0 } } })),
      safe('resellerMarkups', [], prisma.resellerMarkup.groupBy({ by: ['resellerId'], _count: { _all: true } })),
    ]);

  const payoutReadyUserIds = new Set(payoutMethodCounts.map((row) => String(row.userId)));
  const sellerWarehouses = new Map<string, Array<{ address: string; city: string; phone: string | null; contactName: string | null; pathaoStoreId: number | null }>>();

  for (const warehouse of warehouses) {
    if (!warehouse.managerId) continue;
    const key = String(warehouse.managerId);
    const current = sellerWarehouses.get(key) || [];
    current.push({
      address: warehouse.address,
      city: warehouse.city,
      phone: warehouse.phone,
      contactName: warehouse.contactName,
      pathaoStoreId: warehouse.pathaoStoreId,
    });
    sellerWarehouses.set(key, current);
  }

  const resellersWithClicks = Number(referrals || 0);
  const resellerMarkupMap = new Map(resellerMarkups.map((row) => [String(row.resellerId), Number(row._count?._all || 0)]));

  return NextResponse.json({
    salesSeries: buildHourlySeriesFromOrders(recentOrders, 12),
    activityHeatmap: buildWeeklyHeatmapFromOrders(recentOrders),
    lowStockProducts: lowStockProducts.map((product) => ({
      id: product.id,
      name: product.name,
      stock: product.stock,
    })),
    activeShipments,
    activeRiskFlags: riskFlags,
    readinessSummary: {
      sellers: {
        identity_incomplete: sellers.filter((seller) => !seller.storeName?.trim() || !seller.storefrontSlug?.trim()).length,
        verification_incomplete: sellers.filter((seller) => !seller.emailVerified || !seller.phoneVerified).length,
        pickup_incomplete: sellers.filter((seller) => {
          const rows = sellerWarehouses.get(String(seller.id)) || [];
          if (rows.length === 0) return true;
          return !rows.some((warehouse) => warehouse.address?.trim() && warehouse.city?.trim() && warehouse.phone?.trim() && warehouse.contactName?.trim());
        }).length,
        courier_unlinked: sellers.filter((seller) => {
          const rows = sellerWarehouses.get(String(seller.id)) || [];
          if (rows.length === 0) return true;
          return !rows.some((warehouse) => Boolean(warehouse.pathaoStoreId));
        }).length,
        payout_missing: sellers.filter((seller) => !payoutReadyUserIds.has(String(seller.id))).length,
      },
      resellers: {
        verification_incomplete: resellers.filter((reseller) => !reseller.emailVerified || !reseller.phoneVerified).length,
        catalog_empty: resellers.filter((reseller) => Number(resellerMarkupMap.get(String(reseller.id)) || 0) === 0).length,
        payout_missing: resellers.filter((reseller) => !payoutReadyUserIds.has(String(reseller.id))).length,
        no_clicks_yet: Math.max(0, resellers.length - Number(referrals || 0)),
      },
    },
  });
}
