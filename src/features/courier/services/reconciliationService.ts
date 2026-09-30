/**
 * Courier reconciliation.
 *
 * Webhooks are the primary way a shipment's status advances, but they cannot be
 * the only one. Couriers drop webhooks, deliver them late, and occasionally stop
 * delivering them during an incident. Reconciliation is the backstop: a periodic
 * poll that closes the gap.
 *
 * It handles two different problems, and conflating them would be a mistake:
 *
 *  1. **Stale active shipments.** A parcel with a tracking id that the courier
 *     has moved forward but we have not heard about. Fully automatable — this is
 *     an ordinary read.
 *
 *  2. **Ambiguous bookings.** A create call whose response was lost, leaving a
 *     parcel that may or may not exist. *Not* automatable in general, and this
 *     service is deliberately honest about that:
 *
 *       - When the provider advertises `referenceLookup`, we can ask it whether
 *         the reference exists. A definitive "no" makes the booking safely
 *         retryable; "yes" hands us a tracking id.
 *       - Pathao has no such endpoint. It can only be queried by consignment id,
 *         which is exactly what we are missing. So the only automatic resolution
 *         is the consignment-creation webhook, which the webhook service matches
 *         by merchant reference and self-heals.
 *       - Failing that, the booking stays `uncertain` and is escalated to an
 *         operator. It is never retried automatically, because a retry that hits
 *         a parcel the courier already holds produces a second physical delivery.
 *
 * Everything here is read-only against the courier. The single exception is
 * nothing: this file cannot create a consignment even if a future edit tried to,
 * because it never holds a booking call.
 */

import { prismaDirect } from '../../shared/services/database/prisma';
import { logger } from '../../../lib/logger';
import { requireCourierProvider } from '../registry/providerRegistry';
import { isCourierError } from '../core/errors';
import type { InternalShipmentStatus } from '../core/status';
import {
  buildShipmentTimestampData,
  isActiveStatus,
  isTerminalStatus,
  resolveStatusTransition,
} from '../core/status';

/** How long to wait before a parcel with no movement is polled again. */
const ACTIVE_POLL_INTERVAL_MS = 30 * 60 * 1000;

/**
 * How long an ambiguous booking is given to resolve itself via webhook before an
 * operator is asked to look.
 */
const UNCERTAIN_GRACE_MS = 6 * 60 * 60 * 1000;

/**
 * After this long an ambiguous booking is not merely waiting, it is a backlog
 * item. Surfaced by `listUncertainBookings` and never auto-resolved.
 */
const UNCERTAIN_ESCALATION_MS = 48 * 60 * 60 * 1000;

/** A poll failure backs off, so a courier outage does not turn into a hot loop. */
const MAX_POLL_BACKOFF_MS = 8 * 60 * 60 * 1000;
const RECONCILIATION_CLAIM_LEASE_MS = 10 * 60 * 1000;

export type ReconciliationOutcome =
  | 'advanced'
  | 'unchanged'
  | 'terminal'
  | 'resolved'
  | 'not_found'
  | 'needs_operator'
  | 'skipped'
  | 'failed';

export type ReconciliationResult = {
  shipmentId: string;
  outcome: ReconciliationOutcome;
  status: InternalShipmentStatus | null;
  nextReconcileAt: Date | null;
  detail: string | null;
};

type ReconcileCandidate = {
  id: string;
  status: string;
  trackingId: string | null;
  merchantReference: string | null;
  courierProvider: string | null;
  bookingState: string;
  lastReconciledAt: Date | null;
  nextReconcileAt: Date | null;
  lastBookedAt: Date | null;
  updatedAt: Date;
  pickupRequestedAt: Date | null;
  pickedUpAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
};

const CANDIDATE_SELECT = {
  id: true,
  status: true,
  trackingId: true,
  merchantReference: true,
  courierProvider: true,
  bookingState: true,
  lastReconciledAt: true,
  nextReconcileAt: true,
  lastBookedAt: true,
  updatedAt: true,
  pickupRequestedAt: true,
  pickedUpAt: true,
  outForDeliveryAt: true,
  deliveredAt: true,
} as const;

function backoffFor(shipment: ReconcileCandidate, now: number): Date {
  const previous = shipment.lastReconciledAt?.getTime() ?? 0;
  const elapsed = now - previous;

  // A shipment that has already been quiet for a long time is not being retried
  // in a tight loop, so cap the wait rather than growing it without bound.
  if (elapsed >= MAX_POLL_BACKOFF_MS) return new Date(now + ACTIVE_POLL_INTERVAL_MS);
  if (elapsed <= 0) return new Date(now + ACTIVE_POLL_INTERVAL_MS);

  const doubled = elapsed * 2;
  return new Date(now + Math.min(Math.max(doubled, ACTIVE_POLL_INTERVAL_MS), MAX_POLL_BACKOFF_MS));
}

async function setCursor(shipmentId: string, nextReconcileAt: Date | null, applied = false) {
  await prismaDirect.orderShipment.update({
    where: { id: shipmentId },
    data: {
      ...(applied ? { lastReconciledAt: new Date() } : {}),
      nextReconcileAt,
    },
  });
}

/**
 * Polls one booked shipment for movement.
 *
 * Only ever reads. A status the courier reports that we cannot map leaves the
 * shipment alone: an unrecognised string is not evidence of anything, and
 * guessing would corrupt a real delivery timeline.
 */
export async function reconcileShipment(
  shipmentId: string,
  providerOverride?: string,
): Promise<ReconciliationResult> {
  const shipment = await prismaDirect.orderShipment.findUnique({
    where: { id: shipmentId },
    select: CANDIDATE_SELECT,
  });

  if (!shipment) {
    return { shipmentId, outcome: 'skipped', status: null, nextReconcileAt: null, detail: 'Shipment not found.' };
  }

  const now = Date.now();

  if (isTerminalStatus(shipment.status)) {
    await setCursor(shipmentId, null);
    return { shipmentId, outcome: 'terminal', status: null, nextReconcileAt: null, detail: 'Shipment already finished.' };
  }

  const providerCode = (providerOverride ?? shipment.courierProvider ?? '').trim().toLowerCase();
  if (!providerCode) {
    await setCursor(shipmentId, null);
    return { shipmentId, outcome: 'skipped', status: null, nextReconcileAt: null, detail: 'No courier assigned.' };
  }

  let provider;
  try {
    provider = requireCourierProvider(providerCode);
  } catch {
    await setCursor(shipmentId, backoffFor(shipment, now));
    return {
      shipmentId,
      outcome: 'failed',
      status: null,
      nextReconcileAt: backoffFor(shipment, now),
      detail: 'Provider unavailable.',
    };
  }

  if (!provider.getCapabilities().tracking) {
    await setCursor(shipmentId, null);
    return { shipmentId, outcome: 'skipped', status: null, nextReconcileAt: null, detail: 'Provider cannot be polled.' };
  }

  // An ambiguous booking is a different problem from a stale one, and it has a
  // different resolution path. Handled before any tracking call because there is
  // usually no consignment id to call with.
  if (shipment.bookingState === 'uncertain') {
    return resolveUncertainBooking(shipment, provider, providerCode);
  }

  if (!shipment.trackingId) {
    await setCursor(shipmentId, null);
    return { shipmentId, outcome: 'skipped', status: null, nextReconcileAt: null, detail: 'No consignment id to poll.' };
  }

  const externalShipmentId = shipment.trackingId;
  const nextReconcileAt = backoffFor(shipment, now);

  try {
    const result = await provider.getShipmentStatus({ provider: providerCode, shipmentId, externalShipmentId });

    // A "could not tell" answer is not the same as "no movement". Distinguishing
    // them is why `resolveStatusTransition` is consulted rather than assigning.
    const target = resolveStatusTransition(shipment.status, result.status);

    if (!target) {
      const detail = result.status
        ? `Courier reported "${result.providerStatus}", which would move the parcel backwards; ignored.`
        : `Courier status "${result.providerStatus}" is not yet mapped; recorded only.`;

      await prismaDirect.$transaction([
        prismaDirect.orderShipment.update({
          where: { id: shipmentId },
          data: {
            providerStatus: result.providerStatus,
            ...(isActiveStatus(shipment.status) ? { lastReconciledAt: new Date() } : {}),
            nextReconcileAt: isActiveStatus(shipment.status) ? nextReconcileAt : null,
          },
        }),
        prismaDirect.shipmentEvent.create({
          data: {
            shipmentId,
            source: 'reconciliation',
            provider: providerCode,
            externalStatus: result.providerStatus,
            internalStatus: null,
            occurredAt: new Date(),
            note: detail,
          },
        }),
      ]);

      return {
        shipmentId,
        outcome: 'unchanged',
        status: null,
        nextReconcileAt: isActiveStatus(shipment.status) ? nextReconcileAt : null,
        detail,
      };
    }

    const timestampData = buildShipmentTimestampData(target, shipment) as Record<string, never>;

    await prismaDirect.$transaction([
      prismaDirect.orderShipment.update({
        where: { id: shipmentId },
        data: {
          status: target,
          ...timestampData,
          providerStatus: result.providerStatus,
          ...(result.courierCharge !== null && result.courierCharge !== undefined
            ? { courierCharge: result.courierCharge }
            : {}),
          lastReconciledAt: new Date(),
          nextReconcileAt: isTerminalStatus(target) ? null : nextReconcileAt,
        },
      }),
      prismaDirect.shipmentEvent.create({
        data: {
          shipmentId,
          source: 'reconciliation',
          provider: providerCode,
          externalStatus: result.providerStatus,
          internalStatus: target,
          occurredAt: new Date(),
          note: 'Status advanced by a reconciliation poll.',
        },
      }),
    ]);

    return {
      shipmentId,
      outcome: 'advanced',
      status: target,
      nextReconcileAt: isTerminalStatus(target) ? null : nextReconcileAt,
      detail: null,
    };
  } catch (error) {
    await setCursor(shipmentId, nextReconcileAt);

    logger.warn('Shipment reconciliation poll failed.', {
      shipmentId,
      providerCode,
      code: isCourierError(error) ? error.code : 'COURIER_UNKNOWN',
      retryAt: nextReconcileAt.toISOString(),
    });

    return {
      shipmentId,
      outcome: 'failed',
      status: null,
      nextReconcileAt,
      detail: 'The courier could not be reached.',
    };
  }
}

/**
 * Resolves — or escalates — a booking whose outcome was never confirmed.
 *
 * The single most important line in this file is the absence of a booking retry.
 * `not_found` only comes from a provider that can actually search by reference;
 * when one does not, that answer is never inferred.
 */
async function resolveUncertainBooking(
  shipment: ReconcileCandidate,
  provider: ReturnType<typeof requireCourierProvider>,
  providerCode: string,
): Promise<ReconciliationResult> {
  const now = Date.now();
  const waitingSince = shipment.updatedAt.getTime();
  const merchantReference = shipment.merchantReference;

  if (!merchantReference) {
    // Without a reference there is nothing to search for, now or later.
    await setCursor(shipment.id, null);
    return {
      shipmentId: shipment.id,
      outcome: 'needs_operator',
      status: null,
      nextReconcileAt: null,
      detail: 'No merchant reference was recorded, so the parcel cannot be identified.',
    };
  }

  if (provider.getCapabilities().referenceLookup && provider.findShipmentByReference) {
    try {
      const found = await provider.findShipmentByReference({ provider: providerCode, merchantReference });

      if (found?.externalShipmentId) {
        await prismaDirect.$transaction([
          prismaDirect.orderShipment.update({
            where: { id: shipment.id },
            data: {
              trackingId: found.externalShipmentId,
              providerStatus: found.providerStatus,
              bookingState: 'booked',
              lastBookedAt: new Date(),
              lastReconciledAt: new Date(),
              lastBookingError: null,
              lastBookingErrorCode: null,
              nextReconcileAt: new Date(now + ACTIVE_POLL_INTERVAL_MS),
            },
          }),
          prismaDirect.shipmentEvent.create({
            data: {
              shipmentId: shipment.id,
              source: 'reconciliation',
              provider: providerCode,
              externalStatus: found.providerStatus,
              internalStatus: found.status,
              occurredAt: new Date(),
              note: 'Ambiguous booking resolved: the consignment already existed.',
            },
          }),
        ]);

        return {
          shipmentId: shipment.id,
          outcome: 'resolved',
          status: found.status,
          nextReconcileAt: new Date(now + ACTIVE_POLL_INTERVAL_MS),
          detail: null,
        };
      }

      // A definitive "this reference does not exist" from a provider that can
      // actually search. Safe to release: no parcel was ever created.
      await prismaDirect.$transaction([
        prismaDirect.orderShipment.update({
          where: { id: shipment.id },
          data: {
            bookingState: 'failed',
            lastReconciledAt: new Date(),
            lastBookingError: 'The courier confirmed no consignment exists for this reference.',
            lastBookingErrorCode: 'RECONCILED_NOT_FOUND',
            nextReconcileAt: null,
          },
        }),
        prismaDirect.shipmentEvent.create({
          data: {
            shipmentId: shipment.id,
            source: 'reconciliation',
            provider: providerCode,
            occurredAt: new Date(),
            note: 'Ambiguous booking resolved: no consignment exists, safe to retry.',
          },
        }),
      ]);

      return {
        shipmentId: shipment.id,
        outcome: 'not_found',
        status: null,
        nextReconcileAt: null,
        detail: null,
      };
    } catch {
      await setCursor(shipment.id, backoffFor(shipment, now));
      return {
        shipmentId: shipment.id,
        outcome: 'failed',
        status: null,
        nextReconcileAt: backoffFor(shipment, now),
        detail: 'The reference lookup failed.',
      };
    }
  }

  // No lookup available. The consignment-creation webhook is the only automatic
  // route to resolution; until the grace period expires this stays a wait.
  if (now - waitingSince < UNCERTAIN_GRACE_MS) {
    const nextReconcileAt = new Date(now + ACTIVE_POLL_INTERVAL_MS);
    await setCursor(shipment.id, nextReconcileAt);
    return {
      shipmentId: shipment.id,
      outcome: 'unchanged',
      status: null,
      nextReconcileAt,
      detail: `Waiting for a consignment webhook; ${provider.name} cannot be searched by reference.`,
    };
  }

  const detail =
    now - waitingSince >= UNCERTAIN_ESCALATION_MS
      ? 'Unresolved for over two days. Check the courier dashboard for this reference before taking any action.'
      : `No consignment webhook after ${Math.round((now - waitingSince) / 3_600_000)}h. Ask ${provider.name} to look up "${merchantReference}".`;

  const nextCheck = new Date(now + ACTIVE_POLL_INTERVAL_MS);

  await prismaDirect.$transaction([
    prismaDirect.orderShipment.update({
      where: { id: shipment.id },
      data: { nextReconcileAt: nextCheck },
    }),
    prismaDirect.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        source: 'reconciliation',
        provider: providerCode,
        occurredAt: new Date(),
        note: detail,
        metadata: { merchantReference },
      },
    }),
  ]);

  return {
    shipmentId: shipment.id,
    outcome: 'needs_operator',
    status: null,
    nextReconcileAt: nextCheck,
    detail,
  };
}

/**
 * Processes the batch of shipments whose reconciliation cursor has come due.
 *
 * Polls one at a time. A courier outage should not turn into fifty concurrent
 * requests that all fail and all extend their own backoff in a thundering herd.
 */
export async function reconcileDueShipments(limit = 25): Promise<ReconciliationResult[]> {
  const due = await prismaDirect.orderShipment.findMany({
    where: {
      nextReconcileAt: { lte: new Date() },
      bookingState: { in: ['booked', 'uncertain'] },
    },
    orderBy: { nextReconcileAt: 'asc' },
    take: Math.min(Math.max(1, limit), 100),
    select: CANDIDATE_SELECT,
  });

  const results: ReconciliationResult[] = [];

  for (const shipment of due) {
    // Claim the cursor before polling. Multiple worker processes may wake up at
    // the same time; only one is allowed to perform the courier API request.
    const claimed = await prismaDirect.orderShipment.updateMany({
      where: {
        id: shipment.id,
        nextReconcileAt: { lte: new Date() },
        bookingState: { in: ['booked', 'uncertain'] },
      },
      data: {
        nextReconcileAt: new Date(Date.now() + RECONCILIATION_CLAIM_LEASE_MS),
      },
    });

    if (claimed.count !== 1) continue;

    try {
      results.push(await reconcileShipment(shipment.id));
    } catch (error) {
      logger.error('Reconciliation threw unexpectedly.', {
        shipmentId: shipment.id,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
      results.push({
        shipmentId: shipment.id,
        outcome: 'failed',
        status: null,
        nextReconcileAt: null,
        detail: 'Unexpected error.',
      });
    }
  }

  return results;
}

/** Ambiguous bookings, oldest first, for the operator queue. */
export async function listReconciliationBacklog(limit = 50) {
  return prismaDirect.orderShipment.findMany({
    where: { bookingState: 'uncertain' },
    orderBy: { updatedAt: 'asc' },
    take: Math.min(Math.max(1, limit), 200),
    select: {
      id: true,
      orderId: true,
      sellerId: true,
      courierProvider: true,
      merchantReference: true,
      trackingId: true,
      lastBookingError: true,
      lastBookingErrorCode: true,
      lastBookedAt: true,
      updatedAt: true,
    },
  });
}
