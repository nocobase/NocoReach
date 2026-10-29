// @vitest-environment node
import { expect, it } from 'vitest';
import { timeZoneName } from '../../client/lib/time-zone-name.js';

it.each(['UTC', 'Etc/UTC', 'GMT', 'Etc/GMT'])(
  'keeps %s as UTC in Chinese UI and preserves the English name',
  (timeZone) => {
    expect(timeZoneName(timeZone, 'zh-CN')).toBe('UTC');
    expect(timeZoneName(timeZone, 'en-US')).toBe('Coordinated Universal Time');
  },
);
