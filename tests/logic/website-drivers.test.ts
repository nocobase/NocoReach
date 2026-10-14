import { describe, expect, it } from 'vitest';

import {
  explainChange,
  type ChangeRow,
} from '../../client/pages/data-website/drivers';
import type { Report, Values } from '../../client/pages/data-website/model';

const row = (key: string, current: Values, previous: Values): ChangeRow => ({
  key,
  current,
  previous,
});
const report = (
  current: Values,
  previous: Values,
  changes: Report['changes'],
): Report => ({
  connected: true,
  totals: { current, previous },
  changes,
});

describe('where a change came from', () => {
  const views = report(
    { views: 60_000, sessions: 50_000, users: 40_000 },
    { views: 73_500, sessions: 52_000, users: 41_000 },
    {
      channel: [
        row(
          'Organic Search',
          { views: 20_000, sessions: 15_000, users: 12_000 },
          { views: 28_200, sessions: 16_000, users: 13_000 },
        ),
        row(
          'Direct',
          { views: 30_000, sessions: 30_000, users: 25_000 },
          { views: 33_100, sessions: 31_000, users: 25_500 },
        ),
        row(
          'Referral',
          { views: 10_000, sessions: 5_000, users: 3_000 },
          { views: 12_200, sessions: 5_000, users: 2_500 },
        ),
      ],
      page: [
        row('/blog/crm', { views: 1_000 }, { views: 3_400 }),
        row('/pricing', { views: 5_000 }, { views: 6_100 }),
        row('/new', { views: 300 }, {}),
        row('/old', {}, { views: 900 }),
      ],
      landing: [row('/', { sessions: 9_000 }, { sessions: 10_500 })],
    },
  );

  it('splits a count over its two largest channels with their shares, and over the pages that moved most', () => {
    expect(explainChange(views, 'views')).toEqual({
      delta: -13_500,
      channels: [
        { key: 'Organic Search', delta: -8_200, share: 8_200 / 13_500 },
        { key: 'Direct', delta: -3_100, share: 3_100 / 13_500 },
      ],
      counter: null,
      pages: [
        { key: '/blog/crm', delta: -2_400, share: null },
        { key: '/pricing', delta: -1_100, share: null },
        { key: '/old', delta: -900, share: null, status: 'gone' },
      ],
      pagesAre: 'page',
    });
  });

  it('reads sessions by landing page', () => {
    const x = explainChange(views, 'sessions')!;
    expect(x.pagesAre).toBe('landing');
    expect(x.pages).toEqual([
      { key: '/', delta: -1_500, share: null, status: undefined },
    ]);
  });

  it('names a channel that went the other way, and then gives no shares', () => {
    const x = explainChange(
      report(
        { views: 9_800 },
        { views: 10_000 },
        {
          channel: [
            row('Organic Search', { views: 4_000 }, { views: 5_000 }),
            row('Referral', { views: 3_800 }, { views: 3_000 }),
            row('Direct', { views: 2_000 }, { views: 2_000 }),
          ],
        },
      ),
      'views',
    )!;
    expect(x.channels).toEqual([
      { key: 'Organic Search', delta: -1_000, share: null },
    ]);
    expect(x.counter).toEqual({ key: 'Referral', delta: 800, share: null });
  });

  it('ranks active users by channel without shares or pages, since users do not add up across channels', () => {
    const x = explainChange(views, 'users')!;
    expect(x.channels.map((d) => [d.key, d.share])).toEqual([
      ['Organic Search', null],
      ['Direct', null],
    ]);
    expect(x.counter).toEqual({ key: 'Referral', delta: 500, share: null });
    expect(x.pages).toEqual([]);
    expect(x.pagesAre).toBeNull();
  });

  it('marks pages new in this period', () => {
    const x = explainChange(
      report(
        { views: 1_300 },
        { views: 1_000 },
        {
          page: [row('/new', { views: 300 }, {})],
        },
      ),
      'views',
    )!;
    expect(x.pages).toEqual([
      { key: '/new', delta: 300, share: null, status: 'new' },
    ]);
  });

  it('explains nothing for rates, for no change, or without the change tables', () => {
    expect(explainChange(views, 'engagementRate')).toBeNull();
    expect(explainChange(views, 'keyEventRate')).toBeNull();
    expect(
      explainChange(report({ views: 5 }, { views: 5 }, {}), 'views'),
    ).toBeNull();
    expect(
      explainChange(report({ views: 6 }, { views: 5 }, undefined), 'views'),
    ).toBeNull();
  });
});
