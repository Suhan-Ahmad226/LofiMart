import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getPublicPublishedProductWhere, productSellerInclude, serializeProduct } from '../products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: getPublicPublishedProductWhere(),
        include: productSellerInclude,
        orderBy: { createdAt: 'desc' },
        take: 60,
      }),
      prisma.category.findMany({
        select: {
          id: true,
          name: true,
          icon: true,
        },
        orderBy: { name: 'asc' },
      }).catch(() => []),
    ]);

    const productPayload = products.map(serializeProduct);
    const categoryPayload =
      categories.length > 0
        ? categories
        : Array.from(new Set(productPayload.map((product) => product.category).filter(Boolean))).map((name) => ({
            id: String(name).toLowerCase().replace(/\s+/g, '-'),
            name,
            icon: null,
          }));

    return NextResponse.json({
      products: productPayload,
      categories: categoryPayload,
    });
  } catch (error) {
    console.error('GET /api/shop-page error:', error);
    return NextResponse.json({ error: 'Failed to load homepage data' }, { status: 500 });
  }
}
