import { NextRequest, NextResponse } from 'next/server';
import type { ShipmentStatus } from '@prisma/client';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 5);

const ACTIVE_SHIPMENT_STATUSES: ShipmentStatus[] = [
  'processing',
  'packed',
  'ready_for_pickup',
  'pickup_requested',
  'picked_up',
  'in_transit',
  'out_for_delivery',
];

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  // Revenue must be line revenue (unit price × quantity), not the unit price.
  // Keep this calculation in Postgres so the query remains bounded for large sellers.
  const [totalProducts, totalOrders, revenueAggregate, productSales, periodRevenue, previousPeriodRevenue] =
    await Promise.all([
      prisma.product.count({ where: { sellerId } }),
      prisma.order.count({ where: { items: { some: { product: { sellerId } } } } }),
      prisma.$queryRaw<Array<{ total: unknown }>>`
        SELECT COALESCE(SUM(oi."qty" * oi."price"), 0) AS total
        FROM "OrderItem" oi
        INNER JOIN "Product" p ON p."id" = oi."productId"
        INNER JOIN "Order" o ON o."id" = oi."orderId"
        WHERE p."sellerId" = ${sellerId}
          AND o."status" <> 'cancelled'
      `,
      prisma.$queryRaw<Array<{ productId: string; sales: unknown; revenue: unknown }>>`
        SELECT
          oi."productId" AS "productId",
          COALESCE(SUM(oi."qty"), 0) AS sales,
          COALESCE(SUM(oi."qty" * oi."price"), 0) AS revenue
        FROM "OrderItem" oi
        INNER JOIN "Product" p ON p."id" = oi."productId"
        INNER JOIN "Order" o ON o."id" = oi."orderId"
        WHERE p."sellerId" = ${sellerId}
          AND o."status" <> 'cancelled'
        GROUP BY oi."productId"
        ORDER BY revenue DESC, sales DESC
        LIMIT 5
      `,
      prisma.$queryRaw<Array<{ total: unknown }>>`
        SELECT COALESCE(SUM(oi."qty" * oi."price"), 0) AS total
        FROM "OrderItem" oi
        INNER JOIN "Product" p ON p."id" = oi."productId"
        INNER JOIN "Order" o ON o."id" = oi."orderId"
        WHERE p."sellerId" = ${sellerId}
          AND o."status" <> 'cancelled'
          AND o."createdAt" >= ${thirtyDaysAgo}
      `,
      prisma.$queryRaw<Array<{ total: unknown }>>`
        SELECT COALESCE(SUM(oi."qty" * oi."price"), 0) AS total
        FROM "OrderItem" oi
        INNER JOIN "Product" p ON p."id" = oi."productId"
        INNER JOIN "Order" o ON o."id" = oi."orderId"
        WHERE p."sellerId" = ${sellerId}
          AND o."status" <> 'cancelled'
          AND o."createdAt" >= ${sixtyDaysAgo}
          AND o."createdAt" < ${thirtyDaysAgo}
      `,
    ]);

  const productIds = productSales.map((row) => row.productId);
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { sellerId, id: { in: productIds } },
        select: { id: true, name: true, image: true },
      })
    : [];

  const productById = new Map(products.map((product) => [product.id, product]));
  const topProductRows = productSales
    .map((row) => {
      const product = productById.get(row.productId);
      if (!product) return null;
      return {
        id: product.id,
        name: product.name,
        image: product.image,
        sales: Number(row.sales ?? 0),
        revenue: Number(row.revenue ?? 0),
      };
    })
    .filter((product): product is NonNullable<typeof product> => product !== null);

  const [liveProducts, lowStockCount, outOfStockCount, pendingOrders, deliveredOrders, cancelledOrders, activeShipments, deliveredShipments, last30Orders, revenueOrderCount30d] =
    await Promise.all([
      prisma.product.count({ where: { sellerId, productStatus: 'published' } }),
      prisma.product.count({ where: { sellerId, stock: { lte: LOW_STOCK_THRESHOLD } } }),
      prisma.product.count({ where: { sellerId, stock: { lte: 0 } } }),
      prisma.order.count({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          items: { some: { product: { sellerId } } },
          status: { in: ['pending', 'processing', 'packed', 'ready_for_pickup', 'pickup_requested'] },
        },
      }),
      prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo }, items: { some: { product: { sellerId } } }, status: 'delivered' } }),
      prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo }, items: { some: { product: { sellerId } } }, status: 'cancelled' } }),
      prisma.orderShipment.count({ where: { sellerId, status: { in: ACTIVE_SHIPMENT_STATUSES } } }),
      prisma.orderShipment.count({ where: { sellerId, status: 'delivered' } }),
      prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo }, status: { not: 'cancelled' }, items: { some: { product: { sellerId } } } } }),
    ]);

  const revenue30d = Number(periodRevenue[0]?.total ?? 0);
  const revenuePrev30d = Number(previousPeriodRevenue[0]?.total ?? 0);
  const resolved30dOrders = last30Orders;
  const settled30dOrders = deliveredOrders + cancelledOrders;

  return NextResponse.json({
    totalProducts,
    totalOrders,
    totalEarnings: Number(revenueAggregate[0]?.total ?? 0),
    topProducts: topProductRows,
    liveProducts,
    lowStockCount,
    outOfStockCount,
    pendingOrders,
    deliveredOrders30d: deliveredOrders,
    cancelledOrders30d: cancelledOrders,
    activeShipments,
    deliveredShipments,
    settledOrders30d: settled30dOrders,
    resolvedOrders30d: resolved30dOrders,
    resolutionRate30d: resolved30dOrders > 0 ? Math.round((settled30dOrders / resolved30dOrders) * 1000) / 10 : null,
    revenue30d,
    revenuePrev30d,
    revenueTrendPct: revenuePrev30d > 0 ? Math.round(((revenue30d - revenuePrev30d) / revenuePrev30d) * 1000) / 10 : null,
    averageOrderValue30d: revenueOrderCount30d > 0 ? Math.round((revenue30d / revenueOrderCount30d) * 100) / 100 : 0,
  });
}