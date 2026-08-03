import crypto from 'crypto';
import { z } from 'zod';
import { apiError, apiSuccess } from '../../../../../lib/api-response';
import { getServerEnv } from '../../../../../lib/env';
import { logger } from '../../../../../lib/logger';
import { prisma } from '@/lib/server';
import { isCheckoutPaymentMethodEnabled } from '../../../../../features/shared/services/platform/commerceChannels';
import {
  createBkashPayment,
  createBkashRequestKey,
  createOrReuseBkashPendingPayment,
  createSecureMerchantInvoiceNumber,
  getExistingBkashTransactionForOrder,
} from '../../../../../features/pos/services/payments/bkash';
import { secureApiRoute } from '../../../../../server/next/apiSecurity';

export const runtime = 'nodejs';

const InitiateBkashSchema = z.object({
  orderId: z.string().min(1),
  agreementId: z.string().min(1),
  payerReference: z.string().trim().min(1).max(255).optional(),
});

export async function POST(req: Request) {
  const security = await secureApiRoute(req, {
    keyPrefix: 'api:payments:bkash:initiate',
    limit: 20,
    windowMs: 60_000,
    requireAuth: true,
  });
  if (security instanceof Response) return security;

  try {
    if (!(await isCheckoutPaymentMethodEnabled('bkash'))) {
      return apiError('bkash_disabled', 'bKash payments are temporarily disabled.', 403);
    }

    const body = InitiateBkashSchema.parse(await req.json());
    const userId = String(security.id);
    const env = getServerEnv();

    const order = await prisma.order.findFirst({
      where: {
        id: body.orderId,
        userId,
      },
      include: {
        user: {
          select: {
            phone: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      return apiError('order_not_found', 'Order not found', 404);
    }

    if (order.paymentStatus === 'paid') {
      return apiError('already_paid', 'This order is already paid.', 409);
    }

    const existing = await getExistingBkashTransactionForOrder(order.id);
    const existingMetadata = (existing?.metadata as Record<string, string> | null) ?? null;

    if (existing && ['pending', 'processing', 'requires_action'].includes(existing.status) && existingMetadata?.checkoutUrl) {
      return apiSuccess({
        paymentId: existing.paymentId,
        checkoutUrl: existingMetadata.checkoutUrl,
        orderId: order.id,
        status: existing.status,
        reused: true,
      });
    }

    const merchantInvoiceNumber =
      existingMetadata?.merchantInvoiceNumber || createSecureMerchantInvoiceNumber(order.id);
    const callbackURL = new URL('/api/payments/bkash/callback', env.FRONTEND_URL).toString();
    const payerReference = body.payerReference || order.user?.phone || `ORDER-${order.id}`;
    const requestKey = createBkashRequestKey(order.id, body.agreementId);

    const payment = await createBkashPayment(
      {
        mode: '0001',
        payerReference,
        callbackURL,
        amount: Number(order.total).toFixed(2),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber,
        agreementID: body.agreementId,
        merchantAssociationInfo: crypto.randomUUID(),
      },
      requestKey,
    );

    if (payment.statusCode !== '0000' || !payment.paymentID || !payment.bkashURL) {
      logger.warn('payments.bkash.initiate.rejected', {
        orderId: order.id,
        statusCode: payment.statusCode,
        statusMessage: payment.statusMessage,
      });
      return apiError('bkash_create_failed', payment.statusMessage || 'Failed to create bKash payment', 400, payment);
    }

    await createOrReuseBkashPendingPayment({
      orderId: order.id,
      customerId: userId,
      amount: Number(order.total),
      currency: 'BDT',
      paymentId: payment.paymentID,
      checkoutUrl: payment.bkashURL,
      agreementId: body.agreementId,
      payerReference,
      merchantInvoiceNumber,
      idempotencyKey: requestKey,
      callbackBaseUrl: callbackURL,
    });

    logger.info('payments.bkash.initiate.created', {
      orderId: order.id,
      paymentId: payment.paymentID,
      merchantInvoiceNumber,
    });

    return apiSuccess({
      paymentId: payment.paymentID,
      checkoutUrl: payment.bkashURL,
      orderId: order.id,
      status: 'pending',
      provider: 'bkash',
      callbackUrl: callbackURL,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError('invalid_payload', 'Invalid bKash initiate payload', 400, error.issues);
    }

    logger.error('payments.bkash.initiate.failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return apiError('bkash_initiate_failed', error instanceof Error ? error.message : 'Failed to initiate bKash payment', 500);
  }
}
