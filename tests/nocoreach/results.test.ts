import { describe, expect, it } from 'vitest';
import {
  compare,
  windows,
  totals,
  type Partition,
} from '../../server/nocoreach/execution/effect.js';
import { projectWork } from '../../server/nocoreach/execution/model.js';
import {
  boardWindow,
  listResults,
  resultBoard,
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
  it('splits a comparison over several pages into each page, and leaves a single page alone', () => {
    const other = 'https://example.com/other';
    const records = parts().map((p) => ({
      ...p,
      payload: [
        ...p.payload,
        { page: other, clicks: 4, impressions: 40, position: 12 },
      ],
    }));
    const r = compare(7, '2026-10-01', [url, other], records, '2026-10-12');
    expect(r.gsc?.clicks).toEqual([28, 98]);
    expect(r.byPage).toEqual([
      { page: url, clicks: [0, 70], position: [0, 3] },
      { page: other, clicks: [28, 28], position: [12, 12] },
    ]);
    expect(
      compare(7, '2026-10-01', [url], parts(), '2026-10-12').byPage,
    ).toBeUndefined();
  });
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
  it('lists only work with an outcome: live, or finished even if archived after; never unfinished, waiting or simulated work', () => {
    const work = (id: number, w: object, evidence: object = {}) => ({
      id,
      evidence: { ...evidence, work: { ...projectWork({}), ...w } },
    });
    const draft = { results: [{ id: 'a', createdAt: '2026-10-01T00:00:00Z' }] };
    // Live work, also once archived or stopped after going live, and old Insights observation records.
    expect(resultSummary(task(1), [url])?.latest).toEqual(result);
    expect(
      resultSummary(task(2, { archivedAt: '2026-10-12' }), [url]),
    ).toMatchObject({ archived: true, closed: false });
    expect(
      resultSummary(task(3, { cancelledAt: '2026-10-13' }), [url]),
    ).toMatchObject({ taskState: 'closed', closed: true });
    expect(resultSummary({ id: 4, status: '已完成' }, [])?.status).toBe(
      'unavailable',
    );
    // A finished delivery, archived afterwards, stays a completed delivery.
    expect(
      resultSummary(work(5, { stage: 'done', archivedAt: '2026-10-12' }), []),
    ).toMatchObject({ taskState: 'done', archived: true, phase: 'delivered' });
    // Archived before it finished (the old-workflow archive too), cancelled with a draft, or waiting for review: these
    // stay in Tasks.
    for (const t of [
      work(6, { archivedAt: '2026-10-12' }),
      work(7, { ...draft, stage: 'work', archivedAt: '2026-10-12' }),
      work(8, { ...draft, stage: 'done', cancelledAt: '2026-10-12' }),
      work(9, {
        ...draft,
        stage: 'flow',
        stageIndex: 1,
        flow: {
          id: 'f',
          name: 'Flow',
          version: 1,
          stages: [
            { key: 's0', name: 'agent', kind: 'agent' },
            { key: 's1', name: 'review', kind: 'review' },
          ],
        },
      }),
    ])
      expect(resultSummary(t, [])).toBeNull();
    // Simulated work (the demo install) follows the same rule and says it is simulated.
    expect(
      resultSummary(work(10, { stage: 'done' }, { simulated: true }), []),
    ).toMatchObject({ simulated: true, phase: 'delivered' });
    expect(
      resultSummary(work(11, { stage: 'work' }, { simulated: true }), []),
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
describe('results dashboard', () => {
  const page = (name: string) => `https://example.com/${name}`;
  // `before` and `after` clicks per day on the page, over the day-`day` windows around `from`.
  const daily = (
    from: string,
    day: number,
    url: string,
    before: number,
    after: number,
  ) => {
    const w = windows(from, day),
      out: Partition[] = [];
    for (const [range, clicks] of [
      [w.baseline, before],
      [w.after, after],
    ] as const)
      for (
        let date = range.start;
        date <= range.end;
        date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)
      )
        out.push({
          source: 'gsc',
          grain: 'query_page',
          date,
          payload: [
            { page: url, clicks, impressions: clicks * 10, position: 4 },
          ],
        });
    return out;
  };
  const live = (
    id: number,
    from: string,
    clicks?: [number, number],
    extra: object = {},
  ) => ({
    id,
    projectId: '1',
    title: `Task ${id}`,
    evidence: {
      no: id,
      work: {
        ...projectWork({}),
        stage: 'done',
        observeFrom: `${from}T00:00:00Z`,
        page: { url: page(String(id)) },
        observation: {
          results: clicks
            ? [
                compare(
                  7,
                  from,
                  [page(String(id))],
                  daily(from, 7, page(String(id)), ...clicks),
                  '2026-10-30',
                ),
              ]
            : [],
        },
        ...extra,
      },
    },
  });
  const flow = (stageIndex: number, kinds: string[]) => ({
    stage: 'flow',
    stageIndex,
    flow: {
      id: 'f',
      name: 'Flow',
      version: 1,
      stages: kinds.map((kind, i) => ({ key: `s${i}`, name: kind, kind })),
    },
  });
  const delivered = (id: number, at: string, extra: object = {}) => ({
    id,
    projectId: '1',
    title: `Task ${id}`,
    evidence: {
      no: id,
      work: {
        ...projectWork({}),
        results: [{ id: `a${id}`, createdAt: `${at}T00:00:00Z` }],
        ...extra,
      },
    },
  });
  const service = (tasks: object[]) => ({
    repo: () => ({
      find: async ({ offset, limit }: { offset: number; limit: number }) =>
        tasks.slice(offset, offset + limit).map((t) => ({ toJSON: () => t })),
    }),
    effectPages: (w: { page?: { url: string } }) =>
      w.page?.url ? [w.page.url] : [],
  });

  const period = () => [
    live(1, '2026-10-01', [10, 20]),
    live(2, '2026-09-20', [20, 10]),
    live(3, '2026-10-10'),
    delivered(4, '2026-10-12', flow(1, ['agent', 'review', 'observe'])),
    delivered(5, '2026-10-05', { stage: 'done' }),
    live(6, '2026-06-01', [10, 20]),
  ];

  it('reads the same windows as the data pages and rejects anything else', () => {
    const today = '2026-10-16';
    expect(boardWindow({}, today)).toEqual({ start: '2026-07-19', end: today });
    expect(boardWindow({ range: '28' }, today).start).toBe('2026-09-19');
    expect(boardWindow({ range: '12m' }, today).start).toBe('2025-10-17');
    expect(boardWindow({ range: 'all' }, today)).toEqual({
      start: null,
      end: today,
    });
    expect(
      boardWindow({ range: 'custom', from: '2026-09-01', to: '2026-09-30' }),
    ).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    for (const bad of [
      { range: '7' },
      { range: 'custom', from: '2026-09-30', to: '2026-09-01' },
      { range: 'custom', from: '2026-02-30', to: '2026-03-01' },
      { range: 'custom', from: '2026-10-01', to: '2026-10-17' },
      { range: 'custom' },
    ])
      expect(() => boardWindow(bad, today)).toThrow(
        expect.objectContaining({ status: 400 }),
      );
  });

  it('tells live and delivered work apart, and leaves work still to go live out', () => {
    const phase = (task: object) => resultSummary(task, [])?.phase;
    expect(phase(live(1, '2026-10-01'))).toBe('live');
    // A finished research flow has no page to watch.
    expect(phase(delivered(3, '2026-10-01', { stage: 'done' }))).toBe(
      'delivered',
    );
    // Waiting for review before going live, archived before going live, or a simulated release not yet live: not
    // results yet.
    for (const t of [
      delivered(2, '2026-10-01', flow(1, ['agent', 'review', 'observe'])),
      delivered(4, '2026-10-01', {
        ...flow(1, ['agent', 'review', 'observe']),
        archivedAt: '2026-10-02',
      }),
      delivered(5, '2026-10-01', {
        ...flow(1, ['agent', 'release', 'observe']),
        release: { state: 'simulated', note: '', pages: [] },
      }),
    ])
      expect(resultSummary(t, [])).toBeNull();
  });

  it('counts, adds up and orders only the work of the chosen period', async () => {
    const tasks = period();
    const saved = structuredClone(tasks);
    const board = await resultBoard(service(tasks), '1', {
      range: 'custom',
      from: '2026-09-01',
      to: '2026-10-15',
    });
    // Task 4 still waits for review before going live, so it is not counted.
    expect(board.total).toBe(4);
    expect(board.counts).toEqual({
      live: 3,
      delivered: 1,
      up: 1,
      down: 1,
      flat: 0,
      insufficient: 0,
      waiting: 1,
    });
    // Task 1: 70 → 140, task 2: 140 → 70; task 6 is outside the period.
    expect(board.totals).toEqual({
      clicks: { before: 210, after: 210, tasks: 2 },
      views: null,
    });
    expect(board.changes.map((c) => [c.taskId, c.status])).toEqual([
      ['3', 'waiting'],
      ['1', 'up'],
      ['2', 'down'],
    ]);
    expect(board.changes[1]).toMatchObject({
      metric: 'clicks',
      before: 70,
      after: 140,
      percent: 100,
      day: 7,
      nextDay: 28,
      nextDate: '2026-11-01',
    });
    expect(board.changes[0]).toMatchObject({
      metric: null,
      before: null,
      nextDay: 7,
      nextDate: '2026-10-20',
    });
    // Down first, then checks still to come, then the rest.
    expect(board.attention.map((item) => item.taskId)).toEqual([
      '2',
      '3',
      '1',
      '5',
    ]);
    expect(tasks).toEqual(saved);
  });

  it('leaves a source out of the totals when its days are not all covered', async () => {
    const partial = live(1, '2026-10-01', [10, 20]);
    partial.evidence.work.observation.results[0].coverage!.gsc.afterDays = 6;
    const board = await resultBoard(service([partial]), '1', { range: 'all' });
    expect(board.totals.clicks).toBeNull();
    expect(board.changes[0]).toMatchObject({ status: 'insufficient' });
    expect(board.counts.insufficient).toBe(1);
  });
  it('lists the dashboard period with phases as filters, in either order', async () => {
    const s = service(period()),
      window = { range: 'custom', from: '2026-09-01', to: '2026-10-15' },
      ids = (r: { items: { taskId: string }[] }) =>
        r.items.map((i) => i.taskId);
    expect(ids(await listResults(s, '1', window))).toEqual([
      '3',
      '5',
      '1',
      '2',
    ]);
    expect(ids(await listResults(s, '1', { ...window, order: 'asc' }))).toEqual(
      ['2', '1', '5', '3'],
    );
    // Waiting to go live is no longer a phase of Results.
    await expect(
      listResults(s, '1', { range: 'all', status: 'pendingLive' }),
    ).rejects.toMatchObject({ status: 400 });
    // Delivered work has no comparison, so it is not a live result "without comparable data".
    expect(
      (await listResults(s, '1', { range: 'all', status: 'unavailable' }))
        .total,
    ).toBe(0);
    expect(
      ids(await listResults(s, '1', { range: 'all', status: 'delivered' })),
    ).toEqual(['5']);
    await expect(listResults(s, '1', { order: 'up' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(listResults(s, '1', { range: '7' })).rejects.toMatchObject({
      status: 400,
    });
  });
  it('keeps undated results in an all-time list, as the dashboard counts them', async () => {
    const undated = {
      id: 7,
      projectId: '1',
      title: 'Task 7',
      status: '已完成',
    };
    const s = service([...period(), undated]);
    expect(
      (await listResults(s, '1', { range: 'all' })).items.map((i) => i.taskId),
    ).toContain('7');
    expect((await resultBoard(s, '1', { range: 'all' })).total).toBe(
      (await listResults(s, '1', { range: 'all' })).total,
    );
  });
});
