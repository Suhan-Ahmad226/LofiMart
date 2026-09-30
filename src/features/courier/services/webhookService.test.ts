import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Webhook intake is the one place untrusted input drives shipment state, so
 * these tests concentrate on the three ways that goes wrong:
 *
 *  - an unverified delivery is applied (forged "delivered" events);
 *  - a redelivery is applied twice (couriers retry constantly);
 *  - a late or out-of-order delivery rewinds a real timeline.
 *
 * The fake `webhookDelivery.create` enforces the unique `(provider, eventId)`
 * index synchronously, because that constraint is the only race-free replay
 * guard — a stub that just recorded whatever it was given would make the
 * duplicate tests vacuous.
 */

type Row = Record<string, unknown>;

const shipmentRow: Row = {};
const deliveries: Row[] = [];
const events: Row[] = [];

function uniqueViolation() {
  return Object.assign(new Error('Unique constraint failed on the fields: (`provider`,`eventId`)'), {
    code: 'P2002',
  });
}

vi.mock('../../shared/services/database/prisma', () => ({
  prismaDirect: {
    orderShipment: {
      findFirst: async ({ where }: { where: Row }) => {
        const matches =
          (where.trackingId !== undefined && shipmentRow.trackingId === where.trackingId) ||
          (where.merchantReference !== undefined && shipmentRow.merchantReference === where.merchantReference);
        return matches ? { ...shipmentRow } : null;
      },
      update: async ({ data }: { data: Row }) => {
        Object.assign(shipmentRow, data);
        return { ...shipmentRow };
      },
    },
    webhookDelivery: {
      create: async ({ data }: { data: Row }) => {
        const clash = deliveries.some(
          (row) => row.provider === data.provider && row.eventId === data.eventId,
        );
        if (clash) throw uniqueViolation();
        // `receivedAt` has a schema default, so the fake supplies it too;
        // otherwise the claim-reclaim tests would compare against `undefined`.
        const row = {
          id: `del-${deliveries.length + 1}`,
          deliveryCount: 1,
          receivedAt: new Date(),
          ...data,
        };
        deliveries.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: Row }) =>
        deliveries.find((row) => row.provider === where.provider && row.eventId === where.eventId) ?? null,
      findMany: async () => [...deliveries].reverse(),
      /**
       * Mirrors the compare-and-swap the reclaim relies on: the `where` clause is
       * matched in full, including the exact `receivedAt`, so only one of two
       * concurrent reclaimers can match a given row.
       */
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const matches = deliveries.filter(
          (row) =>
            row.id === where.id &&
            row.outcome === where.outcome &&
            (where.receivedAt === undefined ||
              (row.receivedAt as Date).getTime() === (where.receivedAt as Date).getTime()),
        );
        for (const found of matches) {
          if (typeof data.deliveryCount === 'object' && data.deliveryCount !== null) {
            const increment = (data.deliveryCount as { increment: number }).increment;
            found.deliveryCount = (found.deliveryCount as number) + increment;
          }
          // Every other field, including the new `receivedAt`, must be written for
          // the compare-and-swap to actually exclude a second racer.
          Object.assign(found, data);
        }
        return { count: matches.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const found = deliveries.find((row) => row.id === where.id);
        if (found && typeof data.deliveryCount === 'object' && data.deliveryCount !== null) {
          const increment = (data.deliveryCount as { increment: number }).increment;
          found.deliveryCount = (found.deliveryCount as number) + increment;
          delete data.deliveryCount;
        }
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

const verifyWebhook = vi.fn(async () => true);
const parseWebhook = vi.fn();

vi.mock('../registry/providerRegistry', () => ({
  requireCourierProvider: () => ({ code: 'pathao', name: 'Pathao Courier', verifyWebhook, parseWebhook }),
}));

const { handleCourierWebhook, resolveEventId, listWebhookDeliveries } = await import('./webhookService');
const { CourierWebhookError } = await import('../core/errors');

function webhookEvent(overrides: Row = {}) {
  return {
    provider: 'pathao',
    eventId: 'evt-1',
    externalShipmentId: 'PAT-1',
    merchantReference: 'LFM-ship-1',
    status: 'picked_up' as const,
    providerStatus: 'Picked',
    occurredAt: '2026-03-01T10:00:00.000Z',
    metadata: { invoiceId: 'inv-1' },
    ...overrides,
  };
}

function webhookRequest(): Request {
  return new Request('https://lofimart.com/api/logistics/webhooks/pathao', { method: 'POST' });
}

beforeEach(() => {
  deliveries.length = 0;
  events.length = 0;
  vi.clearAllMocks();
  verifyWebhook.mockResolvedValue(true);
  parseWebhook.mockResolvedValue(webhookEvent());
  for (const key of Object.keys(shipmentRow)) delete shipmentRow[key];
  Object.assign(shipmentRow, {
    id: 'ship-1',
    status: 'pickup_requested',
    trackingId: 'PAT-1',
    merchantReference: 'LFM-ship-1',
    bookingState: 'booked',
    pickupRequestedAt: new Date('2026-02-28T09:00:00.000Z'),
    pickedUpAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
  });
});

describe('handleCourierWebhook', () => {
  it('rejects an unverified delivery without touching the shipment', async () => {
    verifyWebhook.mockResolvedValue(false);

    await expect(handleCourierWebhook('pathao', webhookRequest())).rejects.toBeInstanceOf(
      CourierWebhookError,
    );

    expect(parseWebhook).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
    expect(shipmentRow.status).toBe('pickup_requested');
  });

  it('applies a verified status change and records the event', async () => {
    const result = await handleCourierWebhook('pathao', webhookRequest());

    expect(result.outcome).toBe('processed');
    expect(result.status).toBe('picked_up');
    expect(shipmentRow.status).toBe('picked_up');
    expect(shipmentRow.pickedUpAt).toBeInstanceOf(Date);
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe('evt-1');
  });

  it('preserves the original timestamp when a status repeats', async () => {
    await handleCourierWebhook('pathao', webhookRequest());
    const firstStamp = shipmentRow.pickedUpAt;

    parseWebhook.mockResolvedValue(webhookEvent({ eventId: 'evt-2' }));
    await handleCourierWebhook('pathao', webhookRequest());

    expect(shipmentRow.pickedUpAt).toBe(firstStamp);
  });

  it('treats a redelivery as a duplicate and applies nothing twice', async () => {
    await handleCourierWebhook('pathao', webhookRequest());
    const second = await handleCourierWebhook('pathao', webhookRequest());

    expect(second.outcome).toBe('duplicate');
    expect(events).toHaveLength(1);
  });

  it('counts how many times a courier redelivered the same event', async () => {
    await handleCourierWebhook('pathao', webhookRequest());
    await handleCourierWebhook('pathao', webhookRequest());
    await handleCourierWebhook('pathao', webhookRequest());

    const recorded = await listWebhookDeliveries('pathao');
    expect(recorded[0].deliveryCount).toBe(3);
    expect(recorded[0].outcome).toBe('duplicate');
  });

  it('applies a simultaneous pair of identical deliveries exactly once', async () => {
    const results = await Promise.all([
      handleCourierWebhook('pathao', webhookRequest()),
      handleCourierWebhook('pathao', webhookRequest()),
    ]);

    const outcomes = results.map((r) => r.outcome).sort();
    expect(outcomes).toEqual(['duplicate', 'processed']);
    expect(events).toHaveLength(1);
  });

  /**
   * The dangerous case is a delivery that is interrupted between claiming the row
   * and writing the status. The unique index still blocks the courier's retry, so
   * without a reclaim the event reads as a duplicate, is answered 2xx, and is
   * lost with no indication anything went wrong.
   */
  it('reprocesses a claim abandoned by an interrupted delivery', async () => {
    // Simulate a process that claimed the event and then died: the row exists at
    // the in-progress `received` outcome and was first seen well outside the lease.
    deliveries.push({
      id: 'del-1',
      provider: 'pathao',
      eventId: 'evt-1',
      status: 'Picked',
      outcome: 'received',
      deliveryCount: 1,
      receivedAt: new Date(Date.now() - 60 * 60_000),
    });

    const result = await handleCourierWebhook('pathao', webhookRequest());

    expect(result.outcome).toBe('processed');
    expect(events).toHaveLength(1);
    expect(shipmentRow.status).toBe('picked_up');
  });

  it('does not steal a claim that is still within its lease', async () => {
    deliveries.push({
      id: 'del-1',
      provider: 'pathao',
      eventId: 'evt-1',
      status: 'Picked',
      outcome: 'received',
      deliveryCount: 1,
      receivedAt: new Date(),
    });

    const result = await handleCourierWebhook('pathao', webhookRequest());

    // The original holder is presumed to still be working, so this is a duplicate.
    expect(result.outcome).toBe('duplicate');
    expect(events).toHaveLength(0);
  });

  it('never reprocesses a claim that already finished', async () => {
    deliveries.push({
      id: 'del-1',
      provider: 'pathao',
      eventId: 'evt-1',
      status: 'Picked',
      outcome: 'ignored',
      deliveryCount: 1,
      receivedAt: new Date(Date.now() - 60 * 60_000),
    });

    const result = await handleCourierWebhook('pathao', webhookRequest());

    // 'ignored' is a deliberate decision (e.g. an unmappable status), not a crash,
    // so an old timestamp must not resurrect it.
    expect(result.outcome).toBe('duplicate');
    expect(events).toHaveLength(0);
  });

  it('reclaims at most once when two deliveries race on the same stale claim', async () => {
    deliveries.push({
      id: 'del-1',
      provider: 'pathao',
      eventId: 'evt-1',
      status: 'Picked',
      outcome: 'received',
      deliveryCount: 1,
      receivedAt: new Date(Date.now() - 60 * 60_000),
    });

    const results = await Promise.all([
      handleCourierWebhook('pathao', webhookRequest()),
      handleCourierWebhook('pathao', webhookRequest()),
    ]);

    const outcomes = results.map((r) => r.outcome).sort();
    expect(outcomes).toEqual(['duplicate', 'processed']);
    expect(events).toHaveLength(1);
  });

  it('refuses to rewind a delivered parcel', async () => {
    shipmentRow.status = 'delivered';
    parseWebhook.mockResolvedValue(webhookEvent({ status: 'picked_up', providerStatus: 'Picked' }));

    const result = await handleCourierWebhook('pathao', webhookRequest());

    // Recorded for audit, but the timeline is not corrupted. A late webhook
    // must never un-deliver a parcel.
    expect(result.outcome).toBe('ignored');
    expect(result.status).toBeNull();
    expect(shipmentRow.status).toBe('delivered');
    expect(events).toHaveLength(1);
  });

  it('records an unmappable courier status without guessing', async () => {
    parseWebhook.mockResolvedValue(
      webhookEvent({ status: null, providerStatus: 'Holding at Hub' }),
    );

    const result = await handleCourierWebhook('pathao', webhookRequest());

    expect(result.outcome).toBe('ignored');
    expect(shipmentRow.status).toBe('pickup_requested');
    expect(shipmentRow.providerStatus).toBe('Holding at Hub');
    expect(events).toHaveLength(1);
  });

  it('acknowledges an unmatched consignment instead of retrying forever', async () => {
    // Neither handle points at a shipment we know about.
    Object.assign(shipmentRow, { trackingId: 'PAT-OTHER', merchantReference: 'LFM-other' });

    const result = await handleCourierWebhook('pathao', webhookRequest());

    expect(result.outcome).toBe('unmatched');
    expect(result.shipmentId).toBeNull();
    // No throw: the courier keeps redelivering an event that can never match.
    expect(shipmentRow.status).toBe('pickup_requested');
  });

  it('resolves an uncertain booking by learning the consignment id', async () => {
    // The shape left behind by a booking timeout: no tracking id, and the claim
    // deliberately retained so it cannot be retried blindly.
    Object.assign(shipmentRow, {
      trackingId: null,
      bookingState: 'uncertain',
      status: 'ready_for_pickup',
    });

    const result = await handleCourierWebhook('pathao', webhookRequest());

    expect(result.outcome).toBe('processed');
    expect(shipmentRow.trackingId).toBe('PAT-1');
    expect(shipmentRow.bookingState).toBe('booked');
  });
});

describe('resolveEventId', () => {
  it("prefers the provider's own id", () => {
    expect(resolveEventId(webhookEvent({ eventId: 'abc' }))).toBe('abc');
  });

  it('synthesizes a stable id from consignment and status when none is sent', () => {
    const event = webhookEvent({ eventId: null });
    expect(resolveEventId(event)).toBe('PAT-1:Picked');
    // Stability matters: the same event redelivered must hash to the same key.
    expect(resolveEventId(event)).toBe(resolveEventId(webhookEvent({ eventId: null })));
  });

  it('treats a different status as a different event', () => {
    // A redelivery after a failure must not be swallowed by the first status.
    expect(resolveEventId(webhookEvent({ eventId: null, providerStatus: 'Picked' }))).not.toBe(
      resolveEventId(webhookEvent({ eventId: null, providerStatus: 'Delivered' })),
    );
  });
});
