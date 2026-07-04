import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '../_compat/shared';
import { serializeProduct } from '../products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const items = await prisma.wishlistItem.findMany({
    where: { userId: String(user.id) },
    include: { product: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(items.map((item) => serializeProduct(item.product)));
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const productId = String(body.productId || '');

  if (!productId) {
    return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
  }

  await prisma.wishlistItem.upsert({
    where: {
      userId_productId: {
        userId: String(user.id),
        productId,
      },
    },
    update: {},
    create: {
      userId: String(user.id),
      productId,
    },
  });

  return NextResponse.json({ success: true });
}
