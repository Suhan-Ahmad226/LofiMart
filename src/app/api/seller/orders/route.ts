import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole, serializeOrder } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);
  const orders = await prisma.order.findMany({
    where: {
      tenantId: user.tenantId ?? undefined,
      items: {
        some: {
          product: { sellerId, tenantId: user.tenantId ?? undefined },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      shipments: {
        where: { sellerId },
        include: {
          warehouse: {
            select: { id: true, name: true, city: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return NextResponse.json(orders.map(serializeOrder));
}
