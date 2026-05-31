import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getPublicPublishedProductWhere } from '../../products/shared';

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
    const [categories, products] = await Promise.all([
      prisma.category.findMany({
        orderBy: { name: 'asc' },
        take: 12,
        select: { id: true, name: true, icon: true },
      }),
      prisma.product.findMany({
        where: getPublicPublishedProductWhere(),
        orderBy: [{ reviewsCount: 'desc' }, { rating: 'desc' }, { createdAt: 'desc' }],
        take: 16,
        select: { name: true, category: true },
      }),
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
    });
  } catch (error) {
    console.error('GET /api/search/discovery error:', error);
    return NextResponse.json({
      trending: ['Fashion', 'Electronics', 'Home Decor', 'Beauty'],
      categories: [],
    });
  }
}
