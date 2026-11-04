// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  sampleClock,
  sampleLanguage,
} from '../../server/nocoreach/demo-data/sample-data';

describe('the sample data clock', () => {
  const now = new Date('2026-11-02T12:00:00.000Z');
  const clock = sampleClock(now, 'Asia/Shanghai');

  it('counts days in its time zone', () => {
    const lateEvening = new Date('2026-11-02T17:00:00.000Z');
    expect(clock.dateAgo(0)).toBe('2026-11-02');
    expect(sampleClock(lateEvening, 'Asia/Shanghai').dateAgo(0)).toBe(
      '2026-11-03',
    );
    expect(clock.isoAgo(3, 10, 30)).toBe('2026-10-30T02:30:00.000Z');
  });

  it('follows a daylight saving change', () => {
    const losAngeles = sampleClock(now, 'America/Los_Angeles');
    expect(losAngeles.isoAgo(1)).toBe('2026-11-01T18:00:00.000Z');
    expect(losAngeles.isoAgo(7)).toBe('2026-10-26T17:00:00.000Z');
  });

  it('keeps past days out of the future and lets a negative day reach it', () => {
    expect(clock.daysAgo(0, 23).getTime()).toBeLessThan(now.getTime());
    expect(clock.daysAgo(-1).getTime()).toBeGreaterThan(now.getTime());
  });

  it('samples steadily for a key within a day and differently across keys', () => {
    const value = clock.sample('usage:1');
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(sampleClock(now, 'Asia/Shanghai').sample('usage:1')).toBe(value);
    expect(clock.sample('usage:2')).not.toBe(value);
  });
});

describe('the sample data language', () => {
  it.each([
    ['zh-CN', 'zh-CN'],
    ['en-US', 'en-US'],
    ['ja-JP', 'en-US'],
    [undefined, 'en-US'],
  ])('uses %s as %s', (locale, language) => {
    expect(sampleLanguage(locale)).toBe(language);
  });
});
