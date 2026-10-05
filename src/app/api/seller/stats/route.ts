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

  // Keep the stats endpoint bounded: loading every historical OrderItem and nested
  // relations was unnecessarily expensive and could exhaust/timeout the DB connection.
  const [totalProducts, totalOrders, earningsAggregate, productSales] = await Promise.all([
    prisma.product.count({ where: { sellerId } }),
    prisma.order.count({
      where: {
        items: { some: { product: { sellerId } } },
      },
    }),
    prisma.orderItem.aggregate({
      where: { product: { sellerId } },
      _sum: { qty: true, price: true },
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { product: { sellerId } },
      _sum: { qty: true, price: true },
      orderBy: { _sum: { qty: 'desc' } },
      take: 5,
    }),
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
        sales: Number(row._sum.qty ?? 0),
        revenue: Number(row._sum.price ?? 0),
      };
    })
    .filter((product): product is NonNullable<typeof product> => product !== null);

  // ---------------------------------------------------------------------------
  // Additive dashboard KPIs.
  //
  // Everything below is an addition to the original four fields, so existing
  // consumers of this endpoint keep working unchanged. All of it is served by
  // indexes that already exist on Product.sellerId, OrderShipment(sellerId,
  // status, createdAt) and OrderItem.productId, and the whole block runs as a
  // single round of parallel counts rather than extra row scans.
  // ---------------------------------------------------------------------------
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const [
    liveProducts,
    lowStockCount,
    outOfStockCount,
    pendingOrders,
    deliveredOrders,
    cancelledOrders,
    activeShipments,
    deliveredShipments,
    last30Revenue,
    previous30Revenue,
    last30Orders,
  ] = await Promise.all([
    prisma.product.count({ where: { sellerId, productStatus: 'published' } }),
    prisma.product.count({ where: { sellerId, stock: { lte: LOW_STOCK_THRESHOLD } } }),
    prisma.product.count({ where: { sellerId, stock: { lte: 0 } } }),
    prisma.order.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        items: { some: { product: { sellerId } } },
        status: { in: ['pending', 'processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up'] },
      },
    }),
    prisma.order.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        items: { some: { product: { sellerId } } },
        status: 'delivered',
      },
    }),
    prisma.order.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        items: { some: { product: { sellerId } } },
        status: 'cancelled',
      },
    }),
    prisma.orderShipment.count({
      where: { sellerId, status: { in: ACTIVE_SHIPMENT_STATUSES } },
    }),
    prisma.orderShipment.count({ where: { sellerId, status: 'delivered' } }),
    prisma.orderItem.aggregate({
      where: { product: { sellerId }, order: { createdAt: { gte: thirtyDaysAgo } } },
      _sum: { price: true },
    }),
    prisma.orderItem.aggregate({
      where: {
        product: { sellerId },
        order: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      },
      _sum: { price: true },
    }),
    prisma.order.count({
      where: { createdAt: { gte: thirtyDaysAgo }, items: { some: { product: { sellerId } } } },
    }),
  ]);

  const revenue30d = Number(last30Revenue._sum.price ?? 0);
  const revenuePrev30d = Number(previous30Revenue._sum.price ?? 0);
  const resolved30dOrders = last30Orders;
  const settled30dOrders = deliveredOrders + cancelledOrders;

  return NextResponse.json({
    // --- Original contract (unchanged) ---
    totalProducts,
    totalOrders,
    totalEarnings: Number(earningsAggregate._sum.price ?? 0),
    topProducts: topProductRows,

    // --- Additive dashboard KPIs ---
    liveProducts,
    lowStockCount,
    outOfStockCount,
    pendingOrders,
    // Order-level and shipment-level delivery counts are reported separately:
    // they are different populations (a single order can carry several
    // shipments) and merging them would double count.
    deliveredOrders30d: deliveredOrders,
    cancelledOrders30d: cancelledOrders,
    activeShipments,
    deliveredShipments,
    settledOrders30d: settled30dOrders,
    resolvedOrders30d: resolved30dOrders,
    // Percentage of the last 30 days' orders that reached a terminal state.
    // Null rather than 0 when there is no order history to divide by.
    resolutionRate30d: resolved30dOrders > 0
      ? Math.round((settled30dOrders / resolved30dOrders) * 1000) / 10
      : null,
    revenue30d,
    revenuePrev30d,
    // Null when there is no prior period to compare against, so the UI can show
    // "new" instead of an invented +100%.
    revenueTrendPct: revenuePrev30d > 0
      ? Math.round(((revenue30d - revenuePrev30d) / revenuePrev30d) * 1000) / 10
      : null,
    averageOrderValue30d: resolved30dOrders > 0
      ? Math.round((revenue30d / resolved30dOrders) * 100) / 100
      : 0,
  });
}
