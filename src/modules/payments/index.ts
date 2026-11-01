import { prismaDirect } from '../../features/shared/services/database/prisma';
import { logger } from '../../lib/logger';

export type PaymentWebhookResult = {
  paymentId: string;
  status: string;
  orderId: string | null;
};

export const paymentsModule = {
  async handleWebhook(params: {
    provider: string;
    signature?: string;
    rawBody: string;
    headers: Record<string, string>;
  }): Promise<PaymentWebhookResult> {
    const { provider, rawBody } = params;

    let payload: Record<string, any> = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // In case of form-urlencoded body (e.g., standard SSLCommerz IPN POST)
      const parsedParams = new URLSearchParams(rawBody);
      payload = Object.fromEntries(parsedParams.entries());
    }

    let paymentId = '';
    let orderId: string | null = null;
    let paymentStatus: 'paid' | 'failed' | 'unpaid' = 'unpaid';
    let amount = 0;
    let currency = 'BDT';

    if (provider === 'stripe') {
      const eventType = payload.type || '';
      const eventData = payload.data?.object || {};

      paymentId = eventData.id || payload.id || `stripe_${Date.now()}`;
      orderId = eventData.metadata?.orderId || eventData.client_reference_id || null;
      amount = Number(eventData.amount_total ? eventData.amount_total / 100 : eventData.amount ? eventData.amount / 100 : 0);
      currency = String(eventData.currency || 'USD').toUpperCase();

      if (
        eventType === 'checkout.session.completed' ||
        eventType === 'payment_intent.succeeded' ||
        eventType === 'charge.succeeded'
      ) {
        paymentStatus = 'paid';
      } else if (eventType === 'payment_intent.payment_failed' || eventType === 'charge.failed') {
        paymentStatus = 'failed';
      } else {
        // Other informational events (charge.updated, customer.created, etc.)
        return {
          paymentId,
          status: 'acknowledged',
          orderId,
        };
      }
    } else if (provider === 'sslcommerz') {
      paymentId = payload.val_id || payload.bank_tran_id || payload.tran_id || `ssl_${Date.now()}`;
      orderId = payload.tran_id || payload.value_a || null;
      amount = Number(payload.amount || payload.store_amount || 0);
      currency = String(payload.currency || 'BDT').toUpperCase();

      const sslStatus = String(payload.status || '').toUpperCase();
      if (sslStatus === 'VALID' || sslStatus === 'VALIDATED') {
        paymentStatus = 'paid';
      } else if (sslStatus === 'FAILED' || sslStatus === 'CANCELLED') {
        paymentStatus = 'failed';
      } else {
        paymentStatus = 'unpaid';
      }
    } else {
      // Generic provider fallback
      paymentId = payload.paymentId || payload.transactionId || payload.id || `tx_${Date.now()}`;
      orderId = payload.orderId || payload.merchantRef || null;
      amount = Number(payload.amount || 0);
      paymentStatus = payload.status === 'success' || payload.status === 'paid' ? 'paid' : 'unpaid';
    }

    // Reconcile order in database if orderId is identified
    if (orderId && paymentStatus === 'paid') {
      try {
        const order = await prismaDirect.order.findFirst({
          where: {
            OR: [
              { id: orderId },
              { orderCode: orderId },
            ],
          },
        });

        if (order) {
          await prismaDirect.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'paid',
              paymentProvider: provider,
              paymentMethod: provider,
              paidAt: new Date(),
            },
          });

          // Log payment transaction record
          try {
            await prismaDirect.paymentTransaction.upsert({
              where: { paymentId },
              create: {
                paymentId,
                provider,
                orderId: order.id,
                customerId: order.userId ?? null,
                amount: amount || order.total,
                currency,
                status: 'paid',
                idempotencyKey: `webhook:${provider}:${paymentId}`,
                metadata: payload,
              },
              update: {
                status: 'paid',
                metadata: payload,
              },
            });
          } catch (txErr) {
            logger.warn('Failed to upsert PaymentTransaction, continuing', { txErr });
          }

          logger.info('Payment reconciled via webhook', { orderId: order.id, provider, paymentId });
          return {
            paymentId,
            status: 'paid',
            orderId: order.id,
          };
        }
      } catch (dbErr) {
        logger.error('Error reconciling order payment from webhook', { error: dbErr, orderId, provider });
      }
    }

    return {
      paymentId,
      status: paymentStatus,
      orderId,
    };
  },
};
