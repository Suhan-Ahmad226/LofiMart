import { eventPublisher } from '../../events/publisher';
import { createPaymentsModule } from './application';
import { StripeGateway } from '../../services/payments/stripeGateway';
import { SSLCommerzGateway } from '../../services/payments/sslcommerzGateway';
import { PrismaPaymentRepository } from '../../services/payments/prismaPaymentRepository';

export const paymentsModule = createPaymentsModule({
  gateways: {
    stripe: new StripeGateway(),
    sslcommerz: new SSLCommerzGateway(),
  },
  repository: new PrismaPaymentRepository(),
  publisher: eventPublisher,
});
