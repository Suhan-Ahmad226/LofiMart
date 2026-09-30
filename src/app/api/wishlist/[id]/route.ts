import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireUser } from '@/server/next/requireUser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  const { id: productId } = await params;

  const wishlistItem = await prisma.wishlistItem.findFirst({
    where: {
      userId: String(user.id),
      productId,
    },
  });

  if (!wishlistItem) {
    return NextResponse.json({ error: 'Wishlist item not found' }, { status: 404 });
  }

  await prisma.wishlistItem.delete({
    where: { id: wishlistItem.id },
  });

  return NextResponse.json({ success: true });
}
