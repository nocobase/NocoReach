import { describe, expect, it } from 'vitest';
import {
  compare,
  windows,
  totals,
  type Partition,
} from '../../server/nocoreach/execution/effect.js';
import { projectWork } from '../../server/nocoreach/execution/model.js';
import {
  listResults,
  resultSummary,
  readResult,
} from '../../server/nocoreach/execution/result-view.js';
import {
  metricValues,
  safeConclusion,
} from '../../shared/result-comparison.js';
const url = 'https://example.com/page';
const partition = (date: string, clicks: number): Partition => ({
  source: 'gsc',
  grain: 'query_page',
  date,
  payload: clicks
    ? [{ page: url, clicks, impressions: clicks * 10, position: 3 }]
    : [],
});
function parts(day = 7) {
  const w = windows('2026-10-01', day),
    out: Partition[] = [];
  for (const [range, value] of [
    [w.baseline, 0],
    [w.after, 10],
  ] as const) {
    for (
      let date = range.start;
      date <= range.end;
      date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)
    )
      out.push(partition(date, value));
  }
  return out;
}
describe('safe result comparison', () => {
  it('does not count a malformed date as a covered zero-data day', () => {
    const records = parts();
    records[2].date = '2026-09-2x';
    const result = compare(7, '2026-10-01', [url], records, '2026-10-12');
    expect(result.coverage?.gsc.baselineDays).toBe(6);
    expect(safeConclusion(result)).toBe('insufficient');
  });
  it('uses complete collected zero baseline without an invented percentage', () => {
    const r = compare(7, '2026-10-01', [url], parts(), '2026-10-12');
    expect(r.coverage?.gsc).toEqual({ baselineDays: 7, afterDays: 7 });
    expect(r.change).toBeNull();
    expect(safeConclusion(r)).toBe('up');
    expect(metricValues(r, 'gsc', 'clicks')).toEqual({
      before: 0,
      after: 70,
      difference: 70,
      percent: null,
    });
    expect(metricValues(r, 'gsc', 'ctr').before).toBeNull();
  });
  it('shows missing and historical unknown as unknown, preserving the original snapshot', () => {
    const r = compare(7, '2026-10-01', [url], parts().slice(1), '2026-10-12');
    expect(safeConclusion(r)).toBe('insufficient');
    expect(metricValues(r, 'gsc', 'clicks').before).toBeNull();
    delete r.coverage;
    r.conclusion = 'up';
    expect(safeConclusion(r)).toBe('insufficient');
    expect(r.conclusion).toBe('up');
  });
  it('excludes invalid partitions, deduplicates dates and excludes go-live UTC date across months', () => {
    const p = parts();
    p.push({ ...p[0], payload: null as unknown as any[] });
    expect(totals(p, [url], windows('2026-10-01', 7).baseline).gscDays).toBe(7);
    expect(windows('2026-10-01', 28)).toEqual({
      baseline: { start: '2026-09-03', end: '2026-09-30' },
      after: { start: '2026-10-02', end: '2026-10-29' },
    });
  });
});
describe('results availability gate', () => {
  const result = compare(7, '2026-10-01', [url], parts(), '2026-10-12');
  const task = (id: number, overrides: object = {}) => ({
    id,
    projectId: '1',
    title: `Task ${id}`,
    evidence: {
      no: id,
      work: {
        ...projectWork({}),
        observeFrom: '2026-10-01T00:00:00Z',
        page: { url },
        observation: { results: [result] },
        history: [{ action: 'effect', at: '2026-10-12' }],
        ...overrides,
      },
    },
  });
  it('normalizes occurrence to UTC and does not attach an old snapshot to a different observation cycle', () => {
    const summary = resultSummary(
      task(1, { observeFrom: '2026-10-01T00:30:00+08:00' }),
      [url],
    );
    expect(summary?.occurredAt).toBe('2026-09-30T16:30:00.000Z');
    expect(summary?.status).toBe('unavailable');
    expect(summary?.latest).toBeNull();
  });
  it('uses the actual execution receipt date ahead of earlier deliverables and filters the UTC day inclusively', async () => {
    const t = task(1, {
      observeFrom: undefined,
      observation: undefined,
      stage: 'verification',
      receipt: {
        note: 'Published',
        url,
        recordedAt: '2026-10-13T09:00:00Z',
        recordedBy: 'person',
      },
      history: [{ action: 'recordExecution', at: '2026-10-13T09:00:00Z' }],
    });
    expect(resultSummary(t, [url])?.occurredAt).toBe(
      '2026-10-13T09:00:00.000Z',
    );
    Object.assign(t.evidence.work, {
      results: [{ createdAt: '2026-10-10T09:00:00Z' }],
    });
    const saved = structuredClone(t);
    const service = {
      repo: () => ({ find: async () => [{ toJSON: () => t }] }),
      effectPages: () => [url],
    };
    const listed = await listResults(service, '1', {
      from: '2026-10-13',
      to: '2026-10-13',
    });
    expect(listed.total).toBe(1);
    expect(listed.items[0].occurredAt).toBe('2026-10-13T09:00:00.000Z');
    expect((await listResults(service, '1', { to: '2026-10-12' })).total).toBe(
      0,
    );
    expect(
      (await listResults(service, '1', { from: '2026-10-14' })).total,
    ).toBe(0);
    expect(t).toEqual(saved);
  });
  it.each(['recordExecution', 'confirmPublish', 'live'])(
    'falls back to the latest real %s history event before artifact dates',
    (action) => {
      const t = task(1, {
        observeFrom: undefined,
        observation: undefined,
        stage: 'done',
        history: [
          { action, at: '2026-10-10T09:00:00Z' },
          { action, at: '2026-10-13T09:00:00Z' },
          { action, at: 'invalid' },
          { action: 'archiveTask', at: '2026-10-15T09:00:00Z' },
        ],
        results: [{ createdAt: '2026-10-11T09:00:00Z' }],
      });
      expect(resultSummary(t, [url])?.occurredAt).toBe(
        '2026-10-13T09:00:00.000Z',
      );
    },
  );
  it('preserves observation and live-time precedence, selects the latest artifact and leaves unknown time unknown', () => {
    const t = task(1, {
      observeFrom: '2026-10-01T00:00:00Z',
      release: { liveAt: '2026-10-02T09:00:00Z' },
      receipt: { note: 'Published', recordedAt: '2026-10-13T09:00:00Z' },
    });
    expect(resultSummary(t, [url])?.occurredAt).toBe(
      '2026-10-01T00:00:00.000Z',
    );
    Object.assign(t.evidence.work, { observeFrom: undefined });
    expect(resultSummary(t, [url])?.occurredAt).toBe(
      '2026-10-02T09:00:00.000Z',
    );
    const artifactsOnly = task(2, {
      observeFrom: undefined,
      observation: undefined,
      stage: 'done',
      history: [],
      results: [
        { createdAt: '2026-10-10T09:00:00Z' },
        { createdAt: '2026-10-13T09:00:00Z' },
        { createdAt: 'invalid' },
      ],
    });
    expect(resultSummary(artifactsOnly, [])?.occurredAt).toBe(
      '2026-10-13T09:00:00.000Z',
    );
    Object.assign(artifactsOnly.evidence.work, { results: [] });
    expect(resultSummary(artifactsOnly, [])?.occurredAt).toBeNull();
  });
  it('includes old Insights observation records, closed records and completed tasks; excludes unexecuted closed tasks', () => {
    expect(resultSummary(task(1), [url])?.latest).toEqual(result);
    expect(
      resultSummary(task(2, { archivedAt: '2026-10-12' }), [url])?.closed,
    ).toBe(true);
    expect(resultSummary({ id: 3, status: '已完成' }, [])?.status).toBe(
      'unavailable',
    );
    expect(
      resultSummary(
        {
          id: 4,
          evidence: { work: { ...projectWork({}), archivedAt: '2026-10-12' } },
        },
        [],
      ),
    ).toBeNull();
  });
  it('filters every row before pagination, keeps project filters and does not mutate task evidence', async () => {
    const tasks = Array.from({ length: 205 }, (_, i) => task(i + 1));
    const saved = structuredClone(tasks);
    const service = {
      repo: () => ({
        find: async ({ filter, offset, limit }: any) => {
          expect(filter).toEqual({ projectId: '1' });
          return tasks
            .slice(offset, offset + limit)
            .map((t) => ({ toJSON: () => t }));
        },
      }),
      effectPages: () => [url],
    };
    const r = await listResults(service, '1', { q: 'Task 205', pageSize: 20 });
    expect(r.total).toBe(1);
    expect(r.items[0].taskId).toBe('205');
    expect(tasks).toEqual(saved);
  });
  it('returns both checkpoints without execution transcript, leaving original task results and history intact', async () => {
    const t = task(1);
    t.evidence.work.observation.results.push(
      compare(28, '2026-10-01', [url], parts(28), '2026-11-02'),
    );
    const saved = structuredClone(t);
    const service = {
      task: async (p: string, id: string) => {
        expect(p).toBe('1');
        expect(id).toBe('1');
        return t;
      },
      effectPages: () => [url],
      snapshot: async () => null,
    };
    const r = await readResult(service, '1', { taskId: '1' });
    expect(r.results.map((r: any) => r.day)).toEqual([7, 28]);
    expect(r.task.history).toBeUndefined();
    expect(t).toEqual(saved);
  });
});
