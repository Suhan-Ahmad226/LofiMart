import { prisma } from '../../../../features/shared/services/database/prisma';
import type { PaymentRepository } from '../../../../modules/payments/contracts';

export class PrismaPaymentRepository implements PaymentRepository {
  async findByIdempotencyKey(key: string) {
    const record = await prisma.paymentTransaction.findUnique({
      where: {
        idempotencyKey: key,
      },
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      provider: record.provider as 'stripe' | 'sslcommerz',
      paymentId: record.paymentId,
      orderId: record.orderId,
      customerId: record.customerId,
      amount: Number(record.amount),
      currency: record.currency,
      status: record.status,
      metadata: record.metadata as Record<string, string> | null,
    };
  }

  async saveTransaction(input: {
    provider: 'stripe' | 'sslcommerz';
    paymentId: string;
    orderId?: string;
    customerId?: string;
    amount: number;
    currency: string;
    status: string;
    idempotencyKey: string;
    metadata?: Record<string, string>;
  }) {
    const record = await prisma.paymentTransaction.create({
      data: {
        provider: input.provider,
        paymentId: input.paymentId,
        orderId: input.orderId,
        customerId: input.customerId,
        amount: input.amount,
        currency: input.currency,
        status: input.status,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
      },
    });

    return {
      id: record.id,
      provider: record.provider as 'stripe' | 'sslcommerz',
      paymentId: record.paymentId,
      orderId: record.orderId,
      customerId: record.customerId,
      amount: Number(record.amount),
      currency: record.currency,
      status: record.status,
      metadata: record.metadata as Record<string, string> | null,
    };
  }

  async updateTransactionStatus(paymentId: string, status: string, metadata?: Record<string, string>) {
    await prisma.paymentTransaction.updateMany({
      where: {
        paymentId,
      },
      data: {
        status,
        ...(metadata ? { metadata } : {}),
      },
    });
  }

  async logRefund(input: {
    transactionId: string;
    providerRefundId: string;
    amount?: number;
    reason?: string;
    status: string;
  }) {
    const transaction = await prisma.paymentTransaction.findFirst({
      where: {
        paymentId: input.transactionId,
      },
    });

    if (!transaction) {
      return;
    }

    await prisma.refund.create({
      data: {
        transactionId: transaction.id,
        providerRefundId: input.providerRefundId,
        amount: input.amount ?? Number(transaction.amount),
        reason: input.reason,
        status: input.status,
      },
    });
  }
}
