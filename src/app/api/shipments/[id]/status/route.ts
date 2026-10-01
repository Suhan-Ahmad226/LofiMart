import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '@/app/api/products/shared';
import { serializeOrderShipment } from '@/server/routes/serializers';
import { createNotification } from '@/features/shared/services/notifications/notificationService';
import { syncResellerSettlementFromShipmentStatus } from '@/features/reseller/services/resellerSettlement';
import { buildShipmentTimestampData, isInternalShipmentStatus, isTerminalStatus, isBackwardsTransition, getShipmentStatusLabel } from '@/features/courier/core/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const customerMessageByStatus: Record<string, string> = {
  packed: 'Shipment has been packed.',
  ready_for_pickup: 'Shipment is ready for courier pickup.',
  pickup_requested: 'Courier pickup has been requested.',
  picked_up: 'Shipment has been picked up by the courier.',
  in_transit: 'Shipment is now in transit.',
  out_for_delivery: 'Shipment is out for delivery.',
  delivered: 'Shipment has been delivered successfully.',
  delivery_failed: 'Shipment could not be delivered on this attempt.',
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const userRole = String(user.role || '');
  if (userRole !== 'admin' && userRole !== 'seller') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { status, courierProvider, trackingId, deliveryFailureReason } = body as Record<string, any>;
  const { id: shipmentId } = await params;

  if (!isInternalShipmentStatus(status)) {
    return NextResponse.json({ error: 'Invalid shipment status.' }, { status: 400 });
  }

  try {
    const shipment = await prisma.orderShipment.findFirst({
      where: userRole === 'seller' ? { id: shipmentId, sellerId: String(user.id) } : { id: shipmentId },
      select: {
        id: true, orderId: true, sellerId: true, status: true,
        courierProvider: true, trackingId: true,
        pickupRequestedAt: true, pickedUpAt: true, outForDeliveryAt: true, deliveredAt: true,
        order: { select: { userId: true, tenantId: true } },
      },
    });

    if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    // Idempotent status updates should not attempt to serialize a partial Prisma select.
    // The normal success path fetches the warehouse relation; this early path returns
    // a small acknowledgement instead of undefined serializer fields.
    if (shipment.status === status) return NextResponse.json({ success: true, unchanged: true, shipment_id: shipment.id, status: shipment.status });

    if (userRole === 'seller' && !['packed', 'ready_for_pickup'].includes(status)) {
      return NextResponse.json(
        { error: 'Courier movement is updated automatically from Pathao. Sellers can only update packing readiness here.' },
        { status: 403 },
      );
    }

    if (isTerminalStatus(shipment.status)) {
      return NextResponse.json({ error: `This shipment is already ${getShipmentStatusLabel(shipment.status)} and cannot be moved manually.` }, { status: 409 });
    }

    if (isBackwardsTransition(shipment.status, status)) {
      return NextResponse.json(
        { error: `Shipment cannot move from ${getShipmentStatusLabel(shipment.status)} back to ${getShipmentStatusLabel(status)}.` },
        { status: 409 },
      );
    }

    const nextCourierProvider =
      typeof courierProvider === 'string' && courierProvider.trim()
        ? courierProvider.trim().toLowerCase()
        : undefined;
    if (nextCourierProvider && shipment.courierProvider && nextCourierProvider !== shipment.courierProvider) {
      return NextResponse.json({ error: 'The courier assigned to this shipment cannot be changed here.' }, { status: 409 });
    }

    const nextTrackingId =
      typeof trackingId === 'string' && trackingId.trim() ? trackingId.trim() : undefined;
    if (nextTrackingId && shipment.trackingId && nextTrackingId !== shipment.trackingId) {
      return NextResponse.json({ error: 'The existing tracking ID cannot be replaced here.' }, { status: 409 });
    }

    const timestampData = buildShipmentTimestampData(status, shipment);
    const updatedShipment = await prisma.orderShipment.update({
      where: { id: shipmentId },
      data: {
        status,
        courierProvider: nextCourierProvider,
        trackingId: nextTrackingId,
        ...timestampData,
        ...(status === 'delivery_failed' && typeof deliveryFailureReason === 'string' && deliveryFailureReason.trim()
          ? { deliveryFailureReason: deliveryFailureReason.trim() }
          : {}),
      },
      include: { warehouse: { select: { id: true, name: true, city: true } } },
    });

    const message = customerMessageByStatus[status];
    if (message && shipment.order.userId) {
      await createNotification({
        userId: shipment.order.userId,
        tenantId: shipment.order.tenantId ?? null,
        type: 'order_update',
        title: 'Shipment update',
        message,
        actionUrl: `/account/orders/${shipment.orderId}?shipment=${shipment.id}`,
        metadata: {
          orderId: shipment.orderId,
          shipmentId: shipment.id,
          status: updatedShipment.status,
          courierProvider: updatedShipment.courierProvider,
          trackingId: updatedShipment.trackingId,
        },
      });
    }

    await syncResellerSettlementFromShipmentStatus(shipment.orderId, status);
    return NextResponse.json({ success: true, shipment: serializeOrderShipment(updatedShipment) });
  } catch (error) {
    console.error('PATCH /api/shipments/[id]/status error:', error);
    return NextResponse.json({ error: 'Failed to update shipment status' }, { status: 500 });
  }
}
