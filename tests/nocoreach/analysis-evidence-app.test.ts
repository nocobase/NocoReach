// @vitest-environment node
// Each analysis's evidence kept once (server/nocoreach/analysis-evidence.ts): the startup slimming of stored rows, the
// archive an analysis leaves when a new one is saved, and the online agent reading a past day's whole evidence back.
import { randomBytes } from 'node:crypto';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { archiveKey } from '../../server/nocoreach/analysis-evidence';
import { dailyAnalysisTool } from '../../server/nocoreach/online-agent/analysis-tool';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});

const signal = (key: string) => ({
  key,
  source: 'gsc',
  title: `Signal ${key}`,
  facts: [`fact ${key}`],
  url: `https://example.com/${key}`,
  evidence: [`https://example.com/${key}/page`],
});
const evidence = (keys: string[]) => ({
  capturedAt: '2026-11-01T00:00:00.000Z',
  availableThrough: '2026-10-31',
  periodDays: 28,
  analysisVersion: 3,
  limitations: ['sampled'],
  searchQueries: [{ keyword: 'crm', clicks: 3 }],
  knowledge: [{ title: 'Doc', text: 'x'.repeat(500) }],
  summary: { web: { days: 28, views: 9 }, search: { days: 28, clicks: 3 } },
  signals: {
    analysisRunId: 'run-1',
    computedAt: '2026-11-01T00:00:00.000Z',
    analysisSnapshot: { config: { watchDays: 7 }, catalog: [{ id: 'r' }] },
    ruleRuns: [{ ruleId: 'r', status: 'matched' }],
    items: keys.map(signal),
  },
});
const day = (ago: number) =>
  new Date(Date.now() - ago * 86_400_000).toISOString();

test('slims stored evidence once, archives recent analyses and reads a past day back', async ({
  testApp,
  connection,
}) => {
  const plugin = testApp.application.container.resolve(nocoReachToken).plugin;
  vi.spyOn(plugin.taskExecution, 'tick').mockResolvedValue(undefined);
  await plugin.projects.create({
    name: 'Evidence project',
    domain: 'evidence.example.com',
    language: 'en-US',
  });
  const id = String((await plugin.projects.list()).at(-1).id);
  const recent = day(3),
    old = day(200);
  const snapshots = connection.repository('nrSnapshots');
  await snapshots.createOne({
    values: {
      id: 920001,
      key: `strategy:${id}`,
      payload: {
        revision: 3,
        goal: null,
        goalHistory: [],
        operations: [],
        insights: {
          generatedAt: day(1),
          items: [{ id: 'now', title: 'Now', signalIds: ['a'] }],
          evidence: evidence(['a', 'b']),
        },
        insightHistory: [
          {
            generatedAt: recent,
            items: [{ id: 'recent', title: 'Recent', signalIds: ['c'] }],
            signalReviews: { c: { verdict: 'do', reason: 'r' } },
            evidence: evidence(['c', 'd']),
          },
          {
            generatedAt: old,
            items: [{ id: 'old', title: 'Old', signalIds: ['e'] }],
            evidence: evidence(['e', 'f']),
          },
        ],
        proposals: [
          { id: 'p', title: 'Plan', taskId: 1, evidence: evidence(['a']) },
        ],
      },
    },
  });
  const tasks = connection.repository('nrTasks');
  await tasks.createOne({
    values: {
      id: 910001,
      projectId: id,
      taskKey: 'with-part',
      title: 'With part',
      status: '待处理',
      evidence: {
        insight: { id: 'recent', signalIds: ['c'] },
        part: { signalIds: ['d'] },
        context: evidence(['c', 'd', 'g']),
      },
    },
  });
  await tasks.createOne({
    values: {
      id: 910002,
      projectId: id,
      taskKey: 'change',
      title: 'Change',
      status: '待处理',
      updatedAt: '2026-10-01T00:00:00.000Z',
      evidence: { signalKey: 'b', context: evidence(['a', 'b']) },
    },
  });

  // An archive past its lifetime, of this project and of a project whose id starts the same.
  await snapshots.createOne({
    values: { id: 920002, key: archiveKey(id, old), payload: { stale: true } },
  });
  await snapshots.createOne({
    values: {
      id: 920003,
      key: archiveKey(`${id}2`, old),
      payload: { other: true },
    },
  });
  const updatedAt = async (task: number) =>
    String(
      (
        (await tasks.findOne({ filter: { id: task } })) as unknown as {
          updatedAt: unknown;
        }
      ).updatedAt,
    );
  const changeUpdated = await updatedAt(910002);
  await new Promise((resolve) => setTimeout(resolve, 20));
  // A runner saves the task's step while the slimming waits for its lock: the step is kept.
  const lock = plugin.taskExecution.lock.bind(plugin.taskExecution);
  vi.spyOn(plugin.taskExecution, 'lock').mockImplementation(
    async (project: string, task: string, fn: (tx: unknown) => unknown) => {
      if (task === '910001') {
        const row = (await tasks.findOne({
          filter: { id: 910001 },
        })) as unknown as { evidence: Record<string, unknown> };
        await tasks.updateOne({
          filter: { id: 910001 },
          values: {
            evidence: { ...row.evidence, work: { stage: 'work', revision: 2 } },
          },
        });
      }
      return lock(project, task, fn as never);
    },
  );

  await plugin.strategy.slimProject(id);
  vi.mocked(plugin.taskExecution.lock).mockRestore();

  const state = await plugin.strategy.state(id);
  expect(state.insights.evidence.signals.analysisSnapshot).toEqual({
    config: { watchDays: 7 },
  });
  expect(state.insights.evidence.signals.items).toHaveLength(2);
  const [kept, older] = state.insightHistory;
  expect(kept.items).toEqual([
    { id: 'recent', title: 'Recent', signalIds: ['c'] },
  ]);
  expect(kept.signalReviews).toEqual({ c: { verdict: 'do', reason: 'r' } });
  expect(kept.evidence.signals.items.map((s) => s.key)).toEqual(['c']);
  expect(kept.evidence).not.toHaveProperty('searchQueries');
  expect(kept.evidence.summary).toEqual({
    web: { days: 28 },
    search: { days: 28 },
  });
  expect(older.evidence.signals.items.map((s) => s.key)).toEqual(['e']);
  expect(state.proposals[0]).not.toHaveProperty('evidence');
  // The recent analysis is archived whole; one past the archive's lifetime is not.
  expect(await plugin.strategy.archived(id, recent)).toEqual(
    evidence(['c', 'd']),
  );
  expect(await plugin.strategy.archived(id, old)).toBeNull();
  const withPart = (
    (await tasks.findOne({ filter: { id: 910001 } })) as unknown as {
      evidence: any;
    }
  ).evidence;
  expect(withPart.context.signals.items.map((s) => s.key)).toEqual(['c', 'd']);
  expect(withPart.context.signals.items[0]).toEqual(signal('c'));
  expect(withPart.context.capturedAt).toBe('2026-11-01T00:00:00.000Z');
  expect(withPart.insight).toEqual({ id: 'recent', signalIds: ['c'] });
  expect(withPart.work).toEqual({ stage: 'work', revision: 2 });
  const change = (
    (await tasks.findOne({ filter: { id: 910002 } })) as unknown as {
      evidence: any;
    }
  ).evidence;
  expect(change.context.signals.items.map((s) => s.key)).toEqual(['b']);

  // Slimming is not an edit: the order of queues and Done stays.
  expect(changeUpdated).not.toBe('null');
  expect(await updatedAt(910002)).toBe(changeUpdated);
  // Only this project's archives past their lifetime were removed.
  expect(await plugin.strategy.archived(id, old)).toBeNull();
  expect(await plugin.strategy.archived(`${id}2`, old)).toEqual({
    other: true,
  });

  // Running again changes nothing.
  const before = JSON.stringify(await plugin.strategy.state(id));
  await plugin.strategy.slimProject(id);
  expect(JSON.stringify(await plugin.strategy.state(id))).toBe(before);

  // The agent reads every change of a past day from its archive.
  const tool = dailyAnalysisTool(
    () => plugin.strategy.state(id),
    async () => undefined,
    (opportunity) => `/opportunities?item=${opportunity}`,
    async () => [],
    (generatedAt) => plugin.strategy.archived(id, generatedAt),
  );
  const page = (await tool.execute(
    { day: recent.slice(0, 10) },
    {} as never,
  )) as { text: string; nextOffset: number | null };
  expect(page.nextOffset).toBeNull();
  const read = JSON.parse(page.text) as {
    analysis: { changes: { key: string; facts: string[] }[] };
  };
  expect(read.analysis.changes.map((c) => c.key)).toEqual(['c', 'd']);
  expect(read.analysis.changes[1].facts).toEqual(['fact d']);

  // A new analysis archives the one it replaces, whole.
  const current = state.insights;
  await plugin.strategy.saveInsights(
    id,
    {
      requestId: `evidence-${randomBytes(12).toString('hex')}`,
      revision: state.revision,
      insights: [
        {
          title: 'Next',
          observation: 'o',
          meaning: 'm',
          evidenceText: 'e',
          limitation: 'l',
          suggestion: 's',
          objective: 'g',
          source: 'gsc',
          signalIds: ['h'],
        },
      ],
    },
    undefined,
    { evidence: evidence(['h']) },
  );
  expect(await plugin.strategy.archived(id, current.generatedAt)).toEqual(
    current.evidence,
  );
  const next = await plugin.strategy.state(id);
  expect(next.insightHistory[0].generatedAt).toBe(current.generatedAt);
  expect(
    next.insightHistory[0].evidence.signals.items.map((s) => s.key),
  ).toEqual(['a']);
  expect(next.insights.evidence.signals.analysisSnapshot).toEqual({
    config: { watchDays: 7 },
  });
  expect(await snapshots.count({ filter: { key: archiveKey(id, old) } })).toBe(
    0,
  );
});
