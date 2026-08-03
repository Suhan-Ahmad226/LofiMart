import { eventPublisher } from '../../events/publisher';
import { createPaymentsModule } from './application';
import { StripeGateway } from '../../features/pos/services/payments/stripeGateway';
import { SSLCommerzGateway } from '../../features/pos/services/payments/sslcommerzGateway';
import { PrismaPaymentRepository } from '../../features/pos/services/payments/prismaPaymentRepository';

export const paymentsModule = createPaymentsModule({
  gateways: {
    stripe: new StripeGateway(),
    sslcommerz: new SSLCommerzGateway(),
  },
  repository: new PrismaPaymentRepository(),
  publisher: eventPublisher,
});
