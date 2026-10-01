import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The quote service decides what a shopper is charged for delivery, so these
 * tests focus on the failure modes that cost money:
 *
 *  - a price in the request must be ignored (it is not even in the type);
 *  - an unserved city must not silently become a courier price;
 *  - a fallback fee must be flagged unverified rather than passed off as real;
 *  - free shipping must zero what the customer pays without hiding the courier's
 *    actual cost.
 */

const products: Array<Record<string, unknown>> = [];
const tenantSetting: Record<string, unknown> = {
  freeShippingThreshold: 2500,
  defaultProductWeightKg: 0.5,
  fallbackDeliveryFee: 130,
};

vi.mock('../../shared/services/database/prisma', () => ({
  prismaDirect: {
    product: {
      findMany: async () => products,
    },
    tenantSetting: {
      findFirst: async () => tenantSetting,
    },
  },
}));

/** Resolves locations, and quotes only for a city the fake courier serves. */
const providerStub = {
  resolveLocation: vi.fn(async ({ city }: { city?: string | null }) =>
    city === 'Chattogram'
      ? { provider: 'pathao', cityId: 2, zoneId: 20, areaId: 200, label: 'Chattogram' }
      : null,
  ),
  getQuote: vi.fn(async (_request: { pickupStore: { externalStoreId: string } | null; weightKg: number }) => ({
    provider: 'pathao',
    customerDeliveryFee: 100,
    courierCharge: 100,
    codFee: 5,
    discount: 0,
    additionalCharge: 0,
    totalPrice: 105,
    currency: 'BDT',
    estimatedDeliveryDays: 2,
    codEnabled: true,
    planReference: 'plan-1',
  })),
};

vi.mock('../registry/providerRegistry', () => ({
  requireCourierProvider: () => providerStub,
}));

const { getShippingQuote } = await import('./quoteService');

function seedProduct(overrides: Record<string, unknown> = {}) {
  products.length = 0;
  products.push({
    id: 'prod-1',
    price: { toNumber: () => 1000 },
    weightKg: 1,
    inventoryItems: [
      {
        quantity: 5,
        warehouse: {
          id: 'wh-1',
          name: 'Mirpur Hub',
          city: 'Dhaka',
          insideDhakaFee: { toNumber: () => 80 },
          outsideDhakaFee: { toNumber: () => 130 },
          freeShippingThresholdOverride: null,
          courierStores: [
            {
              provider: 'pathao',
              externalStoreId: '554',
              externalStoreName: 'Mirpur',
              isActive: true,
              status: 'active',
            },
          ],
          pathaoStoreId: 554,
        },
      },
    ],
    ...overrides,
  });
}

beforeEach(() => {
  for (const key of Object.keys(tenantSetting)) delete tenantSetting[key];
  Object.assign(tenantSetting, {
    freeShippingThreshold: 2500,
    defaultProductWeightKg: 0.5,
    fallbackDeliveryFee: 130,
  });

  providerStub.resolveLocation.mockClear();
  providerStub.getQuote.mockClear();
  seedProduct();
});

describe('price integrity', () => {
  it('takes the subtotal from the database, not the request', async () => {
    const quote = await getShippingQuote({
      // A tampered request would carry a price here. The type forbids it, and
      // the service has no parameter to receive it.
      items: [{ productId: 'prod-1', quantity: 1 }],
      destination: { city: 'Chattogram' },
    });

    expect(providerStub.getQuote).toHaveBeenCalled();
    expect(quote.totalCourierCharge).toBe(100);
  });

  it('rejects a request with no items', async () => {
    await expect(
      getShippingQuote({ items: [], destination: { city: 'Chattogram' } }),
    ).rejects.toThrow(/at least one item/i);
  });

  it('rejects a request with no city rather than defaulting one', async () => {
    await expect(
      getShippingQuote({ items: [{ productId: 'prod-1', quantity: 1 }], destination: { city: '  ' } }),
    ).rejects.toThrow(/city is required/i);
  });

  it('rejects an item that is no longer published', async () => {
    products.length = 0;
    await expect(
      getShippingQuote({ items: [{ productId: 'ghost', quantity: 1 }], destination: { city: 'Chattogram' } }),
    ).rejects.toThrow(/no longer available/i);
  });
});

describe('warehouse quantity selection', () => {
  it('chooses a warehouse that can fulfill the requested quantity instead of a partial-stock warehouse', async () => {
    seedProduct({
      inventoryItems: [
        {
          quantity: 2,
          warehouse: {
            id: 'wh-partial',
            name: 'Partial Hub',
            city: 'Dhaka',
            insideDhakaFee: { toNumber: () => 80 },
            outsideDhakaFee: { toNumber: () => 130 },
            freeShippingThresholdOverride: null,
            courierStores: [{ provider: 'pathao', externalStoreId: '111', externalStoreName: 'Partial', isActive: true, status: 'active' }],
            pathaoStoreId: 111,
          },
        },
        {
          quantity: 5,
          warehouse: {
            id: 'wh-full',
            name: 'Full Hub',
            city: 'Dhaka',
            insideDhakaFee: { toNumber: () => 80 },
            outsideDhakaFee: { toNumber: () => 130 },
            freeShippingThresholdOverride: null,
            courierStores: [{ provider: 'pathao', externalStoreId: '222', externalStoreName: 'Full', isActive: true, status: 'active' }],
            pathaoStoreId: 222,
          },
        },
      ],
    });

    const quote = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 5 }],
      destination: { city: 'Chattogram' },
    });

    expect(quote.verified).toBe(true);
    expect(quote.shipments[0].warehouseId).toBe('wh-full');
  });

  it('returns a controlled fallback when no single warehouse can fulfill the line', async () => {
    seedProduct({
      inventoryItems: [
        {
          quantity: 2,
          warehouse: {
            id: 'wh-a', name: 'A', city: 'Dhaka',
            insideDhakaFee: { toNumber: () => 80 }, outsideDhakaFee: { toNumber: () => 130 },
            freeShippingThresholdOverride: null,
            courierStores: [{ provider: 'pathao', externalStoreId: '111', externalStoreName: 'A', isActive: true, status: 'active' }], pathaoStoreId: 111,
          },
        },
        {
          quantity: 2,
          warehouse: {
            id: 'wh-b', name: 'B', city: 'Dhaka',
            insideDhakaFee: { toNumber: () => 80 }, outsideDhakaFee: { toNumber: () => 130 },
            freeShippingThresholdOverride: null,
            courierStores: [{ provider: 'pathao', externalStoreId: '222', externalStoreName: 'B', isActive: true, status: 'active' }], pathaoStoreId: 222,
          },
        },
      ],
    });

    const quote = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 5 }],
      destination: { city: 'Chattogram' },
    });

    expect(quote.verified).toBe(false);
    expect(quote.shipments).toHaveLength(0);
    expect(quote.warnings.join(' ')).toMatch(/enough stock/i);
  });
});

describe('verified provider quotes', () => {
  it('uses the courier price for a served city', async () => {
    const quote = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 1 }],
      destination: { city: 'Chattogram' },
    });

    expect(quote.verified).toBe(true);
    expect(quote.shipments[0].source).toBe('provider');
    expect(quote.shipments[0].courierCharge).toBe(100);
    // Customer pays courier charge plus the COD fee.
    expect(quote.totalCustomerDeliveryFee).toBe(105);
  });

  it('sends the store from the generic mapping, not the legacy column', async () => {
    await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 1 }],
      destination: { city: 'Chattogram' },
    });

    const request = providerStub.getQuote.mock.calls[0][0];
    expect(request.pickupStore?.externalStoreId).toBe('554');
    expect(request.weightKg).toBe(1);
  });
});

describe('honest fallback', () => {
  it('falls back to a flat fee for an unserved city and marks it unverified', async () => {
    const quote = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 1 }],
      destination: { city: 'Nowhere' },
    });

    expect(providerStub.getQuote).not.toHaveBeenCalled();
    expect(quote.verified).toBe(false);
    expect(quote.shipments[0].source).toBe('fallback');
    expect(quote.shipments[0].courierCharge).toBeNull();
    // Outside-Dhaka flat rate, not the inside-Dhaka one.
    expect(quote.shipments[0].customerDeliveryFee).toBe(130);
    expect(quote.warnings.join(' ')).toMatch(/not served/i);
  });

  it('never substitutes a default city when location lookup fails', async () => {
    // The whole point of the location module: a guess would quote a Dhaka
    // price for a parcel going somewhere else.
    providerStub.resolveLocation.mockResolvedValueOnce(null);

    const quote = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 1 }],
      destination: { city: 'Chattogram' },
    });

    expect(quote.verified).toBe(false);
    expect(quote.shipments[0].source).toBe('fallback');
  });

  it('flags a weight that came from the store default', async () => {
    seedProduct({ weightKg: null });

    const quote = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 2 }],
      destination: { city: 'Chattogram' },
    });

    expect(quote.warnings.join(' ')).toMatch(/no shipping weight/i);
    // 0.5 kg default x 2 units.
    expect(quote.shipments[0].weightKg).toBe(1);
  });

  it('falls back when the warehouse has no mapped courier store', async () => {
    seedProduct({
      inventoryItems: [
        {
          quantity: 5,
          warehouse: {
            id: 'wh-1',
            name: 'Unmapped Hub',
            city: 'Dhaka',
            insideDhakaFee: { toNumber: () => 80 },
            outsideDhakaFee: { toNumber: () => 130 },
            freeShippingThresholdOverride: null,
            courierStores: [],
            pathaoStoreId: null,
          },
        },
      ],
    });

    const quote = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 1 }],
      destination: { city: 'Chattogram' },
    });

    expect(quote.verified).toBe(false);
    expect(quote.shipments[0].reason).toMatch(/pickup store/i);
  });

  it('degrades rather than throwing when the courier errors', async () => {
    providerStub.getQuote.mockRejectedValueOnce(new Error('pathao is down'));

    const quote = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 1 }],
      destination: { city: 'Chattogram' },
    });

    expect(quote.verified).toBe(false);
    expect(quote.shipments[0].customerDeliveryFee).toBe(130);
  });
});

describe('free shipping', () => {
  it('zeroes the payable fee but keeps the courier cost visible', async () => {
    // 2 units at 1000 = 2000, under the 2500 threshold, so no free shipping.
    const below = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 2 }],
      destination: { city: 'Chattogram' },
    });
    expect(below.freeShippingApplied).toBe(false);
    expect(below.totalCustomerDeliveryFee).toBe(105);

    // 3 units = 3000, over the threshold.
    const above = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 3 }],
      destination: { city: 'Chattogram' },
    });
    expect(above.freeShippingApplied).toBe(true);
    expect(above.totalCustomerDeliveryFee).toBe(0);
    // The platform still owes the courier, so the cost is retained.
    expect(above.totalCourierCharge).toBe(100);
  });

  it('can be bypassed to show the un-discounted estimate', async () => {
    const quote = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 3 }],
      destination: { city: 'Chattogram' },
      applyFreeShipping: false,
    });

    expect(quote.freeShippingApplied).toBe(false);
    expect(quote.totalCustomerDeliveryFee).toBe(105);
  });
});

describe('weighting', () => {
  it('scales weight with quantity', async () => {
    const quote = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 4 }],
      destination: { city: 'Chattogram' },
    });

    expect(quote.shipments[0].weightKg).toBe(4);
    expect(quote.shipments[0].itemCount).toBe(4);
  });

  it('coerces a fractional or negative quantity to at least one', async () => {
    const quote = await getShippingQuote({
      items: [{ productId: 'prod-1', quantity: 0 }],
      destination: { city: 'Chattogram' },
    });

    expect(quote.shipments[0].itemCount).toBe(1);
  });
});
