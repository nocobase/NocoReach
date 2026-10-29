// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import {
  formatDate,
  formatDateTime,
  formatTime,
  localDateKey,
} from '../../client/lib/format';
import { shortDate } from '../../client/pages/results/format';
import {
  dateOf as downloadDate,
  ago as downloadAgo,
} from '../../client/pages/data-downloads/model';
import { reportDate } from '../../client/pages/task-detail/material-notices';
import {
  snoozeToday,
  snoozeDays,
} from '../../client/pages/task-detail/snooze-days';
import english from '../../shared/i18n/en.json';

const now = new Date('2026-10-21T12:00:00Z');
afterEach(() => {
  vi.unstubAllEnvs();
  setDictionary(null);
});

it.each([
  ['UTC', '2026-10-21', '10-21 23:30', '23:30:45'],
  ['Asia/Shanghai', '2026-10-22', '10-22 07:30', '07:30:45'],
  ['America/New_York', '2026-10-21', '10-21 19:30', '19:30:45'],
  ['Australia/Melbourne', '2026-10-22', '10-22 10:30', '10:30:45'],
])(
  'shows the same instant in browser timezone %s across callers',
  (zone, day, shown, clock) => {
    vi.stubEnv('TZ', zone);
    const values = [
      '2026-10-21T23:30:45Z',
      '2026-10-22T07:30:45+08:00',
      new Date('2026-10-21T23:30:45Z'),
      Date.parse('2026-10-21T23:30:45Z'),
    ];
    for (const value of values) {
      expect(localDateKey(value)).toBe(day);
      expect(formatDateTime(value, { now })).toBe(shown);
      expect(formatTime(value, { seconds: true })).toBe(clock);
    }
    const at = values[0] as string;
    expect(shortDate(at)).toBe(day.slice(5));
    expect(downloadDate(at)).toBe(day.slice(5));
    expect(reportDate(at)).toBe(`2026-${shown}`);
    // Analytics buckets and schedule form days are calendar dates, not midnight instants.
    expect(formatDate('2026-10-21', { now })).toBe('10-21');
    expect(localDateKey('2026-10-21')).toBe('2026-10-21');
  },
);

it('uses the offset at the displayed instant through DST gaps and folds', () => {
  vi.stubEnv('TZ', 'America/New_York');
  expect(formatTime('2026-03-08T06:59:00Z')).toBe('01:59');
  expect(formatTime('2026-03-08T07:00:00Z')).toBe('03:00');
  expect(formatTime('2026-11-01T05:30:00Z')).toBe('01:30');
  expect(formatTime('2026-11-01T06:30:00Z')).toBe('01:30');
  vi.stubEnv('TZ', 'Australia/Melbourne');
  expect(formatTime('2026-01-14T05:00:00Z')).toBe('16:00');
  expect(formatTime('2026-07-14T05:00:00Z')).toBe('15:00');
});

it('selects the year after conversion and follows language changes without changing the instant', () => {
  vi.stubEnv('TZ', 'Asia/Shanghai');
  const at = '2025-12-31T23:30:00Z';
  expect(formatDateTime(at, { now })).toBe('01-01 07:30');
  setDictionary(english);
  expect(formatDateTime(at, { now })).toBe('Jan 1, 7:30 AM');
  expect(formatDateTime(at, { now, locale: 'zh-CN', withYear: true })).toBe(
    '2026-01-01 07:30',
  );
  expect(formatTime(at, { locale: 'en-US', seconds: true })).toBe('7:30:00 AM');
  expect(formatDate('2025-12-31', { now })).toBe('Dec 31, 2025');
});

it.each([undefined, null, '', 'invalid', new Date(NaN)])(
  'keeps missing or invalid timestamps readable: %s',
  (value) => {
    expect(formatDateTime(value)).toBe('—');
    expect(formatTime(value)).toBe('—');
    expect(localDateKey(value)).toBe('');
  },
);

it.each(['UTC', 'Asia/Shanghai', 'America/New_York', 'Australia/Melbourne'])(
  'keeps snooze configuration calendar choices in the configured timezone from %s',
  (browserZone) => {
    vi.stubEnv('TZ', browserZone);
    const at = new Date('2026-10-21T23:30:00Z');
    expect(snoozeDays(snoozeToday('Asia/Shanghai', at))).toEqual({
      week: '2026-10-29',
      twoWeeks: '2026-11-05',
      month: '2026-11-22',
    });
    expect(snoozeDays(snoozeToday('America/New_York', at))).toEqual({
      week: '2026-10-28',
      twoWeeks: '2026-11-04',
      month: '2026-11-21',
    });
  },
);

it('compares release ages using their local calendar day within a selected analytics window', () => {
  setDictionary(english);
  const at = '2026-10-21T23:30:00Z';
  vi.stubEnv('TZ', 'Asia/Shanghai');
  expect(downloadAgo(at, '2026-10-22')).toBe('today');
  vi.stubEnv('TZ', 'America/New_York');
  expect(downloadAgo(at, '2026-10-22')).toBe('1 days ago');
});
