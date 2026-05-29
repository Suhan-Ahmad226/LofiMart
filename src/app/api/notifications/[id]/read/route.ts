import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const updated = await prisma.userNotification.updateMany({
    where: {
      id,
      userId: String(user.id),
    },
    data: {
      readAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, updated: updated.count });
}
