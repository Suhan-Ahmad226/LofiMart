import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  paymentTransaction: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/server', () => ({
  prisma: prismaMock,
}));

vi.mock('@/src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  markBkashPaymentCancelledOrFailed,
  syncBkashOrderPaymentState,
} from '@/src/services/payments/bkash/order-state';

describe('bKash order state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores reserved stock once when a pending bKash payment fails', async () => {
    const transaction = {
      id: 'txn-1',
      paymentId: 'pay-1',
      orderId: 'order-1',
      status: 'pending',
      metadata: {},
    };
    const tx = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'order-1',
          items: [
            { productId: 'product-1', qty: 2 },
            { productId: 'product-2', qty: 1 },
          ],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      paymentTransaction: {
        update: vi.fn().mockResolvedValue({ ...transaction, status: 'failed' }),
      },
      product: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    prismaMock.paymentTransaction.findFirst.mockResolvedValue(transaction);
    prismaMock.$transaction.mockImplementation((callback) => callback(tx));

    await markBkashPaymentCancelledOrFailed({
      paymentId: 'pay-1',
      nextStatus: 'failed',
      reason: 'payment_failed',
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        status: {
          notIn: ['cancelled', 'payment_failed'],
        },
      },
      data: {
        paymentStatus: 'failed',
        status: 'payment_failed',
        failureReason: 'payment_failed',
      },
    });
    expect(tx.product.update).toHaveBeenCalledTimes(2);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { stock: { increment: 2 } },
    });
  });

  it('does not restore stock again for duplicate fail or cancel callbacks', async () => {
    const transaction = {
      id: 'txn-1',
      paymentId: 'pay-1',
      orderId: 'order-1',
      status: 'failed',
      metadata: { callbackReason: 'payment_failed' },
    };
    const tx = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'order-1',
          items: [{ productId: 'product-1', qty: 2 }],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      paymentTransaction: {
        update: vi.fn().mockResolvedValue(transaction),
      },
      product: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    prismaMock.paymentTransaction.findFirst.mockResolvedValue(transaction);
    prismaMock.$transaction.mockImplementation((callback) => callback(tx));

    await markBkashPaymentCancelledOrFailed({
      paymentId: 'pay-1',
      nextStatus: 'failed',
      reason: 'payment_failed',
    });

    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('settles explicit bKash failure query results instead of leaving them pending', async () => {
    const transaction = {
      id: 'txn-1',
      paymentId: 'pay-1',
      orderId: 'order-1',
      status: 'pending',
      metadata: {},
    };
    const tx = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'order-1',
          items: [{ productId: 'product-1', qty: 1 }],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      paymentTransaction: {
        update: vi.fn().mockResolvedValue({ ...transaction, status: 'failed' }),
      },
      product: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    prismaMock.paymentTransaction.findFirst.mockResolvedValue(transaction);
    prismaMock.$transaction.mockImplementation((callback) => callback(tx));

    const result = await syncBkashOrderPaymentState('pay-1', {
      paymentID: 'pay-1',
      statusCode: '2029',
      statusMessage: 'Payment failed',
      amount: '100.00',
      transactionStatus: 'Failed',
    });

    expect(result).toMatchObject({
      paymentId: 'pay-1',
      orderId: 'order-1',
      paymentStatus: 'failed',
      verified: false,
    });
    expect(tx.product.update).toHaveBeenCalledTimes(1);
  });
});
