import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ productId: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { productId } = await params;
  await prisma.wishlistItem.deleteMany({
    where: {
      userId: String(user.id),
      productId,
    },
  });

  return NextResponse.json({ success: true });
}
