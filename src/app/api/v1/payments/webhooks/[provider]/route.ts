import { apiError, apiSuccess } from '@/src/lib/api-response';
import { logger } from '@/src/lib/logger';
import { paymentsModule } from '@/src/modules/payments';
import { captureError } from '@/src/services/monitoring/errorTracker';
import { secureApiRoute } from '@/src/server/next/apiSecurity';

export const runtime = 'nodejs';

const SUPPORTED_PROVIDERS = new Set(['stripe', 'sslcommerz']);

function headersToObject(headers: Headers) {
  return Object.fromEntries(headers.entries());
}

export async function POST(
  req: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const securityResult = await secureApiRoute(req, {
    keyPrefix: 'api:v1:payments:webhooks',
    limit: 120,
    enforceOriginForMutations: false,
  });
  if (securityResult instanceof Response) return securityResult;

  const params = await context.params;
  const provider = params.provider;

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return apiError('unsupported_provider', 'Unsupported payment provider', 404);
  }

  const rawBody = await req.text();

  try {
    const result = await paymentsModule.handleWebhook({
      provider: provider as 'stripe' | 'sslcommerz',
      signature: req.headers.get('stripe-signature') || undefined,
      rawBody,
      headers: headersToObject(req.headers),
    });

    logger.info('payments.webhook.processed', {
      provider,
      paymentId: result.paymentId,
      status: result.status,
    });

    return apiSuccess(
      {
        received: true,
        provider,
        paymentId: result.paymentId,
        status: result.status,
      },
      { status: 202 },
    );
  } catch (error) {
    captureError(error, {
      scope: 'payments.webhook',
      metadata: { provider },
    });

    return apiError('webhook_processing_failed', 'Failed to process payment webhook', 400, {
      provider,
    });
  }
}
