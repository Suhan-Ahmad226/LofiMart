import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { createNotification } from '@/features/shared/services/notifications/notificationService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleAuditLog(userId: string | null | undefined, action: string, entityType: string, entityId?: string | null, metadata?: Record<string, unknown>) {
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

  const transaction = await prisma.payoutTransaction.update({
    where: { id },
    data: {
      status,
      notes: notes || undefined,
      processedAt: new Date(),
    },
    include: {
      user: {
        select: {
          id: true,
          tenantId: true,
          role: true,
        },
      },
    },
  });

  await createNotification({
    userId: transaction.user.id,
    tenantId: transaction.user.tenantId ?? null,
    type: 'payout',
    title: status === 'approved' ? 'Payout request approved' : status === 'rejected' ? 'Payout request rejected' : 'Payout sent',
    message:
      status === 'approved'
        ? 'Your payout request has been approved and is queued for processing.'
        : status === 'rejected'
          ? notes || 'Your payout request could not be approved.'
          : 'Your payout has been marked as paid.',
    actionUrl: `/settings/${transaction.user.role}/payout`,
    metadata: {
      payoutTransactionId: transaction.id,
      status,
    },
  });

  await handleAuditLog(String(user.id), 'admin.payout.reviewed', 'payout_transaction', transaction.id, { status });
  return NextResponse.json({ success: true, transaction: serializePayoutTransaction(transaction) });
}
