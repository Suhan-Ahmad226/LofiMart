import { ensureTelegramInvoice } from '@/features/telegram_bot/lib/invoiceService';
import { sendLowStockAlert, sendNewOrderNotification } from '@/features/telegram_bot/lib/notificationService';

export type OrderLowStockAlert = {
  sellerId: string;
  productName: string;
  stock: number;
  threshold: number;
};

export async function runOrderPostCreateEffects(input: {
  orderId: string;
  orderCode: string;
  total: number;
  sellerIds: string[];
  lowStockAlerts: OrderLowStockAlert[];
}) {
  try {
    await ensureTelegramInvoice(input.orderId);
  } catch (error) {
    console.error('Order created but invoice generation failed:', error);
  }

  await Promise.all(input.lowStockAlerts.map((alert) => sendLowStockAlert(alert)));

  await Promise.all(
    [...new Set(input.sellerIds)].map((sellerId) =>
      sendNewOrderNotification({
        sellerId,
        orderId: input.orderId,
        orderCode: input.orderCode,
        total: input.total,
      }),
    ),
  );
}
