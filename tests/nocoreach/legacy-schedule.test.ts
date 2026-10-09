// The daily analysis on the Scheduler (server/nocoreach/legacy/schedule.ts, server/providers/nocoreach.ts): the classic
// workflow surface answered from the schedule's definition, the per-firing run records, and what a firing reports.
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { DailyAnalysis, NODE_TYPE, WORKFLOW_TITLE } from '../../server/nocoreach/daily-analysis.js';
import { JOB_STATUS, LegacyWorkflows, ScheduledRuns, STALE_RUN_MS } from '../../server/nocoreach/legacy/schedule.js';
import { analysisCompletion, analysisObservation } from '../../server/providers/nocoreach.js';

const KEY = 'nocoreach.daily-analysis';

function definitions(rows: Record<string, unknown>[]) {
  const asked: unknown[] = [];
  const db: any = {
    repository: (name: string) => {
      assert.equal(name, 'scheduleDefinitions');
      return { findMany: async (o: any) => (asked.push(o), rows.slice(0, o.limit)) };
    },
  };
  return { db, asked };
}

test('the classic workflow lookup reads the schedule: its id, cron, and whether it runs', async () => {
  const row = { id: 'sch-1', key: KEY, cron: '0 9 * * *', timezone: 'Asia/Shanghai', enabled: true, lifecycleState: 'active' };
  const { db, asked } = definitions([row]);
  const workflows = new LegacyWorkflows(db, { [WORKFLOW_TITLE]: KEY }).repository();
  const wf = await workflows.findOne({ filter: { title: WORKFLOW_TITLE, type: 'schedule', current: true } });
  assert.equal(wf?.get('id'), 'sch-1');
  assert.equal(wf?.get('enabled'), true);
  assert.equal(wf?.get('config').repeat, '0 9 * * *');
  assert.ok(JSON.stringify(asked[0]).includes(KEY), 'looked up by the schedule key');
  assert.equal(await workflows.findOne({ filter: { title: 'Another workflow' } }), null);
  await assert.rejects(workflows.create({ values: {} }), /defined in code/);
  // Switched off by an administrator, or deactivated when removed from code: the service treats both as off.
  for (const off of [{ ...row, enabled: false }, { ...row, lifecycleState: 'inactive' }])
    assert.equal((await new LegacyWorkflows(definitions([off]).db, { [WORKFLOW_TITLE]: KEY }).repository().findOne({ filter: { title: WORKFLOW_TITLE } }))?.get('enabled'), false);
  // Not synchronized yet, or no Scheduler: no workflow, as when the classic one was deleted.
  const broken: any = { repository: () => ({ findMany: async () => { throw new Error('no table'); } }) };
  assert.equal(await new LegacyWorkflows(broken, { [WORKFLOW_TITLE]: KEY }).repository().findOne({ filter: { title: WORKFLOW_TITLE } }), null);
});

test('the daily analysis registers its instruction with the bridge, which runs it', async () => {
  const workflows = new LegacyWorkflows(definitions([]).db, { [WORKFLOW_TITLE]: KEY });
  const analysis: any = new DailyAnalysis({ app: { pm: { get: (n: string) => (n === 'workflow' ? workflows.plugin : null) } } }, async () => ({ text: '', model: 'm' }));
  assert.equal(analysis.registerInstruction(), true);
  const Instruction = workflows.instruction(NODE_TYPE);
  assert.ok(Instruction);
  analysis.p.projectIds = async () => [];
  assert.deepEqual(await new Instruction({}).run(), { status: JOB_STATUS.FAILED, result: { error: '项目不存在' } });
});

test('a firing\'s run record is kept per occurrence', async () => {
  const rows = new Map<string, any>();
  const repo = {
    findOne: async ({ filter }: any) => (rows.has(filter.key) ? { id: filter.key, get: () => rows.get(filter.key) } : null),
    update: async ({ filterByTk, values }: any) => void rows.set(filterByTk, values.payload),
    create: async ({ values }: any) => void rows.set(values.key, values.payload),
  };
  const runs = new ScheduledRuns({ getRepository: () => repo } as any, 'daily-analysis:occurrence');
  assert.equal(await runs.get('o-1'), null);
  const pending = await runs.put('o-1', { status: 'pending' });
  const done = await runs.put('o-1', { status: 'failed', reason: '项目 1：还没有接入在线 AI' });
  assert.ok(rows.has('daily-analysis:occurrence:o-1'));
  assert.equal(done.acceptedAt, pending.acceptedAt, 'accepted once');
  assert.equal((await runs.get('o-1'))?.status, 'failed');
});

test('a firing reports success only when every project succeeded or had already succeeded today', () => {
  const ok = analysisCompletion(JOB_STATUS.RESOLVED, { '1': { ok: true, items: 3, model: 'secret/model', at: 'x' }, '2': { ok: true, skipped: '今天已经分析成功' } });
  assert.deepEqual(ok, { status: 'succeeded', result: { projects: { '1': { ok: true, items: 3 }, '2': { ok: true, skipped: '今天已经分析成功' } } } });
  const failed = analysisCompletion(JOB_STATUS.FAILED, { '1': { ok: true, items: 1 }, '2': { ok: false, error: '还没有接入在线 AI', retryable: false } });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.reason, '项目 2：还没有接入在线 AI');
  assert.deepEqual(analysisCompletion(JOB_STATUS.FAILED, { error: '项目不存在' }), { status: 'failed', reason: '项目不存在' });
});

test('the Scheduler\'s question about a firing is answered from its record; a silent one is reported interrupted', () => {
  const now = new Date().toISOString();
  assert.deepEqual(analysisObservation(null), { state: 'unknown', reason: 'no-run-record' });
  assert.deepEqual(analysisObservation({ occurrenceId: 'o', status: 'running', acceptedAt: now, updatedAt: now }), { state: 'running' });
  assert.deepEqual(analysisObservation({ occurrenceId: 'o', status: 'succeeded', acceptedAt: now, updatedAt: now, result: { projects: {} } }), {
    state: 'completed',
    completion: { status: 'succeeded', result: { projects: {} } },
  });
  const old = new Date(Date.now() - STALE_RUN_MS - 1000).toISOString();
  const stale = analysisObservation({ occurrenceId: 'o', status: 'running', acceptedAt: old, updatedAt: old });
  assert.equal(stale.state, 'completed');
  assert.equal(stale.state === 'completed' && stale.completion.status, 'failed');
});
