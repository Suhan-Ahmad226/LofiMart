/**
 * Courier booking job handler.
 *
 * This exists as a separate module, outside the BullMQ worker, for one reason:
 * the retry decision is safety-critical and has to be testable. A worker
 * callback wired directly to Redis cannot be exercised in a unit test, and
 * "does an ambiguous booking get retried?" is not something to answer by
 * reading code carefully.
 *
 * The rule it encodes:
 *
 *   - a booking that may have created a parcel is **never** retried;
 *   - a booking the courier definitively rejected is **not** retried, because the
 *     shipment is already marked failed and only a deliberate seller action can
 *     fix bad data;
 *   - a shipment that is already booked, or mid-attempt, is **not** retried,
 *     because re-running cannot change that state;
 *   - only a failure the courier itself calls retryable propagates, and those
 *     are the only jobs BullMQ sees again.
 *
 * Everything else returns a result and the job completes normally. A completed
 * job with a recorded shipment state is far easier to reason about at 3am than a
 * job that burned five attempts re-learning something already in the database.
 */

import { logger } from '../../../lib/logger';
import { bookShipment, CourierBookingUncertainError, ShipmentNotBookableError } from './bookingService';
import { isCourierError } from '../core/errors';

export type CourierBookingJobOutcome = 'booked' | 'duplicate' | 'uncertain' | 'skipped' | 'rejected';

export type CourierBookingJobResult = {
  outcome: CourierBookingJobOutcome;
  shipmentId: string;
  /** Merchant reference for an uncertain outcome, so it can be traced. */
  merchantReference?: string;
  trackingId?: string;
  detail?: string;
};

export type CourierBookingJobData = {
  shipmentId: string;
  providerCode: string;
};

/**
 * Runs one booking job.
 *
 * @throws when the failure is retryable, so the queue backs off and tries again
 */
export async function runCourierBookingJob(
  data: CourierBookingJobData,
): Promise<CourierBookingJobResult> {
  const { shipmentId, providerCode } = data;

  if (typeof shipmentId !== 'string' || !shipmentId.trim()) {
    throw new Error('Courier booking job is missing a shipment id.');
  }

  if (typeof providerCode !== 'string' || !providerCode.trim()) {
    // A malformed payload cannot become well-formed by retrying.
    throw new Error('Courier booking job is missing a provider code.');
  }

  try {
    const result = await bookShipment(shipmentId, providerCode);

    return {
      outcome: result.duplicate ? 'duplicate' : 'booked',
      shipmentId,
      trackingId: result.trackingId,
    };
  } catch (error) {
    if (error instanceof CourierBookingUncertainError) {
      logger.warn('courier.booking.uncertain', {
        shipmentId,
        providerCode,
        merchantReference: error.merchantReference,
      });
      return { outcome: 'uncertain', shipmentId, merchantReference: error.merchantReference };
    }

    if (error instanceof ShipmentNotBookableError) {
      return { outcome: 'skipped', shipmentId, detail: error.message };
    }

    // `uncertain` is checked before `retryable`, and the order matters. A
    // `CourierTimeoutError` is flagged retryable *and* uncertain, and it is the
    // canonical duplicate-booking cause: the courier may have created the parcel
    // before the response was lost. The booking service normally converts it into
    // a `CourierBookingUncertainError`, but if a raw one ever reaches here this
    // is the last thing standing between a timeout and five more attempts.
    if (isCourierError(error) && error.uncertain) {
      logger.warn('courier.booking.uncertain', {
        shipmentId,
        providerCode,
        code: error.code,
      });
      return { outcome: 'uncertain', shipmentId };
    }

    if (isCourierError(error) && !error.retryable) {
      logger.warn('courier.booking.rejected', {
        shipmentId,
        providerCode,
        code: error.code,
      });
      return { outcome: 'rejected', shipmentId, detail: error.message };
    }

    // Retryable and worth retrying: a network blip, a rate limit, a 5xx. The
    // service has already recorded the attempt, so this genuinely is a fresh try.
    logger.error('courier.booking.retryable_failure', {
      shipmentId,
      providerCode,
      code: isCourierError(error) ? error.code : 'COURIER_UNKNOWN',
    });
    throw error;
  }
}
