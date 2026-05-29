import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);
  const [totalProducts, totalOrders, orderItems, topProducts] = await Promise.all([
    prisma.product.count({ where: { sellerId } }),
    prisma.order.count({
      where: {
        items: { some: { product: { sellerId } } },
      },
    }),
    prisma.orderItem.findMany({
      where: { product: { sellerId } },
      select: { qty: true, price: true },
    }),
    prisma.product.findMany({
      where: { sellerId },
      include: {
        orderItems: { select: { qty: true, price: true } },
      },
      take: 20,
    }),
  ]);

  const topProductRows = topProducts
    .map((product) => ({
      id: product.id,
      name: product.name,
      image: product.image,
      sales: product.orderItems.reduce((sum, item) => sum + item.qty, 0),
      revenue: product.orderItems.reduce((sum, item) => sum + Number(item.price) * item.qty, 0),
    }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  return NextResponse.json({
    totalProducts,
    totalOrders,
    totalEarnings: orderItems.reduce((sum, item) => sum + Number(item.price) * item.qty, 0),
    topProducts: topProductRows,
  });
}
