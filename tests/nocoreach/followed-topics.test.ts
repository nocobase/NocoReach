// @ts-nocheck
// Followed topics (2026-11-10): one list in Project knowledge › Memory that the sources search besides the product name.
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import {
  TOPICS_MAX,
  cleanTopic,
  topicKey,
  topicMonthlyCost,
  uniqueTopics,
} from '../../shared/followed-topics.js';
import { FollowedTopics } from '../../server/nocoreach/followed-topics.js';
import {
  memoryForAI,
  memoryOf,
  topicsInput,
  topicsOf,
} from '../../server/nocoreach/execution/memory.js';
import { Knowledge } from '../../server/nocoreach/knowledge.js';

test('a topic is a short phrase without quotes; spellings that differ in case, spaces, hyphens or underscores are one topic', () => {
  assert.equal(cleanTopic('  workflow   automation '), 'workflow automation');
  for (const bad of [
    'x',
    'a'.repeat(61),
    'say "hi"',
    'back\\slash',
    'bell\u0007char',
    3,
    null,
  ])
    assert.equal(cleanTopic(bad), null, String(bad));
  assert.equal(topicKey('Low-Code'), topicKey('low code'));
  assert.equal(topicKey('low_code'), topicKey('lowcode'));
  assert.deepEqual(
    uniqueTopics(['Low code', 'low-code', 'x', 'CRM', 'crm ', 'AI agents']),
    ['Low code', 'CRM', 'AI agents'],
  );
});

test('what one topic costs a month: the paid sources at their list prices, Hacker News and GitHub free', () => {
  const c = topicMonthlyCost();
  assert.equal(c.reddit.toFixed(3), '0.026');
  assert.equal(c.youtube.toFixed(3), '0.086');
  assert.equal(c.trends.toFixed(3), '0.047');
  assert.equal(c.aiQuestions.toFixed(2), '0.40');
  assert.equal(c.total.toFixed(2), '0.56');
});

test('saving topics: each checked, repeats dropped, no more than ten unless the longer list was already saved', () => {
  assert.deepEqual(topicsInput(['CRM', 'crm', 'Open source CRM']), [
    'CRM',
    'Open source CRM',
  ]);
  assert.throws(() => topicsInput(['ok', 'x']), /x/);
  assert.throws(
    () => topicsInput('crm'),
    (e) => e.status === 400,
  );
  const eleven = Array.from({ length: 11 }, (_, i) => `topic ${i}`);
  assert.throws(
    () => topicsInput(eleven),
    (e) => e.status === 400 && /10/.test(e.message),
  );
  assert.equal(
    topicsInput(eleven, eleven).length,
    11,
    'a list moved from the sources is only trimmed',
  );
  assert.equal(topicsInput(eleven.slice(1), eleven).length, 10);
  assert.throws(
    () => topicsInput([...eleven.slice(1), 'new one'], eleven),
    /10/,
    'nothing new while over ten',
  );
});

test('the AI reads the followed topics after the competitors', () => {
  const read = memoryForAI({
    name: 'Acme',
    memory: {
      brand: 'Acme',
      competitors: 'Asana',
      rules: 'No prices',
      topics: ['task management', 'team collaboration'],
    },
  });
  const keys = Object.keys(read);
  const at = keys.findIndex(
    (k) => read[k] === 'task management, team collaboration',
  );
  assert.ok(at > 0, 'the topics are there');
  assert.equal(read[keys[at - 1]], 'Asana');
  assert.equal(read[keys[at + 1]], 'No prices');
  assert.equal(
    Object.values(
      memoryForAI({ name: 'Acme', memory: { brand: 'Acme' } }),
    ).includes(''),
    false,
    'no empty line without topics',
  );
});

test('a memory holding only the topics still reads the project’s older fields', () => {
  const project = {
    name: 'Acme',
    description: 'Project management for teams',
    audience: 'Agencies',
    memory: { topics: ['task management'] },
  };
  assert.equal(memoryOf(project).brand, 'Project management for teams');
  assert.equal(memoryOf(project).audience, 'Agencies');
  assert.equal(
    memoryOf({ ...project, memory: { brand: '', topics: [] } }).audience,
    '',
    'saved sections win, even empty',
  );
});

function knowledge() {
  const rows = [
    {
      id: 1,
      key: 'project',
      payload: {
        id: 1,
        name: 'Acme',
        memory: { brand: 'Acme', competitors: 'Asana' },
      },
    },
  ];
  const changed = [];
  const repo = {
    findOne: async ({ filter }) => {
      const r = rows.find((x) => x.key === filter.key);
      return r ? { id: r.id, get: (k) => structuredClone(r[k]) } : null;
    },
    update: async ({ filterByTk, values }) =>
      Object.assign(
        rows.find((r) => r.id === filterByTk),
        structuredClone(values),
      ),
  };
  const k = new Knowledge({
    projects: {
      row: async () => ({ id: 1, get: () => structuredClone(rows[0].payload) }),
    },
    db: {
      getRepository: () => repo,
      sequelize: { transaction: (fn) => fn({}), query: async () => {} },
    },
    followedTopics: { changed: (id) => changed.push(id) },
  });
  return { k, project: () => rows[0].payload, changed };
}

test('Memory keeps the topics beside the sections; a change reaches the sources, other saves keep the list', async () => {
  const { k, project, changed } = knowledge();
  const saved = await k.saveMemory('1', {
    topics: ['Task management', 'task-management', 'Team collaboration'],
  });
  assert.deepEqual(saved.topics, ['Task management', 'Team collaboration']);
  assert.deepEqual(project().memory.topics, [
    'Task management',
    'Team collaboration',
  ]);
  assert.equal(project().memory.brand, 'Acme', 'the sections stay');
  assert.deepEqual(changed, ['1']);
  await k.saveMemory('1', { sections: { voice: 'Plain' } });
  assert.deepEqual(
    project().memory.topics,
    ['Task management', 'Team collaboration'],
    'saving a section keeps the topics',
  );
  await k.saveMemory('1', { memory: { brand: 'Acme Inc' } });
  assert.deepEqual(
    project().memory.topics,
    ['Task management', 'Team collaboration'],
    'replacing every section keeps them too',
  );
  await k.saveMemory('1', {
    topics: ['Task management', 'Team collaboration'],
  });
  assert.deepEqual(changed, ['1'], 'the same list changes nothing');
  await assert.rejects(
    k.saveMemory('1', { topics: ['"quoted"'] }),
    (e) => e.status === 400,
  );
  await k.saveMemory('1', { topics: [] });
  assert.deepEqual(project().memory.topics, []);
  assert.deepEqual(changed, ['1', '1']);
});

function projects(list, sources = {}) {
  const store = new Map(list.map((p) => [String(p.id), structuredClone(p)]));
  const p = {
    projects: {
      all: async () => [...store.values()].map((x) => structuredClone(x)),
      get: async (id) => structuredClone(store.get(String(id))),
      update: async (id, fn) =>
        store.set(String(id), fn(structuredClone(store.get(String(id))))),
    },
    ...sources,
  };
  return { p, store, topics: (id) => topicsOf(store.get(String(id))) };
}

test('moving the sources’ lists: AI questions, then Trends, then GitHub hot topics, repeats once, nothing dropped, once per project', async () => {
  const state = (byId) => ({ state: async (id) => byId[id] ?? null });
  const many = Array.from({ length: 9 }, (_, i) => ({ keyword: `trend ${i}` }));
  const { p, topics } = projects(
    [
      { id: 1, name: 'A', memory: { brand: 'A' } },
      { id: 2, name: 'B' },
      { id: 3, name: 'C', memory: { brand: 'C', topics: ['kept'] } },
      { id: 4, name: 'D' },
    ],
    {
      aiQuestions: state({
        1: { topics: [{ keyword: 'internal tools' }, { keyword: 'low code' }] },
        2: { topics: [{ keyword: 'crm' }] },
      }),
      trends: state({
        1: {
          keywords: [
            { keyword: 'Low-Code' },
            { keyword: 'workflow automation' },
          ],
        },
        2: { keywords: many },
      }),
      githubTrends: state({
        1: { topics: ['low-code', 'internal-tools', 'ai-agents'] },
        2: { topics: ['crm', 'mcp'] },
      }),
    },
  );
  const f = new FollowedTopics(p);
  assert.equal(await f.migrate(), 2);
  assert.deepEqual(topics(1), [
    'internal tools',
    'low code',
    'workflow automation',
    'ai-agents',
  ]);
  assert.equal(
    topics(2).length,
    11,
    'more than ten are all kept, to be trimmed',
  );
  assert.deepEqual(topics(2).slice(0, 2), ['crm', 'trend 0']);
  assert.deepEqual(
    await f.of('2'),
    topics(2).slice(0, TOPICS_MAX),
    'the sources search the first ten meanwhile',
  );
  assert.deepEqual(
    topics(3),
    ['kept'],
    'a project with its list is left alone',
  );
  assert.deepEqual(
    topics(4),
    [],
    'a project without any gets an empty list, so it is not moved again',
  );
  assert.equal(
    p.projects.get && (await p.projects.get('1')).memory.brand,
    'A',
    'the sections stay',
  );
  assert.equal(await f.migrate(), 0, 'once');
});

test('before the move a source keeps its own list; a failed read is tried again at the next start', async () => {
  let fail = true;
  const { p, topics } = projects([{ id: 1, name: 'A' }], {
    aiQuestions: { state: async () => ({ topics: [{ keyword: 'crm' }] }) },
    trends: { state: async () => null },
    githubTrends: { state: async () => null },
  });
  const update = p.projects.update;
  p.projects.update = async (...a) => {
    if (fail) throw new Error('database busy');
    return update(...a);
  };
  const f = new FollowedTopics(p);
  assert.equal(await f.of('1'), null, 'null: the sources read their own lists');
  assert.equal(await f.migrate(), 0);
  assert.equal(topics(1), null);
  fail = false;
  assert.equal(await f.migrate(), 1);
  assert.deepEqual(await f.of('1'), ['crm']);
});

test('a change in Memory reaches the sources that keep a copy of the list', async () => {
  const seen = [];
  const source = (name) => ({
    topicsChanged: async (id) => seen.push([name, id]),
  });
  const f = new FollowedTopics({
    trends: source('trends'),
    aiQuestions: source('ai'),
    githubTrends: source('github'),
  });
  f.changed(7);
  await vi.waitFor(() => assert.equal(seen.length, 3));
  assert.deepEqual(seen.sort(), [
    ['ai', '7'],
    ['github', '7'],
    ['trends', '7'],
  ]);
});
