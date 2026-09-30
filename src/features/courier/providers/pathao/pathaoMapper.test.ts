import { describe, expect, it } from 'vitest';

import {
  assertPathaoWeight,
  buildPathaoOrderPayload,
  buildPathaoPricePlanPayload,
  mapDeliverySpeedToPathao,
  mapItemTypeToPathao,
  mapPathaoStatus,
  normalizeBooleanFlag,
  parseProviderMoney,
  pickPathaoStatusString,
  resolvePathaoPricePlan,
} from './pathaoMapper';
import { PATHAO_DELIVERY_TYPE, PATHAO_ITEM_TYPE } from './pathaoConstants';
import { CourierValidationError } from '../../core/errors';
import type { CourierBookingRequest } from '../../core/contracts';

function buildRequest(overrides: Partial<CourierBookingRequest> = {}): CourierBookingRequest {
  return {
    orderId: 'order_1',
    shipmentId: 'ship_1',
    provider: 'pathao',
    merchantReference: 'LFM-ship_1',
    customer: {
      name: 'Ayesha Rahman',
      phone: '01712345678',
      secondaryPhone: '8801712345679',
      address: 'House 12, Road 5, Dhanmondi',
      city: 'Dhaka',
      location: { provider: 'pathao', cityId: 1, zoneId: 2, areaId: 3, label: 'Dhanmondi' },
    },
    pickup: {
      warehouseId: 'wh_1',
      store: { provider: 'pathao', externalStoreId: '554', externalStoreName: 'Mirpur Hub' },
      name: 'Mirpur Hub',
      contactName: 'Warehouse Admin',
      phone: '01812345678',
      address: 'House 7, Mirpur 10',
      city: 'Dhaka',
      location: { provider: 'pathao', cityId: 1, zoneId: 2, areaId: 3, label: 'Mirpur' },
    },
    parcel: {
      quantity: 2,
      weightKg: 1.5,
      itemType: 'parcel',
      deliverySpeed: 'standard',
      description: 'Cotton shirts',
      specialInstruction: 'Call before delivery',
    },
    codAmount: 2500,
    shipmentValue: 2200,
    ...overrides,
  };
}

describe('mapPathaoStatus', () => {
  it('maps every documented Pathao status slug', () => {
    const expectations: Array<[string, string]> = [
      ['Order Pickup Info Received', 'processing'],
      ['Parcel Info Received', 'in_transit'],
      ['Courier Request Accepted', 'pickup_requested'],
      ['Pickup Request Accepted', 'pickup_requested'],
      ['Parcel Received', 'ready_for_pickup'],
      ['Parcel Picked Up', 'picked_up'],
      ['In Transit', 'in_transit'],
      ['Parcel Out For Delivery', 'out_for_delivery'],
      ['Delivery Attempted', 'out_for_delivery'],
      ['Parcel Delivery Attempted', 'out_for_delivery'],
      ['Parcel Delivered', 'delivered'],
      ['Courier Reject', 'delivery_failed'],
      ['Parcel Returned', 'returned'],
      ['Order Pickup Info Cancelled', 'cancelled'],
      ['Pickup Request Cancelled', 'cancelled'],
      ['Parcel Canceled', 'cancelled'],
    ];

    for (const [pathaoStatus, internal] of expectations) {
      expect(mapPathaoStatus(pathaoStatus), `for "${pathaoStatus}"`).toBe(internal);
    }
  });

  it('is insensitive to case, spacing and punctuation', () => {
    expect(mapPathaoStatus('parcel_delivered')).toBe('delivered');
    expect(mapPathaoStatus('  PARCEL   PICKED   UP ')).toBe('picked_up');
    expect(mapPathaoStatus('Parcel-Delivered')).toBe('delivered');
  });

  it('returns null for unknown or missing statuses instead of guessing', () => {
    // The old implementation substring-matched, so any string containing
    // "deliver" became `delivered`. An unknown status must stay unmapped.
    expect(mapPathaoStatus('Parcel Quantum-Entangled')).toBeNull();
    expect(mapPathaoStatus('')).toBeNull();
    expect(mapPathaoStatus(null)).toBeNull();
    expect(mapPathaoStatus(undefined)).toBeNull();
    // A non-string must not be coerced into a status.
    expect(mapPathaoStatus(42 as unknown as string)).toBeNull();
  });

  it('does not treat a delivery attempt as a failure', () => {
    expect(mapPathaoStatus('Parcel Delivery Attempted')).toBe('out_for_delivery');
    expect(mapPathaoStatus('Parcel Delivery Attempted')).not.toBe('delivery_failed');
  });
});

describe('pickPathaoStatusString', () => {
  it('prefers the stable slug over the display string', () => {
    expect(
      pickPathaoStatusString({
        order_status_slug: 'Parcel Delivered',
        order_status: 'Parcel Delivered',
        event: 'Delivered',
      }),
    ).toBe('Parcel Delivered');
  });

  it('falls back through order_status then event', () => {
    expect(pickPathaoStatusString({ order_status: 'Parcel Picked Up' })).toBe('Parcel Picked Up');
    expect(pickPathaoStatusString({ event: 'Parcel Picked Up' })).toBe('Parcel Picked Up');
  });

  it('returns null when nothing usable is present', () => {
    expect(pickPathaoStatusString({ order_status_slug: '  ' })).toBeNull();
    expect(pickPathaoStatusString({})).toBeNull();
  });
});

describe('assertPathaoWeight', () => {
  it('accepts a weight inside the courier window and rounds to 2dp', () => {
    expect(assertPathaoWeight(1.5)).toBe(1.5);
    expect(assertPathaoWeight(0.5)).toBe(0.5);
    expect(assertPathaoWeight(10)).toBe(10);
    expect(assertPathaoWeight(1.239)).toBe(1.24);
  });

  it('rejects rather than clamping, so product data is never mutated', () => {
    expect(() => assertPathaoWeight(0.3)).toThrow(CourierValidationError);
    expect(() => assertPathaoWeight(12)).toThrow(CourierValidationError);
    expect(() => assertPathaoWeight(0)).toThrow(CourierValidationError);
    expect(() => assertPathaoWeight(-1)).toThrow(CourierValidationError);
    expect(() => assertPathaoWeight(Number.NaN)).toThrow(CourierValidationError);
  });
});

describe('buildPathaoOrderPayload', () => {
  it('sends the merchant reference so a retry is verifiable', () => {
    const payload = buildPathaoOrderPayload(buildRequest());
    expect(payload.merchant_order_id).toBe('LFM-ship_1');
  });

  it('translates speed and item type into Pathao codes', () => {
    const payload = buildPathaoOrderPayload(buildRequest());
    expect(payload.delivery_type).toBe(PATHAO_DELIVERY_TYPE.NORMAL);
    expect(payload.item_type).toBe(PATHAO_ITEM_TYPE.PARCEL);

    const express = buildPathaoOrderPayload(
      buildRequest({ parcel: { ...buildRequest().parcel, deliverySpeed: 'express' } }),
    );
    expect(express.delivery_type).toBe(PATHAO_DELIVERY_TYPE.ON_DEMAND);
  });

  it('normalises phone numbers to the local 11-digit form', () => {
    const payload = buildPathaoOrderPayload(buildRequest());
    expect(payload.recipient_phone).toBe('01712345678');
    expect(payload.recipient_secondary_phone).toBe('01712345679');
  });

  it('omits an absent secondary phone rather than sending an empty string', () => {
    const payload = buildPathaoOrderPayload(
      buildRequest({
        customer: { ...buildRequest().customer, secondaryPhone: null },
      }),
    );
    expect('recipient_secondary_phone' in payload).toBe(false);
  });

  it('collects the COD amount, not the shipment value', () => {
    const payload = buildPathaoOrderPayload(buildRequest());
    expect(payload.amount_to_collect).toBe(2500);
  });

  it('fails when the recipient location is not mapped, never defaulting to a city', () => {
    expect(() =>
      buildPathaoOrderPayload(
        buildRequest({
          customer: { ...buildRequest().customer, location: null },
        }),
      ),
    ).toThrow(/not mapped/i);

    expect(() =>
      buildPathaoOrderPayload(
        buildRequest({
          customer: {
            ...buildRequest().customer,
            location: { provider: 'pathao', cityId: 1, zoneId: null, areaId: null },
          },
        }),
      ),
    ).toThrow(/partially mapped/i);
  });

  it('fails when the pickup store is missing or malformed', () => {
    expect(() =>
      buildPathaoOrderPayload(
        buildRequest({ pickup: { ...buildRequest().pickup, store: null } }),
      ),
    ).toThrow(/pickup store/i);

    expect(() =>
      buildPathaoOrderPayload(
        buildRequest({
          pickup: {
            ...buildRequest().pickup,
            store: { provider: 'pathao', externalStoreId: 'not-a-number' },
          },
        }),
      ),
    ).toThrow(/invalid/i);
  });

  it('rejects a malformed recipient phone instead of forwarding it', () => {
    expect(() =>
      buildPathaoOrderPayload(
        buildRequest({ customer: { ...buildRequest().customer, phone: '12345' } }),
      ),
    ).toThrow(CourierValidationError);
  });

  it('rejects out-of-range text fields before hitting the API', () => {
    expect(() =>
      buildPathaoOrderPayload(
        buildRequest({ customer: { ...buildRequest().customer, name: 'Al' } }),
      ),
    ).toThrow(/too short/i);

    expect(() =>
      buildPathaoOrderPayload(
        buildRequest({ customer: { ...buildRequest().customer, address: 'short' } }),
      ),
    ).toThrow(/too short/i);
  });
});

describe('buildPathaoPricePlanPayload', () => {
  it('sends store, weight, speed and the recipient zone', () => {
    const payload = buildPathaoPricePlanPayload({
      store: { externalStoreId: '554' },
      recipientLocation: { cityId: 1, zoneId: 2, areaId: 3 },
      weightKg: 2,
      itemType: 'parcel',
      deliverySpeed: 'standard',
    });
    expect(payload).toEqual({
      store_id: 554,
      item_type: PATHAO_ITEM_TYPE.PARCEL,
      delivery_type: PATHAO_DELIVERY_TYPE.NORMAL,
      item_weight: 2,
      recipient_city: 1,
      recipient_zone: 2,
    });
  });

  it('requires a mapped recipient location', () => {
    expect(() =>
      buildPathaoPricePlanPayload({
        store: { externalStoreId: '554' },
        recipientLocation: null,
        weightKg: 2,
        itemType: 'parcel',
        deliverySpeed: 'standard',
      }),
    ).toThrow(/not mapped/i);
  });
});

describe('price plan resolution', () => {
  it('prefers finalPrice over price', () => {
    const resolved = resolvePathaoPricePlan({
      finalPrice: 120,
      price: 150,
      codAmount: 0,
    });
    expect(resolved.courierCharge).toBe(120);
  });

  it('falls back to price when finalPrice is absent', () => {
    const resolved = resolvePathaoPricePlan({ price: '150.50', codAmount: 0 });
    expect(resolved.courierCharge).toBe(150.5);
  });

  it('computes a COD fee only when COD is enabled for the plan', () => {
    const withCod = resolvePathaoPricePlan({
      price: 100,
      codPercentage: '1.0',
      codEnabled: true,
      codAmount: 5000,
    });
    expect(withCod.codFee).toBe(1);
    expect(withCod.codEnabled).toBe(true);

    const withoutCod = resolvePathaoPricePlan({
      price: 100,
      codPercentage: '1.0',
      codEnabled: false,
      codAmount: 5000,
    });
    expect(withoutCod.codFee).toBe(0);
    expect(withoutCod.codEnabled).toBe(false);
  });
});

describe('scalar helpers', () => {
  it('distinguishes a missing amount from a zero amount', () => {
    expect(parseProviderMoney(undefined)).toBeNull();
    expect(parseProviderMoney(null)).toBeNull();
    expect(parseProviderMoney('')).toBeNull();
    expect(parseProviderMoney(0)).toBe(0);
  });

  it('parses numeric strings and rejects non-numeric ones', () => {
    expect(parseProviderMoney('125.50')).toBe(125.5);
    expect(parseProviderMoney('abc')).toBeNull();
  });

  it('normalises Pathao boolean-ish flags', () => {
    expect(normalizeBooleanFlag(1)).toBe(true);
    expect(normalizeBooleanFlag(0)).toBe(false);
    expect(normalizeBooleanFlag('true')).toBe(true);
    expect(normalizeBooleanFlag('Yes')).toBe(true);
    expect(normalizeBooleanFlag(undefined)).toBe(false);
  });

  it('maps speed and item type', () => {
    expect(mapDeliverySpeedToPathao('express')).toBe(PATHAO_DELIVERY_TYPE.ON_DEMAND);
    expect(mapDeliverySpeedToPathao('standard')).toBe(PATHAO_DELIVERY_TYPE.NORMAL);
    expect(mapItemTypeToPathao('document')).toBe(PATHAO_ITEM_TYPE.DOCUMENT);
    expect(mapItemTypeToPathao('parcel')).toBe(PATHAO_ITEM_TYPE.PARCEL);
  });
});
