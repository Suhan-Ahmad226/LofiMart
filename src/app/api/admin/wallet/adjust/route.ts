import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireAdminRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { walletAdjustmentSchema } from '@/modules/profile/validation';
import { createNotification } from '@/features/shared/services/notifications/notificationService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const body = await request.json().catch(() => ({})) || {};
  const parsed = walletAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid wallet adjustment' }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: parsed.data.user_id },
    select: { tenantId: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await createNotification({
    userId: parsed.data.user_id,
    tenantId: targetUser.tenantId ?? null,
    type: 'reward',
    title: parsed.data.type === 'debit' ? 'Wallet adjustment applied' : 'Wallet credit added',
    message:
      parsed.data.description ||
      (parsed.data.type === 'debit'
        ? `An admin adjusted ${parsed.data.amount.toLocaleString()} BDT from your wallet balance.`
        : `${parsed.data.amount.toLocaleString()} BDT was added to your wallet balance.`),
    actionUrl: '/account/wallet',
    metadata: {
      amount: parsed.data.amount,
      adjustmentType: parsed.data.type,
      source: parsed.data.source,
    },
  });

  return NextResponse.json({ success: true });
}
