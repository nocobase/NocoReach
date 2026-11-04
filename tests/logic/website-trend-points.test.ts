import { describe, expect, it } from 'vitest';

import { trendPoints } from '../../client/pages/data-website/model';

const days = {
  current: ['2026-10-24', '2026-10-25', '2026-10-26'].map((date, i) => ({
    date,
    sessions: 10 + i,
  })),
  previous: [{ date: '2026-10-21', sessions: 7 }],
};
const sessions = (v: { sessions?: number }) => v.sessions ?? null;

describe('Traffic trend points', () => {
  it('moves the days GA4 is still processing to the dotted line, which starts on the last settled day', () => {
    const { points, fresh } = trendPoints(days, sessions, '2026-10-24');
    expect(fresh).toBe(true);
    expect(points.map((p) => [p.value, p.fresh])).toEqual([
      [10, 10],
      [null, 11],
      [null, 12],
    ]);
    expect(points[0]).toMatchObject({
      previous: 7,
      previousDate: '2026-10-21',
    });
    expect(points[1]).toMatchObject({ previous: null, previousDate: '' });
  });

  it('draws one solid line when every day is settled or nothing says which are not', () => {
    for (const settled of ['2026-10-26', '2026-10-30', null, undefined]) {
      const { points, fresh } = trendPoints(days, sessions, settled);
      expect(fresh).toBe(false);
      expect(points.map((p) => p.value)).toEqual([10, 11, 12]);
    }
  });
});
