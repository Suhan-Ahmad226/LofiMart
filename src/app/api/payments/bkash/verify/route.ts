import { z } from 'zod';
import { apiError, apiSuccess } from '../../../../../lib/api-response';
import { logger } from '../../../../../lib/logger';
import { prisma } from '@/lib/server';
import {
  getBkashTransactionByPaymentId,
  queryBkashPayment,
  syncBkashOrderPaymentState,
} from '../../../../../features/pos/services/payments/bkash';
import { secureApiRoute } from '../../../../../server/next/apiSecurity';

export const runtime = 'nodejs';

const VerifyBkashSchema = z.object({
  paymentId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
}).refine((value) => value.paymentId || value.orderId, {
  message: 'Provide paymentId or orderId',
  path: ['paymentId'],
});

export async function POST(req: Request) {
  const security = await secureApiRoute(req, {
    keyPrefix: 'api:payments:bkash:verify',
    limit: 40,
    windowMs: 60_000,
    requireAuth: true,
  });
  if (security instanceof Response) return security;

  try {
    const body = VerifyBkashSchema.parse(await req.json());
    const userId = String(security.id);

    let paymentId = body.paymentId || '';
    if (!paymentId && body.orderId) {
      const order = await prisma.order.findFirst({
        where: {
          id: body.orderId,
          userId,
        },
        select: {
          paymentIntentId: true,
        },
      });

      if (!order?.paymentIntentId) {
        return apiError('payment_not_found', 'No bKash payment found for this order', 404);
      }

      paymentId = order.paymentIntentId;
    }

    const transaction = await getBkashTransactionByPaymentId(paymentId);
    if (!transaction?.orderId) {
      return apiError('payment_not_found', 'bKash payment reference not found', 404);
    }

    const order = await prisma.order.findFirst({
      where: {
        id: transaction.orderId,
        userId,
      },
    });

    if (!order) {
      return apiError('order_not_found', 'Order not found', 404);
    }

    const verification = await queryBkashPayment(paymentId);
    const result = await syncBkashOrderPaymentState(paymentId, verification);

    logger.info('payments.bkash.verify.completed', {
      orderId: transaction.orderId,
      paymentId,
      paymentStatus: result.paymentStatus,
      trxId: result.trxId,
    });

    return apiSuccess(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError('invalid_payload', 'Invalid verification payload', 400, error.issues);
    }

    logger.error('payments.bkash.verify.failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return apiError('bkash_verify_failed', error instanceof Error ? error.message : 'Failed to verify bKash payment', 500);
  }
}
