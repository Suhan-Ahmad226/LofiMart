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

  const requestRecord = await prisma.accountActionRequest.findFirst({
    where: {
      id,
      type: 'return_request',
    },
  });

  if (!requestRecord) {
    return NextResponse.json({ error: 'Return request not found.' }, { status: 404 });
  }

  const currentStatus = String(requestRecord.status || 'pending').toLowerCase();
  const linkedOrder = requestRecord.orderId
    ? await prisma.order.findUnique({
        where: { id: String(requestRecord.orderId) },
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              refunds: true,
            },
          },
        },
      })
    : null;

  if (currentStatus === 'refunded') {
    return NextResponse.json({ error: 'This return request has already been marked as refunded.' }, { status: 409 });
  }

  if (nextStatus === 'approved' && currentStatus !== 'pending') {
    return NextResponse.json({ error: 'Only pending return requests can be approved.' }, { status: 409 });
  }

  if (nextStatus === 'refunded' && currentStatus !== 'approved') {
    return NextResponse.json({ error: 'Only approved return requests can be marked as refunded.' }, { status: 409 });
  }

  if (nextStatus === 'refunded' && !linkedOrder) {
    return NextResponse.json({ error: 'A linked order is required before this return can be marked as refunded.' }, { status: 400 });
  }

  if (nextStatus === 'rejected' && !['pending', 'approved'].includes(currentStatus)) {
    return NextResponse.json({ error: 'This return request cannot be rejected anymore.' }, { status: 409 });
  }

  const updated = await prisma.accountActionRequest.update({
    where: { id: requestRecord.id },
    data: {
      status: nextStatus,
      resolutionNote: resolutionNote || null,
      processedById: String(user.id),
      processedAt: new Date(),
    } as any,
  });

  if (nextStatus === 'refunded' && linkedOrder) {
    await prisma.order.update({
      where: { id: linkedOrder.id },
      data: {
        paymentStatus: 'refunded',
        failureReason: null,
      },
    });
  }

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
  });

  return NextResponse.json({ success: true, request: serializeAccountActionRequest(updated) });
}
