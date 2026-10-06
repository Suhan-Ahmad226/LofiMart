import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '@/app/api/products/shared';

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

  const userRole = String(user.role || '');

  if (userRole !== 'admin' && userRole !== 'seller') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { status, courierProvider, trackingId, deliveryFailureReason } = body as Record<string, any>;
  const allowedStatuses = new Set([
    'processing',
    'confirmed',
    'pickup_requested',
    'picked_up',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'returned',
    'delivery_failed',
  ]);
  if (typeof status !== 'string' || !allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Invalid order status.' }, { status: 400 });
  }
  const { id: orderId } = await params;

  try {
    if (userRole === 'seller') {
      const sellerId = String(user.id);
      const sellerShipments = await prisma.orderShipment.findMany({
        where: {
          orderId,
          sellerId,
          order: { tenantId: user.tenantId ?? undefined },
        },
        select: { id: true },
      });

      if (sellerShipments.length === 0) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      const timestampData: Record<string, unknown> = {};
      if (status === 'pickup_requested') timestampData.pickupRequestedAt = new Date();
      if (status === 'picked_up') timestampData.pickedUpAt = new Date();
      if (status === 'out_for_delivery') timestampData.outForDeliveryAt = new Date();
      if (status === 'delivered') timestampData.deliveredAt = new Date();
      if (status !== 'delivery_failed') timestampData.deliveryFailureReason = null;
      if (status === 'delivery_failed' && typeof deliveryFailureReason === 'string' && deliveryFailureReason.trim()) {
        timestampData.deliveryFailureReason = deliveryFailureReason.trim();
      }

      await prisma.orderShipment.updateMany({
        where: {
          orderId,
          sellerId,
          order: { tenantId: user.tenantId ?? undefined },
        },
        data: {
          status: status as any,
          courierProvider: undefined,
          trackingId: undefined,
          ...timestampData,
        } as any,
      });

      if (typeof courierProvider === 'string' && courierProvider.trim()) {
        await prisma.orderShipment.updateMany({
          where: {
            orderId,
            sellerId,
            order: { tenantId: user.tenantId ?? undefined },
          },
          data: { courierProvider: courierProvider.trim() },
        });
      }
      if (typeof trackingId === 'string' && trackingId.trim()) {
        await prisma.orderShipment.updateMany({
          where: { orderId, sellerId, order: { tenantId: user.tenantId ?? undefined } },
          data: { trackingId: trackingId.trim() },
        });
      }

      const shipments = await prisma.orderShipment.findMany({
        where: { orderId, order: { tenantId: user.tenantId ?? undefined } },
        select: { status: true },
      });
      const statuses = shipments.map((shipment) => String(shipment.status));
      const orderStatus =
        statuses.length > 0 && statuses.every((value) => value === 'delivered')
          ? 'delivered'
          : statuses.length > 0 && statuses.every((value) => value === 'cancelled')
            ? 'cancelled'
            : statuses.length > 0 && statuses.every((value) => value === 'returned')
              ? 'returned'
              : statuses.some((value) => value === 'delivery_failed')
              ? 'delivery_failed'
              : statuses.some((value) => value === 'out_for_delivery')
                ? 'out_for_delivery'
                : statuses.some((value) => value === 'picked_up')
                  ? 'picked_up'
                  : statuses.some((value) => value === 'pickup_requested')
                    ? 'pickup_requested'
                    : 'processing';

      const updatedOrder = await prisma.order.update({
        where: { id: orderId, tenantId: user.tenantId ?? undefined },
        data: { status: orderStatus as any },
      });

      if (orderStatus === 'delivered') {
        await settleResellerCommissionsForOrder(updatedOrder.id);
      } else if (orderStatus === 'cancelled' || orderStatus === 'returned' || orderStatus === 'delivery_failed') {
        await reverseResellerCommissionsForOrder(updatedOrder.id, orderStatus as 'cancelled' | 'returned' | 'delivery_failed');
      }

      return NextResponse.json({ success: true });
    }
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
      where: { id: orderId, ...(user.tenantId ? { tenantId: user.tenantId } : {}) },
      data: {
        status: status as any,
        courierProvider: typeof courierProvider === 'string' && courierProvider.trim() ? courierProvider.trim() : undefined,
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
    return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 });
  }
}
