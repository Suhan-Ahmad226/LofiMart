import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { raceWithTimeout } from '../../_utils/route-timeout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { value: banners, timedOut } = await raceWithTimeout(
      prisma.banner.findMany({
        where: {
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          subtitle: true,
          image: true,
          link: true,
          buttonText: true,
        },
      }),
      3000,
      [],
    );

    if (timedOut) {
      return NextResponse.json(
        { success: false, error: 'Banners are temporarily unavailable', data: [] },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json({
      success: true,
      data: (banners ?? []).map((banner) => ({
        ...banner,
        button_text: banner.buttonText,
        is_active: true,
      })),
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('GET /api/v2/banners error:', error);
    return NextResponse.json(
      { success: false, error: 'Banners are temporarily unavailable', data: [] },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
