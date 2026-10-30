// @ts-nocheck
// Reopening closed tasks (2026-10-29 user decision): every closed task can be reopened and resumes at the step where
// it was closed, keeping what was done and approved (shared/task-reopen.ts, TaskService unarchiveTask).
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import { reopening } from '../../shared/task-reopen.js';
import { SYSTEM_PLAYBOOKS, stagesFor } from '../../server/nocoreach/execution/playbook.js';
import { fakeAgents, selectAgent, claim, finish } from './agents-fixture';
vi.setConfig({ testTimeout: 60000 });

function fixture() {
  const state = { nrTasks: [{ id: 1, projectId: '1', title: 'Synthetic task', brief: 'Supplied evidence only', status: '待处理', evidence: { reason: 'original' } }], nrSnapshots: [], users: [{ id: 1, username: 'tester', roles: [{ name: 'admin' }] }] };
  let sequence = 100;
  const match = (r, filter = {}) => Object.entries(filter).every(([k, v]) => v && typeof v === 'object' ? v.$startsWith !== undefined && String(r[k]).startsWith(v.$startsWith) : String(r[k]) === String(v));
  const row = r => r ? { ...r, get: k => structuredClone(r[k]), toJSON: () => structuredClone(r) } : null;
  const repo = name => ({ findOne: async ({ filter, filterByTk }) => row(state[name].find(r => filterByTk !== undefined ? String(r.id) === String(filterByTk) : match(r, filter))), find: async ({ filter, offset = 0, limit = 100 }) => state[name].filter(r => match(r, filter)).slice(offset, offset + limit).map(row), create: async ({ values }) => { const r = { id: sequence++, ...structuredClone(values) }; state[name].push(r); return row(r); }, update: async ({ filterByTk, values }) => { Object.assign(state[name].find(r => String(r.id) === String(filterByTk)), structuredClone(values)); } });
  let tail = Promise.resolve();
  const p = { agents: fakeAgents(), project: async () => ({ name: 'Synthetic', writingStyle: 'Plain' }), db: { getRepository: repo, sequelize: { query: async () => {}, transaction: fn => { const result = tail.then(async () => { const old = structuredClone(state); try { const after = []; const value = await fn({ connection: {}, afterCommit: cb => after.push(cb) }); for (const cb of after) await cb(); return value; } catch (e) { Object.assign(state, old); throw e; } }); tail = result.catch(() => {}); return result; } } }, app: { resourceManager: { define: () => {} }, acl: { allow: () => {} } } };
  const s = new TaskService(p, { prepare: async () => ({ llmService: 'test', model: 'echo' }), invoke: async () => ({ content: 'AI draft' }) });
  const view = (taskId = '1') => s.get('1', taskId);
  const command = async (command, body = {}, taskId = '1') => s.update('1', { taskId, revision: (await view(taskId)).work.revision, requestId: randomUUID(), command, ...body }, '1', 'Tester');
  const stage = async (taskId = '1') => { const d = await view(taskId); return d.work.flow.stages[d.work.stageIndex]; };
  return { s, state, command, view, stage };
}
const output = d => d.work.results[d.work.stageIndex - 1];
const reopened = d => d.work.history.at(-1);
const pr = n => ({ url: `https://github.com/estheryo/website-test/pull/${n}`, number: n, branch: 'nocoreach/task-1', headSha: 'abc1234', files: [] });
async function withRepo(f) {
  await selectAgent(f);
  await f.s.agents.saveRepo('1', { repo: 'estheryo/website-test', baseBranch: 'main', revision: 1 });
}
// A built-in playbook's task placed at one of its steps, as a test writes it directly.
function placed(f, id, playbook, stageIndex, extra = {}) {
  const flow = { id: playbook, name: playbook, version: 1, stages: stagesFor(SYSTEM_PLAYBOOKS.find(p => p.id === playbook)) };
  f.state.nrTasks.push({ id, projectId: '1', title: `Task ${id}`, brief: '', status: '进行中', evidence: { work: { schemaVersion: 2, revision: 1, stage: 'flow', plan: null, planVersion: 0, step: 0, results: [], history: [], operations: [], receipt: null, verification: null, humanOwnerId: '1', humanOwnerName: 'Tester', flow, stageIndex, ...extra } } });
}

test('a task closed before it started goes back to waiting to start', async () => {
  const f = fixture();
  let d = await f.command('archiveTask');
  assert.ok(d.work.archivedAt);
  d = await f.command('unarchiveTask');
  assert.equal(d.work.archivedAt, undefined);
  assert.equal(d.work.stage, 'plan');
  assert.equal(d.task.status, '待处理');
  assert.equal(reopened(d).action, 'unarchiveTask');
  assert.equal(reopened(d).stageKey, undefined, 'nothing started, so no step to name');
  await assert.rejects(f.command('unarchiveTask'), e => e.status === 409, 'an open task is not reopened');
});

test('closed at review: reopening returns straight to the review with the delivered result', async () => {
  const f = fixture();
  await selectAgent(f);
  await f.command('startTask', { playbookId: 'keyword-research' });
  const c = await claim(f);
  await finish(f, { taskId: '1', runId: c.run.id, ok: true, content: 'Keyword analysis' });
  let d = await f.view();
  const delivered = output(d);
  assert.equal((await f.stage()).kind, 'review');
  d = await f.command('cancelTask');
  assert.ok(d.work.cancelledAt);
  assert.equal(d.task.status, '已取消');
  assert.deepEqual(reopening(d.work, d.runs), { stageIndex: d.work.stageIndex });
  d = await f.command('unarchiveTask');
  assert.equal(d.work.cancelledAt, undefined);
  assert.equal(d.work.cancelledBy, undefined);
  assert.equal(d.task.status, '待确认');
  assert.equal((await f.stage()).kind, 'review');
  assert.equal(output(d).id, delivered.id, 'the delivered result is kept');
  assert.equal(reopened(d).stageKey, (await f.stage()).key);
  assert.equal(reopened(d).note, undefined);
  d = await f.command('approveStage', { stageKey: (await f.stage()).key, artifactId: delivered.id, checked: ['facts'] });
  assert.equal(d.work.stage, 'done', 'the review goes on as if it was never closed');
});

test('an Agent step stopped by closing waits to be started again', async () => {
  const f = fixture();
  await selectAgent(f);
  let d = await f.command('startTask', { playbookId: 'keyword-research' });
  const queued = d.runs[0];
  d = await f.command('cancelTask');
  assert.equal(d.runs.find(r => r.id === queued.id).error, 'cancelled');
  assert.equal(reopening(d.work, d.runs).restart, 'stopped');
  d = await f.command('unarchiveTask');
  assert.equal(d.work.stageIndex, 0);
  assert.equal(reopened(d).note, 'stopped');
  assert.equal(d.runs.filter(r => r.status === 'queued').length, 0, 'reopening does not start the Agent by itself');
  d = await f.command('retryStage', { stageKey: (await f.stage()).key });
  assert.equal(d.runs.filter(r => r.status === 'queued').length, 1, 'Start this step again queues a new run');
});

test('a running Agent step stopped by closing: reopened once the executor has stopped', async () => {
  const f = fixture();
  await selectAgent(f);
  await f.command('startTask', { playbookId: 'keyword-research' });
  const c = await claim(f);
  let d = await f.command('cancelTask');
  assert.equal(d.runs.find(r => r.id === c.run.id).cancelRequested, true);
  await assert.rejects(f.command('unarchiveTask'), e => e.status === 409 && /还在停下/.test(e.message));
  // The Runner stops it: the official run ends as cancelled and the business run settles.
  await f.s.runtime.sync(f.state.nrSnapshots.find(r => r.key.endsWith(c.run.id)).payload);
  d = await f.view();
  assert.equal(d.runs.find(r => r.id === c.run.id).error, 'cancelled');
  d = await f.command('unarchiveTask');
  assert.equal(reopened(d).note, 'stopped');
  assert.equal(d.work.cancelledAt, undefined);
});

test('a change withdrawn by closing goes back to the Agent step that made it, which opens a new PR', async () => {
  const f = fixture();
  await withRepo(f);
  await f.command('startTask', { playbookId: 'optimize-page' });
  let c = await claim(f);
  await finish(f, { taskId: '1', runId: c.run.id, ok: true, content: 'Changed', pr: pr(4) });
  let d = await f.view();
  const delivered = output(d);
  d = await f.command('cancelTask');
  assert.equal(d.work.prClose.state, 'closing');
  c = await claim(f);
  assert.equal(c.run.mode, 'close');
  await finish(f, { taskId: '1', runId: c.run.id, ok: true });
  d = await f.view();
  assert.equal(d.work.prClose.state, 'closed');
  d = await f.command('unarchiveTask');
  assert.equal((await f.stage()).kind, 'agent');
  assert.equal(reopened(d).note, 'withdrawn');
  assert.equal(reopened(d).stageKey, 'build');
  assert.equal(d.work.results[0].id, delivered.id, 'the earlier version stays in the record');
  assert.equal(d.task.status, '进行中');
  // Closing again before a new PR exists does not close the closed one again.
  d = await f.command('cancelTask');
  assert.equal(d.runs.filter(r => r.mode === 'close').length, 1);
  await f.command('unarchiveTask');
  await f.command('retryStage', { stageKey: 'build' });
  c = await claim(f);
  assert.equal(c.run.mode, 'build');
  assert.equal(c.run.input.branch, 'nocoreach/task-1');
  await finish(f, { taskId: '1', runId: c.run.id, ok: true, content: 'Changed again', pr: pr(7) });
  d = await f.view();
  assert.equal((await f.stage()).kind, 'review');
  assert.equal(output(d).pr.number, 7, 'the new PR is reviewed');
});

test('a PR close the Agent has not picked up is dropped on reopen and the change returns to its review', async () => {
  const f = fixture();
  await withRepo(f);
  await f.command('startTask', { playbookId: 'optimize-page' });
  const c = await claim(f);
  await finish(f, { taskId: '1', runId: c.run.id, ok: true, content: 'Changed', pr: pr(4) });
  let d = await f.command('cancelTask');
  const close = d.runs.find(r => r.mode === 'close');
  assert.equal(close.status, 'queued');
  assert.equal(reopening(d.work, d.runs).keepsChange, true);
  d = await f.command('unarchiveTask');
  assert.equal(d.runs.find(r => r.id === close.id).status, 'failed');
  assert.equal(d.work.prClose, undefined);
  assert.equal((await f.stage()).kind, 'review');
  assert.equal(output(d).pr.number, 4);
  // The plugin run is cancelled when the dropped close is synced.
  await f.s.runtime.sync(f.state.nrSnapshots.find(r => r.key.endsWith(close.id)).payload);
  assert.equal(f.s.p.agents.records.get(close.pluginRunId).status, 'cancelled');
});

test('a merged change never goes back: closed while its live page was checked, it resumes the check', async () => {
  const f = fixture();
  await withRepo(f);
  const release = { state: 'verifying', pr: { number: 4, url: pr(4).url, headSha: 'abc1234' }, note: 'x', pages: ['https://www.example.com/a'], verifyText: 'x', mergedAt: '2026-10-28T00:00:00Z', nextCheckAt: '2026-10-28T00:00:00Z', deadline: '2026-10-29T00:00:00Z' };
  placed(f, 2, 'optimize-page', 2, { release, results: [{ id: 'a1', stepId: 'build', planVersion: 0, version: 1, content: 'Changed', createdAt: '2026-10-27T00:00:00Z', createdBy: 'agent', pr: pr(4), approvedAt: '2026-10-27T01:00:00Z' }] });
  let d = await f.command('cancelTask', {}, '2');
  assert.equal(d.work.prClose, undefined, 'a merged PR is not closed');
  d = await f.command('unarchiveTask', {}, '2');
  assert.equal((await f.stage('2')).kind, 'release');
  assert.equal(d.work.release.state, 'verifying');
  assert.equal(d.work.release.mergedAt, release.mergedAt);
});

test('a publish stopped before merging goes back to the review, so publishing waits for a new approval', async () => {
  const f = fixture();
  const release = { state: 'merging', pr: { number: 4, url: pr(4).url, headSha: 'abc1234' }, note: 'x', pages: [] };
  placed(f, 2, 'optimize-page', 2, { release, results: [{ id: 'a1', stepId: 'build', planVersion: 0, version: 1, content: 'Changed', createdAt: '2026-10-27T00:00:00Z', createdBy: 'agent', pr: pr(4), approvedAt: '2026-10-27T01:00:00Z' }] });
  // No repository connected any more, so closing could not withdraw the PR.
  let d = await f.command('cancelTask', {}, '2');
  assert.equal(d.work.prClose, undefined);
  d = await f.command('unarchiveTask', {}, '2');
  assert.equal((await f.stage('2')).kind, 'review');
  assert.equal(d.work.release, undefined);
  assert.equal(output(d).id, 'a1');
});

test('a live task put away comes back still watched, and a task both stopped and put away reopens fully', async () => {
  const f = fixture();
  placed(f, 2, 'optimize-page', 3, { stage: 'done', observeFrom: '2026-09-20T00:00:00Z' });
  await f.command('archiveTask', {}, '2');
  let d = await f.command('unarchiveTask', {}, '2');
  assert.equal(d.work.stage, 'done');
  assert.equal(d.work.observeFrom, '2026-09-20T00:00:00Z');
  placed(f, 3, 'keyword-research', 1, { results: [{ id: 'r1', stepId: 'analyze', planVersion: 0, version: 1, content: 'Doc', createdAt: '2026-10-27T00:00:00Z', createdBy: 'agent' }] });
  await f.command('cancelTask', {}, '3');
  d = await f.command('archiveTask', {}, '3');
  assert.ok(d.work.cancelledAt && d.work.archivedAt);
  d = await f.command('unarchiveTask', {}, '3');
  assert.equal(d.work.cancelledAt, undefined);
  assert.equal(d.work.archivedAt, undefined);
  assert.equal((await f.stage('3')).kind, 'review');
});

test('reopening is the owner\'s or an administrator\'s', async () => {
  const f = fixture();
  f.state.users.push({ id: 3, nickname: 'Mia', roles: [{ name: 'nr.member' }] });
  placed(f, 2, 'keyword-research', 1, { humanOwnerId: '1', cancelledAt: '2026-10-28T00:00:00Z', cancelledBy: '1' });
  const as = async (actor, command) => f.s.update('1', { taskId: '2', revision: (await f.view('2')).work.revision, requestId: randomUUID(), command }, actor, 'Someone');
  await assert.rejects(as('3', 'unarchiveTask'), e => e.status === 403);
});
