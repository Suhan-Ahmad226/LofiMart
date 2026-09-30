/**
 * Internal shipment status vocabulary.
 *
 * The `ShipmentStatus` Prisma enum is the single source of truth for what a
 * shipment can be. Providers never speak this language: Pathao answers with
 * `order_status_slug` / `event` strings, and every future courier will have its
 * own vocabulary. Provider-specific strings are translated inside the provider
 * mapper and must never reach a service, a database write, or the UI.
 *
 * The lifecycle is:
 *
 *   pending -> processing -> packed -> ready_for_pickup -> pickup_requested
 *          -> picked_up -> in_transit -> out_for_delivery -> delivered
 *
 * with `delivery_failed`, `returned` and `cancelled` as terminal-or-retryable
 * exceptions.
 */

export const SHIPMENT_STATUSES = [
  'pending',
  'processing',
  'packed',
  'ready_for_pickup',
  'pickup_requested',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returned',
  'cancelled',
] as const;

export type InternalShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

const SHIPMENT_STATUS_SET = new Set<string>(SHIPMENT_STATUSES);

export function isInternalShipmentStatus(value: unknown): value is InternalShipmentStatus {
  return typeof value === 'string' && SHIPMENT_STATUS_SET.has(value);
}

/**
 * Statuses from which a shipment may be handed to a courier. Booking claims the
 * row by transitioning it out of this set, which is what makes the claim atomic
 * (see `modules/logistics/bookingService`).
 */
export const BOOKABLE_STATUSES = [
  'pending',
  'processing',
  'packed',
  'ready_for_pickup',
] as const satisfies readonly InternalShipmentStatus[];

/**
 * Statuses that mean a parcel physically exists and is moving. These are the
 * only shipments worth polling in the reconciliation worker; everything else is
 * either not booked yet or already terminal.
 */
export const ACTIVE_STATUSES = [
  'pickup_requested',
  'picked_up',
  'in_transit',
  'out_for_delivery',
] as const satisfies readonly InternalShipmentStatus[];

/** Terminal statuses: the parcel's journey is over, stop polling and stop retrying. */
export const TERMINAL_STATUSES = [
  'delivered',
  'delivery_failed',
  'returned',
  'cancelled',
] as const satisfies readonly InternalShipmentStatus[];

const TERMINAL_STATUS_SET = new Set<string>(TERMINAL_STATUSES);

export function isTerminalStatus(value: unknown): boolean {
  return typeof value === 'string' && TERMINAL_STATUS_SET.has(value);
}

export function isActiveStatus(value: unknown): boolean {
  return typeof value === 'string' && (ACTIVE_STATUSES as readonly string[]).includes(value);
}

/**
 * Rough position in the journey, used to reject backwards transitions.
 *
 * A webhook delivery service can easily arrive after a later reconciliation
 * poll, and applying it would move a `delivered` parcel back to `picked_up`.
 * Exceptions (`delivery_failed`, `returned`, `cancelled`) are handled
 * separately because they are not strictly ordered.
 */
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  processing: 1,
  packed: 2,
  ready_for_pickup: 3,
  pickup_requested: 4,
  picked_up: 5,
  in_transit: 6,
  out_for_delivery: 7,
  delivered: 8,
};

const EXCEPTION_STATUSES = new Set<string>(['delivery_failed', 'returned', 'cancelled']);

export function isBackwardsTransition(
  from: unknown,
  to: unknown,
): boolean {
  if (!isInternalShipmentStatus(from) || !isInternalShipmentStatus(to)) return false;
  if (from === to) return false;

  // An exception status always wins: a parcel that failed or came back must be
  // able to leave the happy path regardless of ordering.
  if (EXCEPTION_STATUSES.has(to)) return false;

  // Recovering from an exception back into transit is legitimate (a redelivery
  // attempt), so do not treat it as a regression.
  if (EXCEPTION_STATUSES.has(from)) return false;

  const fromRank = STATUS_RANK[from];
  const toRank = STATUS_RANK[to];
  if (fromRank === undefined || toRank === undefined) return false;

  return toRank < fromRank;
}

/**
 * Returns the transition to apply, or `null` when nothing should change.
 * Centralising this keeps webhook, reconciliation and manual sync from
 * disagreeing about what a status update means.
 */
export function resolveStatusTransition(
  from: unknown,
  to: unknown,
): InternalShipmentStatus | null {
  if (!isInternalShipmentStatus(to)) return null;
  if (from === to) return null;
  if (isBackwardsTransition(from, to)) return null;
  return to;
}

const STATUS_LABELS: Record<InternalShipmentStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  packed: 'Packed',
  ready_for_pickup: 'Ready for pickup',
  pickup_requested: 'Booked',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  delivery_failed: 'Delivery failed',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

export function getShipmentStatusLabel(status: string | null | undefined): string {
  if (!isInternalShipmentStatus(status)) return 'Unknown';
  return STATUS_LABELS[status];
}

/**
 * The customer-facing progress timeline. Each step lists the statuses that
 * satisfy it, so a provider that skips `in_transit` still renders a complete
 * journey. Order matters: it is the order shown to the customer.
 */
export type ShipmentTimelineStep = {
  key: string;
  label: string;
  description: string;
  satisfiedBy: readonly InternalShipmentStatus[];
};

export const SHIPMENT_TIMELINE: readonly ShipmentTimelineStep[] = [
  {
    key: 'confirmed',
    label: 'Order confirmed',
    description: 'We received your order.',
    satisfiedBy: ['pending', 'processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled'],
  },
  {
    key: 'booked',
    label: 'Shipment booked',
    description: 'The courier has been notified and will collect the parcel.',
    satisfiedBy: ['pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned'],
  },
  {
    key: 'picked_up',
    label: 'Picked up',
    description: 'The parcel left the seller.',
    satisfiedBy: ['picked_up', 'in_transit', 'out_for_delivery', 'delivered'],
  },
  {
    key: 'in_transit',
    label: 'In transit',
    description: 'The parcel is moving through the courier network.',
    satisfiedBy: ['in_transit', 'out_for_delivery', 'delivered'],
  },
  {
    key: 'out_for_delivery',
    label: 'Out for delivery',
    description: 'The rider is on the way to you.',
    satisfiedBy: ['out_for_delivery', 'delivered'],
  },
  {
    key: 'delivered',
    label: 'Delivered',
    description: 'The parcel was handed over.',
    satisfiedBy: ['delivered'],
  },
];

export function getTimelineProgress(status: unknown) {
  const current = isInternalShipmentStatus(status) ? status : null;
  const currentRank = current ? SHIPMENT_TIMELINE.findIndex((step) => step.satisfiedBy.includes(current)) : -1;

  return SHIPMENT_TIMELINE.map((step, index) => {
    const reached = currentRank >= 0 && index <= currentRank;
    const isCurrent = currentRank === index;
    return { ...step, reached, isCurrent };
  });
}

/**
 * Timestamp columns written when a status is reached. Keeping this next to the
 * status vocabulary means webhook, sync and reconciliation all stamp the same
 * columns, and a status can never arrive without its timestamp.
 */
export function buildShipmentTimestampData(
  normalizedStatus: string | null | undefined,
  shipment: {
    pickupRequestedAt?: Date | null;
    pickedUpAt?: Date | null;
    outForDeliveryAt?: Date | null;
    deliveredAt?: Date | null;
  },
  now: Date = new Date(),
): Record<string, unknown> {
  if (!normalizedStatus) return {};

  const timestampData: Record<string, unknown> = {};

  if (normalizedStatus === 'pickup_requested') {
    timestampData.pickupRequestedAt = shipment.pickupRequestedAt ?? now;
  }
  if (normalizedStatus === 'picked_up') {
    timestampData.pickedUpAt = shipment.pickedUpAt ?? now;
  }
  if (normalizedStatus === 'out_for_delivery') {
    timestampData.outForDeliveryAt = shipment.outForDeliveryAt ?? now;
  }
  if (normalizedStatus === 'delivered') {
    timestampData.deliveredAt = shipment.deliveredAt ?? now;
  }
  // Any status other than an explicit failure clears a stale failure reason, so
  // the UI does not keep showing "address incomplete" for a parcel that is now
  // moving again.
  if (normalizedStatus !== 'delivery_failed') {
    timestampData.deliveryFailureReason = null;
  }

  return timestampData;
}
