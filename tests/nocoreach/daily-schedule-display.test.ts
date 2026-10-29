// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { dailyScheduleTime } from '../../client/lib/schedule-time';
import english from '../../shared/i18n/en.json';

afterEach(() => {
  vi.unstubAllEnvs();
  setDictionary(null);
});

it.each([
  ['Asia/Shanghai', '2026-10-29T00:00:00Z', '0 9 * * *', 'UTC', '17:00'],
  ['America/New_York', '2026-10-29T00:00:00Z', '0 9 * * *', 'UTC', '05:00'],
  [
    'America/New_York',
    '2026-10-29T00:00:00Z',
    '0 9 * * *',
    'Asia/Shanghai',
    '21:00',
  ],
  ['Asia/Shanghai', '2026-10-29T00:00:00Z', '30 23 * * *', 'UTC', '07:30'],
  ['America/New_York', '2026-03-08T00:00:00Z', '0 9 * * *', 'UTC', '05:00'],
  ['America/New_York', '2026-03-07T00:00:00Z', '0 9 * * *', 'UTC', '04:00'],
  ['America/New_York', '2026-11-01T00:00:00Z', '0 9 * * *', 'UTC', '04:00'],
  ['America/New_York', '2026-10-31T00:00:00Z', '0 9 * * *', 'UTC', '05:00'],
  [
    'Asia/Shanghai',
    '2026-03-08T00:00:00Z',
    '30 2 * * *',
    'America/New_York',
    '15:30',
  ],
  [
    'Asia/Shanghai',
    '2026-11-01T00:00:00Z',
    '30 1 * * *',
    'America/New_York',
    '13:30',
  ],
])(
  'shows the next occurrence in %s at %s (%s in %s)',
  (browser, now, cron, timezone, expected) => {
    vi.stubEnv('TZ', browser);
    const schedule = Object.freeze({ cron, timezone });
    expect(dailyScheduleTime(schedule, new Date(now))).toBe(expected);
    expect(schedule).toEqual({ cron, timezone });
  },
);

it('recomputes for the next execution after today has run and follows the UI locale', () => {
  vi.stubEnv('TZ', 'America/New_York');
  const schedule = { cron: '0 9 * * *', timezone: 'UTC' };
  expect(dailyScheduleTime(schedule, new Date('2026-10-31T10:00:00Z'))).toBe(
    '04:00',
  );
  setDictionary(english);
  expect(dailyScheduleTime(schedule, new Date('2026-10-31T10:00:00Z'))).toBe(
    '4:00 AM',
  );
  expect(
    dailyScheduleTime(
      { ...schedule, cron: '0 0 9 * * *' },
      new Date('2026-10-31T10:00:00Z'),
    ),
  ).toBe('4:00 AM');
});

it.each([
  null,
  undefined,
  { cron: null, timezone: 'UTC' },
  { cron: '0 9 * * *' },
  { cron: '0 9 * * *', timezone: 'bad-zone' },
  { cron: '0 99 * * *', timezone: 'UTC' },
  { cron: '0 9 * * 1', timezone: 'UTC' },
  { cron: '*/5 * * * *', timezone: 'UTC' },
])('omits unknown or non-daily clock metadata: %j', (schedule) => {
  expect(dailyScheduleTime(schedule)).toBeNull();
});
