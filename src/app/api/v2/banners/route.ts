import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';

export async function GET(request: NextRequest) {
  try {
    const banners = await prisma.banner.findMany({
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
    });

    return NextResponse.json({
      success: true,
      data: banners.map((banner) => ({
        ...banner,
        button_text: banner.buttonText,
        is_active: true,
      })),
    });
  } catch (error) {
    console.error('GET /api/v2/banners error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch banners' },
      { status: 500 }
    );
  }
}
