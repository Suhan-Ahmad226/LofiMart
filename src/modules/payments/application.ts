import { paymentCompletedEvent } from '../../events/commerce';
import type { EventPublisher } from '../../events/contracts';
import { enqueueEmail, enqueueNotification, enqueuePaymentProcessing } from '../../workers/queue';
import type {
  CreatePaymentRequest,
  PaymentGateway,
  PaymentProvider,
  PaymentRepository,
  PaymentWebhookPayload,
  RefundRequest,
} from './contracts';

export function createPaymentsModule(dependencies: {
  gateways: Record<PaymentProvider, PaymentGateway>;
  repository: PaymentRepository;
  publisher: EventPublisher;
}) {
  const { gateways, repository, publisher } = dependencies;

  return {
    async createPayment(request: CreatePaymentRequest) {
      const existing = await repository.findByIdempotencyKey(request.idempotencyKey);
      if (existing) {
        return {
          provider: existing.provider,
          paymentId: existing.paymentId,
          status: existing.status as 'requires_action' | 'processing' | 'succeeded' | 'failed',
        };
      }

      const gateway = gateways[request.provider];
      const intent = await gateway.createPayment(request);

      await repository.saveTransaction({
        provider: request.provider,
        paymentId: intent.paymentId,
        orderId: request.orderId,
        customerId: request.customerId,
        amount: request.amount,
        currency: request.currency,
        status: intent.status,
        idempotencyKey: request.idempotencyKey,
        metadata: request.metadata,
      });

      return intent;
    },

    async handleWebhook(payload: PaymentWebhookPayload) {
      const gateway = gateways[payload.provider];
      const event = await gateway.parseWebhook(payload);

      await repository.updateTransactionStatus(event.paymentId, event.status, event.metadata);

      if (event.status === 'succeeded') {
        await enqueuePaymentProcessing({
          paymentId: event.paymentId,
          provider: payload.provider,
          orderId: event.orderId,
        });

        if (event.orderId) {
          await enqueueEmail({
            to: event.metadata?.customerEmail || 'ops@local.invalid',
            subject: 'Payment received',
            template: 'payment-completed',
            payload: {
              orderId: event.orderId,
              paymentId: event.paymentId,
            },
          });
        }

        if (event.metadata?.userId) {
          await enqueueNotification({
            userId: event.metadata.userId,
            channel: 'in-app',
            message: `Payment completed for ${event.orderId || event.paymentId}`,
          });
        }

        await publisher.publish(
          paymentCompletedEvent({
            transactionId: event.paymentId,
            orderId: event.orderId,
            provider: payload.provider,
            amount: event.amount ?? 0,
          }),
        );
      }

      return event;
    },

    async refundPayment(provider: PaymentProvider, request: RefundRequest) {
      const gateway = gateways[provider];
      const refund = await gateway.refund(request);

      await repository.logRefund({
        transactionId: request.transactionId,
        providerRefundId: refund.refundId,
        amount: request.amount,
        reason: request.reason,
        status: refund.status,
      });

      return refund;
    },
  };
}
