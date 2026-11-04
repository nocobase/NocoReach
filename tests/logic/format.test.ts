import { afterEach, describe, expect, it } from 'vitest';

import { setDictionary } from '../../client/i18n';
import {
  countIn,
  formatChange,
  formatCompact,
  formatCompactIn,
  formatCount,
  formatDate,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRelative,
  formatSigned,
} from '../../client/lib/format';
import english from '../../shared/i18n/en.json';
import japanese from '../../shared/i18n/ja-JP.json';
import traditional from '../../shared/i18n/zh-TW.json';

const now = new Date(2026, 9, 21, 15, 0);

afterEach(() => setDictionary(null));

describe('dates', () => {
  it('writes a calendar day the same in every time zone, without the year in the current year', () => {
    expect(formatDate('2026-10-07', { now })).toBe('10-07');
    expect(formatDate('2025-12-31', { now })).toBe('2025-12-31');
    expect(formatDate('2026-10-07', { now, withYear: true })).toBe(
      '2026-10-07',
    );
    setDictionary(english);
    expect(formatDate('2026-10-07', { now })).toBe('Oct 7');
    expect(formatDate('2025-12-31', { now })).toBe('Dec 31, 2025');
  });

  it('writes an instant in local time without seconds or a time zone', () => {
    const at = new Date(2026, 9, 21, 9, 4, 37);
    expect(formatDateTime(at, { now })).toBe('10-21 09:04');
    setDictionary(english);
    expect(formatDateTime(at, { now })).toBe('Oct 21, 9:04 AM');
  });

  it('shows a dash for a missing or unreadable date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDateTime('not a date')).toBe('—');
  });

  it('says how long ago, then the day after a month', () => {
    const t = now.getTime();
    expect(formatRelative(new Date(t - 20_000), t)).toBe('刚刚');
    expect(formatRelative(new Date(t - 7 * 60_000), t)).toBe('7 分钟前');
    expect(formatRelative(new Date(t - 3 * 3_600_000), t)).toBe('3 小时前');
    expect(formatRelative(new Date(t - 3 * 86_400_000), t)).toBe('3 天前');
    expect(formatRelative(new Date(2026, 7, 1, 12), t)).toBe('08-01');
  });
});

describe('numbers and changes', () => {
  it('separates thousands and writes shares as percentages', () => {
    expect(formatCount(33802)).toBe('33,802');
    expect(formatCount(null)).toBe('—');
    expect(formatPercent(0.462)).toBe('46.2%');
    expect(formatPercent(0.02)).toBe('2.0%');
  });

  it('shortens a large count the reader’s way, with the unit joining the word after it', () => {
    expect(formatCompact(1735)).toBe('1,735');
    expect(formatCompact(16234)).toBe('1.6 万');
    expect(formatCompactIn('youtube.viewsCount', 16234)).toBe('1.6 万次播放');
    expect(formatCompactIn('youtube.viewsCount', 1735)).toBe('1,735 次播放');
    expect(countIn('xiaohongshu.likesCount', '1.2 万')).toBe('1.2 万赞');
    expect(countIn('xiaohongshu.likesCount', '10 万+')).toBe('10 万+ 赞');
    setDictionary(traditional, 'zh-TW');
    expect(formatCompactIn('youtube.viewsCount', 16234)).toBe('1.6 萬次播放');
    setDictionary(japanese, 'ja-JP');
    expect(formatCompactIn('youtube.viewsCount', 16234)).toBe('再生 1.6万回');
    expect(formatCompactIn('youtube.viewsCount', 1735)).toBe('再生 1,735 回');
    setDictionary(english);
    expect(formatCompact(16234)).toBe('16.2K');
    expect(formatCompactIn('youtube.viewsCount', 16234)).toBe('16.2K views');
  });

  it('signs a difference with a true minus and leaves zero unsigned', () => {
    expect(formatSigned(253)).toBe('+253');
    expect(formatSigned(-2578)).toBe('−2,578');
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(-0.2)).toBe('0');
  });

  it('writes a change with an arrow, one decimal under 10% and whole numbers above', () => {
    expect(formatChange(0.12)).toBe('↑ 12%');
    expect(formatChange(-0.098)).toBe('↓ 9.8%');
    expect(formatChange(-0.27)).toBe('↓ 27%');
    expect(formatChange(4.644)).toBe('↑ 464%');
    expect(formatChange(0.0001)).toBe('0%');
    expect(formatChange(null)).toBe('—');
  });

  it('writes durations in minutes and seconds, then hours and minutes', () => {
    expect(formatDuration(43)).toBe('43 秒');
    expect(formatDuration(157)).toBe('2 分 37 秒');
    expect(formatDuration(4440)).toBe('1 小时 14 分');
    setDictionary(english);
    expect(formatDuration(157)).toBe('2 min 37 s');
  });
});
