import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { z } from 'zod';
import { requireUser } from '@/src/server/next/requireUser';

const CreateReviewSchema = z.object({
  productId: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().min(10).max(1000),
});

async function getAuthUser(request: NextRequest) {
  const user = await requireUser(request);
  return user instanceof NextResponse ? null : user;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const productId = searchParams.get('productId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const skip = (page - 1) * limit;

    const where = productId ? { productId } : {};

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      prisma.review.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: reviews,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('GET /api/v2/reviews error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reviews' },
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

    const body = await request.json();
    const { productId, rating, comment } = CreateReviewSchema.parse(body);

    // Check if user purchased this product
    const purchase = await prisma.orderItem.findFirst({
      where: {
        productId,
        order: { userId: String(user.id), status: 'delivered' },
      },
    });

    if (!purchase) {
      return NextResponse.json(
        { success: false, error: 'You can only review products you purchased' },
        { status: 403 }
      );
    }

    // Check if user already reviewed this product
    const existingReview = await prisma.review.findFirst({
      where: { productId, userId: String(user.id) },
    });

    if (existingReview) {
      return NextResponse.json(
        { success: false, error: 'You already reviewed this product' },
        { status: 400 }
      );
    }

    const review = await prisma.review.create({
      data: {
        productId,
        userId: String(user.id),
        rating,
        comment,
      },
      include: {
        user: { select: { name: true, avatarUrl: true } },
      },
    });

    // Update product rating
    const avgRating = await prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: true,
    });

    await prisma.product.update({
      where: { id: productId },
      data: {
        rating: avgRating._avg.rating || 0,
        reviewsCount: avgRating._count,
      },
    });

    return NextResponse.json(
      { success: true, data: review },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }
    console.error('POST /api/v2/reviews error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create review' },
      { status: 500 }
    );
  }
}
