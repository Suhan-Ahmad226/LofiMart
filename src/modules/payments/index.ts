export type PaymentWebhookResult = {
  paymentId: string;
  status: string;
  orderId: string | null;
};

export const paymentsModule = {
  async handleWebhook(_params: {
    provider: string;
    signature?: string;
    rawBody: string;
    headers: Record<string, string>;
  }): Promise<PaymentWebhookResult> {
    throw new Error('Payment webhook processing is not implemented; refusing to acknowledge the webhook.');
  },
};
