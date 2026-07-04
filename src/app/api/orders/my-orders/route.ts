import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, serializeOrder } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const orders = await prisma.order.findMany({
    where: { userId: String(user.id) },
    orderBy: { createdAt: 'desc' },
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
  });

  return NextResponse.json(orders.map(serializeOrder));
}
