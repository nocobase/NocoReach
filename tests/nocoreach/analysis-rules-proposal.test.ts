import { beforeEach, expect, test, vi } from 'vitest';
import {
  AnalysisRules,
  RULES,
  normalize,
} from '../../server/nocoreach/analysis-rules';
import {
  applyRuleChanges,
  rulesRevision,
} from '../../server/nocoreach/analysis-rules-proposal';
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('../../server/nocoreach/execution/provider', () => ({
  OnlineProvider: class {
    complete = complete;
  },
}));
const change = {
  ruleId: 'gsc-click-drop',
  field: 'dropPct',
  before: 30,
  after: 50,
  reason: 'Reduce small fluctuations',
};
function fixture() {
  const stored = new Map<string, ReturnType<typeof normalize>>();
  let queue = Promise.resolve();
  const repo = {
    findOne: async ({ filter }: { filter: { key: string } }) =>
      stored.has(filter.key)
        ? { id: filter.key, get: () => structuredClone(stored.get(filter.key)) }
        : null,
    create: async ({
      values,
    }: {
      values: { key: string; payload: ReturnType<typeof normalize> };
    }) => {
      stored.set(values.key, values.payload);
    },
    update: async ({
      filterByTk,
      values,
    }: {
      filterByTk: string;
      values: { payload: ReturnType<typeof normalize> };
    }) => {
      stored.set(filterByTk, values.payload);
    },
  };
  const service = new AnalysisRules({
    db: {
      getRepository: () => repo,
      sequelize: {
        query: async () => [],
        transaction: (fn: () => Promise<unknown>) => {
          const run = queue.then(fn);
          queue = run.then(
            () => undefined,
            () => undefined,
          );
          return run;
        },
      },
    },
  });
  return { service, stored };
}
beforeEach(() => {
  complete.mockReset();
});
test('preview uses current catalog and real provider contract without persisting', async () => {
  const { service, stored } = fixture();
  complete.mockResolvedValue(
    JSON.stringify({ explanation: 'Raise threshold', changes: [change] }),
  );
  const p = await service.propose(
    '1',
    { instruction: 'Reduce small fluctuations' },
    'en-US',
  );
  expect(p.changes).toEqual([change]);
  expect(stored.size).toBe(0);
  const sent = JSON.parse(complete.mock.calls[0][1]);
  expect(sent.catalog).toHaveLength(RULES.length);
  expect(sent.catalog[0].params[0]).toHaveProperty('min');
  await service.apply('1', p);
  expect(
    (await service.view('1')).rules.find(
      (r: { id: string }) => r.id === 'gsc-click-drop',
    ).params[0].value,
  ).toBe(50);
});
test('strict patches reject unknown fields, invalid types/ranges, duplicate and no-op edits', () => {
  const config = normalize({});
  for (const changes of [
    [{ ...change, ruleId: 'fake' }],
    [{ ...change, field: 'focus' }],
    [{ ...change, after: 1000 }],
    [{ ...change, after: '50' }],
    [change, change],
    [{ ...change, after: 30 }],
    [{ ...change, field: 'enabled', before: true, after: 0 }],
    [],
  ])
    expect(() => applyRuleChanges(RULES, config, changes)).toThrow();
  expect(config).toEqual(normalize({}));
});
test('preview validates model response, retains empty clarification and does not retry model failures', async () => {
  const { service, stored } = fixture();
  for (const output of [
    'not json',
    JSON.stringify({
      explanation: 'bad',
      changes: [{ ...change, after: 500 }],
    }),
    JSON.stringify({
      explanation: 'bad',
      changes: [{ ...change, before: 40 }],
    }),
  ]) {
    complete.mockResolvedValue(output);
    await expect(
      service.propose('1', { instruction: 'Please adjust' }, 'zh-CN'),
    ).rejects.toMatchObject({ status: 502 });
  }
  complete.mockResolvedValue(
    JSON.stringify({ explanation: 'Which traffic source?', changes: [] }),
  );
  expect(
    (await service.propose('1', { instruction: 'Less noise' }, 'en-US'))
      .changes,
  ).toEqual([]);
  complete.mockRejectedValue(
    Object.assign(new Error('missing model'), { status: 409 }),
  );
  const before = complete.mock.calls.length;
  await expect(
    service.propose('1', { instruction: 'Please adjust' }, 'en-US'),
  ).rejects.toMatchObject({ status: 409 });
  expect(complete.mock.calls.length - before).toBe(1);
  expect(stored.size).toBe(0);
});
test('save and apply reject stale revisions, preserve other rules, focus, watch and projects', async () => {
  const { service } = fixture();
  await service.save('1', {
    focus: 'Docs',
    watchDays: 21,
    rules: { 'site-thin': { enabled: false } },
  });
  const v = await service.view('1');
  await service.apply('1', { revision: v.revision, changes: [change] });
  const c = await service.config('1');
  expect(c.focus).toBe('Docs');
  expect(c.watchDays).toBe(21);
  expect(c.rules['site-thin'].enabled).toBe(false);
  expect(await service.config('2')).toEqual(normalize({}));
  await expect(
    service.apply('1', { revision: v.revision, changes: [change] }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    service.save('1', { expectedRevision: v.revision, focus: 'overwrite' }),
  ).rejects.toMatchObject({ status: 409 });
});
test('concurrent writes from the same version cannot both win', async () => {
  const { service } = fixture();
  const { revision } = await service.view('1');
  const writes = await Promise.allSettled([
    service.apply('1', { revision, changes: [change] }),
    service.save('1', {
      expectedRevision: revision,
      focus: 'changed elsewhere',
    }),
  ]);
  expect(writes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(writes.filter((r) => r.status === 'rejected')).toHaveLength(1);
});
test('catalog changes invalidate preview; rank interval is validated as a whole', () => {
  const c = normalize({});
  expect(rulesRevision(RULES, c)).not.toBe(rulesRevision(RULES.slice(1), c));
  expect(() =>
    applyRuleChanges(RULES, c, [
      {
        ...change,
        ruleId: 'gsc-near-first',
        field: 'posFrom',
        before: 8,
        after: 30,
      },
    ]),
  ).toThrow();
  expect(() =>
    applyRuleChanges(RULES, c, [
      {
        ...change,
        ruleId: 'gsc-near-first',
        field: 'posFrom',
        before: 8,
        after: 30,
      },
      {
        ...change,
        ruleId: 'gsc-near-first',
        field: 'posTo',
        before: 20,
        after: 40,
      },
    ]),
  ).not.toThrow();
});
test('invalid instructions rejected before contacting model', async () => {
  const { service } = fixture();
  for (const instruction of ['', ' '.repeat(4), 'x'.repeat(2001), {}])
    await expect(
      service.propose('1', { instruction }, 'zh-CN'),
    ).rejects.toMatchObject({ status: 400 });
  expect(complete).not.toHaveBeenCalled();
});
