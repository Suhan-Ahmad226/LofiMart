import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '@/app/api/products/shared';
import { serializeOrderShipment } from '@/server/routes/serializers';
import { createNotification } from '@/features/shared/services/notifications/notificationService';
import { syncResellerSettlementFromShipmentStatus } from '@/features/reseller/services/resellerSettlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const customerMessageByStatus: Record<string, string> = {
  packed: `Shipment has been packed.`,
  ready_for_pickup: `Shipment is ready for courier pickup.`,
  pickup_requested: `Courier pickup has been requested.`,
  picked_up: `Shipment has been picked up by the courier.`,
  in_transit: `Shipment is now in transit.`,
  out_for_delivery: `Shipment is out for delivery.`,
  delivered: `Shipment has been delivered successfully.`,
  delivery_failed: `Shipment could not be delivered on this attempt.`,
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

  try {
    const shipment = await prisma.orderShipment.findFirst({
      where: userRole === 'seller'
        ? {
            id: shipmentId,
            sellerId: String(user.id),
          }
        : {
            id: shipmentId,
          },
      select: {
        id: true,
        orderId: true,
        sellerId: true,
        status: true,
        order: {
          select: {
            userId: true,
            tenantId: true,
          },
        },
      },
    });

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
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

    const updatedShipment = await prisma.orderShipment.update({
      where: { id: shipmentId },
      data: {
        status: status as any,
        courierProvider: typeof courierProvider === 'string' && courierProvider.trim() ? courierProvider.trim() : undefined,
        trackingId: typeof trackingId === 'string' && trackingId.trim() ? trackingId.trim() : undefined,
        ...timestampData,
      } as any,
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
      },
    });

    const message = customerMessageByStatus[status];
    if (message) {
      await createNotification({
        userId: shipment.order.userId!,
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
    return NextResponse.json({ error: 'Failed to update shipment status' }, { status: 500 });
  }
}
