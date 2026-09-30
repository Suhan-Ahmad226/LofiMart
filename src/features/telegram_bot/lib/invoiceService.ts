import { prisma } from '@/lib/server';
import { getServerEnv } from '../../../lib/env';
import { createHmac, timingSafeEqual } from 'crypto';
import { sendTelegramDocument } from './telegram';

const INVOICE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function getInvoiceTokenSecret() {
  return getServerEnv().JWT_SECRET || getServerEnv().TELEGRAM_WEBHOOK_SECRET || 'lofimart-telegram-invoice';
}

function signInvoicePayload(orderId: string, expiresAt: number) {
  return createHmac('sha256', getInvoiceTokenSecret())
    .update(`${orderId}.${expiresAt}`)
    .digest('base64url');
}

export function createTelegramInvoiceToken(orderId: string, ttlSeconds = INVOICE_TOKEN_TTL_SECONDS) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = signInvoicePayload(orderId, expiresAt);
  return `${expiresAt}.${signature}`;
}

export function verifyTelegramInvoiceToken(orderId: string, token: string | null | undefined) {
  const [expiresAtRaw, signature] = String(token || '').split('.', 2);
  const expiresAt = Number(expiresAtRaw);

  if (!expiresAt || !signature || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = signInvoicePayload(orderId, expiresAt);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}

export async function ensureTelegramInvoice(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { invoice: true },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  const frontendUrl = getServerEnv().FRONTEND_URL;
  const invoiceUrl = new URL(`/account/orders/${order.id}/invoice`, frontendUrl).toString();
  const token = createTelegramInvoiceToken(order.id);
  const documentUrl = new URL(
    `/api/telegram/invoices/${encodeURIComponent(order.id)}?token=${encodeURIComponent(token)}`,
    frontendUrl,
  ).toString();

  const invoice = await prisma.invoice.upsert({
    where: { orderId: order.id },
    create: {
      order: { connect: { id: order.id } },
      ...(order.userId ? { user: { connect: { id: order.userId } } } : {}),
      status: order.paymentStatus === 'paid' ? 'paid' : 'draft',
      subtotal: order.total,
      total: order.total,
      invoiceUrl,
      documentUrl,
    },
    update: {
      invoiceUrl,
      documentUrl,
      status: order.paymentStatus === 'paid' ? 'paid' : order.invoice?.status ?? 'draft',
    },
  });

  return {
    invoice,
    invoiceUrl,
    documentUrl,
  };
}

export async function sendInvoiceToTelegram(input: {
  chatId: string | number;
  orderId: string;
  caption?: string;
}) {
  const invoice = await ensureTelegramInvoice(input.orderId);

  await sendTelegramDocument({
    chatId: input.chatId,
    documentUrl: invoice.documentUrl,
    caption: input.caption || `Invoice for order ${input.orderId}`,
    buttons: [[{ text: 'Open invoice', url: invoice.invoiceUrl }]],
  });

  return invoice;
}
