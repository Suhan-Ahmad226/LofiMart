import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser, toPlainNumber } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const safe = async <T,>(label: string, fallback: T, query: Promise<T>) => {
    try {
      return await query;
    } catch (error) {
      console.error(`GET /api/admin/stats ${label} error:`, error);
      return fallback;
    }
  };

  const [totalUsers, totalSellers, totalOrders, revenueAggregate, recentOrders] = await Promise.all([
    safe('totalUsers', 0, prisma.user.count()),
    safe('totalSellers', 0, prisma.user.count({ where: { role: 'seller' } })),
    safe('totalOrders', 0, prisma.order.count()),
    safe(
      'totalRevenue',
      { _sum: { total: null } },
      prisma.order.aggregate({
        _sum: { total: true },
        where: { status: { not: 'cancelled' } },
      }),
    ),
    safe(
      'recentOrders',
      [],
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          orderCode: true,
          total: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
    ),
  ]);

  return NextResponse.json({
    totalUsers,
    totalSellers,
    totalOrders,
    totalRevenue: toPlainNumber(revenueAggregate._sum.total ?? 0) ?? 0,
    recentOrders: recentOrders.map((order) => ({
      id: order.orderCode || order.id,
      user_name: order.user?.name || order.user?.email || 'Customer',
      customer_name: order.user?.name || order.user?.email || 'Customer',
      total: toPlainNumber(order.total) ?? 0,
      status: order.status,
      created_at: order.createdAt.toISOString(),
    })),
  });
}
