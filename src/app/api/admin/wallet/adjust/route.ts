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
    select: { id: true, tenantId: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const amount = Number(parsed.data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 });
  }

  const transaction = await prisma.$transaction(async (tx) => {
    const updated = parsed.data.type === 'debit'
      ? await tx.user.updateMany({ where: { id: targetUser.id, walletBalance: { gte: amount } }, data: { walletBalance: { decrement: amount } } })
      : await tx.user.updateMany({ where: { id: targetUser.id }, data: { walletBalance: { increment: amount } } });
    if (updated.count !== 1) throw new Error(parsed.data.type === 'debit' ? 'Insufficient wallet balance' : 'Wallet update failed');
    const wallet = await tx.user.findUnique({ where: { id: targetUser.id }, select: { walletBalance: true } });
    return tx.walletTransaction.create({
      data: {
        userId: targetUser.id,
        tenantId: targetUser.tenantId ?? null,
        type: parsed.data.type,
        amount, currency: 'BDT', status: 'completed',
        source: parsed.data.source || 'admin_adjustment',
        description: parsed.data.description || (parsed.data.type === 'debit' ? 'Admin wallet debit' : 'Admin wallet credit'),
        balanceAfter: wallet?.walletBalance ?? 0,
        metadata: { adjustmentType: parsed.data.type, source: parsed.data.source || 'admin_adjustment', actor: 'admin' },
      },
    });
  });

  await createNotification({
    userId: targetUser.id,
    tenantId: targetUser.tenantId ?? null,
    type: 'reward',
    title: parsed.data.type === 'debit' ? 'Wallet adjustment applied' : 'Wallet credit added',
    message: parsed.data.description || (parsed.data.type === 'debit'
      ? 'An admin adjusted ' + amount.toLocaleString() + ' BDT from your wallet balance.'
      : amount.toLocaleString() + ' BDT was added to your wallet balance.'),
    actionUrl: '/account/wallet',
    metadata: { amount, adjustmentType: parsed.data.type, source: parsed.data.source, transactionId: transaction.id },
  });

  return NextResponse.json({ success: true });
}
