import crypto from 'crypto';
import { prisma } from '@/lib/server';
import { logger } from '../../../../../lib/logger';
import { sendPaymentReceivedNotificationsForOrder } from '../../../../telegram_bot/index';
import type { BkashExecutePaymentResponse, BkashQueryPaymentResponse, BkashVerificationResult } from './types';

type BkashTransactionMetadata = Record<string, string>;

function toPlainAmount(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function createSecureMerchantInvoiceNumber(orderId: string) {
  const entropy = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `BK-${orderId.slice(-8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${entropy}`;
}

export function createBkashRequestKey(orderId: string, agreementId: string) {
  return crypto.createHash('sha256').update(`bkash:${orderId}:${agreementId}`).digest('hex');
}

export async function getExistingBkashTransactionForOrder(orderId: string) {
  return prisma.paymentTransaction.findFirst({
    where: {
      orderId,
      provider: 'bkash',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function createOrReuseBkashPendingPayment(input: {
  orderId: string;
  customerId: string;
  amount: number;
  currency: string;
  paymentId: string;
  checkoutUrl: string;
  agreementId: string;
  payerReference: string;
  merchantInvoiceNumber: string;
  idempotencyKey: string;
  callbackBaseUrl: string;
}) {
  const existing = await getExistingBkashTransactionForOrder(input.orderId);

  if (existing && ['pending', 'processing', 'requires_action', 'paid'].includes(existing.status)) {
    return existing;
  }

  const metadata: BkashTransactionMetadata = {
    agreementId: input.agreementId,
    payerReference: input.payerReference,
    merchantInvoiceNumber: input.merchantInvoiceNumber,
    checkoutUrl: input.checkoutUrl,
    callbackBaseUrl: input.callbackBaseUrl,
  };

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.paymentTransaction.create({
      data: {
        provider: 'bkash',
        paymentId: input.paymentId,
        orderId: input.orderId,
        customerId: input.customerId,
        amount: input.amount,
        currency: input.currency,
        status: 'pending',
        idempotencyKey: input.idempotencyKey,
        metadata,
      },
    });

    await tx.order.update({
      where: { id: input.orderId },
      data: {
        paymentMethod: 'bkash',
        paymentProvider: 'bkash',
        paymentIntentId: input.paymentId,
        paymentStatus: 'pending',
        status: {
          set: 'pending',
        },
      },
    });

    return transaction;
  });
}

export async function getBkashTransactionByPaymentId(paymentId: string) {
  return prisma.paymentTransaction.findFirst({
    where: {
      paymentId,
      provider: 'bkash',
    },
    include: {
      order: true,
    },
  });
}

export async function markBkashPaymentCancelledOrFailed(input: {
  paymentId: string;
  nextStatus: 'failed' | 'cancelled';
  reason: string;
}) {
  const transaction = await getBkashTransactionByPaymentId(input.paymentId);
  if (!transaction) return null;
  if (transaction.status === 'paid') return transaction;

  return prisma.$transaction(async (tx) => {
    const order = transaction.orderId
      ? await tx.order.findUnique({
          where: { id: transaction.orderId },
          select: {
            id: true,
            items: {
              select: {
                productId: true,
                qty: true,
              },
            },
          },
        })
      : null;

    await tx.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: input.nextStatus,
        metadata: {
          ...(transaction.metadata as Record<string, unknown> | null),
          callbackReason: input.reason,
        },
      },
    });

    if (!order) {
      return transaction;
    }

    const updatedOrder = await tx.order.updateMany({
      where: {
        id: order.id,
        status: {
          notIn: ['cancelled', 'payment_failed'],
        },
      },
      data: {
        paymentStatus: input.nextStatus,
        status: input.nextStatus === 'cancelled' ? 'cancelled' : 'payment_failed',
        failureReason: input.reason,
      },
    });

    if (updatedOrder.count === 1) {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              increment: item.qty,
            },
          },
        });
      }
    }

    return transaction;
  });
}

export async function finalizeBkashPaidPayment(input: {
  paymentId: string;
  trxId: string | null;
  rawStatus: string | null;
  amount: number | null;
  verificationPayload: Record<string, unknown>;
}) {
  const transaction = await getBkashTransactionByPaymentId(input.paymentId);
  if (!transaction) {
    throw new Error('Unknown bKash payment reference');
  }

  if (!transaction.orderId) {
    throw new Error('bKash payment is not linked to an order');
  }

  if (transaction.status === 'paid') {
    return {
      paymentId: input.paymentId,
      orderId: transaction.orderId,
      paymentStatus: 'paid',
      trxId: input.trxId,
      rawStatus: input.rawStatus,
      amount: input.amount,
      verified: true,
    } satisfies BkashVerificationResult;
  }

  const orderId = transaction.orderId;
  if (!orderId) {
    throw new Error('bKash payment is not linked to an order');
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'paid',
        metadata: {
          ...(transaction.metadata as Record<string, unknown> | null),
          trxId: input.trxId,
          rawStatus: input.rawStatus,
          verificationPayload: input.verificationPayload,
        },
      },
    });

    // Security-critical: order state is updated only after a server-to-server execute/query
    // confirms the payment. The browser callback alone is never trusted as proof of payment.
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentMethod: 'bkash',
        paymentProvider: 'bkash',
        paymentIntentId: input.paymentId,
        paymentStatus: 'paid',
        paidAt: new Date(),
        status: 'processing',
      },
    });
  });

  logger.info('payments.bkash.order_paid', {
    orderId,
    paymentId: input.paymentId,
    trxId: input.trxId,
  });

  sendPaymentReceivedNotificationsForOrder(orderId).catch((error) => {
    logger.warn('payments.bkash.telegram_notification_failed', {
      orderId,
      paymentId: input.paymentId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return {
    paymentId: input.paymentId,
    orderId,
    paymentStatus: 'paid',
    trxId: input.trxId,
    rawStatus: input.rawStatus,
    amount: input.amount,
    verified: true,
  } satisfies BkashVerificationResult;
}

export async function syncBkashOrderPaymentState(
  paymentId: string,
  payload: BkashExecutePaymentResponse | BkashQueryPaymentResponse,
) {
  const rawStatus = payload.transactionStatus || payload.statusMessage || null;
  const normalized = String(rawStatus || '').toLowerCase();
  const trxId = payload.trxID || null;
  const amount = toPlainAmount(payload.amount);

  if (normalized === 'completed' || normalized === 'authorized' || payload.statusCode === '0000') {
    return finalizeBkashPaidPayment({
      paymentId,
      trxId,
      rawStatus,
      amount,
      verificationPayload: payload as unknown as Record<string, unknown>,
    });
  }

  const isCancelled =
    normalized.includes('cancel') ||
    normalized.includes('expired') ||
    payload.statusCode === '2062';
  const isFailed =
    normalized.includes('fail') ||
    normalized.includes('declin') ||
    normalized.includes('error') ||
    payload.statusCode === '2029';

  if (isCancelled || isFailed) {
    await markBkashPaymentCancelledOrFailed({
      paymentId,
      nextStatus: isCancelled ? 'cancelled' : 'failed',
      reason: rawStatus || (isCancelled ? 'payment_cancelled' : 'payment_failed'),
    });

    const updatedTransaction = await getBkashTransactionByPaymentId(paymentId);
    return {
      paymentId,
      orderId: updatedTransaction?.orderId ?? null,
      paymentStatus: isCancelled ? 'cancelled' : 'failed',
      trxId,
      rawStatus,
      amount,
      verified: false,
    } satisfies BkashVerificationResult;
  }

  const transaction = await getBkashTransactionByPaymentId(paymentId);
  return {
    paymentId,
    orderId: transaction?.orderId ?? null,
    paymentStatus: transaction?.status === 'cancelled' ? 'cancelled' : transaction?.status === 'failed' ? 'failed' : 'pending',
    trxId,
    rawStatus,
    amount,
    verified: false,
  } satisfies BkashVerificationResult;
}
