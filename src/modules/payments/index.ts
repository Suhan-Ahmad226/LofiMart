export const paymentsModule = {
  async handleWebhook(params: {
    provider: string;
    signature?: string;
    rawBody: string;
    headers: Record<string, string>;
  }) {
    return {
      paymentId: 'stub-payment-id',
      status: 'unknown',
      orderId: null,
    };
  },
};
