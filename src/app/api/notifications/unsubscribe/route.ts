import { NextRequest, NextResponse } from 'next/server';
import { prismaDirect } from '@/src/services/database/prisma';
import { requireApiUser } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  if (body.endpoint) {
    await prismaDirect.pushSubscription.deleteMany({
      where: {
        endpoint: String(body.endpoint),
        userId: String(user.id),
      },
    });
  }

  return NextResponse.json({ success: true });
}
