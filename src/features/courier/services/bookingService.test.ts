import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Booking a shipment is the only irreversible thing LofiMart does with a
 * courier, so these tests target duplicate parcels rather than happy paths.
 *
 * The fake Prisma below is deliberately faithful about the two things the
 * service relies on: `updateMany` respects its `where` guard, and
 * `findUnique` returns a snapshot. That is what makes the concurrency test
 * meaningful — a stub that always returned `count: 1` would pass a broken
 * implementation.
 */

type Row = Record<string, unknown>;

const shipmentRow: Row = {};
const attempts: Row[] = [];
const events: Row[] = [];
const warehouseRow: Row = {};

function matches(row: Row, where: Row): boolean {
  for (const [key, condition] of Object.entries(where ?? {})) {
    if (condition && typeof condition === 'object' && 'in' in (condition as Row)) {
      const allowed = (condition as { in: unknown[] }).in;
      if (!allowed.includes(row[key])) return false;
    } else if (Array.isArray(condition)) {
      if (!condition.includes(row[key])) return false;
    } else if (row[key] !== condition) {
      return false;
    }
  }
  return true;
}

vi.mock('../../shared/services/database/prisma', () => ({
  prismaDirect: {
    orderShipment: {
      findUnique: async ({ where }: { where: Row }) =>
        matches(shipmentRow, where) ? { ...shipmentRow } : null,
      findMany: async ({ where }: { where?: Row }) =>
        matches(shipmentRow, where ?? {}) ? [{ ...shipmentRow }] : [],
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        // The guard runs synchronously before any await, which is what makes
        // two concurrent claims resolve to one winner.
        if (!matches(shipmentRow, where)) return { count: 0 };
        Object.assign(shipmentRow, data);
        return { count: 1 };
      },
      update: async ({ data }: { data: Row }) => {
        Object.assign(shipmentRow, data);
        return { ...shipmentRow };
      },
    },
    warehouse: {
      findUnique: async ({ where }: { where: Row }) =>
        matches(warehouseRow, where) ? { ...warehouseRow } : null,
    },
    courierBookingAttempt: {
      create: async ({ data }: { data: Row }) => {
        attempts.push({ ...data });
        return data;
      },
      update: async ({ where, data }: { where: { shipmentId_attemptNumber: { shipmentId: string; attemptNumber: number } }; data: Row }) => {
        const target = where.shipmentId_attemptNumber;
        const found = attempts.find(
          (attempt) => attempt.shipmentId === target.shipmentId && attempt.attemptNumber === target.attemptNumber,
        );
        Object.assign(found ?? {}, data);
        return found;
      },
    },
    shipmentEvent: {
      create: async ({ data }: { data: Row }) => {
        events.push({ ...data });
        return data;
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  },
}));

const createShipment = vi.fn();
const resolveLocation = vi.fn(async () => ({
  provider: 'pathao',
  cityId: 2,
  zoneId: 20,
  areaId: 200,
  label: 'Chattogram',
}));
const getCapabilities = vi.fn(() => ({ createShipment: true }) as Record<string, boolean>);

vi.mock('../registry/providerRegistry', () => ({
  requireCourierProvider: () => ({
    code: 'pathao',
    name: 'Pathao Courier',
    getCapabilities,
    resolveLocation,
    createShipment,
  }),
}));

const {
  bookShipment,
  buildMerchantReference,
  listUncertainBookings,
  ShipmentNotBookableError,
  CourierBookingUncertainError,
} = await import('./bookingService');

const { CourierTimeoutError, CourierValidationError } = await import('../core/errors');

function seedShipment(overrides: Row = {}) {
  for (const key of Object.keys(shipmentRow)) delete shipmentRow[key];
  Object.assign(shipmentRow, {
    id: 'ship-1',
    orderId: 'order-1',
    sellerId: 'seller-1',
    warehouseId: 'wh-1',
    status: 'ready_for_pickup',
    courierProvider: null,
    trackingId: null,
    merchantReference: null,
    bookingState: 'pending',
    bookingAttemptCount: 0,
    total: 1500,
    customerDeliveryFee: null,
    courierCharge: null,
    codAmount: null,
    items: [{ productId: 'p1', qty: 2, product: { weightKg: 0.75 } }],
    order: {
      orderCode: 'LM-1',
      userId: 'user-1',
      guestPhone: '01712345678',
      shippingAddress: {
        name: 'Jane Doe',
        phone: '01712345678',
        city: 'Chattogram',
        address: '456 Oak Avenue',
      },
      user: { name: 'Jane Doe' },
    },
    ...overrides,
  });
}

function seedWarehouse(overrides: Row = {}) {
  for (const key of Object.keys(warehouseRow)) delete warehouseRow[key];
  Object.assign(
    warehouseRow,
    {
      id: 'wh-1',
      name: 'Main Warehouse',
      address: '1 Industrial Road',
      city: 'Dhaka',
      phone: '01800000000',
      contactName: 'Warehouse Manager',
      courierStores: [
        {
          provider: 'pathao',
          externalStoreId: '123',
          externalStoreName: 'Main Warehouse',
          isActive: true,
          status: 'active',
          cityId: 1,
          zoneId: 10,
          areaId: 100,
        },
      ],
      pathaoStoreId: null,
      pathaoCityId: 1,
      pathaoZoneId: 10,
      pathaoAreaId: 100,
    },
    overrides,
  );
}

function bookingResult(overrides: Row = {}) {
  return {
    provider: 'pathao',
    externalShipmentId: 'PAT-1',
    merchantReference: 'LFM-ship-1',
    status: 'pickup_requested',
    providerStatus: 'Pending',
    courierCharge: 120,
    codFee: 5,
    codAmount: 1500,
    trackingNumber: 'TRK-1',
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  attempts.length = 0;
  events.length = 0;
  vi.clearAllMocks();
  getCapabilities.mockReturnValue({ createShipment: true } as Record<string, boolean>);
  resolveLocation.mockImplementation(async () => ({
    provider: 'pathao',
    cityId: 2,
    zoneId: 20,
    areaId: 200,
    label: 'Chattogram',
  }));
  createShipment.mockResolvedValue(bookingResult());
  seedShipment();
  seedWarehouse();
});

describe('bookShipment', () => {
  it('books the parcel and persists the tracking id with an audit event', async () => {
    const result = await bookShipment('ship-1', 'pathao');

    expect(result.trackingId).toBe('PAT-1');
    expect(result.duplicate).toBe(false);
    expect(shipmentRow.trackingId).toBe('PAT-1');
    expect(shipmentRow.bookingState).toBe('booked');
    expect(shipmentRow.status).toBe('pickup_requested');
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('booking');
  });

  it('derives weight from product data rather than anything the caller supplies', async () => {
    await bookShipment('ship-1', 'pathao');

    // Two units at 0.75 kg. There is no weight parameter on bookShipment's
    // signature, so a caller cannot influence the courier's billing.
    expect(createShipment).toHaveBeenCalledTimes(1);
    const request = createShipment.mock.calls[0][0] as { parcel: { weightKg: number } };
    expect(request.parcel.weightKg).toBe(1.5);
  });

  it('uses the courier store mapping for the warehouse', async () => {
    seedWarehouse({
      courierStores: [
        {
          provider: 'pathao',
          externalStoreId: '554',
          externalStoreName: 'LofiMart Banani',
          isActive: true,
          status: 'active',
          cityId: 1,
          zoneId: 10,
          areaId: 100,
        },
      ],
    });

    await bookShipment('ship-1', 'pathao');

    const request = createShipment.mock.calls[0][0] as { pickup: { store: { externalStoreId: string } | null } };
    expect(request.pickup.store?.externalStoreId).toBe('554');
  });

  it('returns the stored booking for a repeat call instead of creating a second parcel', async () => {
    await bookShipment('ship-1', 'pathao');
    vi.clearAllMocks();

    const second = await bookShipment('ship-1', 'pathao');

    expect(second.duplicate).toBe(true);
    expect(second.trackingId).toBe('PAT-1');
    expect(createShipment).not.toHaveBeenCalled();
  });

  it('lets only one of two concurrent bookings reach the courier', async () => {
    const results = await Promise.allSettled([
      bookShipment('ship-1', 'pathao'),
      bookShipment('ship-1', 'pathao'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // One call created the parcel. The other was told to stop, not to try
    // again, because "try again" is how you get two parcels from one order.
    expect(createShipment).toHaveBeenCalledTimes(1);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ShipmentNotBookableError);
  });

  it('retains the claim when the outcome is unknown and schedules reconciliation', async () => {
    createShipment.mockRejectedValue(new CourierTimeoutError('pathao', 10000));

    await expect(bookShipment('ship-1', 'pathao')).rejects.toBeInstanceOf(
      CourierBookingUncertainError,
    );

    expect(shipmentRow.bookingState).toBe('uncertain');
    expect(shipmentRow.trackingId).toBeNull();
    expect(shipmentRow.nextReconcileAt).toBeInstanceOf(Date);
    expect(attempts.at(-1)?.outcome).toBe('uncertain');
  });

  it('refuses a new attempt while an earlier one is unresolved', async () => {
    createShipment.mockRejectedValue(new CourierTimeoutError('pathao', 10000));
    await expect(bookShipment('ship-1', 'pathao')).rejects.toBeInstanceOf(
      CourierBookingUncertainError,
    );

    vi.clearAllMocks();
    createShipment.mockResolvedValue(bookingResult());

    await expect(bookShipment('ship-1', 'pathao')).rejects.toBeInstanceOf(ShipmentNotBookableError);
    // The whole point: the courier is not contacted again while the parcel may
    // already exist.
    expect(createShipment).not.toHaveBeenCalled();
  });

  it('releases the claim after a definite failure so the seller can retry', async () => {
    createShipment.mockRejectedValue(
      new CourierValidationError('pathao', 'Recipient phone is not a Bangladeshi number.'),
    );

    await expect(bookShipment('ship-1', 'pathao')).rejects.toThrow(/Bangladeshi/);

    // A 4xx means nothing was created, so retrying cannot duplicate a parcel.
    expect(shipmentRow.bookingState).toBe('failed');
    expect(attempts.at(-1)?.outcome).toBe('failed');

    createShipment.mockResolvedValue(bookingResult());
    const retried = await bookShipment('ship-1', 'pathao');
    expect(retried.trackingId).toBe('PAT-1');
    expect(createShipment).toHaveBeenCalledTimes(2);
  });

  it('keeps one merchant reference across every attempt', async () => {
    createShipment.mockRejectedValue(new CourierValidationError('pathao', 'bad address'));
    await expect(bookShipment('ship-1', 'pathao')).rejects.toThrow();
    const firstReference = shipmentRow.merchantReference;

    createShipment.mockResolvedValue(bookingResult());
    await bookShipment('ship-1', 'pathao');

    expect(shipmentRow.merchantReference).toBe(firstReference);
    expect(firstReference).toBe(buildMerchantReference('ship-1'));
    // The unique index on (courierProvider, merchantReference) means the
    // courier can only ever see this reference once.
    expect(attempts.map((a) => a.merchantReference)).toEqual([firstReference, firstReference]);
  });

  it('refuses to book a delivered shipment', async () => {
    seedShipment({ status: 'delivered' });

    await expect(bookShipment('ship-1', 'pathao')).rejects.toBeInstanceOf(ShipmentNotBookableError);
    expect(createShipment).not.toHaveBeenCalled();
  });

  it('refuses a provider that cannot create consignments', async () => {
    getCapabilities.mockReturnValue({ createShipment: false } as Record<string, boolean>);

    await expect(bookShipment('ship-1', 'pathao')).rejects.toThrow(/cannot create consignments/i);
    expect(createShipment).not.toHaveBeenCalled();
  });

  it('surfaces uncertain bookings for operator review', async () => {
    seedShipment({ bookingState: 'uncertain' });

    const pending = await listUncertainBookings();

    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('ship-1');
    expect(pending[0].bookingState).toBe('uncertain');
  });
});
