// @vitest-environment node
import { CronExpressionParser } from 'cron-parser';
import { expect, it } from 'vitest';
import {
  isScheduleTimezone,
  scheduleDay,
  scheduledToday,
} from '../../server/nocoreach/schedule-time.js';

it.each([
  'UTC',
  'Asia/Shanghai',
  'America/New_York',
  'Etc/GMT+8',
  'US/Eastern',
])('accepts IANA timezone %s', (timezone) =>
  expect(isScheduleTimezone(timezone)).toBe(true),
);
it.each(['', 'Mars/Olympus', '+08:00', '-0500', '+08', 'GMT+0800'])(
  'rejects non-IANA timezone %s',
  (timezone) => expect(isScheduleTimezone(timezone)).toBe(false),
);
it.each([
  ['UTC', '2026-10-16T10:00:00Z', '0 9 * * *', '2026-10-16T09:00:00.000Z'],
  [
    'Asia/Shanghai',
    '2026-10-16T10:00:00Z',
    '0 9 * * *',
    '2026-10-16T01:00:00.000Z',
  ],
  [
    'Asia/Shanghai',
    '2026-10-15T16:00:00Z',
    '0 0 * * *',
    '2026-10-15T16:00:00.000Z',
  ],
  ['UTC', '2026-10-16T23:59:00Z', '0 0 * * *', '2026-10-16T00:00:00.000Z'],
  [
    'America/New_York',
    '2026-03-08T07:15:00Z',
    '30 2 * * *',
    '2026-03-08T07:30:00.000Z',
  ],
  [
    'America/New_York',
    '2026-11-01T06:15:00Z',
    '30 1 * * *',
    '2026-11-01T05:30:00.000Z',
  ],
])(
  'finds the task-local daily firing in %s at %s',
  (timezone, now, cron, expected) => {
    expect(scheduledToday(cron!, new Date(now!), timezone)?.toISOString()).toBe(
      expected,
    );
  },
);

it('uses the locked engine rules for continuous DST scheduling', () => {
  const spring = CronExpressionParser.parse('30 2 * * *', {
    tz: 'America/New_York',
    currentDate: '2026-03-08T05:00:00Z',
  });
  expect(spring.next().toISOString()).toBe('2026-03-08T07:30:00.000Z');
  expect(spring.next().toISOString()).toBe('2026-03-09T06:30:00.000Z');
  const autumn = CronExpressionParser.parse('30 1 * * *', {
    tz: 'America/New_York',
    currentDate: '2026-11-01T04:00:00Z',
  });
  expect(autumn.next().toISOString()).toBe('2026-11-01T05:30:00.000Z');
  expect(autumn.next().toISOString()).toBe('2026-11-02T06:30:00.000Z');
  // A fresh parser after recovery can select the second repeated wall-clock time.
  expect(
    CronExpressionParser.parse('30 1 * * *', {
      tz: 'America/New_York',
      currentDate: '2026-11-01T06:00:00Z',
    })
      .next()
      .toISOString(),
  ).toBe('2026-11-01T06:30:00.000Z');
  expect(scheduleDay(new Date('2026-10-15T16:01:00Z'), 'Asia/Shanghai')).toBe(
    '2026-10-16',
  );
});
