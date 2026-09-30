import { describe, expect, it } from 'vitest';
import { deriveOrderStatus } from './orderStatusService';

describe('deriveOrderStatus', () => {
  it('keeps a marketplace order processing until shipment progress exists', () => {
    expect(deriveOrderStatus(['processing', 'ready_for_pickup'])).toBe('ready_for_pickup');
  });

  it('does not mark a multi-shipment order delivered until every shipment is delivered', () => {
    expect(deriveOrderStatus(['delivered', 'in_transit'])).toBe('in_transit');
  });

  it('marks a fully cancelled aggregate cancelled', () => {
    expect(deriveOrderStatus(['cancelled', 'cancelled'])).toBe('cancelled');
  });

  it('surfaces returned/failed terminal exceptions instead of false delivered', () => {
    expect(deriveOrderStatus(['delivered', 'returned'])).toBe('returned');
    expect(deriveOrderStatus(['delivered', 'delivery_failed'])).toBe('delivery_failed');
  });

  it('uses the furthest valid courier progress state', () => {
    expect(deriveOrderStatus(['picked_up', 'out_for_delivery'])).toBe('out_for_delivery');
  });
});
