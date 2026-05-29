import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, serializeNotification } from '../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const notifications = await prisma.userNotification.findMany({
    where: { userId: String(user.id) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(notifications.map(serializeNotification));
}
