import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole, toPlainNumber } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);
  const shipments = await prisma.orderShipment.findMany({
    where: { sellerId },
    orderBy: { createdAt: 'desc' },
    include: {
      order: {
        select: {
          id: true,
          orderCode: true,
          status: true,
          total: true,
          paymentMethod: true,
          paymentStatus: true,
          createdAt: true,
          shippingAddress: true,
          user: { select: { id: true, name: true, phone: true } },
        },
      },
      warehouse: { select: { id: true, name: true, city: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, image: true, sku: true } },
        },
      },
    },
  });

  return NextResponse.json(
    shipments.map((shipment) => ({
      id: shipment.id,
      order_id: shipment.orderId,
      order_code: shipment.order?.orderCode ?? null,
      seller_id: shipment.sellerId,
      warehouse_id: shipment.warehouseId,
      warehouse: shipment.warehouse ?? null,
      status: shipment.status,
      courier_provider: shipment.courierProvider ?? null,
      tracking_id: shipment.trackingId ?? null,
      // The courier's own status string, plus when we last asked it. Exposed so
      // the seller can see why a parcel looks stale without opening the admin
      // tools. This is the field the UI reads; the old `pathaoLastEvent` metadata
      // key is gone because reconciliation stopped writing it.
      provider_status: shipment.providerStatus ?? null,
      provider_reference: shipment.providerReference ?? null,
      last_reconciled_at: shipment.lastReconciledAt
        ? new Date(shipment.lastReconciledAt).toISOString()
        : null,
      // Flattened because the courier screen filters and exports on these directly.
      warehouse_name: shipment.warehouse?.name ?? null,
      warehouse_city: shipment.warehouse?.city ?? null,
      order_created_at: shipment.order?.createdAt
        ? new Date(shipment.order.createdAt).toISOString()
        : null,
      shipping_address: shipment.order?.shippingAddress ?? null,
      payment_method: shipment.order?.paymentMethod ?? null,
      total: toPlainNumber(shipment.total),
      item_count: shipment.itemCount,
      customer_name: shipment.order?.user?.name ?? null,
      customer_phone: shipment.order?.user?.phone ?? null,
      order_status: shipment.order?.status ?? null,
      order_total: toPlainNumber(shipment.order?.total),
      order_payment_status: shipment.order?.paymentStatus ?? null,
      items: shipment.items.map((item) => ({
        id: item.id,
        product_id: item.productId,
        product_name: item.product?.name ?? null,
        product_image: item.product?.image ?? null,
        product_sku: item.product?.sku ?? null,
        qty: item.qty,
        price: toPlainNumber(item.price),
      })),
      pickup_requested_at: shipment.pickupRequestedAt ? new Date(shipment.pickupRequestedAt).toISOString() : null,
      picked_up_at: shipment.pickedUpAt ? new Date(shipment.pickedUpAt).toISOString() : null,
      out_for_delivery_at: shipment.outForDeliveryAt ? new Date(shipment.outForDeliveryAt).toISOString() : null,
      delivered_at: shipment.deliveredAt ? new Date(shipment.deliveredAt).toISOString() : null,
      delivery_failure_reason: shipment.deliveryFailureReason ?? null,
      created_at: shipment.createdAt ? new Date(shipment.createdAt).toISOString() : undefined,
      updated_at: shipment.updatedAt ? new Date(shipment.updatedAt).toISOString() : undefined,
    })),
  );
}
