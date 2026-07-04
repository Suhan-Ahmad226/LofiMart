import { prisma } from '@/lib/server';
import { escapeTelegramHtml, getTelegramDashboardUrl, sendTelegramMessage } from './telegram';

type SellerOrderMessageInput = {
  sellerId: string;
  orderId: string;
  orderCode?: string | null;
  total?: string | number;
};

type TelegramUserContact = {
  telegramChatId?: string | null;
  storeName?: string | null;
  name?: string | null;
};

async function getTelegramUserContact(userId: string): Promise<TelegramUserContact | null> {
  return (prisma.user as any).findUnique({
    where: { id: userId },
    select: { telegramChatId: true, storeName: true, name: true },
  });
}

export async function sendNewOrderNotification(input: SellerOrderMessageInput) {
  const seller = await getTelegramUserContact(input.sellerId);

  if (!seller?.telegramChatId) return false;

  const orderLabel = escapeTelegramHtml(input.orderCode || input.orderId);

  await sendTelegramMessage({
    chatId: seller.telegramChatId,
    text: [
      '<b>New Order</b>',
      `Order: <code>${orderLabel}</code>`,
      `Store: ${escapeTelegramHtml(seller.storeName || seller.name || 'Seller')}`,
      input.total ? `Total: ${escapeTelegramHtml(input.total)} BDT` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    buttons: [
      [
        { text: 'Accept Order', callback_data: `order:accept:${input.orderId}:${input.sellerId}` },
        { text: 'Reject Order', callback_data: `order:reject:${input.orderId}:${input.sellerId}` },
      ],
      [
        { text: 'View Invoice', url: getTelegramDashboardUrl(`/account/orders/${input.orderId}/invoice`) },
        { text: 'Open Dashboard', web_app: { url: getTelegramDashboardUrl('/seller/orders') } },
      ],
    ],
  });

  return true;
}

export async function sendOrderStatusNotification(input: SellerOrderMessageInput & { status: string }) {
  const seller = await getTelegramUserContact(input.sellerId);

  if (!seller?.telegramChatId) return false;

  await sendTelegramMessage({
    chatId: seller.telegramChatId,
    text: `<b>Order ${escapeTelegramHtml(input.status)}</b>\nOrder: <code>${escapeTelegramHtml(input.orderCode || input.orderId)}</code>`,
    buttons:
      input.status === 'accepted'
        ? [[{ text: 'Mark Shipped', callback_data: `order:ship:${input.orderId}:${input.sellerId}` }]]
        : undefined,
  });

  return true;
}

export async function sendLowStockAlert(input: {
  sellerId: string;
  productName: string;
  stock: number;
  threshold: number;
}) {
  const seller = await getTelegramUserContact(input.sellerId);

  if (!seller?.telegramChatId) return false;

  await sendTelegramMessage({
    chatId: seller.telegramChatId,
    text: `<b>Low Stock Alert</b>\n${escapeTelegramHtml(input.productName)}\nStock: <b>${input.stock}</b> / Threshold: ${input.threshold}`,
    buttons: [[{ text: 'Open Inventory', web_app: { url: getTelegramDashboardUrl('/seller/inventory') } }]],
  });

  return true;
}

export async function sendPaymentReceivedNotification(input: SellerOrderMessageInput) {
  return sendOrderStatusNotification({ ...input, status: 'payment received' });
}

export async function sendPaymentReceivedNotificationsForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderCode: true,
      total: true,
      shipments: {
        select: {
          sellerId: true,
          total: true,
        },
      },
      resellerCommissions: {
        select: {
          resellerId: true,
          amount: true,
        },
      },
    },
  });

  if (!order) return { sellerNotifications: 0, resellerNotifications: 0 };

  const sellerTotals = new Map<string, number>();
  for (const shipment of order.shipments || []) {
    sellerTotals.set(
      shipment.sellerId,
      (sellerTotals.get(shipment.sellerId) || 0) + Number(shipment.total || 0),
    );
  }

  const sellerResults = await Promise.all(
    [...sellerTotals.entries()].map(([sellerId, total]) =>
      sendPaymentReceivedNotification({
        sellerId,
        orderId: order.id,
        orderCode: order.orderCode,
        total,
      }),
    ),
  );

  const resellerResults = await Promise.all(
    (order.resellerCommissions || []).map((commission) =>
      sendCommissionEarnedNotification({
        resellerId: commission.resellerId,
        amount: Number(commission.amount || 0),
        orderId: order.orderCode || order.id,
      }),
    ),
  );

  return {
    sellerNotifications: sellerResults.filter(Boolean).length,
    resellerNotifications: resellerResults.filter(Boolean).length,
  };
}

export async function sendCommissionEarnedNotification(input: {
  resellerId: string;
  amount: string | number;
  orderId: string;
}) {
  const reseller = await getTelegramUserContact(input.resellerId);

  if (!reseller?.telegramChatId) return false;

  await sendTelegramMessage({
    chatId: reseller.telegramChatId,
    text: `<b>Commission Earned</b>\nAmount: ${escapeTelegramHtml(input.amount)} BDT\nOrder: <code>${escapeTelegramHtml(input.orderId)}</code>`,
    buttons: [[{ text: 'Open Earnings', web_app: { url: getTelegramDashboardUrl('/reseller-dashboard/earnings') } }]],
  });

  return true;
}
