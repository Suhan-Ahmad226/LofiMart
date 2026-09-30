import { describe, expect, it } from 'vitest';
import {
  calculateNextRun,
  addIntervalDays,
  isRunAllowed,
  getNextScheduleRun,
} from './calculate-next-run';

describe('calculateNextRun', () => {
  it('adds the allowed recurring interval while preserving the posting time', () => {
    const nextRun = calculateNextRun(new Date('2026-09-12T20:00:00.000Z'), 3);

    expect(nextRun.toISOString()).toBe('2026-09-15T20:00:00.000Z');
  });

  it('rejects unsupported intervals', () => {
    expect(() => calculateNextRun(new Date('2026-09-12T20:00:00.000Z'), 6)).toThrow(
      'Interval must be between 1 and 5 days.',
    );
  });
});

describe('addIntervalDays', () => {
  it('keeps the exact wall-clock time when crossing a DST boundary', () => {
    expect(addIntervalDays(new Date('2026-03-08T20:00:00.000Z'), 1).toISOString()).toBe(
      '2026-03-09T20:00:00.000Z',
    );
  });

  it('carries into the next month', () => {
    expect(addIntervalDays(new Date('2026-01-31T18:30:00.000Z'), 2).toISOString()).toBe(
      '2026-02-02T18:30:00.000Z',
    );
  });

  it('rejects an invalid date', () => {
    expect(() => addIntervalDays(new Date('not-a-date'), 1)).toThrow('A valid date is required.');
  });

  it('rejects a negative day count', () => {
    expect(() => addIntervalDays(new Date('2026-09-12T20:00:00.000Z'), -1)).toThrow(
      'Days must be a non-negative integer.',
    );
  });
});

describe('isRunAllowed', () => {
  const nextRunAt = new Date('2026-09-13T20:00:00.000Z');

  it('allows a run when there are no boundaries', () => {
    expect(isRunAllowed({ nextRunAt, postsCreated: 3 })).toBe(true);
  });

  it('allows a run exactly at the inclusive endAt boundary', () => {
    expect(isRunAllowed({ nextRunAt, endAt: nextRunAt, postsCreated: 0 })).toBe(true);
  });

  it('blocks a run after the endAt boundary', () => {
    const endAt = new Date('2026-09-13T19:59:59.999Z');
    expect(isRunAllowed({ nextRunAt, endAt, postsCreated: 0 })).toBe(false);
  });

  it('blocks a run when maxPosts has been reached', () => {
    expect(isRunAllowed({ nextRunAt, maxPosts: 3, postsCreated: 3 })).toBe(false);
  });

  it('allows a run when maxPosts has not been reached', () => {
    expect(isRunAllowed({ nextRunAt, maxPosts: 3, postsCreated: 2 })).toBe(true);
  });

  it('blocks a run when maxPosts equals zero with nothing created yet', () => {
    expect(isRunAllowed({ nextRunAt, maxPosts: 0, postsCreated: 0 })).toBe(false);
  });

  it('ignores a null endAt', () => {
    expect(isRunAllowed({ nextRunAt, endAt: null, postsCreated: 3 })).toBe(true);
  });

  it('rejects a null or invalid nextRunAt', () => {
    expect(() => isRunAllowed({ nextRunAt: null, postsCreated: 0 })).toThrow(
      'A valid nextRunAt date is required.',
    );
  });

  it('rejects a negative postsCreated count', () => {
    expect(() => isRunAllowed({ nextRunAt, postsCreated: -1 })).toThrow(
      'postsCreated must be a non-negative integer.',
    );
  });
});

describe('getNextScheduleRun', () => {
  const lastRunAt = new Date('2026-09-12T20:00:00.000Z');

  it('plans the next run for every allowed interval', () => {
    const expected = [
      '2026-09-13T20:00:00.000Z',
      '2026-09-14T20:00:00.000Z',
      '2026-09-15T20:00:00.000Z',
      '2026-09-16T20:00:00.000Z',
      '2026-09-17T20:00:00.000Z',
    ];

    expected.forEach((iso, index) => {
      const { nextRunAt } = getNextScheduleRun({
        lastRunAt,
        intervalDays: index + 1,
        postsCreated: 2,
      });
      expect(nextRunAt!.toISOString()).toBe(iso);
    });
  });

  it('returns null when the next run falls after endAt', () => {
    const endAt = new Date('2026-09-14T00:00:00.000Z');
    const { nextRunAt } = getNextScheduleRun({ lastRunAt, intervalDays: 3, endAt, postsCreated: 0 });
    expect(nextRunAt).toBeNull();
  });

  it('returns the planned run when endAt is not yet reached', () => {
    const endAt = new Date('2026-09-16T00:00:00.000Z');
    const { nextRunAt } = getNextScheduleRun({ lastRunAt, intervalDays: 3, endAt, postsCreated: 0 });
    expect(nextRunAt!.toISOString()).toBe('2026-09-15T20:00:00.000Z');
  });

  it('returns null when maxPosts has been reached', () => {
    const { nextRunAt } = getNextScheduleRun({
      lastRunAt,
      intervalDays: 3,
      maxPosts: 2,
      postsCreated: 2,
    });
    expect(nextRunAt).toBeNull();
  });

  it('runs forever when no boundary is set', () => {
    const endAt = new Date('2040-01-01T00:00:00.000Z');
    const { nextRunAt } = getNextScheduleRun({ lastRunAt, intervalDays: 5, endAt, postsCreated: 0 });
    expect(nextRunAt!.toISOString()).toBe('2026-09-17T20:00:00.000Z');
  });

  it('rejects an interval below the allowed range', () => {
    expect(() => getNextScheduleRun({ lastRunAt, intervalDays: 0, postsCreated: 0 })).toThrow(
      'Interval must be between 1 and 5 days.',
    );
  });

  it('rejects a non-integer interval', () => {
    expect(() => getNextScheduleRun({ lastRunAt, intervalDays: 2.5, postsCreated: 0 })).toThrow(
      'Interval must be between 1 and 5 days.',
    );
  });

  it('rejects an invalid postsCreated count', () => {
    expect(() => getNextScheduleRun({ lastRunAt, intervalDays: 3, postsCreated: -1 })).toThrow(
      'postsCreated must be a non-negative integer.',
    );
  });
});