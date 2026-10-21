import { expect, it } from 'vitest';
import {
  settleVerdicts,
  type CoverTask,
} from '../../server/nocoreach/verdict-coverage';
import { opportunityState, rowsFor } from '../../shared/strategy-pending';
import type {
  InsightBatch,
  Opportunity,
  Signal,
  StrategyState,
} from '../../shared/strategy-model';

const signal = (key: string, url?: string): Signal => ({
  key,
  type: 'change',
  source: 'gsc',
  title: `${key} changed`,
  facts: [`${key}: 5,790 impressions, 0 clicks`],
  strength: 1,
  actionable: true,
  action: 'optimize',
  ...(url ? { url } : {}),
});
const card = (id: string, extra: Partial<Opportunity> = {}): Opportunity => ({
  id,
  title: id,
  observation: 'o',
  meaning: 'm',
  evidenceText: 'e',
  limitation: 'l',
  suggestion: 's',
  objective: 'g',
  source: 'search',
  ...extra,
});
const batch = (
  generatedAt: string,
  items: Opportunity[],
  signals: Signal[],
): InsightBatch => ({
  generatedAt,
  items,
  evidence: {
    analysisVersion: 3,
    capturedAt: '',
    availableThrough: null,
    periodDays: 28,
    searchQueries: [],
    pages: [],
    industryCandidates: [],
    limitations: [],
    signals: { computedAt: '', coverage: {}, missing: [], items: signals },
  },
});
const page = 'https://www.nocobase.com/en/blog/workflow-automation-tools';
let n = 0;
const uuid = () => `new-${++n}`;

it('a change judged worth doing with no opportunity is skipped when something already covers it', () => {
  const changes = [
    signal('handed'),
    signal('page-task', page),
    signal('page-done', 'https://www.nocobase.com/pricing'),
    signal('page-closed', 'https://www.nocobase.com/cn/commercial'),
    signal('pending-elsewhere', 'https://www.nocobase.com/docs/a'),
    signal('ignored'),
    signal('cited'),
    signal('watching'),
  ];
  const state: StrategyState = {
    revision: 1,
    goal: null,
    proposals: [
      {
        id: 'p',
        title: '',
        brief: '',
        status: 'approved',
        goalVersion: null,
        evidence: batch('', [], []).evidence,
        signalKey: 'handed',
        taskId: 5,
        taskNo: 5,
      },
    ],
    insights: batch(
      '2026-10-21',
      [card('cited-card', { signalIds: ['cited'] })],
      changes,
    ),
    insightHistory: [
      batch(
        '2026-10-15',
        [
          card('older', {
            no: 3,
            target: 'https://nocobase.com/docs/a/',
            signalIds: ['other'],
          }),
          card('dropped', { no: 4, signalIds: ['ignored'] }),
        ],
        [],
      ),
    ],
    opportunityMeta: { dropped: { status: 'ignored' } },
  };
  state.insights!.signalReviews = Object.fromEntries(
    changes.map((c) => [
      c.key,
      c.key === 'watching'
        ? { verdict: 'watch' as const, reason: 'wait' }
        : { verdict: 'do' as const, reason: 'worth it' },
    ]),
  );
  const tasks: CoverTask[] = [
    { id: 5, evidence: { no: 5, work: { stage: 'plan' } } },
    // T-32 is about the same page, written without www and with a trailing slash.
    {
      id: 32,
      evidence: {
        no: 32,
        work: { stage: 'plan' },
        insight: {
          target: 'https://nocobase.com/en/blog/workflow-automation-tools/',
        },
      },
    },
    {
      id: 40,
      evidence: {
        no: 40,
        work: {
          stage: 'done',
          page: { url: 'https://www.nocobase.com/pricing' },
        },
      },
    },
    {
      id: 41,
      evidence: {
        no: 41,
        work: {
          stage: 'plan',
          archivedAt: '2026-10-20',
          page: { url: 'https://www.nocobase.com/cn/commercial' },
        },
      },
    },
  ];
  const out = settleVerdicts(state, tasks, '2026-10-21T09:00:00Z', uuid);
  const reviews = state.insights!.signalReviews!;
  expect(reviews.handed).toEqual({
    verdict: 'skip',
    reason: '已有任务 T-5 在处理',
  });
  expect(reviews['page-task']).toEqual({
    verdict: 'skip',
    reason: '已有任务 T-32 在处理',
  });
  expect(reviews['page-done'].reason).toBe('任务 T-40 已经做过');
  expect(reviews['page-closed'].reason).toBe('相关任务 T-41 已关闭');
  expect(reviews['pending-elsewhere']).toEqual({
    verdict: 'skip',
    reason: '已有机会 O-3',
  });
  expect(reviews.ignored).toEqual({
    verdict: 'skip',
    reason: '相关机会已忽略',
  });
  // A change an opportunity cites and one being watched are left as they are.
  expect(reviews.cited).toEqual({ verdict: 'do', reason: 'worth it' });
  expect(reviews.watching.verdict).toBe('watch');
  expect(out.raised).toEqual([]);
  expect(state.insights!.items.map((c) => c.id)).toEqual(['cited-card']);
  // The reasons follow the analysis language.
  state.insights!.signalReviews!.handed = { verdict: 'do', reason: '' };
  settleVerdicts(state, tasks, '2026-10-21T09:00:00Z', uuid, 'en-US');
  expect(reviews.handed.reason).toBe('Task T-5 is already on it');
});

it('a change worth doing that nothing covers gets an opportunity, reusing an expired one about the same thing', () => {
  const fresh = signal('fresh', 'https://www.nocobase.com/en/blog/new-post'),
    again = signal('again', 'https://www.nocobase.com/en/blog/old-post');
  const state: StrategyState = {
    revision: 1,
    goal: null,
    proposals: [],
    insights: batch('2026-10-21', [], [fresh, again]),
    insightHistory: [
      batch(
        '2026-09-20',
        [
          card('expired', {
            no: 12,
            title: 'again changed',
            target: again.url,
            signalIds: ['again'],
            firstSeenAt: '2026-09-20',
          }),
        ],
        [again],
      ),
    ],
  };
  state.insights!.signalReviews = {
    fresh: { verdict: 'do', reason: 'Title needs a rewrite' },
    again: { verdict: 'do', reason: 'Still slipping' },
  };
  const out = settleVerdicts(state, [], '2026-10-21T09:00:00Z', uuid, 'en-US');
  expect(out).toEqual({ skipped: [], raised: ['fresh', 'again'] });
  const [first, second] = state.insights!.items;
  expect(first).toMatchObject({
    title: 'fresh changed',
    reason: 'Title needs a rewrite',
    suggestion: 'Title needs a rewrite',
    objective: 'Title needs a rewrite',
    observation: 'fresh: 5,790 impressions, 0 clicks',
    target: fresh.url,
    signalIds: ['fresh'],
    confidence: 'verify',
    change: 'new',
  });
  expect(first.limitation).toContain('without a full analysis');
  // The same change raised before keeps its card, number and first-seen day.
  expect(second).toMatchObject({ id: 'expired', firstSeenAt: '2026-09-20' });
  expect(state.insights!.signalReviews!.fresh.verdict).toBe('do');
  // Both now stand on Opportunities as pending.
  expect(
    rowsFor(state)
      .filter((r) => opportunityState(r, state).state === 'pending')
      .map((r) => r.card.id)
      .sort(),
  ).toEqual(['expired', first.id].sort());
});

it('a task handed off from a change on its own covers that change and its page', () => {
  const change = signal('gsc:x', 'https://www.nocobase.com/en/blog/x'),
    same = signal('rank:x', 'https://nocobase.com/en/blog/x/');
  const state: StrategyState = {
    revision: 1,
    goal: null,
    proposals: [],
    insights: batch('2026-10-21', [], [change, same]),
  };
  state.insights!.signalReviews = {
    'gsc:x': { verdict: 'do', reason: 'r' },
    'rank:x': { verdict: 'do', reason: 'r' },
  };
  settleVerdicts(
    state,
    [
      {
        id: 33,
        evidence: {
          no: 33,
          work: { stage: 'plan' },
          insight: null,
          signalKey: 'gsc:x',
          page: 'https://www.nocobase.com/en/blog/x',
        },
      },
    ],
    '2026-10-21T09:00:00Z',
    uuid,
  );
  expect(state.insights!.signalReviews).toEqual({
    'gsc:x': { verdict: 'skip', reason: '已有任务 T-33 在处理' },
    'rank:x': { verdict: 'skip', reason: '已有任务 T-33 在处理' },
  });
  expect(state.insights!.items).toEqual([]);
});
