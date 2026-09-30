import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireAdminRole } from '../../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function settleResellerCommissionsForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, refCode: true, items: { select: { price: true, qty: true } } },
  });
  if (!order || !order.refCode) return;

  const referral = await prisma.resellerReferral.findFirst({
    where: { code: String(order.refCode) },
    select: { resellerId: true },
  });
  if (!referral) return;

  const existing = await prisma.resellerCommission.findFirst({
    where: { resellerId: referral.resellerId, orderId: order.id },
  });
  if (existing) return;

  await prisma.resellerCommission.create({
    data: {
      resellerId: referral.resellerId,
      orderId: order.id,
      amount: order.items.reduce((sum, item) => sum + Number(item.price) * item.qty, 0) * 0.05,
      status: 'pending',
    },
  });
}

async function reverseResellerCommissionsForOrder(
  orderId: string,
  reason: 'cancelled' | 'returned' | 'delivery_failed',
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, refCode: true },
  });
  if (!order) return;

  const refCode = order.refCode;
  if (!refCode) return;

  const referral = await prisma.resellerReferral.findFirst({
    where: { code: refCode },
    select: { resellerId: true },
  });
  if (!referral) return;

  await prisma.resellerCommission.updateMany({
    where: { resellerId: referral.resellerId, orderId: order.id, status: { in: ['paid', 'pending'] } },
    data: { status: reason, paidAt: null },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const body = await request.json().catch(() => ({}));
  const { status, courierProvider, trackingId, deliveryFailureReason } = body as Record<string, any>;
  const { id: orderId } = await params;

  if (typeof status !== 'string' || !status.trim()) {
    return NextResponse.json({ error: 'Status is required' }, { status: 400 });
  }

  try {
    const timestampData: Record<string, unknown> = {};

    if (status === 'pickup_requested') timestampData.pickupRequestedAt = new Date();
    if (status === 'picked_up') timestampData.pickedUpAt = new Date();
    if (status === 'out_for_delivery') timestampData.outForDeliveryAt = new Date();
    if (status === 'delivered') timestampData.deliveredAt = new Date();
    if (status !== 'delivery_failed') timestampData.deliveryFailureReason = null;
    if (status === 'delivery_failed' && typeof deliveryFailureReason === 'string' && deliveryFailureReason.trim()) {
      timestampData.deliveryFailureReason = deliveryFailureReason.trim();
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: status as any,
        courierProvider:
          typeof courierProvider === 'string' && courierProvider.trim() ? courierProvider.trim() : undefined,
        trackingId: typeof trackingId === 'string' && trackingId.trim() ? trackingId.trim() : undefined,
        ...timestampData,
      } as any,
    });

    if (status === 'delivered') {
      await settleResellerCommissionsForOrder(updatedOrder.id);
    } else if (status === 'cancelled' || status === 'returned' || status === 'delivery_failed') {
      await reverseResellerCommissionsForOrder(updatedOrder.id, status);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/admin/orders/[id]/status error:', error);
    return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 });
  }
}