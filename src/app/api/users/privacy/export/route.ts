import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, serializeUser, serializeAddress, toPlainNumber } from '@/app/api/_compat/shared';

function serializePayoutTransaction(transaction: any) {
  return {
    id: transaction.id,
    user_id: transaction.userId,
    payout_method_id: transaction.payoutMethodId ?? null,
    type: transaction.type,
    amount: toPlainNumber(transaction.amount),
    currency: transaction.currency,
    status: transaction.status,
    reference: transaction.reference ?? null,
    notes: transaction.notes ?? null,
    metadata: transaction.metadata ?? null,
    processed_at: transaction.processedAt ? new Date(transaction.processedAt).toISOString() : null,
    created_at: transaction.createdAt ? new Date(transaction.createdAt).toISOString() : undefined,
  };
}

function serializeOrder(order: any) {
  return {
    id: order.id,
    order_code: order.orderCode ?? null,
    user_id: order.userId,
    total: toPlainNumber(order.total),
    status: order.status,
    courier_provider: order.courierProvider ?? null,
    tracking_id: order.trackingId ?? null,
    payment_method: order.paymentMethod ?? null,
    payment_provider: order.paymentProvider ?? null,
    payment_status: order.paymentStatus ?? null,
    paid_at: order.paidAt ? new Date(order.paidAt).toISOString() : null,
    pickup_requested_at: order.pickupRequestedAt ? new Date(order.pickupRequestedAt).toISOString() : null,
    picked_up_at: order.pickedUpAt ? new Date(order.pickedUpAt).toISOString() : null,
    out_for_delivery_at: order.outForDeliveryAt ? new Date(order.outForDeliveryAt).toISOString() : null,
    delivered_at: order.deliveredAt ? new Date(order.deliveredAt).toISOString() : null,
    failure_reason: order.failureReason ?? null,
    delivery_failure_reason: order.deliveryFailureReason ?? null,
    ref_code: order.refCode ?? null,
    shipping_address: order.shippingAddress ?? null,
    shipment_metadata: order.shipmentMetadata ?? null,
    shipments: Array.isArray(order.shipments)
      ? order.shipments.map((shipment: any) => ({
          id: shipment.id,
          order_id: shipment.orderId,
          seller_id: shipment.sellerId,
          seller_name: shipment.seller?.name ?? null,
          seller_store_name: shipment.seller?.storeName ?? null,
          seller_email: shipment.seller?.email ?? null,
          seller_phone: shipment.seller?.phone ?? null,
          warehouse_id: shipment.warehouseId ?? null,
          warehouse_name: shipment.warehouse?.name ?? null,
          warehouse_city: shipment.warehouse?.city ?? null,
          status: shipment.status,
          total: toPlainNumber(shipment.total),
          tracking_id: shipment.trackingId ?? null,
          courier_provider: shipment.courierProvider ?? null,
          created_at: shipment.createdAt ? new Date(shipment.createdAt).toISOString() : undefined,
        }))
      : undefined,
    customer_email: order.user?.email ?? null,
    customer_phone: order.user?.phone ?? null,
    created_at: order.createdAt ? new Date(order.createdAt).toISOString() : undefined,
    updated_at: order.updatedAt ? new Date(order.updatedAt).toISOString() : undefined,
    customer_name: order.user?.name ?? undefined,
  };
}

function serializeOrderItem(item: any) {
  return {
    id: item.id,
    order_id: item.orderId,
    product_id: item.productId,
    quantity: item.qty,
    price: toPlainNumber(item.price),
    variant_summary: item.variantSummary ?? null,
    sku: item.variantSku ?? item.product?.sku ?? null,
    name: item.product?.name ?? '',
    image: item.product?.image ?? null,
    seller_name: item.product?.seller?.name ?? null,
    seller_store_name: item.product?.seller?.storeName ?? null,
    seller_email: item.product?.seller?.email ?? null,
    seller_phone: item.product?.seller?.phone ?? null,
  };
}

async function ensureNotificationPreference(userId: string) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

function serializeNotificationPreference(preference: any) {
  return {
    email_enabled: preference?.emailEnabled ?? true,
    sms_enabled: preference?.smsEnabled ?? false,
    order_updates: preference?.orderUpdates ?? true,
    marketing_opt_in: preference?.marketingOptIn ?? false,
    payout_alerts: preference?.payoutAlerts ?? true,
    security_alerts: preference?.securityAlerts ?? true,
  };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const userId = String(user.id);
  const [userRecord, orders, transactions, addresses, notificationPreference] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    }),
    prisma.payoutTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ensureNotificationPreference(userId),
  ]);

  return NextResponse.json({
    exported_at: new Date().toISOString(),
    user: userRecord ? serializeUser(userRecord) : null,
    addresses: addresses.map(serializeAddress),
    orders: orders.map((order) => ({ ...serializeOrder(order), items: order.items.map(serializeOrderItem) })),
    transactions: transactions.map(serializePayoutTransaction),
    notification_preferences: serializeNotificationPreference(notificationPreference),
  });
}
