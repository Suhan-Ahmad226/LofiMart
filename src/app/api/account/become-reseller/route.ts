import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '@/app/api/_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const updated = await prisma.user.update({
      where: { id: String(user.id) },
      data: {
        role: 'reseller',
        sellerStatus: 'approved',
      },
      select: { id: true, role: true, sellerStatus: true },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    console.error('[account:become-reseller]', error);
    return NextResponse.json({ error: 'Unable to start reseller onboarding.' }, { status: 500 });
  }
}
