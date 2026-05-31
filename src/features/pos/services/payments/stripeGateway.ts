import Stripe from 'stripe';
import { getServerEnv } from '@/src/lib/env';
import type {
  CreatePaymentRequest,
  PaymentGateway,
  PaymentIntentResult,
  PaymentWebhookPayload,
  RefundResult,
  RefundRequest,
} from '@/src/modules/payments/contracts';

function getStripeClient() {
  const { STRIPE_SECRET_KEY } = getServerEnv();
  return new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2026-03-25.dahlia',
  });
}

export class StripeGateway implements PaymentGateway {
  provider = 'stripe' as const;

  async createPayment(request: CreatePaymentRequest): Promise<PaymentIntentResult> {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(request.amount * 100),
      currency: request.currency.toLowerCase(),
      metadata: {
        orderId: request.orderId || '',
        customerId: request.customerId || '',
        ...request.metadata,
      },
    });

    return {
      provider: this.provider,
      paymentId: intent.id,
      clientSecret: intent.client_secret ?? undefined,
      status: intent.status === 'succeeded' ? 'succeeded' : 'requires_action',
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const stripe = getStripeClient();
    const refund = await stripe.refunds.create({
      payment_intent: request.transactionId,
      ...(request.amount ? { amount: Math.round(request.amount * 100) } : {}),
      ...(request.reason ? { reason: 'requested_by_customer' } : {}),
    });

    return {
      refundId: refund.id,
      status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
    };
  }

  async parseWebhook(payload: PaymentWebhookPayload) {
    const { STRIPE_WEBHOOK_SECRET } = getServerEnv();
    const stripe = getStripeClient();
    const signature = payload.signature || payload.headers['stripe-signature'];

    if (!signature || !STRIPE_WEBHOOK_SECRET) {
      throw new Error('Missing Stripe webhook signature or secret');
    }

    const event = stripe.webhooks.constructEvent(payload.rawBody, signature, STRIPE_WEBHOOK_SECRET);
    const intent = event.data.object as Stripe.PaymentIntent;

    return {
      eventType: event.type,
      paymentId: intent.id,
      status: intent.status === 'succeeded' ? 'succeeded' : intent.status,
      amount: typeof intent.amount === 'number' ? intent.amount / 100 : undefined,
      orderId: intent.metadata?.orderId,
      metadata: intent.metadata || undefined,
    };
  }
}
