import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    return NextResponse.json(categories);
  } catch (error) {
    console.error('GET /api/categories/tree error:', error);
    return NextResponse.json([], {
      headers: {
        'X-Data-Source': 'fallback',
      },
    });
  }
}
