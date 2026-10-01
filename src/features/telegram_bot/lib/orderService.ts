export { createMarketplaceOrder } from '@/features/orders/services/orderService';

export async function assertSellerTelegramAccess(chatId: string | number, sellerId: string) {
  const seller = await prisma.user.findFirst({
    where: {
      id: sellerId,
      telegramChatId: String(chatId),
      role: { in: ['seller', 'admin', 'reseller'] },
    },
    select: { id: true },
  });

  if (!seller) {
    throw new Error('This Telegram chat is not linked to the seller account');
  }

  return seller;
}

export async function updateSellerOrderStatus(input: {
  chatId: string | number;
  sellerId: string;
  orderId: string;
  action: 'accept' | 'reject' | 'ship' | 'deliver';
}) {
  await assertSellerTelegramAccess(input.chatId, input.sellerId);

  const status =
    input.action === 'accept'
      ? 'processing'
      : input.action === 'ship'
        ? 'picked_up'
        : input.action === 'deliver'
          ? 'delivered'
          : 'cancelled';

  const existingShipment = await prisma.orderShipment.findFirst({
    where: {
      orderId: input.orderId,
      sellerId: input.sellerId,
    },
    select: {
      id: true,
      status: true,
      warehouseId: true,
      items: {
        select: {
          productId: true,
          qty: true,
        },
      },
    },
  });

  const currentStatus = String(existingShipment?.status || '');
  if (input.action === 'deliver') {
    throw new Error('Delivery completion is controlled by the courier webhook; sellers cannot mark a Pathao shipment delivered manually.');
  }

  const validTransition =
    (input.action === 'accept' && ['processing'].includes(currentStatus)) ||
    (input.action === 'ship' && ['processing', 'packed', 'ready_for_pickup'].includes(currentStatus)) ||
    (input.action === 'reject' && ['processing'].includes(currentStatus));

  if (!validTransition) {
    throw new Error(`Invalid shipment transition: ${currentStatus} -> ${status}`);
  }

  const shipment = await prisma.orderShipment.updateMany({
    where: {
      orderId: input.orderId,
      sellerId: input.sellerId,
    },
    data: {
      status: status as any,
      ...(status === 'picked_up' ? { pickedUpAt: new Date() } : {}),
      ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
    },
  });

  if (!shipment.count) {
    throw new Error('Seller shipment not found for this order');
  }

  if (status === 'cancelled' && existingShipment && existingShipment.status !== 'cancelled') {
    await restoreStockForOrder(
      existingShipment.items.map((item) => ({
        productId: item.productId,
        quantity: item.qty,
        reference: input.orderId,
        warehouseId: existingShipment.warehouseId ?? undefined,
      })),
    );
  }

  const { syncOrderStatusFromShipments } = await import('@/features/courier/services/orderStatusService');
  await syncOrderStatusFromShipments(input.orderId);

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { orderCode: true },
  });

  await sendOrderStatusNotification({
    sellerId: input.sellerId,
    orderId: input.orderId,
    orderCode: order?.orderCode,
    status,
  });

  if (status === 'processing') {
    await sendInvoiceToTelegram({
      chatId: input.chatId,
      orderId: input.orderId,
      caption: `Invoice for order ${order?.orderCode || input.orderId}`,
    });
  }

  return { status };
}
