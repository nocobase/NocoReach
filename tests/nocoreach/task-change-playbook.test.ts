// Changing the playbook of a started task (2026-11-11 user decision, after T-78 was started with Content topic and
// outline when it needed Keyword research): the task starts again from the first step of the playbook chosen, and
// nothing of the earlier playbook's steps carries over, even under the same step key (shared/playbook-change.ts,
// TaskService restartWithPlaybook). A step a person stopped waits to be started again rather than reading as a failure.
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import { playbookTitle } from '../../server/nocoreach/execution/task-title.js';
import { SYSTEM_PLAYBOOKS, stagesFor } from '../../server/nocoreach/execution/playbook.js';
import { RESTART_ACTION, playbookChangeBlock, sinceRestart } from '../../shared/playbook-change.js';
import { nextVersion, previousVersion, restorable } from '../../shared/article-versions.js';
import { taskState } from '../../shared/task-pending.js';
import { CAPABILITY_ACTIONS } from '../../shared/access-capabilities.js';
import { fakeAgents, selectAgent, claim, finish } from './agents-fixture';
vi.setConfig({ testTimeout: 60000 });

function fixture(evidence = { reason: 'original' }, title = 'Synthetic task') {
  const state = { nrTasks: [{ id: 1, projectId: '1', title, brief: 'Supplied evidence only', status: '待处理', evidence }], nrSnapshots: [], users: [{ id: 1, username: 'tester', roles: [{ name: 'admin' }] }] };
  let sequence = 100;
  const match = (r, filter = {}) => Object.entries(filter).every(([k, v]) => v && typeof v === 'object' ? v.$startsWith !== undefined && String(r[k]).startsWith(v.$startsWith) : String(r[k]) === String(v));
  const row = r => r ? { ...r, get: k => structuredClone(r[k]), toJSON: () => structuredClone(r) } : null;
  const repo = name => ({ findOne: async ({ filter, filterByTk }) => row(state[name].find(r => filterByTk !== undefined ? String(r.id) === String(filterByTk) : match(r, filter))), find: async ({ filter, offset = 0, limit = 100 }) => state[name].filter(r => match(r, filter)).slice(offset, offset + limit).map(row), create: async ({ values }) => { const r = { id: sequence++, ...structuredClone(values) }; state[name].push(r); return row(r); }, update: async ({ filterByTk, values }) => { Object.assign(state[name].find(r => String(r.id) === String(filterByTk)), structuredClone(values)); } });
  let tail = Promise.resolve();
  const p = { agents: fakeAgents(), project: async () => ({ name: 'Synthetic', writingStyle: 'Plain' }), db: { getRepository: repo, sequelize: { query: async () => {}, transaction: fn => { const result = tail.then(async () => { const old = structuredClone(state); try { const after = []; const value = await fn({ connection: {}, afterCommit: cb => after.push(cb) }); for (const cb of after) await cb(); return value; } catch (e) { Object.assign(state, old); throw e; } }); tail = result.catch(() => {}); return result; } } }, app: { resourceManager: { define: () => {} }, acl: { allow: () => {} } } };
  const s = new TaskService(p, { prepare: async () => ({ llmService: 'test', model: 'echo' }), invoke: async () => ({ content: 'AI draft' }) });
  const view = (taskId = '1') => s.get('1', taskId);
  const command = async (command, body = {}, taskId = '1') => s.update('1', { taskId, revision: (await view(taskId)).work.revision, requestId: randomUUID(), command, ...body }, '1', 'Tester');
  return { s, state, command, view };
}
const output = d => d.work.results[d.work.stageIndex - 1];
const builtIn = id => SYSTEM_PLAYBOOKS.find(p => p.id === id);
const refused = (status, pattern) => e => e.status === status && (!pattern || pattern.test(e.message));
// A built-in playbook's task placed at one of its steps, as a test writes it directly.
function placed(f, id, playbook, stageIndex, extra = {}) {
  const flow = { id: playbook, name: playbook, version: 1, stages: stagesFor(builtIn(playbook)) };
  f.state.nrTasks.push({ id, projectId: '1', title: `Task ${id}`, brief: '', status: '进行中', evidence: { work: { schemaVersion: 2, revision: 1, stage: 'flow', plan: null, planVersion: 0, step: 0, results: [], history: [], operations: [], receipt: null, verification: null, humanOwnerId: '1', humanOwnerName: 'Tester', flow, stageIndex, ...extra } } });
}

test('T-78: from Content topic and outline to Keyword research, the shared step keys carry nothing over', async () => {
  const f = fixture();
  await selectAgent(f);
  await f.command('comment', { comment: 'Left before the start' });
  await f.command('startTask', { playbookId: 'content-outline' });
  let c = await claim(f);
  await finish(f, { taskId: '1', runId: c.run.id, ok: true, content: 'Outline, version 1' });
  let d = await f.view();
  // A change asked for on the outline: the step's next run reads it as feedback.
  await f.command('requestStageChanges', { stageKey: 'accept', artifactId: output(d).id, comment: 'Shorter outline' });
  c = await claim(f);
  assert.deepEqual(c.run.input.feedback.map(m => m.text ?? m), ['Shorter outline']);
  await finish(f, { taskId: '1', runId: c.run.id, ok: true, content: 'Outline, version 2' });
  d = await f.view();
  assert.equal(output(d).version, 2);
  await f.command('comment', { comment: 'What we need is keyword research' });
  const before = (await f.view()).runs.map(r => r.id);

  d = await f.command(RESTART_ACTION, { playbookId: 'keyword-research' });
  assert.equal(d.work.flow.id, 'keyword-research');
  assert.equal(d.work.playbook.id, 'keyword-research');
  assert.equal(d.work.stageIndex, 0);
  assert.deepEqual(d.work.results, [], 'the outline does not carry over');
  assert.equal(d.work.attempt, 1);
  // The change is recorded with the playbook it replaced, its steps named as they were.
  const changed = d.work.history.findLast(e => e.action === RESTART_ACTION);
  assert.equal(changed.from.id, 'content-outline');
  assert.equal(changed.from.attempt, 0);
  assert.deepEqual(changed.from.stages.map(s => s.key), ['analyze', 'accept']);
  assert.equal(changed.to.id, 'keyword-research');
  assert.equal(sinceRestart(d.work.history).some(e => e.action === 'requestStageChanges'), false);
  // The new playbook's first step is queued in the same request, under the new attempt.
  const queued = d.runs.filter(r => !before.includes(r.id));
  assert.deepEqual(queued.map(r => [r.stepId, r.status, r.attempt]), [['analyze', 'queued', 1]]);
  assert.equal(d.task.status, '进行中');

  c = await claim(f);
  assert.deepEqual(c.run.input.feedback, [], 'the outline\'s change request is not feedback for Keyword research');
  assert.deepEqual(c.run.input.previousStages, []);
  assert.equal(c.run.input.unfinished, undefined);
  assert.equal(c.run.input.playbook, builtIn('keyword-research').name);
  // The messages in Activity go to the new Agent run as they would have gone to the old one.
  const notes = c.run.input.notes.map(m => m.text ?? m);
  assert.ok(notes.includes('Left before the start'));
  assert.ok(notes.includes('What we need is keyword research'));
  await finish(f, { taskId: '1', runId: c.run.id, ok: true, content: 'Keywords' });
  d = await f.view();
  assert.equal(output(d).content, 'Keywords');
  assert.equal(output(d).version, 1, 'versions are numbered again from 1');
  assert.equal(output(d).attempt, 1);
  // The outline's versions stay for Activity, under the attempt that made them.
  assert.deepEqual(d.artifacts.filter(a => !a.attempt).map(a => a.version).sort(), [1, 2]);
  assert.equal(nextVersion(d.artifacts, output(d)), 2);

  // Reviewing the new result reads only its own requests.
  await f.command('requestStageChanges', { stageKey: 'accept', artifactId: output(d).id, comment: 'Add search volume' });
  c = await claim(f);
  assert.deepEqual(c.run.input.feedback.map(m => m.text ?? m), ['Add search volume']);
});

test('what a failed run of the earlier playbook got is not handed to the new one', async () => {
  const f = fixture();
  await selectAgent(f);
  await f.command('startTask', { playbookId: 'content-outline' });
  const { run } = await claim(f);
  await finish(f, { taskId: '1', runId: run.id, ok: false, error: 'missing_tool', message: 'gh missing', content: '# Outline so far' });
  let d = await f.view();
  assert.equal(d.runs[0].status, 'failed');
  assert.equal(d.partial.content, '# Outline so far');
  d = await f.command(RESTART_ACTION, { playbookId: 'keyword-research' });
  const c = await claim(f);
  assert.equal(c.run.input.unfinished, undefined);
  // The failure was the earlier playbook's: the new step waits for its own run, not for a person.
  assert.equal(d.work.latestRun?.status, 'queued');
});

test('a step a person stopped waits to be started again, and its playbook can change', async () => {
  const f = fixture();
  await selectAgent(f);
  await f.command('startTask', { playbookId: 'content-outline' });
  const c = await claim(f);
  await assert.rejects(f.command(RESTART_ACTION, { playbookId: 'keyword-research' }), refused(409, /先停止/), 'not while the Agent runs');
  let d = await f.command('cancelRun', { runId: c.run.id });
  assert.equal(d.runs.find(r => r.id === c.run.id).cancelRequested, true);
  // The Runner stops it: the official run ends as cancelled and the business run settles.
  await f.s.runtime.sync(f.state.nrSnapshots.find(r => r.key.endsWith(c.run.id)).payload);
  d = await f.view();
  const stopped = d.runs.find(r => r.id === c.run.id);
  assert.equal(stopped.error, 'cancelled');
  assert.deepEqual(d.work.latestRun, { id: c.run.id, status: 'failed', stopped: true });
  const stop = d.work.history.findLast(e => e.action === 'cancelRun');
  assert.equal(stop.runId, c.run.id);
  assert.equal(stop.stageKey, 'analyze', 'Activity names the step stopped');
  assert.equal(taskState(d.work), 'review', 'it waits for a person');

  d = await f.command(RESTART_ACTION, { playbookId: 'keyword-research' });
  assert.equal(d.work.flow.id, 'keyword-research');
  assert.equal(d.work.latestRun.status, 'queued');
  assert.equal(d.work.latestRun.stopped, undefined);
});

test('a queued run stopped is recorded as stopped at once', async () => {
  const f = fixture();
  await selectAgent(f);
  let d = await f.command('startTask', { playbookId: 'keyword-research' });
  const queued = d.runs[0];
  d = await f.command('cancelRun', { runId: queued.id });
  assert.equal(d.runs.find(r => r.id === queued.id).error, 'cancelled');
  assert.deepEqual(d.work.latestRun, { id: queued.id, status: 'failed', stopped: true });
  assert.equal(d.work.history.findLast(e => e.action === 'cancelRun').stageKey, 'analyze');
});

test('the playbook changes only while nothing runs, nothing is published and the task is open', async () => {
  const f = fixture();
  await selectAgent(f);
  await assert.rejects(f.command(RESTART_ACTION, { playbookId: 'keyword-research' }), refused(409, /还没开始/), 'not before the start');
  const d = await f.command('startTask', { playbookId: 'content-outline' });
  await assert.rejects(f.command(RESTART_ACTION, { playbookId: 'keyword-research' }), refused(409, /先停止/), 'not while a run is queued');
  await f.command('cancelRun', { runId: d.runs[0].id });
  await assert.rejects(f.command(RESTART_ACTION, { playbookId: 'no-such-playbook' }), e => e.status >= 400, 'only a playbook of the project');
  await f.command('cancelTask');
  await assert.rejects(f.command(RESTART_ACTION, { playbookId: 'keyword-research' }), refused(409), 'not once closed');

  // Published: at Publish or after, or with a release.
  placed(f, 2, 'optimize-page', 2);
  placed(f, 3, 'optimize-page', 3);
  placed(f, 4, 'optimize-page', 1, { release: { state: 'live' } });
  placed(f, 5, 'keyword-research', 1, { stage: 'done' });
  for (const id of ['2', '3', '4']) await assert.rejects(f.command(RESTART_ACTION, { playbookId: 'keyword-research' }, id), refused(409, /已经发布/), `task ${id}`);
  await assert.rejects(f.command(RESTART_ACTION, { playbookId: 'keyword-research' }, '5'), refused(409, /已完成/));

  // The same rules the task page reads.
  const flow = { stages: stagesFor(builtIn('optimize-page')) };
  assert.equal(playbookChangeBlock({ stage: 'plan' }, []), 'notStarted');
  assert.equal(playbookChangeBlock({ stage: 'flow', flow, stageIndex: 1 }, [{ status: 'running' }]), 'running');
  assert.equal(playbookChangeBlock({ stage: 'flow', flow, stageIndex: 1, archivedAt: 'x' }, []), 'closed');
  assert.equal(playbookChangeBlock({ stage: 'flow', flow, stageIndex: 2 }, []), 'published');
  assert.equal(playbookChangeBlock({ stage: 'done', flow, stageIndex: 1 }, []), 'done');
  assert.equal(playbookChangeBlock({ stage: 'flow', flow, stageIndex: 1 }, [{ status: 'failed' }]), undefined);
});

test('an automatic title follows the new playbook; a title a person changed stays', async () => {
  const subject = 'fde', locale = 'en-US';
  const titled = id => playbookTitle(builtIn(id), subject, locale);
  let f = fixture({ reason: 'original', autoTitle: { subject, locale } }, titled('content-outline'));
  await selectAgent(f);
  await f.command('startTask', { playbookId: 'content-outline' });
  await f.command('cancelRun', { runId: (await f.view()).runs[0].id });
  let d = await f.command(RESTART_ACTION, { playbookId: 'keyword-research' });
  assert.equal(d.task.title, titled('keyword-research'));
  assert.equal(d.work.history.at(-1).action, 'retitle');

  f = fixture({ reason: 'original', autoTitle: { subject, locale } }, titled('content-outline'));
  await selectAgent(f);
  await f.command('startTask', { playbookId: 'content-outline' });
  await f.command('cancelRun', { runId: (await f.view()).runs[0].id });
  f.state.nrTasks[0].title = 'Our FDE plan';
  d = await f.command(RESTART_ACTION, { playbookId: 'keyword-research' });
  assert.equal(d.task.title, 'Our FDE plan');
  assert.equal(d.work.history.some(e => e.action === 'retitle'), false);
});

test('a step\'s versions are those of its own attempt', () => {
  const v = (id, version, attempt) => ({ id, stepId: 'analyze', version, createdAt: `2026-11-11T10:0${version}:00Z`, createdBy: 'agent', ...(attempt ? { attempt } : {}), article: { targetId: 't', changes: [] } });
  const old1 = v('a', 1), old2 = v('b', 2), new1 = v('c', 1, 1), new2 = v('d', 2, 1);
  const all = [old1, old2, new1, new2];
  assert.equal(previousVersion(all, new2), new1);
  assert.equal(previousVersion(all, new1), undefined, 'not the earlier playbook\'s version 2');
  assert.equal(nextVersion(all, new2), 3);
  assert.equal(nextVersion(all, old2), 3);
  assert.equal(restorable([], new2, new1), true);
  assert.equal(restorable([], new2, old1), false, 'an earlier playbook\'s version is not restored into the new one');
});

test('whoever may work on tasks may change the playbook', () => {
  // The route checks each command as its own permission; a command missing here is refused for everyone.
  assert.ok(CAPABILITY_ACTIONS.tasks.includes(`nrTaskWork.command.${RESTART_ACTION}`));
});
