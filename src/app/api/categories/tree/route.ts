import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        icon: true,
        subcategories: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            icon: true,
            subsubcategories: {
              orderBy: { name: 'asc' },
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(categories, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('GET /api/categories/tree error:', error);
    return NextResponse.json([], {
      headers: {
        'X-Data-Source': 'fallback',
        'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
      },
    });
  }
}
