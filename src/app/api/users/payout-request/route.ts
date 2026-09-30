import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '@/app/api/_compat/shared';
import { isSellerApproved, getSellerApprovalBlockedMessage } from '@/lib/sellerApproval';

async function handleAuditLog(
  userId: string | null | undefined,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      userId: userId ? String(userId) : null,
      action,
      entityType,
      entityId: entityId || null,
      metadata: metadata ?? {},
    },
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['seller', 'reseller'].includes(String(user.role))) {
    return NextResponse.json(
      { error: 'Only seller and reseller accounts can request payouts' },
      { status: 403 },
    );
  }

  if (String(user.role) === 'seller') {
    const seller = await prisma.user.findUnique({
      where: { id: String(user.id) },
      select: { sellerStatus: true },
    });
    if (!isSellerApproved(seller?.sellerStatus)) {
      return NextResponse.json(
        { error: getSellerApprovalBlockedMessage('payout_withdrawal', seller?.sellerStatus) },
        { status: 403 },
      );
    }
  }

  const body = await request.json().catch(() => ({}));
  const amount = Number(body?.amount);
  const payoutMethodId = typeof body?.payout_method_id === 'string' ? body.payout_method_id : null;
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'A valid payout amount is required' }, { status: 400 });
  }

  let payoutMethod = null;
  if (payoutMethodId) {
    payoutMethod = await prisma.payoutMethod.findFirst({
      where: { id: payoutMethodId, userId: String(user.id) },
    });
    if (!payoutMethod) {
      return NextResponse.json({ error: 'Payout method not found' }, { status: 404 });
    }
  }

  const transaction = await prisma.payoutTransaction.create({
    data: {
      userId: String(user.id),
      payoutMethodId: payoutMethod?.id ?? null,
      type: 'payout_request',
      amount,
      currency: 'BDT',
      status: 'pending',
      notes,
    },
  });

  await handleAuditLog(String(user.id), 'payout.requested', 'payout_transaction', transaction.id, { amount });
  return NextResponse.json({ success: true, transaction });
}
