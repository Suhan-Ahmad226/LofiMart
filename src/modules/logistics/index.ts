import { eventPublisher } from '../../events/publisher';
import { shipmentBookedEvent } from '../../events/logistics';
import { createLogisticsModule } from './application';
import { courierProviderRegistry } from '../../features/courier/services/providerRegistry';

const moduleCore = createLogisticsModule({
  registry: courierProviderRegistry,
});

export const logisticsModule = {
  listProviders: moduleCore.listProviders,
  async bookShipment(input: Parameters<typeof moduleCore.bookShipment>[0]) {
    const booking = await moduleCore.bookShipment(input);

    await eventPublisher.publish(
      shipmentBookedEvent({
        orderId: input.orderId,
        providerCode: booking.providerCode,
        trackingId: booking.trackingId,
        bookingMode: booking.bookingMode,
      }),
    );

    return booking;
  },
};
