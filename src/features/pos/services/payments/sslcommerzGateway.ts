import type {
  CreatePaymentRequest,
  PaymentGateway,
  PaymentIntentResult,
  PaymentWebhookPayload,
  RefundResult,
  RefundRequest,
} from '@/src/modules/payments/contracts';

export class SSLCommerzGateway implements PaymentGateway {
  provider = 'sslcommerz' as const;

  async createPayment(request: CreatePaymentRequest): Promise<PaymentIntentResult> {
    return {
      provider: this.provider,
      paymentId: `sslcz_${request.idempotencyKey}`,
      checkoutUrl: `https://sandbox.sslcommerz.com/payment/${request.idempotencyKey}`,
      status: 'requires_action',
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    return {
      refundId: `sslcz_refund_${request.transactionId}`,
      status: 'pending',
    };
  }

  async parseWebhook(payload: PaymentWebhookPayload) {
    const body = JSON.parse(payload.rawBody || '{}') as Record<string, unknown>;

    return {
      eventType: String(body.event || 'payment.updated'),
      paymentId: String(body.tran_id || body.paymentId || ''),
      status: String(body.status || 'processing').toLowerCase(),
      amount: body.amount ? Number(body.amount) : undefined,
      orderId: body.orderId ? String(body.orderId) : undefined,
      metadata: Object.fromEntries(
        Object.entries(body)
          .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
          .map(([key, value]) => [key, String(value)]),
      ),
    };
  }
}
