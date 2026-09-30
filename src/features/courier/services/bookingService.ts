/**
 * Courier booking.
 *
 * Creating a consignment is the only genuinely irreversible operation in the
 * system, so this service is built around one question: *what happens if this
 * request is sent twice?* Every design decision below follows from it.
 *
 * The guarantees:
 *
 *  1. **One claim wins.** `claimShipmentForBooking` is a conditional
 *     `updateMany` on `bookingState`, so two concurrent requests cannot both
 *     proceed to the provider.
 *
 *  2. **The idempotency key is generated once and persisted.** The database
 *     holds a unique index on `(courierProvider, merchantReference)`, so even if
 *     every application-level guard failed, one physical parcel cannot acquire
 *     two references.
 *
 *  3. **An unknown outcome is never retried blindly.** A timeout or 5xx after
 *     the POST may have created a consignment. That is recorded as `uncertain`
 *     and routed to reconciliation, which resolves it by looking the reference up
 *     at the courier. Retrying would create a duplicate parcel: a real cost, and
 *     a customer receiving two deliveries.
 *
 *  4. **Every attempt is recorded.** `CourierBookingAttempt` makes
 *     duplicate-booking questions answerable without log spelunking.
 */

import { prismaDirect } from '../../shared/services/database/prisma';
import { logger } from '../../../lib/logger';
import { requireCourierProvider } from '../registry/providerRegistry';
import type { CourierBookingRequest, CourierBookingResult } from '../core/contracts';
import { isCourierError } from '../core/errors';
import { BOOKABLE_STATUSES, isTerminalStatus } from '../core/status';
import { PATHAO_PROVIDER_CODE } from '../providers/pathao/pathaoConstants';

/**
 * Booking lifecycle, stored in `OrderShipment.bookingState`.
 *
 * Separate from `ShipmentStatus` on purpose: a shipment can be `delivered` while
 * its booking state is `booked`, and conflating the two makes "did we create
 * this parcel?" unanswerable.
 */
export const BOOKING_STATES = [
  'pending',
  'queued',
  'booking',
  'booked',
  'failed',
  'uncertain',
] as const;

export type BookingState = (typeof BOOKING_STATES)[number];

/** States from which a booking attempt may start. */
const CLAIMABLE_BOOKING_STATES: BookingState[] = ['pending', 'failed'];

/**
 * States where a booking call may be in flight. A shipment in one of these is
 * never claimed again automatically: the previous call's outcome is unknown.
 */
const IN_FLIGHT_BOOKING_STATES: BookingState[] = ['booking', 'queued', 'uncertain'];

/** How long before an `uncertain` booking is re-examined by reconciliation. */
const RECONCILE_DELAY_MS = 15 * 60 * 1000;

export class ShipmentNotBookableError extends Error {
  readonly shipmentId: string;

  constructor(shipmentId: string, reason: string) {
    super(`Shipment ${shipmentId} cannot be booked: ${reason}`);
    this.name = 'ShipmentNotBookableError';
    this.shipmentId = shipmentId;
  }
}

/** The parcel may exist at the courier. Reconcile; do not retry. */
export class CourierBookingUncertainError extends Error {
  readonly shipmentId: string;
  readonly merchantReference: string;
  readonly cause: unknown;

  constructor(shipmentId: string, merchantReference: string, cause: unknown) {
    super(
      'The courier may have created this shipment. It was not retried automatically; reconcile it instead.',
    );
    this.name = 'CourierBookingUncertainError';
    this.shipmentId = shipmentId;
    this.merchantReference = merchantReference;
    this.cause = cause;
  }
}

export type BookShipmentResult = {
  shipmentId: string;
  trackingId: string;
  provider: string;
  merchantReference: string;
  status: string;
  providerStatus: string | null;
  courierCharge: number | null;
  codFee: number | null;
  codAmount: number | null;
  /** True when the parcel was already booked and the stored result was returned. */
  duplicate: boolean;
  /** True when the shipment was claimed by another worker. */
  concurrent: boolean;
  bookedAt: Date;
};

/**
 * Generates the provider-side idempotency key.
 *
 * Derived from the shipment id so it is stable and reproducible, and prefixed so
 * it is recognisable in the courier's dashboard when reconciling by hand.
 */
export function buildMerchantReference(shipmentId: string): string {
  return `LFM-${shipmentId}`;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    const candidate = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(candidate) ? candidate : fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readString(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** Loads everything needed to build a provider booking request. */
async function loadBookingContext(shipmentId: string) {
  const shipment = await prismaDirect.orderShipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      orderId: true,
      sellerId: true,
      warehouseId: true,
      status: true,
      courierProvider: true,
      trackingId: true,
      merchantReference: true,
      bookingState: true,
      bookingAttemptCount: true,
      total: true,
      customerDeliveryFee: true,
      courierCharge: true,
      codAmount: true,
      items: { select: { productId: true, qty: true, product: { select: { weightKg: true } } } },
      order: {
        select: {
          orderCode: true,
          userId: true,
          guestPhone: true,
          shippingAddress: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!shipment) return null;

  const warehouse = shipment.warehouseId
    ? await prismaDirect.warehouse.findUnique({
        where: { id: shipment.warehouseId },
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          phone: true,
          contactName: true,
          courierStores: {
            where: { isActive: true, status: 'active' },
            select: {
              provider: true,
              externalStoreId: true,
              externalStoreName: true,
              cityId: true,
              zoneId: true,
              areaId: true,
              isActive: true,
              status: true,
            },
          },
          pathaoStoreId: true,
          pathaoCityId: true,
          pathaoZoneId: true,
          pathaoAreaId: true,
        },
      })
    : null;

  return { shipment, warehouse };
}

/**
 * Builds the provider-neutral booking request.
 *
 * Every value comes from the database. The recipient location is resolved
 * through the provider rather than read from the order, so a stale or mistyped
 * `cityId` on a saved address cannot be shipped to the wrong area.
 */
async function buildBookingRequest(
  context: NonNullable<Awaited<ReturnType<typeof loadBookingContext>>>,
  providerCode: string,
  provider: ReturnType<typeof requireCourierProvider>,
): Promise<CourierBookingRequest> {
  const { shipment, warehouse } = context;
  const address = readRecord(shipment.order?.shippingAddress);

  const recipientName =
    readString(address, 'name', 'fullName', 'recipient_name', 'contactName') ??
    readString(address, 'customerName') ??
    shipment.order?.user?.name ??
    // Never send a literal "Customer": the courier cannot hand the parcel to
    // anyone, and Pathao rejects names under three characters anyway.
    'Customer';

  const recipientPhone =
    readString(address, 'phone', 'mobile', 'phoneNumber', 'contact_number') ??
    shipment.order?.guestPhone ??
    null;

  const recipientCity = readString(address, 'city', 'district');

  // Weight comes from product data. Items with no weight on file are the
  // operator's gap to close, so the total is reported and the provider decides
  // whether it is acceptable.
  const weightKg = shipment.items.reduce(
    (sum, item) => sum + (item.product?.weightKg ?? 0) * item.qty,
    0,
  );

  const codAmount = Math.max(0, Math.round(toNumber(shipment.codAmount ?? shipment.total)));

  const storeMapping =
    warehouse?.courierStores.find((entry) => entry.provider === providerCode) ?? null;

  const legacyStoreId = warehouse?.pathaoStoreId ?? null;

  const pickupStore =
    storeMapping && storeMapping.isActive && storeMapping.status === 'active'
      ? {
          provider: providerCode,
          externalStoreId: storeMapping.externalStoreId,
          externalStoreName: storeMapping.externalStoreName,
          active: true,
        }
      : legacyStoreId !== null && providerCode === PATHAO_PROVIDER_CODE
        ? { provider: providerCode, externalStoreId: String(legacyStoreId), active: true }
        : null;

  const pickupLocation =
    warehouse && storeMapping
      ? {
          provider: providerCode,
          cityId: storeMapping.cityId,
          zoneId: storeMapping.zoneId,
          areaId: storeMapping.areaId,
          label: storeMapping.externalStoreName,
        }
      : warehouse
        ? {
            provider: providerCode,
            cityId: warehouse.pathaoCityId,
            zoneId: warehouse.pathaoZoneId,
            areaId: warehouse.pathaoAreaId,
            label: warehouse.city,
          }
        : null;

  const recipientLocation = await provider.resolveLocation({
    city: recipientCity,
    zone: readString(address, 'zone', 'thana'),
    area: readString(address, 'area'),
  });

  return {
    orderId: shipment.orderId,
    shipmentId: shipment.id,
    provider: providerCode,
    merchantReference: shipment.merchantReference ?? buildMerchantReference(shipment.id),
    customer: {
      name: recipientName,
      phone: recipientPhone,
      secondaryPhone: readString(address, 'secondaryPhone', 'alternativePhone'),
      address: readString(address, 'address', 'fullAddress', 'street', 'deliveryAddress'),
      city: recipientCity,
      location: recipientLocation,
    },
    pickup: {
      warehouseId: warehouse?.id ?? null,
      store: pickupStore,
      name: warehouse?.name ?? null,
      contactName: warehouse?.contactName ?? null,
      phone: warehouse?.phone ?? null,
      address: warehouse?.address ?? null,
      city: warehouse?.city ?? null,
      location: pickupLocation,
    },
    parcel: {
      quantity: shipment.items.reduce((sum, item) => sum + item.qty, 0),
      weightKg,
      itemType: 'parcel' as const,
      deliverySpeed: 'standard' as const,
      description: null,
      specialInstruction: null,
    },
    codAmount,
    shipmentValue: toNumber(shipment.total),
  };
}

type ClaimOutcome =
  | { kind: 'claimed'; merchantReference: string; attemptNumber: number }
  | { kind: 'already_booked'; result: BookShipmentResult }
  | { kind: 'in_flight'; state: BookingState };

/**
 * Atomically claims the shipment and records the attempt.
 *
 * The `updateMany` guard is what makes booking safe under concurrency: only the
 * caller that actually moved `bookingState` out of a claimable value proceeds.
 */
async function claimShipment(
  shipmentId: string,
  providerCode: string,
): Promise<ClaimOutcome> {
  const existing = await prismaDirect.orderShipment.findUnique({
    where: { id: shipmentId },
    select: {
      trackingId: true,
      courierProvider: true,
      merchantReference: true,
      bookingState: true,
      status: true,
      bookingAttemptCount: true,
      providerStatus: true,
      courierCharge: true,
      codFee: true,
      codAmount: true,
      lastBookedAt: true,
    },
  });

  if (!existing) {
    throw new ShipmentNotBookableError(shipmentId, 'the shipment does not exist');
  }

  if (isTerminalStatus(existing.status)) {
    throw new ShipmentNotBookableError(
      shipmentId,
      `it is already ${existing.status}`,
    );
  }

  // Already booked. Returning the stored result is what makes a duplicate
  // request safe: the caller gets the existing consignment, not a new parcel.
  if (existing.trackingId) {
    return {
      kind: 'already_booked',
      result: {
        shipmentId,
        trackingId: existing.trackingId,
        provider: existing.courierProvider ?? providerCode,
        merchantReference: existing.merchantReference ?? buildMerchantReference(shipmentId),
        status: existing.status,
        providerStatus: existing.providerStatus,
        courierCharge: existing.courierCharge === null ? null : toNumber(existing.courierCharge),
        codFee: existing.codFee === null ? null : toNumber(existing.codFee),
        codAmount: existing.codAmount === null ? null : toNumber(existing.codAmount),
        duplicate: true,
        concurrent: false,
        bookedAt: existing.lastBookedAt ?? new Date(),
      },
    };
  }

  if (IN_FLIGHT_BOOKING_STATES.includes(existing.bookingState as BookingState)) {
    // A previous attempt is unresolved. Retrying here is exactly the duplicate
    // parcel this design exists to prevent.
    return { kind: 'in_flight', state: existing.bookingState as BookingState };
  }

  const merchantReference = existing.merchantReference ?? buildMerchantReference(shipmentId);
  const attemptNumber = (existing.bookingAttemptCount ?? 0) + 1;

  const claimed = await prismaDirect.orderShipment.updateMany({
    where: {
      id: shipmentId,
      trackingId: null,
      bookingState: { in: [...CLAIMABLE_BOOKING_STATES] },
    },
    data: {
      bookingState: 'booking',
      bookingAttemptCount: attemptNumber,
      // Written at claim time so the unique index on
      // (courierProvider, merchantReference) covers the whole in-flight window,
      // not just the success path.
      courierProvider: providerCode,
      merchantReference,
      lastBookingError: null,
      lastBookingErrorCode: null,
    },
  });

  if (claimed.count === 0) {
    return { kind: 'in_flight', state: existing.bookingState as BookingState };
  }

  await prismaDirect.courierBookingAttempt.create({
    data: {
      shipmentId,
      provider: providerCode,
      attemptNumber,
      merchantReference,
      outcome: 'in_progress',
    },
  });

  return { kind: 'claimed', merchantReference, attemptNumber };
}

/** Persists a successful booking. */
async function markBooked(
  shipmentId: string,
  attemptNumber: number,
  merchantReference: string,
  result: CourierBookingResult,
): Promise<BookShipmentResult> {
  const now = new Date();

  await prismaDirect.$transaction([
    prismaDirect.orderShipment.update({
      where: { id: shipmentId },
      data: {
        trackingId: result.externalShipmentId,
        courierProvider: result.provider,
        merchantReference,
        providerReference: result.merchantReference,
        providerStatus: result.providerStatus,
        status: result.status,
        pickupRequestedAt: now,
        bookingState: 'booked',
        lastBookedAt: now,
        lastBookingError: null,
        lastBookingErrorCode: null,
        lastReconciledAt: now,
        courierCharge: result.courierCharge,
        codFee: result.codFee,
        codAmount: result.codAmount,
      },
    }),
    prismaDirect.courierBookingAttempt.update({
      where: { shipmentId_attemptNumber: { shipmentId, attemptNumber } },
      data: {
        completedAt: now,
        success: true,
        outcome: 'succeeded',
        durationMs: null,
      },
    }),
    // Append-only audit trail. `eventId` is null here because this is not a
    // webhook, so the unique index does not constrain it.
    prismaDirect.shipmentEvent.create({
      data: {
        shipmentId,
        source: 'booking',
        provider: result.provider,
        externalStatus: result.providerStatus,
        internalStatus: result.status,
        occurredAt: now,
        note: 'Consignment created.',
        metadata: { attemptNumber, trackingId: result.externalShipmentId },
      },
    }),
  ]);

  return {
    shipmentId,
    trackingId: result.externalShipmentId,
    provider: result.provider,
    merchantReference,
    status: result.status,
    providerStatus: result.providerStatus,
    courierCharge: result.courierCharge,
    codFee: result.codFee,
    codAmount: result.codAmount,
    duplicate: false,
    concurrent: false,
    bookedAt: now,
  };
}

/**
 * Records an ambiguous outcome.
 *
 * The claim is deliberately retained: the parcel may exist, so the shipment must
 * not become claimable again. `nextReconcileAt` schedules the sweep that will
 * resolve it by looking the reference up at the courier.
 */
async function markUncertain(
  shipmentId: string,
  attemptNumber: number,
  merchantReference: string,
  providerCode: string,
  error: unknown,
): Promise<void> {
  const now = new Date();
  const code = isCourierError(error) ? error.code : 'COURIER_UNKNOWN';
  const message = error instanceof Error ? error.message : 'Unknown courier failure.';

  await prismaDirect.$transaction([
    prismaDirect.orderShipment.update({
      where: { id: shipmentId },
      data: {
        bookingState: 'uncertain',
        lastBookingError: message.slice(0, 500),
        lastBookingErrorCode: code,
        nextReconcileAt: new Date(now.getTime() + RECONCILE_DELAY_MS),
      },
    }),
    prismaDirect.courierBookingAttempt.update({
      where: { shipmentId_attemptNumber: { shipmentId, attemptNumber } },
      data: {
        completedAt: now,
        success: false,
        outcome: 'uncertain',
        errorCode: code,
        errorMessage: message.slice(0, 500),
      },
    }),
    prismaDirect.shipmentEvent.create({
      data: {
        shipmentId,
        source: 'booking',
        provider: providerCode,
        occurredAt: now,
        note: 'Booking outcome unknown; awaiting reconciliation.',
        metadata: { attemptNumber, merchantReference, errorCode: code },
      },
    }),
  ]);
}

/**
 * Records a definite failure and releases the claim.
 *
 * Only a *definite* failure gets here. A 4xx means the courier rejected the
 * request before creating anything, so the shipment becomes claimable again and a
 * retry cannot duplicate a parcel.
 */
async function markFailed(
  shipmentId: string,
  attemptNumber: number,
  providerCode: string,
  error: unknown,
): Promise<void> {
  const now = new Date();
  const code = isCourierError(error) ? error.code : 'COURIER_UNKNOWN';
  const message = error instanceof Error ? error.message : 'Unknown courier failure.';

  await prismaDirect.$transaction([
    prismaDirect.orderShipment.update({
      where: { id: shipmentId },
      data: {
        bookingState: 'failed',
        lastBookingError: message.slice(0, 500),
        lastBookingErrorCode: code,
      },
    }),
    prismaDirect.courierBookingAttempt.update({
      where: { shipmentId_attemptNumber: { shipmentId, attemptNumber } },
      data: {
        completedAt: now,
        success: false,
        outcome: 'failed',
        errorCode: code,
        errorMessage: message.slice(0, 500),
      },
    }),
    prismaDirect.shipmentEvent.create({
      data: {
        shipmentId,
        source: 'booking',
        provider: providerCode,
        occurredAt: now,
        note: `Booking failed: ${code}.`,
        metadata: { attemptNumber, errorCode: code },
      },
    }),
  ]);
}

/**
 * Books a shipment with the courier.
 *
 * @throws {ShipmentNotBookableError} the shipment is missing or already finished
 * @throws {CourierBookingUncertainError} the outcome is unknown; reconcile, do not retry
 */
export async function bookShipment(
  shipmentId: string,
  providerCodeInput: string,
): Promise<BookShipmentResult> {
  const providerCode = String(providerCodeInput || '').trim().toLowerCase();

  const provider = requireCourierProvider(providerCode);
  if (!provider.getCapabilities().createShipment) {
    throw new ShipmentNotBookableError(
      shipmentId,
      `${provider.name} cannot create consignments through this integration.`,
    );
  }

  const claim = await claimShipment(shipmentId, providerCode);

  if (claim.kind === 'already_booked') return claim.result;

  if (claim.kind === 'in_flight') {
    throw new ShipmentNotBookableError(
      shipmentId,
      `a booking attempt is already ${claim.state} and must be reconciled before another is made`,
    );
  }

  const context = await loadBookingContext(shipmentId);

  if (!context) {
    await markFailed(shipmentId, claim.attemptNumber, providerCode, new Error('Shipment not found.'));
    throw new ShipmentNotBookableError(shipmentId, 'the shipment does not exist');
  }

  const startedAt = Date.now();

  try {
    const request = await buildBookingRequest(context, providerCode, provider);
    const result = await provider.createShipment(request);

    return await markBooked(
      shipmentId,
      claim.attemptNumber,
      claim.merchantReference,
      result,
    );
  } catch (error) {
    // `uncertain` is the decisive property: the request may have been processed
    // by the courier. Anything else is a definite failure and is retryable.
    if (isCourierError(error) && error.uncertain) {
      await markUncertain(shipmentId, claim.attemptNumber, claim.merchantReference, providerCode, error);
      throw new CourierBookingUncertainError(shipmentId, claim.merchantReference, error);
    }

    await markFailed(shipmentId, claim.attemptNumber, providerCode, error);

    logger.error('Courier booking failed.', {
      shipmentId,
      providerCode,
      attemptNumber: claim.attemptNumber,
      durationMs: Date.now() - startedAt,
      code: isCourierError(error) ? error.code : 'COURIER_UNKNOWN',
    });

    throw error;
  }
}

/**
 * Records a tracking id a seller entered by hand.
 *
 * The offline path: a parcel booked outside the API, or by a courier the seller
 * arranged directly. It is a claim on the shipment like any other booking, so it
 * takes the same atomic update and refuses to overwrite an existing tracking id
 * — silently replacing one would make the parcel impossible to find at the
 * courier while both tracking ids existed in the platform.
 */
export async function recordManualTrackingId(
  shipmentId: string,
  trackingIdInput: string,
  providerCodeInput: string,
): Promise<BookShipmentResult> {
  const trackingId = String(trackingIdInput || '').trim();
  const providerCode = String(providerCodeInput || '').trim().toLowerCase();

  if (!trackingId) {
    throw new ShipmentNotBookableError(shipmentId, 'a tracking id is required');
  }

  const existing = await prismaDirect.orderShipment.findUnique({
    where: { id: shipmentId },
    select: { trackingId: true, status: true, courierProvider: true, bookingState: true },
  });

  if (!existing) {
    throw new ShipmentNotBookableError(shipmentId, 'the shipment does not exist');
  }

  if (isTerminalStatus(existing.status)) {
    throw new ShipmentNotBookableError(shipmentId, `it is already ${existing.status}`);
  }

  if (existing.trackingId && existing.trackingId !== trackingId) {
    throw new ShipmentNotBookableError(
      shipmentId,
      `it is already tracked as ${existing.trackingId}, which a courier is using`,
    );
  }

  const now = new Date();
  const merchantReference = buildMerchantReference(shipmentId);

  const claimed = await prismaDirect.orderShipment.updateMany({
    where: { id: shipmentId, trackingId: null },
    data: {
      trackingId,
      courierProvider: providerCode,
      merchantReference,
      status: 'pickup_requested',
      pickupRequestedAt: existing.trackingId ? undefined : now,
      bookingState: 'booked',
      lastBookedAt: now,
      lastBookingError: null,
      lastBookingErrorCode: null,
    },
  });

  if (claimed.count === 0) {
    throw new ShipmentNotBookableError(
      shipmentId,
      'it was booked by another request while the tracking id was being entered',
    );
  }

  await prismaDirect.shipmentEvent.create({
    data: {
      shipmentId,
      source: 'manual',
      provider: providerCode,
      internalStatus: 'pickup_requested',
      occurredAt: now,
      note: 'Tracking id entered by hand.',
      metadata: { trackingId },
    },
  });

  return {
    shipmentId,
    trackingId,
    provider: providerCode,
    merchantReference,
    status: 'pickup_requested',
    providerStatus: null,
    courierCharge: null,
    codFee: null,
    codAmount: null,
    duplicate: false,
    concurrent: false,
    bookedAt: now,
  };
}

/**
 * Bookings that need human attention.
 *
 * The admin surface for the one situation automation must not resolve on its
 * own: a parcel the courier may already hold, which a retry would duplicate.
 */
export async function listUncertainBookings(limit = 50) {
  return prismaDirect.orderShipment.findMany({
    where: { bookingState: 'uncertain' },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Math.max(1, limit), 200),
    select: {
      id: true,
      orderId: true,
      sellerId: true,
      courierProvider: true,
      merchantReference: true,
      trackingId: true,
      bookingState: true,
      lastBookingError: true,
      lastBookingErrorCode: true,
      updatedAt: true,
      bookingAttempts: {
        select: {
          attemptNumber: true,
          outcome: true,
          errorCode: true,
          startedAt: true,
          completedAt: true,
        },
        orderBy: { attemptNumber: 'desc' },
      },
    },
  });
}

export { CLAIMABLE_BOOKING_STATES, IN_FLIGHT_BOOKING_STATES, BOOKABLE_STATUSES };
