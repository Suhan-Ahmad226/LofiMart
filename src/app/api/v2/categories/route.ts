import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { raceWithTimeout } from '../../_utils/route-timeout';

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
      return NextResponse.json(
        { success: false, error: 'Categories are temporarily unavailable', data: [] },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json({
      success: true,
      data: categories,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('GET /api/v2/categories error:', error);
    return NextResponse.json(
      { success: false, error: 'Categories are temporarily unavailable', data: [] },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
