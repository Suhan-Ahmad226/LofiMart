import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Reconciliation is the safety net for webhooks that never arrive, and it is
 * also the only place an ambiguous booking could be "resolved" incorrectly. The
 * tests therefore assert two things above all else:
 *
 *  - an ambiguous booking is never turned into a retry on its own;
 *  - a status the courier reports cannot move a parcel backwards.
 *
 * The negative case matters most: if reconciliation quietly retried an uncertain
 * booking, a courier that had already accepted the parcel would receive a second
 * one, and the customer would get two deliveries.
 */

type Row = Record<string, unknown>;

const shipmentRow: Row = {};
const events: Row[] = [];

vi.mock('../../shared/services/database/prisma', () => ({
  prismaDirect: {
    orderShipment: {
      findUnique: async ({ where }: { where: Row }) =>
        shipmentRow.id === where.id ? { ...shipmentRow } : null,
      findMany: async ({ where }: { where?: Row }) => {
        const wanted = where?.bookingState as { in?: string[] } | undefined;
        if (wanted?.in && !wanted.in.includes(shipmentRow.bookingState as string)) return [];
        const due = where?.nextReconcileAt as { lte: Date } | undefined;
        if (due && (shipmentRow.nextReconcileAt as Date) > due.lte) return [];
        return [{ ...shipmentRow }];
      },
      update: async ({ data }: { data: Row }) => {
        Object.assign(shipmentRow, data);
        return { ...shipmentRow };
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

const getShipmentStatus = vi.fn();
const findShipmentByReference = vi.fn();
const capabilities = { tracking: true, referenceLookup: false } as Record<string, boolean>;

vi.mock('../registry/providerRegistry', () => ({
  requireCourierProvider: () => ({
    code: 'pathao',
    name: 'Pathao Courier',
    getCapabilities: () => capabilities,
    getShipmentStatus,
    findShipmentByReference,
  }),
}));

const { reconcileShipment, reconcileDueShipments, listReconciliationBacklog } = await import(
  './reconciliationService'
);
const { CourierNetworkError } = await import('../core/errors');

function trackingResult(overrides: Row = {}) {
  return {
    provider: 'pathao',
    externalShipmentId: 'PAT-1',
    status: 'in_transit' as const,
    providerStatus: 'In Transit',
    courierCharge: 120,
    events: [],
    ...overrides,
  };
}

function seedShipment(overrides: Row = {}) {
  for (const key of Object.keys(shipmentRow)) delete shipmentRow[key];
  Object.assign(shipmentRow, {
    id: 'ship-1',
    status: 'pickup_requested',
    trackingId: 'PAT-1',
    merchantReference: 'LFM-ship-1',
    courierProvider: 'pathao',
    bookingState: 'booked',
    lastReconciledAt: null,
    nextReconcileAt: null,
    lastBookedAt: new Date('2026-03-01T08:00:00.000Z'),
    updatedAt: new Date('2026-03-01T08:00:00.000Z'),
    pickupRequestedAt: new Date('2026-03-01T08:00:00.000Z'),
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    providerStatus: 'Pending',
    ...overrides,
  });
}

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

beforeEach(() => {
  events.length = 0;
  vi.clearAllMocks();
  capabilities.tracking = true;
  capabilities.referenceLookup = false;
  getShipmentStatus.mockResolvedValue(trackingResult());
  findShipmentByReference.mockResolvedValue(null);
  seedShipment();
});

describe('reconcileShipment', () => {
  it('advances a parcel the courier has moved forward', async () => {
    const result = await reconcileShipment('ship-1');

    expect(result.outcome).toBe('advanced');
    expect(shipmentRow.status).toBe('in_transit');
    expect(shipmentRow.providerStatus).toBe('In Transit');
    expect(shipmentRow.lastReconciledAt).toBeInstanceOf(Date);
  });

  it('preserves earlier timestamps when a later status is reached', async () => {
    const originalPickup = shipmentRow.pickupRequestedAt as Date;
    getShipmentStatus.mockResolvedValue(
      trackingResult({ status: 'picked_up', providerStatus: 'Picked' }),
    );

    await reconcileShipment('ship-1');

    // The pickup timestamp records when the pickup was requested, not when the
    // poll happened to notice it.
    expect(shipmentRow.pickedUpAt).toBeInstanceOf(Date);
    expect(shipmentRow.pickupRequestedAt).toBe(originalPickup);
  });

  it('refuses to rewind a parcel on a stale courier status', async () => {
    seedShipment({ status: 'in_transit' });
    getShipmentStatus.mockResolvedValue(
      trackingResult({ status: 'picked_up', providerStatus: 'Picked' }),
    );

    const result = await reconcileShipment('ship-1');

    // A courier reporting an older status is normal — responses and webhooks
    // arrive out of order. Trusting one would drag a moving parcel backwards in
    // the customer's tracking view.
    expect(result.outcome).toBe('unchanged');
    expect(shipmentRow.status).toBe('in_transit');
    expect(result.detail).toMatch(/backwards/i);
  });

  it('records an unmappable status without moving the shipment', async () => {
    getShipmentStatus.mockResolvedValue(trackingResult({ status: null, providerStatus: 'Hub Sorting' }));

    const result = await reconcileShipment('ship-1');

    expect(result.outcome).toBe('unchanged');
    expect(shipmentRow.status).toBe('pickup_requested');
    expect(shipmentRow.providerStatus).toBe('Hub Sorting');
    expect(events).toHaveLength(1);
  });

  it('stops polling a finished parcel', async () => {
    seedShipment({ status: 'delivered' });

    const result = await reconcileShipment('ship-1');

    expect(result.outcome).toBe('terminal');
    expect(shipmentRow.nextReconcileAt).toBeNull();
    expect(getShipmentStatus).not.toHaveBeenCalled();
  });

  it('backs off and reschedules when the courier is unreachable', async () => {
    getShipmentStatus.mockRejectedValue(new CourierNetworkError('pathao', 'connect ECONNREFUSED'));

    const result = await reconcileShipment('ship-1');

    expect(result.outcome).toBe('failed');
    // A reschedule rather than an immediate retry: a courier outage must not
    // become a hot loop against their API.
    expect(result.nextReconcileAt).toBeInstanceOf(Date);
    expect(result.nextReconcileAt!.getTime()).toBeGreaterThan(Date.now());
    expect(shipmentRow.status).toBe('pickup_requested');
  });

  it('stops reconciling a delivered parcel for good', async () => {
    getShipmentStatus.mockResolvedValue(
      trackingResult({ status: 'delivered', providerStatus: 'Delivered' }),
    );

    const result = await reconcileShipment('ship-1');

    expect(result.outcome).toBe('advanced');
    expect(shipmentRow.status).toBe('delivered');
    expect(shipmentRow.nextReconcileAt).toBeNull();
  });
});

describe('ambiguous bookings', () => {
  it('never re-books an unresolved parcel on its own', async () => {
    seedShipment({
      status: 'ready_for_pickup',
      trackingId: null,
      bookingState: 'uncertain',
      updatedAt: hoursAgo(2),
    });

    const result = await reconcileShipment('ship-1');

    // Pathao cannot be searched by reference, so the answer is "wait", and the
    // claim is held. Booking again here is how a customer ends up with two
    // parcels for one order.
    expect(result.outcome).toBe('unchanged');
    expect(shipmentRow.bookingState).toBe('uncertain');
    expect(shipmentRow.trackingId).toBeNull();
    expect(findShipmentByReference).not.toHaveBeenCalled();
  });

  it('escalates to an operator once the grace period has passed', async () => {
    seedShipment({
      status: 'ready_for_pickup',
      trackingId: null,
      bookingState: 'uncertain',
      updatedAt: hoursAgo(10),
    });

    const result = await reconcileShipment('ship-1');

    expect(result.outcome).toBe('needs_operator');
    // The message is actionable: it names the reference to search for.
    expect(result.detail).toMatch(/LFM-ship-1/);
    expect(shipmentRow.bookingState).toBe('uncertain');
  });

  it('learns the consignment id when the courier can search by reference', async () => {
    capabilities.referenceLookup = true;
    findShipmentByReference.mockResolvedValue(
      trackingResult({ status: 'pickup_requested', providerStatus: 'Pending' }),
    );
    seedShipment({ trackingId: null, bookingState: 'uncertain', updatedAt: hoursAgo(1) });

    const result = await reconcileShipment('ship-1');

    expect(result.outcome).toBe('resolved');
    expect(shipmentRow.trackingId).toBe('PAT-1');
    expect(shipmentRow.bookingState).toBe('booked');
  });

  it('releases the claim only on a definitive "no such parcel"', async () => {
    capabilities.referenceLookup = true;
    findShipmentByReference.mockResolvedValue(null);
    seedShipment({ trackingId: null, bookingState: 'uncertain', updatedAt: hoursAgo(1) });

    const result = await reconcileShipment('ship-1');

    expect(result.outcome).toBe('not_found');
    expect(shipmentRow.bookingState).toBe('failed');
    expect(shipmentRow.lastBookingErrorCode).toBe('RECONCILED_NOT_FOUND');
  });

  it('holds the claim when the lookup itself fails', async () => {
    capabilities.referenceLookup = true;
    findShipmentByReference.mockRejectedValue(new CourierNetworkError('pathao', 'timeout'));
    seedShipment({ trackingId: null, bookingState: 'uncertain', updatedAt: hoursAgo(1) });

    const result = await reconcileShipment('ship-1');

    // "Could not ask" is not "the parcel does not exist". Releasing on a failed
    // lookup would risk a duplicate delivery.
    expect(result.outcome).toBe('failed');
    expect(shipmentRow.bookingState).toBe('uncertain');
  });

  it('flags a booking with no reference as unrecoverable', async () => {
    seedShipment({ trackingId: null, merchantReference: null, bookingState: 'uncertain' });

    const result = await reconcileShipment('ship-1');

    expect(result.outcome).toBe('needs_operator');
    expect(result.detail).toMatch(/reference/i);
  });
});

describe('reconcileDueShipments', () => {
  it('processes shipments whose cursor has come due', async () => {
    seedShipment({ nextReconcileAt: hoursAgo(1) });

    const results = await reconcileDueShipments();

    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe('advanced');
  });

  it('leaves shipments alone until their cursor is due', async () => {
    seedShipment({ nextReconcileAt: new Date(Date.now() + 3_600_000) });

    const results = await reconcileDueShipments();

    expect(results).toHaveLength(0);
    expect(getShipmentStatus).not.toHaveBeenCalled();
  });
});

describe('listReconciliationBacklog', () => {
  it('surfaces unresolved bookings oldest first', async () => {
    seedShipment({ trackingId: null, bookingState: 'uncertain' });

    const backlog = await listReconciliationBacklog();

    expect(backlog).toHaveLength(1);
    expect(backlog[0].merchantReference).toBe('LFM-ship-1');
  });
});
