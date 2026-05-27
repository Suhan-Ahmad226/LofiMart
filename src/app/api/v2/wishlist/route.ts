import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireUser } from '@/src/server/next/requireUser';

async function getAuthUser(request: NextRequest) {
  const user = await requireUser(request);
  return user instanceof NextResponse ? null : user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const wishlist = await prisma.wishlistItem.findMany({
      where: { userId: String(user.id) },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            image: true,
            rating: true,
            reviewsCount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: wishlist });
  } catch (error) {
    console.error('GET /api/v2/wishlist error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch wishlist' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { productId } = await request.json();

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Check if already in wishlist
    const existing = await prisma.wishlistItem.findFirst({
      where: { userId: String(user.id), productId },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Product already in wishlist' },
        { status: 400 }
      );
    }

    const item = await prisma.wishlistItem.create({
      data: {
        userId: String(user.id),
        productId,
      },
      include: {
        product: {
          select: { name: true, price: true, image: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: item },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v2/wishlist error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add to wishlist' },
      { status: 500 }
    );
  }
}
