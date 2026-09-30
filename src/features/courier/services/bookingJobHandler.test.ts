import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The retry policy is the whole point of this module. An ambiguous booking whose
 * error escapes to BullMQ would be retried up to five times, which is five more
 * chances to create a second physical parcel for one order.
 *
 * So these tests are framed around one question per case: *does this failure make
 * the job run again?* Exactly one answer is allowed to be "yes".
 */

const bookShipment = vi.fn();

vi.mock('./bookingService', async () => {
  const actual = await vi.importActual<typeof import('./bookingService')>('./bookingService');
  return {
    ...actual,
    bookShipment,
  };
});

const { runCourierBookingJob } = await import('./bookingJobHandler');

const { CourierBookingUncertainError, ShipmentNotBookableError } = await import('./bookingService');
const {
  CourierTimeoutError,
  CourierNetworkError,
  CourierRateLimitError,
  CourierValidationError,
  CourierAuthorizationError,
} = await import('../core/errors');

const booked = {
  shipmentId: 'ship-1',
  trackingId: 'PAT-1',
  provider: 'pathao',
  merchantReference: 'LFM-ship-1',
  status: 'pickup_requested' as const,
  providerStatus: 'Pending',
  courierCharge: 120,
  codFee: 5,
  codAmount: 1500,
  duplicate: false,
  concurrent: false,
  bookedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bookShipment.mockResolvedValue(booked);
});

describe('runCourierBookingJob', () => {
  it('reports a completed booking', async () => {
    const result = await runCourierBookingJob({ shipmentId: 'ship-1', providerCode: 'pathao' });

    expect(result.outcome).toBe('booked');
    expect(result.trackingId).toBe('PAT-1');
  });

  it('reports a repeat booking as a duplicate rather than doing it again', async () => {
    bookShipment.mockResolvedValue({ ...booked, duplicate: true });

    const result = await runCourierBookingJob({ shipmentId: 'ship-1', providerCode: 'pathao' });

    expect(result.outcome).toBe('duplicate');
  });

  it('never lets an ambiguous booking be retried', async () => {
    bookShipment.mockRejectedValue(
      new CourierBookingUncertainError('ship-1', 'LFM-ship-1', new Error('socket hang up')),
    );

    // If this threw, BullMQ would try again — and again — against a parcel the
    // courier may already hold.
    const result = await runCourierBookingJob({ shipmentId: 'ship-1', providerCode: 'pathao' });

    expect(result.outcome).toBe('uncertain');
    expect(result.merchantReference).toBe('LFM-ship-1');
    expect(bookShipment).toHaveBeenCalledTimes(1);
  });

  it('does not retry a shipment that is mid-attempt or already booked', async () => {
    bookShipment.mockRejectedValue(
      new ShipmentNotBookableError('ship-1', 'a booking attempt is already uncertain'),
    );

    const result = await runCourierBookingJob({ shipmentId: 'ship-1', providerCode: 'pathao' });

    expect(result.outcome).toBe('skipped');
  });

  it('does not retry a booking the courier definitively rejected', async () => {
    bookShipment.mockRejectedValue(
      new CourierValidationError('pathao', 'Recipient phone is not a Bangladeshi number.'),
    );

    // The shipment is already marked failed in the database. Retrying the same
    // payload can only produce the same rejection; the seller has to fix the data.
    const result = await runCourierBookingJob({ shipmentId: 'ship-1', providerCode: 'pathao' });

    expect(result.outcome).toBe('rejected');
    expect(result.detail).toMatch(/Bangladeshi/);
  });

  it('does not retry a booking the account is not permitted to make', async () => {
    bookShipment.mockRejectedValue(new CourierAuthorizationError('pathao', 403));

    const result = await runCourierBookingJob({ shipmentId: 'ship-1', providerCode: 'pathao' });

    expect(result.outcome).toBe('rejected');
  });

  it.each([
    ['a network failure', () => new CourierNetworkError('pathao', 'connect ECONNRESET')],
    ['a rate limit', () => new CourierRateLimitError('pathao', 2000)],
  ])('does retry after %s', async (_label, build) => {
    bookShipment.mockRejectedValue(build());

    // The only failures allowed to reach BullMQ again. A timeout is deliberately
    // absent: it is the canonical duplicate-booking cause, and the service
    // reports it as `uncertain` before it gets here.
    await expect(
      runCourierBookingJob({ shipmentId: 'ship-1', providerCode: 'pathao' }),
    ).rejects.toBeDefined();
  });

  it('never retries a timeout, which is the duplicate-parcel risk', async () => {
    bookShipment.mockRejectedValue(new CourierTimeoutError('pathao', 10000));

    // A raw timeout is flagged both retryable and uncertain, so the order of the
    // checks in the handler is what keeps this from being retried. The booking
    // service is expected to have converted it already; if one ever escapes, the
    // job handler is the last line of defence against five more attempts.
    const result = await runCourierBookingJob({ shipmentId: 'ship-1', providerCode: 'pathao' });

    expect(result.outcome).toBe('uncertain');
    expect(bookShipment).toHaveBeenCalledTimes(1);
  });

  it('refuses a payload with no shipment id', async () => {
    await expect(
      runCourierBookingJob({ shipmentId: '', providerCode: 'pathao' }),
    ).rejects.toThrow(/shipment id/i);
    expect(bookShipment).not.toHaveBeenCalled();
  });

  it('refuses a payload with no provider code', async () => {
    await expect(runCourierBookingJob({ shipmentId: 'ship-1', providerCode: '' })).rejects.toThrow(
      /provider code/i,
    );
  });
});
