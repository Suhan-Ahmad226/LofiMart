import { z } from 'zod';
import { apiError, apiSuccess } from '../../../../../lib/api-response';
import { logger } from '../../../../../lib/logger';
import { prisma } from '@/lib/server';
import {
  executeBkashPayment,
  getBkashTransactionByPaymentId,
  syncBkashOrderPaymentState,
} from '../../../../../features/pos/services/payments/bkash';
import { secureApiRoute } from '../../../../../server/next/apiSecurity';

export const runtime = 'nodejs';

const ExecuteBkashSchema = z.object({
  paymentId: z.string().min(1),
});

export async function POST(req: Request) {
  const security = await secureApiRoute(req, {
    keyPrefix: 'api:payments:bkash:execute',
    limit: 30,
    windowMs: 60_000,
    requireAuth: true,
  });
  if (security instanceof Response) return security;

  try {
    const body = ExecuteBkashSchema.parse(await req.json());
    const userId = String(security.id);

    const transaction = await getBkashTransactionByPaymentId(body.paymentId);
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

    if (transaction.status === 'paid') {
      return apiSuccess({
        paymentId: transaction.paymentId,
        orderId: transaction.orderId,
        paymentStatus: 'paid',
        verified: true,
      });
    }

    const executed = await executeBkashPayment(body.paymentId);
    const result = await syncBkashOrderPaymentState(body.paymentId, executed);

    logger.info('payments.bkash.execute.completed', {
      orderId: transaction.orderId,
      paymentId: body.paymentId,
      paymentStatus: result.paymentStatus,
      trxId: result.trxId,
    });

    return apiSuccess(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError('invalid_payload', 'Invalid execute payment payload', 400, error.issues);
    }

    logger.error('payments.bkash.execute.failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return apiError('bkash_execute_failed', error instanceof Error ? error.message : 'Failed to execute bKash payment', 500);
  }
}
