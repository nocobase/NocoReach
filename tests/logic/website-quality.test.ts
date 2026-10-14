import { describe, expect, it } from 'vitest';

import type { Report, Row } from '../../client/pages/data-website/model';
import {
  qualityIssues,
  suspectChannels,
} from '../../client/pages/data-website/quality';

const channel = (name: string, sessions: number, engaged: number): Row => ({
  key: name,
  dims: { sessionDefaultChannelGroup: name },
  sessions,
  engaged,
});

// Studio's 28 days (2026-09-13 – 10-10), rounded: Unassigned 10% of sessions at 0.6% engagement, key event rate 25.7%.
const studio = (extra: Partial<Report> = {}): Report => ({
  connected: true,
  totals: {
    current: {
      sessions: 57_692,
      engaged: 24_980,
      keyEventRate: 0.257,
    },
    previous: { sessions: 60_641 },
  },
  tables: {
    channel: [
      channel('Direct', 26_378, 10_050),
      channel('Organic Search', 19_551, 12_728),
      channel('Unassigned', 5_745, 34),
      channel('Referral', 3_474, 2_098),
    ],
    event: [
      {
        key: 'page_view',
        dims: { eventName: 'page_view' },
        events: 72_725,
        keyEvents: 0,
      },
      {
        key: 'scroll',
        dims: { eventName: 'scroll' },
        events: 40_000,
        keyEvents: 14_000,
      },
      {
        key: 'sign_up',
        dims: { eventName: 'sign_up' },
        events: 500,
        keyEvents: 500,
      },
    ],
  },
  changes: {
    channel: [
      {
        key: 'Unassigned',
        current: { sessions: 5_745 },
        previous: { sessions: 3_582 },
      },
    ],
  },
  ...extra,
});

describe('data that may be off', () => {
  it('flags a large channel with almost no engagement, the sessions it gained while the site fell, and a key event that fires on most visits', () => {
    const issues = qualityIssues(studio());
    expect(issues).toEqual([
      {
        kind: 'lowEngagementChannel',
        channel: 'Unassigned',
        share: 5_745 / 57_692,
        rate: 34 / 5_745,
        siteRate: 24_980 / 57_692,
        gained: 2_163,
      },
      { kind: 'highKeyEventRate', rate: 0.257, event: 'scroll' },
    ]);
    expect([...suspectChannels(issues)]).toEqual(['Unassigned']);
  });

  it('does not count a gain as hiding a fall when the site grew', () => {
    const issues = qualityIssues(
      studio({
        totals: {
          current: { sessions: 57_692, engaged: 24_980, keyEventRate: 0.02 },
          previous: { sessions: 50_000 },
        },
      }),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        kind: 'lowEngagementChannel',
        gained: null,
      }),
    ]);
  });

  it('leaves small channels and ordinary rates alone, and names no event when none fires on most visits', () => {
    const report = studio({
      totals: {
        current: { sessions: 100_000, engaged: 50_000, keyEventRate: 0.3 },
      },
      tables: {
        channel: [
          channel('Direct', 60_000, 30_000),
          channel('Unassigned', 4_000, 10),
          channel('Display', 10_000, 1_500),
        ],
        event: [
          {
            key: 'sign_up',
            dims: { eventName: 'sign_up' },
            events: 30_000,
            keyEvents: 30_000,
          },
        ],
      },
    });
    expect(qualityIssues(report)).toEqual([
      { kind: 'highKeyEventRate', rate: 0.3, event: null },
    ]);
  });

  it('flags sessions without a source when no low-engagement Unassigned channel already says so', () => {
    const report = studio({
      totals: {
        current: { sessions: 10_000, engaged: 5_000, keyEventRate: 0.03 },
      },
      tables: {
        channel: [
          channel('Direct', 8_000, 4_000),
          channel('Unassigned', 800, 400),
        ],
        sourceMedium: [
          {
            key: 'n',
            dims: { sessionSource: '(not set)', sessionMedium: '(not set)' },
            sessions: 1_200,
          },
        ],
      },
    });
    expect(qualityIssues(report)).toEqual([{ kind: 'noSource', share: 0.12 }]);
    expect(qualityIssues(studio()).some((i) => i.kind === 'noSource')).toBe(
      false,
    );
  });

  it('finds nothing without totals', () => {
    expect(qualityIssues({ connected: true })).toEqual([]);
  });
});
