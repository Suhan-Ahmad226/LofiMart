import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const { id } = await params;
  const result = await prisma.socialAccount.updateMany({
    where: { id, sellerId: String(user.id), platform: 'facebook' },
    data: {
      status: 'DISCONNECTED',
      encryptedAccessToken: null,
      tokenExpiresAt: null,
      updatedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: 'Facebook Page not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
