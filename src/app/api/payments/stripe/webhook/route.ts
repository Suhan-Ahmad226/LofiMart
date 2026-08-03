import { apiError, apiSuccess } from '../../../../../lib/api-response';
import { logger } from '../../../../../lib/logger';
import { paymentsModule } from '../../../../../modules/payments';
import { captureError } from '../../../../../features/shared/services/monitoring/errorTracker';
import { secureApiRoute } from '../../../../../server/next/apiSecurity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function headersToObject(headers: Headers) {
  return Object.fromEntries(headers.entries());
}

export async function POST(req: Request) {
  const securityResult = await secureApiRoute(req, {
    keyPrefix: 'api:payments:stripe:webhook',
    limit: 120,
    enforceOriginForMutations: false,
  });
  if (securityResult instanceof Response) return securityResult;

  const rawBody = await req.text();

  try {
    const result = await paymentsModule.handleWebhook({
      provider: 'stripe',
      signature: req.headers.get('stripe-signature') || undefined,
      rawBody,
      headers: headersToObject(req.headers),
    });

    logger.info('payments.stripe.webhook.processed', {
      paymentId: result.paymentId,
      status: result.status,
      orderId: result.orderId,
    });

    return apiSuccess(
      {
        received: true,
        provider: 'stripe',
        paymentId: result.paymentId,
        status: result.status,
      },
      { status: 202 },
    );
  } catch (error) {
    captureError(error, {
      scope: 'payments.stripe.webhook',
    });

    return apiError('stripe_webhook_processing_failed', 'Failed to process Stripe webhook', 400);
  }
}
