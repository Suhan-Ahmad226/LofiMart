import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerEnv } from '../../../../../lib/env';
import { logger } from '../../../../../lib/logger';
import {
  executeBkashPayment,
  getBkashTransactionByPaymentId,
  markBkashPaymentCancelledOrFailed,
  queryBkashPayment,
  syncBkashOrderPaymentState,
} from '../../../../../features/pos/services/payments/bkash';
import { secureApiRoute } from '../../../../../server/next/apiSecurity';

export const runtime = 'nodejs';

const CallbackSchema = z.object({
  paymentID: z.string().min(1),
  status: z.enum(['success', 'failure', 'cancel']),
  signature: z.string().optional(),
});

function buildRedirect(pathname: string, searchParams: Record<string, string | null | undefined>) {
  const base = new URL(pathname, getServerEnv().FRONTEND_URL);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) {
      base.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(base);
}

export async function GET(req: Request) {
  const security = await secureApiRoute(req, {
    keyPrefix: 'api:payments:bkash:callback',
    limit: 120,
    windowMs: 60_000,
    enforceOriginForMutations: false,
  });
  if (security instanceof Response) return security;

  const url = new URL(req.url);
  const parsed = CallbackSchema.safeParse({
    paymentID: url.searchParams.get('paymentID') || '',
    status: url.searchParams.get('status') || '',
    signature: url.searchParams.get('signature') || undefined,
  });

  if (!parsed.success) {
    logger.warn('payments.bkash.callback.invalid', {
      query: url.search,
    });
    return buildRedirect('/payment/bkash/fail', {
      reason: 'invalid_callback',
    });
  }

  const { paymentID, status } = parsed.data;
  const transaction = await getBkashTransactionByPaymentId(paymentID);

  if (!transaction?.orderId) {
    return buildRedirect('/payment/bkash/fail', {
      paymentId: paymentID,
      reason: 'unknown_payment',
    });
  }

  if (transaction.status === 'paid') {
    return buildRedirect('/payment/bkash/success', {
      paymentId: paymentID,
      orderId: transaction.orderId,
    });
  }

  if (status === 'cancel') {
    await markBkashPaymentCancelledOrFailed({
      paymentId: paymentID,
      nextStatus: 'cancelled',
      reason: 'customer_cancelled',
    });

    return buildRedirect('/payment/bkash/cancel', {
      paymentId: paymentID,
      orderId: transaction.orderId,
    });
  }

  if (status === 'failure') {
    await markBkashPaymentCancelledOrFailed({
      paymentId: paymentID,
      nextStatus: 'failed',
      reason: 'payment_failed',
    });

    return buildRedirect('/payment/bkash/fail', {
      paymentId: paymentID,
      orderId: transaction.orderId,
      reason: 'payment_failed',
    });
  }

  try {
    // Security-critical: successful browser callbacks are never trusted by themselves.
    // We always perform a server-to-server execute, and fall back to query verification
    // before we mark an order as paid.
    const executeResult = await executeBkashPayment(paymentID);
    const payment = await syncBkashOrderPaymentState(paymentID, executeResult);

    if (payment.verified) {
      return buildRedirect('/payment/bkash/success', {
        paymentId: paymentID,
        orderId: payment.orderId,
        trxId: payment.trxId,
      });
    }
  } catch (error) {
    logger.warn('payments.bkash.callback.execute_retry', {
      paymentId: paymentID,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  try {
    const queryResult = await queryBkashPayment(paymentID);
    const payment = await syncBkashOrderPaymentState(paymentID, queryResult);

    if (payment.verified) {
      return buildRedirect('/payment/bkash/success', {
        paymentId: paymentID,
        orderId: payment.orderId,
        trxId: payment.trxId,
      });
    }
  } catch (error) {
    logger.error('payments.bkash.callback.verify_failed', {
      paymentId: paymentID,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  return buildRedirect('/payment/bkash/fail', {
    paymentId: paymentID,
    orderId: transaction.orderId,
    reason: 'verification_failed',
  });
}
