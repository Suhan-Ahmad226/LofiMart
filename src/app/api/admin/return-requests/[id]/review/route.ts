import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { createNotification } from '@/features/shared/services/notifications/notificationService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeAccountActionRequest(request: any) {
  return {
    id: request.id,
    user_id: request.userId,
    order_id: request.orderId ?? null,
    type: request.type,
    status: request.status,
    reason: request.reason ?? null,
    resolution_note: request.resolutionNote ?? null,
    processed_by_id: request.processedById ?? null,
    processed_at: request.processedAt ? new Date(request.processedAt).toISOString() : null,
    created_at: request.createdAt ? new Date(request.createdAt).toISOString() : undefined,
    updated_at: request.updatedAt ? new Date(request.updatedAt).toISOString() : undefined,
  };
}

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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const roleError = requireRole(['admin'])(user);
  if (roleError) return roleError;

  const body = await request.json().catch(() => ({})) || {};
  const nextStatus = typeof body?.status === 'string' ? body.status.trim().toLowerCase() : '';
  const resolutionNote = typeof body?.resolutionNote === 'string' ? body.resolutionNote.trim() : '';

  if (!['approved', 'rejected', 'refunded'].includes(nextStatus)) {
    return NextResponse.json({ error: 'Invalid return request action.' }, { status: 400 });
  }

  if (nextStatus === 'rejected' && resolutionNote.length < 5) {
    return NextResponse.json({ error: 'Please add a short rejection note for the customer.' }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const requestRecord = await tx.accountActionRequest.findFirst({
      where: { id, type: 'return_request' },
    });
    if (!requestRecord) return { error: 'Return request not found.', status: 404 as const };

    const currentStatus = String(requestRecord.status || 'pending').toLowerCase();
    if (currentStatus === 'refunded') return { error: 'This return request has already been marked as refunded.', status: 409 as const };
    if (nextStatus === 'approved' && currentStatus !== 'pending') return { error: 'Only pending return requests can be approved.', status: 409 as const };
    if (nextStatus === 'refunded' && currentStatus !== 'approved') return { error: 'Only approved return requests can be marked as refunded.', status: 409 as const };
    if (nextStatus === 'rejected' && !['pending', 'approved'].includes(currentStatus)) return { error: 'This return request cannot be rejected anymore.', status: 409 as const };

    const linkedOrder = requestRecord.orderId
      ? await tx.order.findUnique({
          where: { id: String(requestRecord.orderId) },
          select: { id: true, userId: true, tenantId: true, total: true },
        })
      : null;

    if (nextStatus === 'refunded' && !linkedOrder) {
      return { error: 'A linked order is required before this return can be marked as refunded.', status: 400 as const };
    }

    const claimed = await tx.accountActionRequest.updateMany({
      where: { id: requestRecord.id, status: currentStatus },
      data: {
        status: nextStatus,
        resolutionNote: resolutionNote || null,
        processedById: String(user.id),
        processedAt: new Date(),
      },
    });
    if (claimed.count !== 1) return { error: 'Return request changed by another request. Please refresh.', status: 409 as const };

    let refundAmount = 0;
    if (nextStatus === 'refunded' && linkedOrder) {
      refundAmount = Number(linkedOrder.total);
      await tx.order.update({
        where: { id: linkedOrder.id },
        data: { paymentStatus: 'refunded', failureReason: null },
      });

      if (linkedOrder.userId) {
        const walletUser = await tx.user.update({
          where: { id: linkedOrder.userId },
          data: { walletBalance: { increment: refundAmount } },
          select: { walletBalance: true, tenantId: true },
        });
        await tx.walletTransaction.create({
          data: {
            userId: linkedOrder.userId,
            tenantId: linkedOrder.tenantId ?? walletUser.tenantId ?? null,
            type: 'credit',
            amount: refundAmount,
            currency: 'BDT',
            status: 'completed',
            source: 'return_refund',
            description: `Refund for order ${linkedOrder.id}`,
            balanceAfter: walletUser.walletBalance,
            metadata: { returnRequestId: requestRecord.id, orderId: linkedOrder.id, actor: 'admin' },
          },
        });
      }
    }

    return {
      request: { ...requestRecord, status: nextStatus, resolutionNote: resolutionNote || null, processedById: String(user.id) },
      order: linkedOrder,
      currentStatus,
      refundAmount,
    };
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const requestRecord = result.request;
  const currentStatus = result.currentStatus;
  const linkedOrder = result.order;
  const orderActionUrl = requestRecord.orderId
    ? `/account/orders/${requestRecord.orderId}?return=${requestRecord.id}`
    : '/account/orders';
  const statusLabel = nextStatus.replaceAll('_', ' ');
  const title =
    nextStatus === 'approved'
      ? 'Return request approved'
      : nextStatus === 'rejected'
        ? 'Return request rejected'
        : 'Refund processed';
  const message =
    nextStatus === 'approved'
      ? `Your return request${requestRecord.orderId ? ` for order ${requestRecord.orderId}` : ''} has been approved for the next review step.`
      : nextStatus === 'rejected'
        ? resolutionNote || 'Your return request could not be approved.'
        : `The refund for your approved return request${requestRecord.orderId ? ` on order ${requestRecord.orderId}` : ''} has been processed and credited to your wallet.`;

  await createNotification({
    userId: String(requestRecord.userId),
    type: 'account_action',
    title,
    message,
    actionUrl: orderActionUrl,
    metadata: {
      requestId: requestRecord.id,
      orderId: requestRecord.orderId ?? null,
      type: 'return_request',
      status: nextStatus,
    },
  });

  await handleAuditLog(String(user.id), `return_request.${nextStatus}`, 'account_action_request', requestRecord.id, {
    orderId: requestRecord.orderId ?? null,
    previousStatus: currentStatus,
    status: nextStatus,
    resolutionNote: resolutionNote || null,
    refundAmount: result.refundAmount,
  });

  return NextResponse.json({ success: true, request: serializeAccountActionRequest(result.request) });
}
