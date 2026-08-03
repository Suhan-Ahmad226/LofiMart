import type {
  CourierAdapter,
  CourierProviderView,
  ShipmentBookingInput,
  ShipmentBookingResult,
} from '../../../modules/logistics/contracts';

export class ManualCourierAdapter implements CourierAdapter {
  constructor(private readonly provider: CourierProviderView) {}

  getProvider(): CourierProviderView {
    return this.provider;
  }

  async bookShipment(input: ShipmentBookingInput): Promise<ShipmentBookingResult> {
    const prefix = this.provider.code.toUpperCase();
    const trackingId = `${prefix}-${Math.random().toString(36).slice(2, 11).toUpperCase()}`;

    return {
      providerCode: this.provider.code,
      providerName: this.provider.name,
      trackingId,
      bookingMode: this.provider.mode,
      status: 'pickup_requested',
      notes: `Manual booking prepared for ${input.customer.name || 'customer'} under merchant reference ${input.merchantReference}.`,
    };
  }
}
