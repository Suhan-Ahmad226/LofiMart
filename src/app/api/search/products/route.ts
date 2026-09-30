import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getPublicPublishedProductWhere, productSellerInclude, serializeProduct } from '../../products/shared';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || searchParams.get('search') || '').trim();
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 48, 1), 100);

    const where = getPublicPublishedProductWhere(
      query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' as const } },
              { description: { contains: query, mode: 'insensitive' as const } },
              { category: { contains: query, mode: 'insensitive' as const } },
              { sku: { contains: query, mode: 'insensitive' as const } },
            ],
          }
        : {},
    );

    const products = await prisma.product.findMany({
      where,
      include: productSellerInclude,
      orderBy: [{ rating: 'desc' }, { reviewsCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return NextResponse.json(
      products.map(serializeProduct),
      {
        headers: {
          'Cache-Control': 'public, max-age=120, s-maxage=600, stale-while-revalidate=1800',
        },
      },
    );
  } catch (error) {
    console.error('GET /api/search/products error:', error);
    return NextResponse.json([], {
      headers: {
        'X-Data-Source': 'fallback',
        'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
      },
    });
  }
}
