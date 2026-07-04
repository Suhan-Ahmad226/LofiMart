import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { raceWithTimeout } from '../../_utils/route-timeout';

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
      console.warn('GET /api/v2/banners timed out; returning fallback banner payload');
    }

    return NextResponse.json({
      success: true,
      data: (banners ?? []).map((banner) => ({
        ...banner,
        button_text: banner.buttonText,
        is_active: true,
      })),
    });
  } catch (error) {
    console.error('GET /api/v2/banners fallback:', error);
    return NextResponse.json({
      success: true,
      data: [],
      warning: 'Banners are temporarily unavailable',
    });
  }
}
