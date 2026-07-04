import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireUser } from '@/src/server/next/requireUser';

async function getAuthUser(request: NextRequest) {
  const user = await requireUser(request);
  return user instanceof NextResponse ? null : user;
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

    const item = await prisma.wishlistItem.findUnique({
      where: { id },
    });

    if (!item || item.userId !== String(user.id)) {
      return NextResponse.json(
        { success: false, error: 'Item not found' },
        { status: 404 }
      );
    }

    await prisma.wishlistItem.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    console.error('DELETE /api/v2/wishlist/[id] error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove item' },
      { status: 500 }
    );
  }
}
