import type { DomainEvent } from './contracts';

export function shipmentBookedEvent(payload: {
  orderId: string;
  providerCode: string;
  trackingId: string;
  bookingMode: 'manual' | 'api';
}): DomainEvent<typeof payload> {
  return {
    name: 'logistics.shipment.booked',
    occurredAt: new Date().toISOString(),
    payload,
  };
}
