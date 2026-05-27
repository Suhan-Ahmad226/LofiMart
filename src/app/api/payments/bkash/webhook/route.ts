import { apiError, apiSuccess } from '@/src/lib/api-response';
import { getServerEnv } from '@/src/lib/env';
import { logger } from '@/src/lib/logger';
import {
  getBkashTransactionByPaymentId,
  queryBkashPayment,
  syncBkashOrderPaymentState,
} from '@/src/services/payments/bkash';
import { secureApiRoute } from '@/src/server/next/apiSecurity';

export const runtime = 'nodejs';

type SnsEnvelope = {
  Type?: string;
  TopicArn?: string;
  Message?: string;
  SubscribeURL?: string;
};

function extractPaymentId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  if (typeof record.paymentID === 'string' && record.paymentID) return record.paymentID;
  if (typeof record.paymentId === 'string' && record.paymentId) return record.paymentId;

  for (const value of Object.values(record)) {
    const nested = extractPaymentId(value);
    if (nested) return nested;
  }

  return null;
}

export async function POST(req: Request) {
  const security = await secureApiRoute(req, {
    keyPrefix: 'api:payments:bkash:webhook',
    limit: 120,
    windowMs: 60_000,
    enforceOriginForMutations: false,
  });
  if (security instanceof Response) return security;

  const rawBody = await req.text();

  try {
    const body = JSON.parse(rawBody) as SnsEnvelope;
    const env = getServerEnv();

    if (env.BKASH_WEBHOOK_TOPIC_ARN && body.TopicArn && body.TopicArn !== env.BKASH_WEBHOOK_TOPIC_ARN) {
      return apiError('invalid_topic', 'Unexpected bKash webhook topic', 403);
    }

    if (body.Type === 'SubscriptionConfirmation' && body.SubscribeURL?.startsWith('https://')) {
      await fetch(body.SubscribeURL, { method: 'GET', cache: 'no-store' });
      logger.info('payments.bkash.webhook.subscription_confirmed', {
        topicArn: body.TopicArn,
      });
      return apiSuccess({ received: true, type: body.Type });
    }

    if (body.Type !== 'Notification') {
      return apiSuccess({ received: true, type: body.Type || 'unknown', ignored: true });
    }

    const messagePayload = body.Message ? JSON.parse(body.Message) : {};
    const paymentId = extractPaymentId(messagePayload);

    if (!paymentId) {
      logger.warn('payments.bkash.webhook.missing_payment', { body });
      return apiSuccess({ received: true, ignored: true });
    }

    const transaction = await getBkashTransactionByPaymentId(paymentId);
    if (!transaction) {
      logger.warn('payments.bkash.webhook.unknown_payment', { paymentId });
      return apiSuccess({ received: true, ignored: true, paymentId });
    }

    const verification = await queryBkashPayment(paymentId);
    const result = await syncBkashOrderPaymentState(paymentId, verification);

    logger.info('payments.bkash.webhook.processed', {
      paymentId,
      orderId: result.orderId,
      paymentStatus: result.paymentStatus,
      verified: result.verified,
    });

    return apiSuccess({
      received: true,
      paymentId,
      paymentStatus: result.paymentStatus,
      verified: result.verified,
    });
  } catch (error) {
    logger.error('payments.bkash.webhook.failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return apiError('bkash_webhook_failed', 'Failed to process bKash webhook', 400);
  }
}
