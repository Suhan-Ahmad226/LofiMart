import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';

async function getAuthUser(request: NextRequest) {
  // TODO: Implement your auth logic
  return null;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthUser(request);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const review = await prisma.review.findUnique({
      where: { id },
    });

    if (!review || review.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Review not found' },
        { status: 404 }
      );
    }

    await prisma.review.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Review deleted' });
  } catch (error) {
    console.error('DELETE /api/v2/reviews/[id] error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete review' },
      { status: 500 }
    );
  }
}
