import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireUser } from '@/server/next/requireUser';
import { serializeOrder } from '@/app/api/_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: {
      id,
      userId: String(user.id),
      tenantId: user.tenantId ?? undefined,
    },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, stock: true, sellerId: true },
          },
        },
      },
      shipments: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const normalizedStatus = String(order.status || '').toLowerCase();
  if (normalizedStatus === 'cancelled') {
    return NextResponse.json({ error: 'This order has already been cancelled.' }, { status: 400 });
  }

  const hasLockedShipment = order.shipments.some(
    (s) => String(s.status || '').toLowerCase() !== 'processing',
  );
  const hasCourierFlow =
    Boolean(order.courierProvider) ||
    Boolean(order.trackingId) ||
    Boolean(order.pickupRequestedAt) ||
    Boolean(order.pickedUpAt) ||
    Boolean(order.outForDeliveryAt) ||
    Boolean(order.deliveredAt) ||
    order.shipments.some(
      (s) =>
        Boolean(s.courierProvider) ||
        Boolean(s.trackingId) ||
        Boolean(s.pickupRequestedAt) ||
        Boolean(s.pickedUpAt) ||
        Boolean(s.outForDeliveryAt) ||
        Boolean(s.deliveredAt),
    );
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  const paymentLocked = ['paid', 'captured', 'authorized'].includes(paymentStatus);

  if (normalizedStatus !== 'processing' || hasLockedShipment || hasCourierFlow || paymentLocked) {
    return NextResponse.json(
      { error: 'This order can no longer be cancelled.' },
      { status: 400 },
    );
  }

  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: { status: 'cancelled' },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true },
          },
        },
      },
      shipments: true,
    },
  });

  for (const item of order.items) {
    const quantity = Math.max(1, Number(item.qty || 1));

    await prisma.product.update({
      where: { id: item.productId },
      data: { stock: { increment: quantity } },
    });

    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: { productId: item.productId },
      orderBy: { updatedAt: 'desc' },
    });

    if (inventoryItem) {
      await prisma.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: {
          quantity: { increment: quantity },
          movements: {
            create: {
              productId: item.productId,
              warehouseId: inventoryItem.warehouseId,
              type: 'return',
              quantityDelta: quantity,
              reason: 'order_cancelled',
              reference: order.id,
            },
          },
        },
      });
    }
  }

  return NextResponse.json({ order: serializeOrder(updatedOrder) });
}
