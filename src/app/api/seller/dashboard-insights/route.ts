import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { buildHourlySeriesFromOrders, requireApiUser, requireSellerRole, toPlainNumber } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 5);

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [recentOrders, products, shipments] = await Promise.all([
    prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        items: {
          some: { product: { sellerId } },
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          where: { product: { sellerId } },
        },
      },
      take: 12,
    }),
    prisma.product.findMany({
      where: { sellerId },
      orderBy: { stock: 'asc' },
      take: 30,
      select: {
        id: true,
        name: true,
        stock: true,
        inventoryItems: {
          select: {
            warehouseId: true,
            quantity: true,
            warehouse: { select: { name: true } },
          },
          orderBy: [{ quantity: 'desc' }],
        },
      },
    }),
    prisma.orderShipment.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        order: { select: { createdAt: true } },
      },
    }),
  ]);

  const lowStockProducts = products.filter((product) => Number(product.stock) <= LOW_STOCK_THRESHOLD).slice(0, 5);

  return NextResponse.json({
    salesSeries: buildHourlySeriesFromOrders(
      recentOrders.map((order) => ({
        createdAt: order.createdAt,
        total: order.items.reduce((sum, item) => sum + Number(item.price) * item.qty, 0),
      })),
      7,
    ),
    lowStockProducts: lowStockProducts.map((product) => ({
      id: product.id,
      name: product.name,
      stock: product.stock,
      warehouse_name:
        product.inventoryItems.find((item) => Number(item.quantity) > 0)?.warehouse?.name ??
        product.inventoryItems[0]?.warehouse?.name ??
        null,
      warehouse_id:
        product.inventoryItems.find((item) => Number(item.quantity) > 0)?.warehouseId ??
        product.inventoryItems[0]?.warehouseId ??
        null,
    })),
    recentShipments: shipments.map((shipment) => ({
      id: shipment.id,
      order_id: shipment.orderId,
      created_at: shipment.order.createdAt.toISOString(),
      total: toPlainNumber(shipment.total),
      status: shipment.status,
    })),
    activeShipments: shipments.filter((shipment) =>
      ['processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery'].includes(
        shipment.status,
      ),
    ).length,
    deliveredShipments: shipments.filter((shipment) => shipment.status === 'delivered').length,
  });
}
