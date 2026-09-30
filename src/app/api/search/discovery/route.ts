import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getPublicPublishedProductWhere } from '../../products/shared';
import { raceWithTimeout } from '../../_utils/route-timeout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function uniqueStrings(values: Array<string | null | undefined>, limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const item = String(value || '').trim();
    if (!item || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    result.push(item);
    if (result.length >= limit) break;
  }

  return result;
}

export async function GET() {
  try {
    const [{ value: categories }, { value: products }] = await Promise.all([
      raceWithTimeout(
        prisma.category.findMany({
          orderBy: { name: 'asc' },
          take: 12,
          select: { id: true, name: true, icon: true },
        }),
        2500,
        [],
      ),
      raceWithTimeout(
        prisma.product.findMany({
          where: getPublicPublishedProductWhere(),
          orderBy: [{ reviewsCount: 'desc' }, { rating: 'desc' }, { createdAt: 'desc' }],
          take: 16,
          select: { name: true, category: true },
        }),
        3500,
        [],
      ),
    ]);

    const trending = uniqueStrings(
      [
        ...products.map((product) => product.category),
        ...categories.map((category) => category.name),
        ...products.map((product) => product.name),
      ],
      8,
    );

    return NextResponse.json({
      trending,
      categories,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('GET /api/search/discovery error:', error);
    return NextResponse.json({
      trending: ['Fashion', 'Electronics', 'Home Decor', 'Beauty'],
      categories: [],
    }, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
      },
    });
  }
}
