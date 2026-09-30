import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '../_compat/shared';
import { serializeProduct } from '../products/shared';
import { buildPrismaPagination } from '@/server/middleware/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const searchParams = request.nextUrl.searchParams;
  const wantsPagination =
    searchParams.has('page') ||
    searchParams.has('pageSize') ||
    searchParams.has('limit') ||
    searchParams.has('offset');

  const where = { userId: String(user.id) };

  if (!wantsPagination) {
    const items = await prisma.wishlistItem.findMany({
      where,
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(items.map((item) => serializeProduct(item.product)));
  }

  const { skip, take, meta } = buildPrismaPagination(request as any, {
    defaultLimit: 8,
    maxLimit: 100,
  });

  const [wishlistItems, total] = await Promise.all([
    prisma.wishlistItem.findMany({
      where,
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.wishlistItem.count({ where }),
  ]);

  return NextResponse.json({
    items: wishlistItems.map((item) => serializeProduct(item.product)),
    pagination: {
      page: meta.page,
      limit: meta.limit,
      total,
      hasMore: skip + wishlistItems.length < total,
    },
  });
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
