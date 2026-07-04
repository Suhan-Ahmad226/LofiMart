import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { raceWithTimeout } from '../../_utils/route-timeout';

const fallbackCategories = [
  { id: 'fallback-fashion', name: 'Fashion', icon: 'shirt', createdAt: null },
  { id: 'fallback-electronics', name: 'Electronics', icon: 'smartphone', createdAt: null },
  { id: 'fallback-home-living', name: 'Home & Living', icon: 'home', createdAt: null },
  { id: 'fallback-beauty', name: 'Beauty', icon: 'sparkles', createdAt: null },
  { id: 'fallback-grocery', name: 'Grocery', icon: 'shopping-basket', createdAt: null },
];

export async function GET(request: NextRequest) {
  try {
    const { value: categories, timedOut } = await raceWithTimeout(
      prisma.category.findMany({
        select: {
          id: true,
          name: true,
          icon: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      }),
      3000,
      [],
    );

    if (timedOut) {
      console.warn('GET /api/v2/categories timed out; returning fallback categories');
    }

    return NextResponse.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('GET /api/v2/categories fallback:', error);
    return NextResponse.json({
      success: true,
      data: fallbackCategories,
      warning: 'Categories are temporarily using fallback data',
    });
  }
}
