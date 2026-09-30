import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, serializeReview } from '../../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const reviews = await prisma.review.findMany({
      where: { productId: id },
      include: {
        user: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(reviews.map(serializeReview), {
      headers: {
        'Cache-Control': 'public, max-age=120, s-maxage=600, stale-while-revalidate=1800',
      },
    });
  } catch (error) {
    console.error('GET /api/products/[id]/reviews error:', error);
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;
    const body = await request.json();
    const rating = Number(body.rating);

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Valid rating is required' }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const purchased = await prisma.orderItem.findFirst({
      where: {
        productId: id,
        order: {
          userId: String(user.id),
          status: { not: 'cancelled' },
        },
      },
      select: { id: true },
    });
    if (!purchased) {
      return NextResponse.json(
        { error: 'You can review a product only after purchasing it.' },
        { status: 403 },
      );
    }

    const existingReview = await prisma.review.findFirst({
      where: { productId: id, userId: String(user.id) },
      select: { id: true },
    });
    if (existingReview) {
      return NextResponse.json(
        { error: 'You have already reviewed this product.' },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          productId: id,
          userId: String(user.id),
          rating,
          comment: body.comment ? String(body.comment).trim().slice(0, 2000) : null,
        },
      });

      const stats = await tx.review.aggregate({
        where: { productId: id },
        _avg: { rating: true },
        _count: { _all: true },
      });

      await tx.product.update({
        where: { id },
        data: {
          rating: stats._avg.rating ?? 0,
          reviewsCount: stats._count._all,
        },
      });
    }, { isolationLevel: 'Serializable' });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/products/[id]/reviews error:', error);
    return NextResponse.json({ error: 'Failed to post review' }, { status: 500 });
  }
}
