export type PaymentProvider = 'stripe' | 'sslcommerz';

export type CreatePaymentRequest = {
  provider: PaymentProvider;
  amount: number;
  currency: string;
  orderId?: string;
  customerId?: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
};

export type PaymentIntentResult = {
  provider: PaymentProvider;
  paymentId: string;
  clientSecret?: string;
  checkoutUrl?: string;
  status: 'requires_action' | 'processing' | 'succeeded' | 'failed';
};

export type RefundRequest = {
  transactionId: string;
  amount?: number;
  reason?: string;
};

export type RefundResult = {
  refundId: string;
  status: 'pending' | 'succeeded' | 'failed';
};

export type PaymentWebhookPayload = {
  provider: PaymentProvider;
  signature?: string;
  rawBody: string;
  headers: Record<string, string>;
};

export type PaymentTransactionRecord = {
  id: string;
  provider: PaymentProvider;
  paymentId: string;
  orderId?: string | null;
  customerId?: string | null;
  amount: number;
  currency: string;
  status: string;
  metadata?: Record<string, string> | null;
};

export interface PaymentGateway {
  provider: PaymentProvider;
  createPayment(request: CreatePaymentRequest): Promise<PaymentIntentResult>;
  refund(request: RefundRequest): Promise<RefundResult>;
  parseWebhook(payload: PaymentWebhookPayload): Promise<{
    eventType: string;
    paymentId: string;
    status: string;
    amount?: number;
    orderId?: string;
    metadata?: Record<string, string>;
  }>;
}

export interface PaymentRepository {
  findByIdempotencyKey(key: string): Promise<PaymentTransactionRecord | null>;
  saveTransaction(input: {
    provider: PaymentProvider;
    paymentId: string;
    orderId?: string;
    customerId?: string;
    amount: number;
    currency: string;
    status: string;
    idempotencyKey: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentTransactionRecord>;
  updateTransactionStatus(paymentId: string, status: string, metadata?: Record<string, string>): Promise<void>;
  logRefund(input: {
    transactionId: string;
    providerRefundId: string;
    amount?: number;
    reason?: string;
    status: string;
  }): Promise<void>;
}
