import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getPublicPublishedProductWhere } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    if (q.length < 2) return NextResponse.json([]);

    const suggestions = await prisma.product.findMany({
      where: getPublicPublishedProductWhere({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      }),
      select: {
        id: true,
        name: true,
        category: true,
        slug: true,
      },
      take: 8,
    });

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error('GET /api/products/suggestions error:', error);
    return NextResponse.json([], { status: 200 });
  }
}
