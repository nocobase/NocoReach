import { expect, it } from 'vitest';
import {
  analysisForAgent,
  dailyAnalysisTool,
  totalsOf,
} from '../../server/nocoreach/online-agent/analysis-tool';
import type {
  InsightBatch,
  Opportunity,
  Signal,
  StrategyState,
} from '../../shared/strategy-model';

const card = (id: string, extra: Partial<Opportunity> = {}): Opportunity => ({
  id,
  title: `Opportunity ${id}`,
  observation: `seen ${id}`,
  meaning: 'm',
  evidenceText: 'e',
  limitation: 'l',
  suggestion: `do ${id}`,
  objective: 'g',
  source: 'search',
  ...extra,
});
const signal = (key: string): Signal => ({
  key,
  type: 'change',
  source: 'gsc',
  title: `${key} changed`,
  facts: [`${key}: 5,790 impressions, 0 clicks`],
  strength: 1,
  actionable: true,
  action: 'optimize',
});
const batch = (
  generatedAt: string,
  items: Opportunity[],
  signals: Signal[] = [],
): InsightBatch => ({
  generatedAt,
  items,
  observations: [`notes of ${generatedAt.slice(0, 10)}`],
  evidence: {
    analysisVersion: 3,
    capturedAt: '',
    availableThrough: '2026-10-17',
    periodDays: 28,
    searchQueries: [],
    pages: [],
    industryCandidates: [],
    limitations: ['X mentions did not sync'],
    signals: { computedAt: '', coverage: {}, missing: [], items: signals },
  },
});
const link = (id: string) => `/main/opportunities?item=${id}`;
const state = (): StrategyState => {
  const latest = batch(
    '2026-10-21T01:00:00Z',
    [
      card('waiting', { no: 41, priority: 'high' }),
      card('handed', { no: 40 }),
      card('dropped', { no: 39 }),
    ],
    [signal('blog'), signal('pricing'), signal('docs')],
  );
  latest.signalReviews = {
    blog: { verdict: 'do', reason: 'Title needs a rewrite' },
    pricing: { verdict: 'watch', reason: 'Wait a week' },
    docs: { verdict: 'skip', reason: 'Task T-32 is already on it' },
  };
  return {
    revision: 3,
    goal: null,
    proposals: [
      {
        id: 'p',
        title: '',
        brief: '',
        status: '',
        goalVersion: null,
        evidence: latest.evidence,
        taskId: 90,
        taskNo: 32,
        insight: card('handed'),
      },
    ],
    insights: latest,
    insightHistory: [
      batch('2026-10-20T09:00:00Z', [card('older', { no: 30 })]),
      batch('2026-10-20T01:00:00Z', [card('morning', { no: 29 })]),
    ],
    opportunityMeta: { dropped: { status: 'ignored' } },
    watch: {
      pricing: {
        key: 'pricing',
        source: 'gsc',
        since: '2026-10-21',
        startTitle: 'pricing changed',
        startFacts: ['12 clicks'],
        waitingFor: 'clicks back above 15',
        decideBy: '2026-10-28',
      },
      home: {
        key: 'home',
        source: 'gsc',
        since: '2026-10-14',
        startTitle: 'home changed',
        startFacts: [],
        decideBy: '2026-10-21',
        ended: { at: '2026-10-21T01:00:00Z', outcome: 'normal' },
      },
    },
  };
};

it('reads the latest analysis: notes, each opportunity with where it stands, every verdict with its reason, watches', () => {
  const view = analysisForAgent(state(), undefined, link) as any;
  expect(view.available).toBe(true);
  // One entry per day: the later of the two analyses on 10/20.
  expect(view.days).toEqual(['2026-10-21', '2026-10-20']);
  expect(view.analysis).toMatchObject({
    day: '2026-10-21',
    periodDays: 28,
    dataThrough: '2026-10-17',
    notes: ['notes of 2026-10-21'],
    limitations: ['X mentions did not sync'],
  });
  expect(
    view.analysis.opportunities.map((o: any) => [o.no, o.status, o.task]),
  ).toEqual([
    ['O-41', 'awaiting_decision', null],
    ['O-40', 'handed_off_to_agent', 'T-32'],
    ['O-39', 'dismissed', null],
  ]);
  expect(view.analysis.opportunities[0]).toMatchObject({
    title: 'Opportunity waiting',
    priority: 'high',
    suggestion: 'do waiting',
    url: '/main/opportunities?item=waiting',
  });
  expect(view.analysis.changes).toEqual([
    expect.objectContaining({
      key: 'blog',
      facts: ['blog: 5,790 impressions, 0 clicks'],
      verdict: 'do',
      reason: 'Title needs a rewrite',
    }),
    expect.objectContaining({ key: 'pricing', verdict: 'watch' }),
    expect.objectContaining({
      key: 'docs',
      verdict: 'skip',
      reason: 'Task T-32 is already on it',
    }),
  ]);
  // Awaiting a decision now, across analyses: the latest one's and both of 10/20 (still within 14 days).
  expect(view.awaitingDecisionNow.map((o: any) => o.no).sort()).toEqual([
    'O-29',
    'O-30',
    'O-41',
  ]);
  expect(view.watching).toEqual([
    expect.objectContaining({
      change: 'pricing changed',
      waitingFor: 'clicks back above 15',
      decideBy: '2026-10-28',
    }),
  ]);
  expect(view.watchesEnded).toEqual([
    expect.objectContaining({ change: 'home changed', outcome: 'normal' }),
  ]);
});

it('a handed-off opportunity says where its task stands, from the tasks the user may list', async () => {
  const of = (work: object) =>
    (
      analysisForAgent(state(), undefined, link, [
        { id: 90, status: 'todo', evidence: { work } },
      ]) as any
    ).analysis.opportunities.find((o: any) => o.no === 'O-40');
  expect(of({ stage: 'done' })).toMatchObject({
    status: 'task_done',
    task: 'T-32',
  });
  expect(of({ boardState: 'review' }).status).toBe('task_needs_confirmation');
  expect(of({ boardState: 'doing' }).status).toBe('task_in_progress');
  expect(of({ cancelledAt: '2026-10-21T00:00:00Z' }).status).toBe(
    'task_closed',
  );
  expect(of({ boardState: 'todo' }).status).toBe('handed_off_to_agent');
  // The tool reads them when given; without them the task is not known.
  const tool = dailyAnalysisTool(
    async () => state(),
    async () => undefined,
    link,
    async () => [{ id: 90, evidence: { work: { stage: 'done' } } }],
  );
  const out = (await tool.execute({})) as { text: string };
  expect(out.text).toContain('"status":"task_done","task":"T-32"');
});

it('reads an earlier day, and says when there is no analysis', () => {
  const view = analysisForAgent(state(), '2026-10-20', link) as any;
  expect(view.analysis.day).toBe('2026-10-20');
  expect(view.analysis.opportunities.map((o: any) => o.no)).toEqual(['O-30']);
  expect(analysisForAgent(state(), '2026-09-01', link)).toMatchObject({
    available: false,
    reason: 'no_analysis_that_day',
  });
  expect(
    analysisForAgent(
      { revision: 0, goal: null, proposals: [] },
      undefined,
      link,
    ),
  ).toEqual({ available: false, reason: 'no_analysis_yet' });
});

it('the tool checks access before every read and pages its result', async () => {
  const calls: string[] = [];
  const tool = dailyAnalysisTool(
    async () => {
      calls.push('read');
      return state();
    },
    async () => {
      calls.push('authorize');
    },
    link,
  );
  const page = (await tool.execute({}, new AbortController().signal)) as {
    text: string;
    nextOffset: number | null;
  };
  expect(calls).toEqual(['authorize', 'read']);
  expect(JSON.parse(page.text).analysis.day).toBe('2026-10-21');
  await expect(
    tool.execute({ day: '21 Oct' }, new AbortController().signal),
  ).rejects.toBeDefined();
  const denied = dailyAnalysisTool(
    async () => state(),
    async () => {
      throw new Error('accessDenied');
    },
    link,
  );
  await expect(
    denied.execute({}, new AbortController().signal),
  ).rejects.toThrow('accessDenied');
});

it('totals give each key metric with the previous period and the change', () => {
  expect(
    totalsOf([
      {
        id: 'gsc',
        cutoff: '2026-10-17',
        window: {
          start: '2026-09-20',
          end: '2026-10-17',
          days: 28,
          previousStart: '2026-08-23',
          previousEnd: '2026-09-19',
        },
        metrics: [
          {
            key: 'impressions',
            label: 'Impressions',
            value: 710820,
            previous: 973726,
            complete: true,
            change: -0.27,
          },
        ],
        series: [{ date: '2026-10-17', value: 412 }],
      },
    ]),
  ).toEqual([
    {
      source: 'gsc',
      title: null,
      dataThrough: '2026-10-17',
      period: { start: '2026-09-20', end: '2026-10-17' },
      previousPeriod: { start: '2026-08-23', end: '2026-09-19' },
      metrics: [
        {
          key: 'impressions',
          label: 'Impressions',
          value: 710820,
          previous: 973726,
          change: -0.27,
          complete: true,
        },
      ],
      daily: [['2026-10-17', 412]],
    },
  ]);
  expect(totalsOf(undefined)).toEqual([]);
});
