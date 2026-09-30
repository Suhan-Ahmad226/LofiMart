export const paymentsModule = {
  async handleWebhook(_params: {
    provider: string;
    signature?: string;
    rawBody: string;
    headers: Record<string, string>;
  }) {
    throw new Error('Payment webhook processing is not implemented; refusing to acknowledge the webhook.');
  },
};
