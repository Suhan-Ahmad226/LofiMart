import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { serializeProduct } from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const sellerId = String(user.id);
  const inventory = await prisma.product.findMany({
    where: user.role === 'admin' ? undefined : { sellerId },
    include: {
      orderItems: {
        select: { qty: true },
      },
      seller: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(inventory.map((product) => ({
    ...serializeProduct(product),
    ordered_qty: product.orderItems.reduce((sum, item) => sum + item.qty, 0),
    available: product.stock,
  })));
}
