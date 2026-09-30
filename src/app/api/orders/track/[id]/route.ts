import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { serializeOrderShipment } from '@/server/routes/serializers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trackingKey = String(id || '').trim();

  const order: any = await prisma.order.findFirst({
    where: {
      OR: [
        { id: trackingKey },
        { orderCode: trackingKey.toUpperCase() },
      ],
    },
    select: {
      id: true,
      orderCode: true,
      status: true,
      createdAt: true,
      courierProvider: true,
      trackingId: true,
      pickupRequestedAt: true,
      pickedUpAt: true,
      outForDeliveryAt: true,
      deliveredAt: true,
      deliveryFailureReason: true,
      shipments: {
        include: {
          warehouse: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    } as any,
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const shipmentStages = [
    { label: 'Order placed', statuses: ['pending', 'processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled'] },
    { label: 'Processing', statuses: ['processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
    { label: 'Packed', statuses: ['packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
    { label: 'Ready for pickup', statuses: ['ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
    { label: 'Pickup requested', statuses: ['pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
    { label: 'Picked up', statuses: ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
    { label: 'In transit', statuses: ['in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
    { label: 'Out for delivery', statuses: ['out_for_delivery', 'delivered', 'delivery_failed'] },
    { label: 'Delivered', statuses: ['delivered'] },
  ];

  const stepDates: Record<string, string> = {
    'Order placed': new Date(order.createdAt).toLocaleString(),
    'Processing': order.status !== 'pending' ? 'Updated' : '-',
    'Packed': ['packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'].includes(order.status) ? 'Updated' : '-',
    'Ready for pickup': ['ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'].includes(order.status) ? 'Updated' : '-',
    'Pickup requested': order.pickupRequestedAt ? new Date(order.pickupRequestedAt).toLocaleString() : '-',
    'Picked up': order.pickedUpAt ? new Date(order.pickedUpAt).toLocaleString() : '-',
    'In transit': ['in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'].includes(order.status) ? 'Updated' : '-',
    'Out for delivery': order.outForDeliveryAt ? new Date(order.outForDeliveryAt).toLocaleString() : '-',
    'Delivered': order.deliveredAt ? new Date(order.deliveredAt).toLocaleString() : '-',
  };

  const steps = shipmentStages.map((stage) => ({
    label: stage.label,
    date: stepDates[stage.label] ?? '-',
    completed: stage.statuses.includes(order.status),
  }));

  return NextResponse.json({
    id: order.id,
    order_code: order.orderCode ?? null,
    status: order.status,
    created_at: order.createdAt.toISOString(),
    courier_provider: order.courierProvider ?? null,
    tracking_id: order.trackingId ?? null,
    delivery_failure_reason: order.deliveryFailureReason ?? null,
    shipments: Array.isArray(order.shipments) ? order.shipments.map(serializeOrderShipment) : [],
    steps,
  });
}
