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

  return NextResponse.json({
    totalProducts,
    totalOrders,
    totalEarnings: Number(earningsAggregate._sum.price ?? 0),
    topProducts: topProductRows,
  });
}
