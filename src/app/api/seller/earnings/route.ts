import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole, toPlainNumber } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);
  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || '30d';

  const now = new Date();
  let startDate: Date;
  switch (range) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  const [orderItems, products] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        product: { sellerId, tenantId: user.tenantId ?? undefined },
        order: {
          createdAt: { gte: startDate, lt: now },
          status: 'delivered',
        },
      },
      include: {
        product: { select: { id: true, name: true } },
        order: { select: { createdAt: true, paymentStatus: true } },
      },
    }),
    prisma.product.count({ where: { sellerId, tenantId: user.tenantId ?? undefined } }),
  ]);

  const totalEarnings = orderItems.reduce(
    (sum, item) => sum + Number(item.price) * item.qty,
    0,
  );

  const totalUnits = orderItems.reduce((sum, item) => sum + item.qty, 0);

  const productMap = new Map<string, { id: string; name: string; units: number; revenue: number }>();
  for (const item of orderItems) {
    const key = item.product.id;
    const existing = productMap.get(key) ?? {
      id: item.product.id,
      name: item.product.name,
      units: 0,
      revenue: 0,
    };
    existing.units += item.qty;
    existing.revenue += Number(item.price) * item.qty;
    productMap.set(key, existing);
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({ id: p.id, name: p.name, units: p.units, revenue: p.revenue }));

  const seriesMap = new Map<string, number>();
  for (const item of orderItems) {
    const dayKey = item.order.createdAt.toISOString().slice(0, 10);
    seriesMap.set(dayKey, (seriesMap.get(dayKey) ?? 0) + Number(item.price) * item.qty);
  }
  const series = [...seriesMap.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    total_earnings: totalEarnings,
    total_units: totalUnits,
    total_products: products,
    range,
    series,
    top_products: topProducts,
  });
}
