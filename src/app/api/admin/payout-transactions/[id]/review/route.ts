import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { createNotification } from '@/features/shared/services/notifications/notificationService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleAuditLog(userId: string | null | undefined, action: string, entityType: string, entityId?: string | null, metadata?: Record<string, unknown>) {
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

function serializePayoutTransaction(transaction: any) {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    source: transaction.source,
    description: transaction.description,
    balance_after: transaction.balanceAfter ?? 0,
    metadata: transaction.metadata ?? null,
    created_at: transaction.createdAt ? new Date(transaction.createdAt).toISOString() : undefined,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const roleError = requireRole(['admin'])(user);
  if (roleError) return roleError;

  const body = await request.json().catch(() => ({})) || {};
  const status = ['approved', 'rejected', 'paid'].includes(String(body?.status))
    ? String(body.status)
    : null;

  if (!status) {
    return NextResponse.json({ error: 'A valid payout review status is required' }, { status: 400 });
  }

  const notes = typeof body?.notes === 'string' ? body.notes.trim() : null;

  const transaction = await prisma.payoutTransaction.findUnique({
    where: { id },
    include: { user: { select: { id: true, tenantId: true, role: true } } },
  });
  if (!transaction) {
    return NextResponse.json({ error: 'Payout transaction not found' }, { status: 404 });
  }

  const currentStatus = String(transaction.status);
  const allowedTransitions: Record<string, string[]> = {
    pending: ['approved', 'rejected'],
    approved: ['paid', 'rejected'],
    processing: ['paid', 'rejected'],
  };
  if (!allowedTransitions[currentStatus]?.includes(status)) {
    return NextResponse.json(
      { error: `Cannot change payout from ${currentStatus} to ${status}` },
      { status: 409 },
    );
  }

  const updated = await prisma.payoutTransaction.updateMany({
    where: { id, status: currentStatus },
    data: {
      status,
      notes: notes || undefined,
      processedAt: status === 'paid' || status === 'rejected' ? new Date() : null,
    },
  });
  if (updated.count !== 1) {
    return NextResponse.json({ error: 'Payout changed by another request. Please refresh.' }, { status: 409 });
  }

  const transactionAfter = await prisma.payoutTransaction.findUnique({
    where: { id },
    include: { user: { select: { id: true, tenantId: true, role: true } } },
  });
  if (!transactionAfter) return NextResponse.json({ error: 'Payout transaction not found' }, { status: 404 });

  await createNotification({
    userId: transactionAfter.user.id,
    tenantId: transactionAfter.user.tenantId ?? null,
    type: 'payout',
    title: status === 'approved' ? 'Payout request approved' : status === 'rejected' ? 'Payout request rejected' : 'Payout sent',
    message:
      status === 'approved'
        ? 'Your payout request has been approved and is queued for processing.'
        : status === 'rejected'
          ? notes || 'Your payout request could not be approved.'
          : 'Your payout has been marked as paid.',
    actionUrl: `/settings/${transactionAfter.user.role}/payout`,
    metadata: {
      payoutTransactionId: transactionAfter.id,
      status,
    },
  });

  await handleAuditLog(String(user.id), 'admin.payout.reviewed', 'payout_transaction', transactionAfter.id, {
    previousStatus: currentStatus,
    status,
    tenantId: transactionAfter.user.tenantId ?? null,
  });
  return NextResponse.json({ success: true, transaction: serializePayoutTransaction(transactionAfter) });
}
