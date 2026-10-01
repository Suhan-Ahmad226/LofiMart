import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, serializeOrder } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const rawLimit = Number(request.nextUrl.searchParams.get('limit') || 0);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 50) : null;
  const where = { userId: String(user.id) };

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(limit ? { take: limit } : {}),
      include: {
        shipments: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                city: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  if (limit) {
    return NextResponse.json({
      orders: orders.map(serializeOrder),
      totalCount,
      limit,
    });
  }

  return NextResponse.json(orders.map(serializeOrder));
}
