import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { toPlainNumber, serializeProduct } from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializePosOrder(order: any) {
  return {
    id: order.id,
    order_code: order.orderCode ?? null,
    user_id: order.userId,
    total: toPlainNumber(order.total),
    status: order.status,
    courier_provider: order.courierProvider ?? null,
    tracking_id: order.trackingId ?? null,
    payment_method: order.paymentMethod ?? null,
    payment_provider: order.paymentProvider ?? null,
    payment_status: order.paymentStatus ?? null,
    paid_at: order.paidAt ? new Date(order.paidAt).toISOString() : null,
    shipping_address: order.shippingAddress ?? null,
    items: Array.isArray(order.items)
      ? order.items.map((item: any) => ({
          id: item.id,
          product_id: item.productId,
          product_name: item.product?.name ?? null,
          qty: item.qty,
          price: toPlainNumber(item.price),
        }))
      : [],
    created_at: order.createdAt ? new Date(order.createdAt).toISOString() : undefined,
  };
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole([''])(user);
  if (roleError) return roleError;

  const search = typeof request.nextUrl.searchParams.get('search') === 'string' ? request.nextUrl.searchParams.get('search')!.trim() : '';
  const warehouseId = typeof request.nextUrl.searchParams.get('warehouseId') === 'string' ? request.nextUrl.searchParams.get('warehouseId')!.trim() : '';
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [warehouses, products, recentOrders, todayOrders, cashierOrders, posTodayItems] = await Promise.all([
    prisma.warehouse.findMany({
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        city: true,
      },
    }),
    prisma.product.findMany({
      where: {
        stock: { gt: 0 },
        ...(warehouseId
          ? {
              inventoryItems: {
                some: {
                  warehouseId,
                  quantity: { gt: 0 },
                },
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        seller: {
          select: {
            name: true,
          },
        },
        inventoryItems: {
          select: {
            warehouseId: true,
            quantity: true,
            warehouse: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ stock: 'desc' }, { updatedAt: 'desc' }],
      take: search ? 40 : 24,
    }),
    prisma.order.findMany({
      where: {
        paymentProvider: 'pos',
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.order.findMany({
      where: {
        paymentProvider: 'pos',
        createdAt: { gte: todayStart },
      },
      select: {
        id: true,
        total: true,
      },
    }),
    prisma.order.findMany({
      where: {
        paymentProvider: 'pos',
        createdAt: { gte: todayStart },
        shipmentMetadata: {
          path: ['cashierId'],
          equals: String(user.id),
        },
      },
      select: {
        id: true,
        total: true,
        paymentMethod: true,
      },
    }),
    prisma.orderItem.findMany({
      where: {
        order: {
          paymentProvider: 'pos',
          createdAt: { gte: todayStart },
        },
      },
      select: {
        productId: true,
        qty: true,
        price: true,
      },
    }),
  ]);

  const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(toPlainNumber(order.total) ?? 0), 0);
  const todayOrderCount = todayOrders.length;
  const cashierRevenue = cashierOrders.reduce((sum, order) => sum + Number(toPlainNumber(order.total) ?? 0), 0);
  const cashSales = cashierOrders
    .filter((order) => String(order.paymentMethod || '').toLowerCase() === 'cash')
    .reduce((sum, order) => sum + Number(toPlainNumber(order.total) ?? 0), 0);
  const cardSales = cashierOrders
    .filter((order) => String(order.paymentMethod || '').toLowerCase() !== 'cash')
    .reduce((sum, order) => sum + Number(toPlainNumber(order.total) ?? 0), 0);
  const topProductTotals = new Map<string, { quantity: number; revenue: number }>();
  for (const item of posTodayItems) {
    const existing = topProductTotals.get(item.productId) ?? { quantity: 0, revenue: 0 };
    existing.quantity += Number(item.qty);
    existing.revenue += Number(item.qty) * Number(toPlainNumber(item.price) ?? 0);
    topProductTotals.set(item.productId, existing);
  }
  const topPosProducts = [...topProductTotals.entries()]
    .map(([productId, totals]) => ({
      productId,
      quantity: totals.quantity,
      revenue: totals.revenue,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);
  const topProductIds = topPosProducts.map((row) => row.productId);
  const topProductRows = topProductIds.length
    ? await prisma.product.findMany({
        where: { id: { in: topProductIds } },
        select: {
          id: true,
          name: true,
        },
      })
    : [];
  const topProductMap = new Map(topProductRows.map((product) => [product.id, product.name]));

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    summary: {
      today_sales: Number(todayRevenue.toFixed(2)),
      today_orders: todayOrderCount,
      average_ticket: todayOrderCount > 0 ? Number((todayRevenue / todayOrderCount).toFixed(2)) : 0,
    },
    shift_summary: {
      cashier_sales: Number(cashierRevenue.toFixed(2)),
      cashier_orders: cashierOrders.length,
      cash_sales: Number(cashSales.toFixed(2)),
      non_cash_sales: Number(cardSales.toFixed(2)),
    },
    close_summary: {
      generated_at: new Date().toISOString(),
      cashier_name: user.name ?? 'Admin Cashier',
      total_sales: Number(todayRevenue.toFixed(2)),
      total_orders: todayOrderCount,
      cash_sales: Number(cashSales.toFixed(2)),
      non_cash_sales: Number(cardSales.toFixed(2)),
      top_items: topPosProducts.map((item) => ({
        product_id: item.productId,
        product_name: topProductMap.get(item.productId) ?? item.productId,
        quantity: Number(item.quantity),
        revenue_estimate: Number(item.revenue.toFixed(2)),
      })),
    },
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      city: warehouse.city,
    })),
    products: products.map((product) => ({
      ...serializeProduct(product),
      warehouse_stock: product.inventoryItems.map((entry) => ({
        warehouse_id: entry.warehouseId,
        warehouse_name: entry.warehouse?.name ?? 'Warehouse',
        quantity: Number(entry.quantity),
      })),
    })),
    recentOrders: recentOrders.map(serializePosOrder),
  });
}
