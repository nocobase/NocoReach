// Activity names the playbook a task was started with, the one chosen before the start and the one a task was handed
// over from or to in the reader's language when it is built-in, and as typed when a person made it, even under a
// built-in's name (2026-11-12: the English task page read "started the task, playbook: " and the Chinese name). The
// server records which playbook it was beside the name; older records are matched by the name alone.
import { afterEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setDictionary } from '../../client/i18n';
import { eventText } from '../../client/pages/playbook-model';
import { startBrief } from '../../client/pages/task-detail/started-model';
import { taskEvidence } from '../../client/pages/task-detail/evidence-model';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import { SYSTEM_PLAYBOOKS } from '../../server/nocoreach/execution/playbook.js';
import english from '../../shared/i18n/en.json';
import japanese from '../../shared/i18n/ja-JP.json';
import { fakeAgents, selectAgent, claim, finish } from './agents-fixture';
vi.setConfig({ testTimeout: 60000 });
afterEach(() => setDictionary(null));

function fixture() {
  const state = { nrTasks: [1, 2].map(id => ({ id, projectId: '1', title: `Task ${id}`, brief: 'Supplied evidence only', status: '待处理', evidence: { reason: 'original' } })), nrSnapshots: [], users: [{ id: 1, username: 'tester', roles: [{ name: 'admin' }] }] };
  let sequence = 100;
  const match = (r, filter = {}) => Object.entries(filter).every(([k, v]) => v && typeof v === 'object' ? v.$startsWith !== undefined && String(r[k]).startsWith(v.$startsWith) : String(r[k]) === String(v));
  const row = r => r ? { ...r, get: k => structuredClone(r[k]), toJSON: () => structuredClone(r) } : null;
  const repo = name => ({ findOne: async ({ filter, filterByTk }) => row(state[name].find(r => filterByTk !== undefined ? String(r.id) === String(filterByTk) : match(r, filter))), find: async ({ filter, offset = 0, limit = 100 }) => state[name].filter(r => match(r, filter)).slice(offset, offset + limit).map(row), create: async ({ values }) => { const r = { id: sequence++, ...structuredClone(values) }; state[name].push(r); return row(r); }, update: async ({ filterByTk, values }) => { Object.assign(state[name].find(r => String(r.id) === String(filterByTk)), structuredClone(values)); } });
  let tail = Promise.resolve();
  const p = { agents: fakeAgents(), project: async () => ({ name: 'Synthetic', writingStyle: 'Plain' }), db: { getRepository: repo, sequelize: { query: async () => {}, transaction: fn => { const result = tail.then(async () => { const old = structuredClone(state); try { const after = []; const value = await fn({ connection: {}, afterCommit: cb => after.push(cb) }); for (const cb of after) await cb(); return value; } catch (e) { Object.assign(state, old); throw e; } }); tail = result.catch(() => {}); return result; } } }, app: { resourceManager: { define: () => {} }, acl: { allow: () => {} } } };
  const s = new TaskService(p, { prepare: async () => ({ llmService: 'test', model: 'echo' }), invoke: async () => ({ content: 'AI draft' }) });
  const view = (taskId = '1') => s.get('1', taskId);
  const command = async (command, body = {}, taskId = '1') => s.update('1', { taskId, revision: (await view(taskId)).work.revision, requestId: randomUUID(), command, ...body }, '1', 'Tester');
  // A playbook a person made, under the name they typed.
  const own = async (name, extra = {}) => (await s.playbooks.save('1', { revision: (await s.playbooks.list('1')).revision, name, category: 'research', steps: [{ kind: 'analyze', instruction: 'Write it' }], ...extra })).playbook;
  return { s, state, command, view, own };
}
const builtIn = id => SYSTEM_PLAYBOOKS.find(p => p.id === id);
const output = d => d.work.results[d.work.stageIndex - 1];
const event = (d, action) => d.work.history.find(e => e.action === action);
const said = (d, action) => eventText(event(d, action), () => 'Review', 'Agent')?.text;

test('a built-in playbook is named in the reader\'s language, a person\'s own as typed even under the same name', async () => {
  const f = fixture();
  await selectAgent(f);
  const keywords = builtIn('keyword-research'), mine = await f.own(keywords.name);
  await f.command('selectPlaybook', { playbookId: 'keyword-research' }, '1');
  const d1 = await f.command('startTask', {}, '1');
  await f.command('selectPlaybook', { playbookId: mine.id }, '2');
  const d2 = await f.command('startTask', {}, '2');
  // Which playbook it was is recorded beside the name.
  expect(event(d1, 'selectPlaybook')).toMatchObject({ note: keywords.name, playbook: { id: 'keyword-research', system: true } });
  expect(event(d1, 'startTask')).toMatchObject({ note: keywords.name, playbook: { id: 'keyword-research', system: true, edited: false } });
  expect(event(d2, 'startTask')).toMatchObject({ note: keywords.name, playbook: { id: mine.id } });
  expect(event(d2, 'startTask').playbook.system).not.toBe(true);

  setDictionary(english);
  expect(said(d1, 'selectPlaybook')).toBe('changed the playbook to "Keyword research"');
  expect(said(d1, 'startTask')).toBe('started the task, playbook: Keyword research');
  expect(said(d2, 'selectPlaybook')).toBe(`changed the playbook to "${keywords.name}"`);
  expect(said(d2, 'startTask')).toBe(`started the task, playbook: ${keywords.name}`);
  setDictionary(japanese, 'ja-JP');
  expect(said(d1, 'startTask')).toContain('キーワード調査');
  expect(said(d2, 'startTask')).toContain(keywords.name);
  setDictionary(null);
  expect(said(d1, 'startTask')).toContain(keywords.name);
});

test('a hand-over names the playbook it came from and the one it went to the same way', async () => {
  const f = fixture();
  await selectAgent(f);
  const outline = builtIn('content-outline'), mine = await f.own(outline.name, { next: ['new-doc'] });
  await f.command('startTask', { playbookId: 'content-outline' }, '1');
  await f.command('startTask', { playbookId: mine.id }, '2');
  for (let i = 0; i < 2; i++) {
    const c = await claim(f);
    await finish(f, { taskId: c.run.taskId, runId: c.run.id, ok: true, content: 'Outline' });
  }
  let d1 = await f.view('1'), d2 = await f.view('2');
  d1 = await f.command('approveStage', { stageKey: 'accept', artifactId: output(d1).id, checked: ['facts'], next: 'new-doc' }, '1');
  d2 = await f.command('approveStage', { stageKey: d2.work.flow.stages[d2.work.stageIndex].key, artifactId: output(d2).id, checked: [], next: 'new-doc' }, '2');
  expect(event(d1, 'approveStage').playbook).toMatchObject({ id: 'new-doc', system: true });
  const from1 = await f.view(d1.work.nextTaskId), from2 = await f.view(d2.work.nextTaskId);
  expect(from1.task.evidence.handoff.playbookOrigin).toEqual({ id: 'content-outline', system: true, edited: false });
  expect(event(from2, 'handoff').playbook).toMatchObject({ id: mine.id, system: false });

  setDictionary(english);
  expect(said(d1, 'approveStage')).toBe('approved "Review", handed to "New docs page" to continue');
  expect(said(from1, 'handoff')).toBe('Handed over from the task "Content topic and outline"; the document it delivered is this task\'s brief');
  expect(startBrief(from1, true).title).toBe('Document delivered by "Content topic and outline"');
  expect(taskEvidence(from1).briefTitle).toBe('Document delivered by "Content topic and outline"');
  expect(said(from2, 'handoff')).toBe(`Handed over from the task "${outline.name}"; the document it delivered is this task's brief`);
  expect(startBrief(from2, true).title).toBe(`Document delivered by "${outline.name}"`);
});

test('a record from before the playbook was kept beside its name is matched by the name', () => {
  const keywords = builtIn('keyword-research');
  setDictionary(english);
  const text = e => eventText(e, () => 'Review', 'Agent')?.text;
  expect(text({ action: 'startTask', note: keywords.name })).toBe('started the task, playbook: Keyword research');
  expect(text({ action: 'selectPlaybook', note: keywords.name })).toBe('changed the playbook to "Keyword research"');
  expect(text({ action: 'handoff', note: builtIn('content-outline').name })).toContain('"Content topic and outline"');
  expect(text({ action: 'approveStage', note: builtIn('new-doc').name })).toBe('approved "Review", handed to "New docs page" to continue');
  expect(text({ action: 'selectPlaybook', note: 'Launch checklist' })).toBe('changed the playbook to "Launch checklist"');
  expect(text({ action: 'startTask' })).toBe('started the task');
  // A snapshot without its origin, as a hand-over of a task started before snapshots kept it records: the id decides.
  expect(text({ action: 'handoff', note: keywords.name, playbook: { id: 'keyword-research' } })).toContain('"Keyword research"');
  expect(text({ action: 'handoff', note: keywords.name, playbook: { id: 'custom-1a2b3c4d' } })).toContain(`"${keywords.name}"`);
});
