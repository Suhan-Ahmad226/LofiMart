export const ALLOWED_INTERVAL_DAYS = [1, 2, 3, 4, 5] as const;

export type AllowedIntervalDays = (typeof ALLOWED_INTERVAL_DAYS)[number];

export function isAllowedIntervalDays(value: number): value is AllowedIntervalDays {
  return ALLOWED_INTERVAL_DAYS.includes(value as AllowedIntervalDays);
}

function assertAllowedInterval(intervalDays: number) {
  if (!Number.isInteger(intervalDays) || !isAllowedIntervalDays(intervalDays)) {
    throw new Error('Interval must be between 1 and 5 days.');
  }
}

function assertNonNegativeLimit(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

export function addIntervalDays(date: Date, days: number): Date {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('A valid date is required.');
  }

  if (!Number.isInteger(days) || days < 0) {
    throw new Error('Days must be a non-negative integer.');
  }

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export function calculateNextRun(currentRun: Date, intervalDays: number) {
  assertAllowedInterval(intervalDays);

  return addIntervalDays(currentRun, intervalDays);
}

/**
 * Returns true when a scheduled run at nextRunAt is still allowed, i.e. the
 * schedule has not reached the endAt boundary or the max-posts count.
 *
 * The endAt boundary is inclusive: a run exactly at endAt is allowed.
 */
export function isRunAllowed(opts: {
  nextRunAt: Date | null;
  endAt?: Date | null;
  maxPosts?: number | null;
  postsCreated: number;
}): boolean {
  const { nextRunAt, endAt, maxPosts, postsCreated } = opts;

  if (!nextRunAt || !(nextRunAt instanceof Date) || Number.isNaN(nextRunAt.getTime())) {
    throw new Error('A valid nextRunAt date is required.');
  }

  assertNonNegativeLimit(postsCreated, 'postsCreated');
  if (maxPosts != null) {
    assertNonNegativeLimit(maxPosts, 'maxPosts');
  }

  if (endAt && !(endAt instanceof Date)) {
    throw new Error('A valid endAt date is required.');
  }

  if (maxPosts != null && postsCreated >= maxPosts) {
    return false;
  }

  if (endAt && nextRunAt.getTime() > endAt.getTime()) {
    return false;
  }

  return true;
}

/**
 * Pure schedule planner. Computes the next run after lastRunAt, honouring the
 * endAt and maxPosts boundaries. A null nextRunAt means no further runs are
 * allowed (the runner decides completion semantics from that result).
 */
export function getNextScheduleRun(input: {
  lastRunAt: Date;
  intervalDays: number;
  endAt?: Date | null;
  maxPosts?: number | null;
  postsCreated: number;
}): { nextRunAt: Date | null } {
  const { lastRunAt, intervalDays, endAt, maxPosts, postsCreated } = input;

  assertAllowedInterval(intervalDays);

  const nextRunAt = addIntervalDays(lastRunAt, intervalDays);

  if (!isRunAllowed({ nextRunAt, endAt, maxPosts, postsCreated })) {
    return { nextRunAt: null };
  }

  return { nextRunAt };
}

export function combineDateAndTime(dateValue: string, timeValue: string) {
  const normalizedDate = dateValue.trim();
  const normalizedTime = timeValue.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    throw new Error('Enter a valid schedule date.');
  }

  if (!/^\d{2}:\d{2}$/.test(normalizedTime)) {
    throw new Error('Enter a valid schedule time.');
  }

  const date = new Date(`${normalizedDate}T${normalizedTime}:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Enter a valid schedule date and time.');
  }

  return date;
}