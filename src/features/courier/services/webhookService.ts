/**
 * Courier webhook intake.
 *
 * Couriers retry. Pathao will redeliver a webhook that it does not see a 2xx for,
 * and it will occasionally deliver the same event twice on its own. So the
 * pipeline is built to be idempotent end to end:
 *
 *   verify -> parse -> claim the delivery -> locate the shipment -> apply
 *
 * Two independent dedupe layers sit in the middle:
 *
 *  1. `WebhookDelivery` holds a unique index on `(provider, eventId)`. The claim
 *     is an insert, and a unique-violation means "already seen" — which is the
 *     only race-free way to detect a replay, because a read-then-write would
 *     let two simultaneous deliveries both conclude they were first.
 *
 *  2. `ShipmentEvent` holds a unique index on `(shipmentId, source, eventId)`,
 *     which stops a duplicate status from being appended even if the delivery
 *     record were lost.
 *
 * A note on synthesized ids: Pathao does not always supply an event id. When it
 * does not, `consignmentId:providerStatus` is used instead. That is safe because
 * the same consignment reporting the same status twice is genuinely the same
 * event, while a *different* status (a redelivery after `delivery_failed`, say)
 * still produces a distinct id and is not swallowed.
 *
 * Nothing in here logs a customer name, phone number or address.
 */

import type { Prisma } from '@prisma/client';

import { prismaDirect } from '../../shared/services/database/prisma';
import { logger } from '../../../lib/logger';
import { requireCourierProvider } from '../registry/providerRegistry';
import type { CourierWebhookEvent } from '../core/contracts';
import { CourierWebhookError } from '../core/errors';
import type { InternalShipmentStatus } from '../core/status';
import { buildShipmentTimestampData, resolveStatusTransition } from '../core/status';

/**
 * Outcomes recorded against a delivery. `failed` is only ever written to the
 * delivery record; `handleCourierWebhook` reports the other four.
 */
export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored' | 'unmatched' | 'failed';

export type WebhookHandleResult = {
  outcome: WebhookOutcome;
  eventId: string;
  shipmentId: string | null;
  /** The internal status actually written, or null when nothing changed. */
  status: InternalShipmentStatus | null;
  deliveryId: string | null;
};

/** A Prisma unique-constraint violation. Detected structurally so tests can raise it. */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'P2002') return true;
  const message = error instanceof Error ? error.message : '';
  return /unique constraint/i.test(message);
}

/**
 * Produces a stable id for an event.
 *
 * Prefers the provider's own id, because it is the only handle guaranteed to be
 * unique across statuses and retries. Falls back to a deterministic
 * consignment+status pair.
 */
export function resolveEventId(event: CourierWebhookEvent): string {
  if (event.eventId) return event.eventId;

  const consignment = event.externalShipmentId ?? event.merchantReference ?? 'unknown';
  const status = event.providerStatus ?? 'no-status';
  return `${consignment}:${status}`;
}

function parseOccurredAt(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Locates the shipment a webhook refers to.
 *
 * Matching is by courier consignment id first, then by our own merchant
 * reference. The second path matters more than it looks: it is how an `uncertain`
 * booking — one where we never received a tracking id — is identified at all.
 */
async function findShipment(event: CourierWebhookEvent) {
  const select = {
    id: true,
    status: true,
    trackingId: true,
    bookingState: true,
    // Needed so a newly reached status does not overwrite the timestamp of the
    // moment it was actually first reached.
    pickupRequestedAt: true,
    pickedUpAt: true,
    outForDeliveryAt: true,
    deliveredAt: true,
  } as const;

  if (event.externalShipmentId) {
    const byTracking = await prismaDirect.orderShipment.findFirst({
      where: { trackingId: event.externalShipmentId },
      select,
    });
    if (byTracking) return byTracking;
  }

  if (event.merchantReference) {
    return prismaDirect.orderShipment.findFirst({
      where: {
        merchantReference: event.merchantReference,
        courierProvider: event.provider,
      },
      select,
    });
  }

  return null;
}

/**
 * How long a claim may sit at `received` before another delivery is allowed to
 * take it over.
 *
 * `received` means "claimed, work in progress". If the process dies between the
 * claim and the status write, that row would otherwise stay `received` forever,
 * and because the unique index still rejects the insert, every subsequent
 * redelivery from the courier would be reported as a duplicate and answered 2xx.
 * The event would be lost permanently and silently — the worst possible outcome,
 * since the courier has no reason to retry something we keep acknowledging.
 *
 * The lease has to be long enough that ordinary processing is never stolen
 * mid-flight, and short enough that a crash is recovered within a courier's
 * retry window. Applying a webhook is two database writes, so minutes of
 * headroom is generous.
 */
const CLAIM_LEASE_MS = 5 * 60_000;

/**
 * Claims the delivery, or reports it as a replay.
 *
 * `deliveryCount` is incremented rather than reset so a webhook redelivered many
 * times is visible in the data — a courier redelivering in a loop is a real
 * integration problem worth surfacing.
 */
async function claimDelivery(
  provider: string,
  eventId: string,
  event: CourierWebhookEvent,
): Promise<{ claimed: true; id: string } | { claimed: false }> {
  try {
    const created = await prismaDirect.webhookDelivery.create({
      data: {
        provider,
        eventId,
        status: event.providerStatus ?? 'unknown',
        externalShipmentId: event.externalShipmentId,
        outcome: 'received',
      },
      select: { id: true },
    });
    return { claimed: true, id: created.id };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      // A real database problem, not a replay. Surfacing it lets the route answer
      // 5xx so the courier retries instead of us silently dropping the event.
      throw error;
    }

    // The insert lost the race, or a previous attempt crashed. Distinguish the
    // two, because answering a crashed attempt with "duplicate" loses the event.
    if (await reclaimStaleClaim(provider, eventId)) {
      const reclaimed = await prismaDirect.webhookDelivery.findFirst({
        where: { provider, eventId },
        select: { id: true },
      });
      if (reclaimed) return { claimed: true, id: reclaimed.id };
    }

    return { claimed: false };
  }
}

/**
 * Takes over a claim that was never finished.
 *
 * Uses `receivedAt` as a compare-and-swap token: two concurrent redeliveries
 * both read the same `receivedAt`, but only one can win the `updateMany` that
 * matches on it. The loser reports a duplicate, so an event is still applied at
 * most once even under simultaneous reclaim.
 *
 * Returns false when there is nothing to reclaim, when the claim is still within
 * its lease, or when the accounting itself failed. In every one of those cases the
 * caller treats the delivery as a duplicate, which is the conservative choice:
 * a duplicate is acknowledged, whereas a wrongly-reprocessed event would double-apply.
 */
async function reclaimStaleClaim(provider: string, eventId: string): Promise<boolean> {
  try {
    const existing = await prismaDirect.webhookDelivery.findFirst({
      where: { provider, eventId },
      select: { id: true, outcome: true, receivedAt: true },
    });

    // Anything other than `received` was finished deliberately, so the event has
    // genuinely already been applied (or deliberately ignored). Do not redo it.
    if (!existing || existing.outcome !== 'received') return false;

    const ageMs = Date.now() - existing.receivedAt.getTime();
    if (!Number.isFinite(ageMs) || ageMs < CLAIM_LEASE_MS) return false;

    const taken = await prismaDirect.webhookDelivery.updateMany({
      where: { id: existing.id, outcome: 'received', receivedAt: existing.receivedAt },
      data: { receivedAt: new Date(), deliveryCount: { increment: 1 } },
    });

    if (taken.count === 1) {
      logger.warn('Reclaimed a webhook claim abandoned by an interrupted delivery.', {
        provider,
        eventId,
        ageMs,
      });
      return true;
    }

    // Lost the compare-and-swap: another delivery reclaimed it first.
    return false;
  } catch (error) {
    logger.warn('Could not evaluate a stale webhook claim.', {
      provider,
      eventId,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

async function bumpDeliveryCount(provider: string, eventId: string): Promise<void> {
  try {
    const existing = await prismaDirect.webhookDelivery.findFirst({
      where: { provider, eventId },
      select: { id: true },
    });
    if (!existing) return;

    await prismaDirect.webhookDelivery.update({
      where: { id: existing.id },
      data: { deliveryCount: { increment: 1 }, outcome: 'duplicate', processedAt: new Date() },
    });
  } catch (error) {
    // Replay accounting is diagnostics, not correctness. Never fail a delivery
    // because a counter could not be bumped.
    logger.warn('Could not record a duplicate webhook delivery.', {
      provider,
      eventId,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function finishDelivery(deliveryId: string, outcome: WebhookOutcome, error?: unknown) {
  try {
    await prismaDirect.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        processedAt: new Date(),
        outcome,
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : null,
      },
    });
  } catch (updateError) {
    logger.warn('Could not finalise a webhook delivery record.', {
      deliveryId,
      reason: updateError instanceof Error ? updateError.message : 'Unknown error',
    });
  }
}

export type WebhookHandleOptions = {
  /**
   * Called once, and only when the status actually changed.
   *
   * The caller owns app side effects (customer notifications, reseller
   * settlement). Two properties matter and both are why this is a hook rather
   * than something the service does itself:
   *
   *  - it fires only on a real transition, so a redelivered webhook cannot send a
   *    customer a second "your parcel is out for delivery";
   *  - a failure inside it cannot fail the webhook, because the status is already
   *    committed and re-running the courier's redelivery would not help. It is
   *    logged and swallowed.
   */
  onStatusChanged?: (context: {
    shipmentId: string;
    orderId: string;
    status: InternalShipmentStatus;
  }) => Promise<void>;
};

/**
 * Verifies, deduplicates and applies one courier webhook.
 *
 * @throws {CourierWebhookError} signature invalid, or the body could not be read
 */
export async function handleCourierWebhook(
  providerCode: string,
  request: Request,
  options: WebhookHandleOptions = {},
): Promise<WebhookHandleResult> {
  const provider = requireCourierProvider(providerCode);

  // Fail closed. A false here means the secret is missing or wrong, and both
  // must be treated as "reject": accepting would allow forged deliveries.
  const verified = await provider.verifyWebhook(request);
  if (!verified) {
    throw new CourierWebhookError(
      providerCode,
      'Webhook signature verification failed.',
    );
  }

  const event = await provider.parseWebhook(request);
  const eventId = resolveEventId(event);

  const claim = await claimDelivery(providerCode, eventId, event);

  if (!claim.claimed) {
    await bumpDeliveryCount(providerCode, eventId);
    return {
      outcome: 'duplicate',
      eventId,
      shipmentId: null,
      status: null,
      deliveryId: null,
    };
  }

  try {
    const shipment = await findShipment(event);

    if (!shipment) {
      // Acknowledged rather than rejected. The courier will keep redelivering an
      // event that can never match, and a retry storm helps nobody. Recorded so
      // an unmatched consignment is still discoverable.
      await finishDelivery(claim.id, 'unmatched');
      return {
        outcome: 'unmatched',
        eventId,
        shipmentId: null,
        status: null,
        deliveryId: claim.id,
      };
    }

    const target = resolveStatusTransition(shipment.status, event.status);
    const occurredAt = parseOccurredAt(event.occurredAt) ?? new Date();

    // An unmappable status is recorded for audit but does not move the
    // shipment. Guessing here would corrupt a real delivery timeline.
    const timestampData = target
      ? (buildShipmentTimestampData(target, shipment, occurredAt) as Prisma.OrderShipmentUncheckedUpdateInput)
      : {};

    // Self-healing for an uncertain booking: the courier has now told us the
    // consignment exists, so the ambiguity is resolved without an operator. This
    // is only reached when matching by merchant reference, because a shipment
    // with no tracking id cannot match on consignment.
    const learnedTrackingId =
      !shipment.trackingId && event.externalShipmentId ? event.externalShipmentId : null;

    const metadata: Prisma.InputJsonValue | undefined =
      event.metadata && Object.keys(event.metadata).length > 0
        ? (event.metadata as Prisma.InputJsonValue)
        : undefined;

    await prismaDirect.$transaction([
      prismaDirect.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          source: 'webhook',
          provider: providerCode,
          externalStatus: event.providerStatus,
          internalStatus: target,
          eventId,
          occurredAt,
          note: target
            ? 'Status updated from a courier webhook.'
            : 'Courier webhook recorded without a status change.',
          metadata,
        },
      }),
      prismaDirect.orderShipment.update({
        where: { id: shipment.id },
        data: {
          ...(target ? { status: target } : {}),
          ...timestampData,
          providerStatus: event.providerStatus,
          ...(learnedTrackingId
            ? { trackingId: learnedTrackingId, bookingState: 'booked', lastBookedAt: new Date() }
            : {}),
        },
      }),
    ]);

    await finishDelivery(claim.id, target ? 'processed' : 'ignored');

    if (target && options.onStatusChanged) {
      const order = await prismaDirect.orderShipment.findUnique({
        where: { id: shipment.id },
        select: { orderId: true },
      });

      if (order) {
        try {
          await options.onStatusChanged({
            shipmentId: shipment.id,
            orderId: order.orderId,
            status: target,
          });
        } catch (hookError) {
          // The status change is already committed and a redelivery would not
          // re-run this path, so a failing side effect is logged, not thrown.
          logger.error('Post-webhook side effect failed.', {
            shipmentId: shipment.id,
            providerCode,
            reason: hookError instanceof Error ? hookError.message : 'Unknown error',
          });
        }
      }
    }

    return {
      outcome: target ? 'processed' : 'ignored',
      eventId,
      shipmentId: shipment.id,
      status: target,
      deliveryId: claim.id,
    };
  } catch (error) {
    // A unique violation on the event insert means this exact event was already
    // appended. Treat it as a replay rather than an error.
    if (isUniqueViolation(error)) {
      await bumpDeliveryCount(providerCode, eventId);
      return { outcome: 'duplicate', eventId, shipmentId: null, status: null, deliveryId: claim.id };
    }

    await finishDelivery(claim.id, 'failed', error);
    throw error;
  }
}

/**
 * Recent deliveries for one provider, newest first.
 *
 * Feeds the admin diagnostics view and, more usefully, answers "is this courier
 * redelivering on a loop?".
 */
export async function listWebhookDeliveries(providerCode: string, limit = 50) {
  return prismaDirect.webhookDelivery.findMany({
    where: { provider: providerCode },
    orderBy: { receivedAt: 'desc' },
    take: Math.min(Math.max(1, limit), 200),
    select: {
      id: true,
      eventId: true,
      status: true,
      outcome: true,
      externalShipmentId: true,
      deliveryCount: true,
      receivedAt: true,
      processedAt: true,
      errorMessage: true,
    },
  });
}
