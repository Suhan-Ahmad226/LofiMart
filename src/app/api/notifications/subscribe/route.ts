import { NextRequest, NextResponse } from 'next/server';
import { prismaDirect } from '@/src/services/database/prisma';
import { requireApiUser } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const subscription = await request.json().catch(() => null);
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  await prismaDirect.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: {
      userId: String(user.id),
      data: subscription,
    },
    create: {
      userId: String(user.id),
      endpoint: subscription.endpoint,
      data: subscription,
    },
  });

  return NextResponse.json({ success: true });
}
