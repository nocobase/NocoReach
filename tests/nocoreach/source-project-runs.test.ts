import { expect, test } from 'vitest';
import { TrendsSource } from '../../server/nocoreach/trends-source.js';
import { CommunitySource } from '../../server/nocoreach/community-source.js';
import { RedditSource } from '../../server/nocoreach/reddit-source.js';
import { HackerNewsSource } from '../../server/nocoreach/hackernews-source.js';
import { PackagesSource } from '../../server/nocoreach/packages-source.js';
import { XSource } from '../../server/nocoreach/x-source.js';
import { ChatSource } from '../../server/nocoreach/chat-source.js';

function gate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function plugin() {
  const rows = new Map();
  const repo = {
    findOne: async ({ filter }) =>
      rows.has(filter.key)
        ? { id: filter.key, get: () => rows.get(filter.key) }
        : null,
    create: async ({ values }) => rows.set(values.key, values.payload),
    update: async ({ filterByTk, values }) =>
      rows.set(filterByTk, values.payload),
  };
  return {
    rows,
    db: {
      getRepository: () => repo,
      sequelize: { transaction: (fn) => fn({}), query: async () => {} },
    },
    env: () => '',
    projectIds: async () => [],
    competitors: { state: async () => ({ list: [] }) },
  };
}
const sources = [
  ['Trends', TrendsSource, 'check', 'checking'],
  ['Community', CommunitySource, 'sync', 'syncing'],
  ['Reddit', RedditSource, 'check', 'checking'],
  ['HackerNews', HackerNewsSource, 'sync', 'syncing'],
  ['Packages', PackagesSource, 'sync', 'syncing'],
  ['X', XSource, 'check', 'checking'],
  ['Chat', ChatSource, 'sync', 'syncing'],
];
for (const [name, Source, method, field] of sources) {
  test(`${name}: real entry points and status isolate projects and merge duplicates`, async () => {
    const p = plugin();
    const source = new Source(p);
    const hold = gate();
    const began = gate();
    const calls = [];
    source.state = async () => ({
      status: 'active',
      terms: ['Example'],
      origin: 'https://example.com',
      packages: [{ id: 'npm:example', registry: 'npm' }],
      cap: 5,
    });
    source.collect = async (id) => {
      calls.push(id);
      if (id === 'A') {
        began.release();
        await hold.promise;
      }
      return id;
    };
    const a = source[method]('A');
    await began.promise;
    expect((await source.status('A'))[field]).toBe(true);
    expect((await source.status('B'))[field]).toBe(false);
    const duplicate = source[method]('A');
    expect(await source[method]('B')).toBe('B');
    expect(calls).toEqual(['A', 'B']);
    hold.release();
    await Promise.all([a, duplicate]);
    await source.runs.wait('A');
    expect((await source.status('A'))[field]).toBe(false);
    source.collect = async () => {
      throw new Error('failure');
    };
    await expect(source[method]('A')).rejects.toThrow('failure');
    await source.runs.wait('A');
    expect((await source.status('A'))[field]).toBe(false);
    await source.close();
  });
}

test('Trends runAll reproducer accepts B while A runs; four background starts are retained', async () => {
  const source = new TrendsSource(plugin());
  const hold = gate();
  const began = gate();
  const calls = [];
  const a = source.runAll('A', async () => {
    began.release();
    await hold.promise;
  });
  await began.promise;
  await source.runAll('B', async () => {
    calls.push('B');
  });
  expect(calls).toEqual(['B']);
  source.collect = async (id) => {
    calls.push(id);
  };
  for (const id of ['C', 'D', 'E', 'F']) source.start(id);
  await Promise.all(['C', 'D', 'E', 'F'].map((id) => source.runs.wait(id)));
  expect(calls).toEqual(['B', 'C', 'D', 'E', 'F']);
  hold.release();
  await a;
  await source.close();
});

test('Trends distinct keywords are retained, project cancellation includes standalone keyword work', async () => {
  const source = new TrendsSource(plugin());
  const hold = gate();
  const began = gate();
  const calls = [];
  source.collectKeyword = async (id, kid) => {
    calls.push(kid);
    if (kid === 'one') {
      began.release();
      await hold.promise;
    }
    source.runs.assertActive();
    return kid;
  };
  source.startKeyword('A', 'one');
  await began.promise;
  source.startKeyword('A', 'two');
  source.startKeyword('B', 'three');
  await source.runs.wait('B');
  expect(calls).toEqual(['one', 'three']);
  const cancelled = source.runs.cancel('A');
  hold.release();
  await cancelled;
  expect(calls).toEqual(['one', 'three']);
  expect(source.keywordChecks.size).toBe(0);
  await source.close();
});

test('Community disconnect discards a late response while another project completes', async () => {
  const p = plugin();
  const hold = gate();
  const began = gate();
  const calls = [];
  const source = new CommunitySource(
    p,
    async (url) => {
      calls.push(url);
      if (url === 'https://a.example/site.json') {
        began.release();
        await hold.promise;
      }
      return {
        text: JSON.stringify(
          url.includes('site.json')
            ? { categories: [] }
            : { topic_list: { topics: [] } },
        ),
      };
    },
    async () => {},
  );
  for (const id of ['A', 'B'])
    p.rows.set(source.key(id), {
      origin: `https://${id.toLowerCase()}.example`,
      status: 'active',
      topics: {},
    });
  const a = source.sync('A');
  const rejected = a.catch((error) => error);
  await began.promise;
  const b = source.sync('B');
  const stop = source.disconnect('A');
  hold.release();
  await Promise.all([b, stop]);
  expect(await rejected).toMatchObject({ name: 'AbortError' });
  expect((await source.state('A')).status).toBe('disconnected');
  expect((await source.state('A')).lastSync).toBeUndefined();
  expect((await source.state('B')).lastSync.ok).toBe(true);
  expect(calls.filter((u) => u.startsWith('https://a.'))).toHaveLength(1);
  await source.close();
});

test('X scheduled tick works without a global run variable', async () => {
  const p = plugin();
  p.projectIds = async () => ['A', 'B'];
  p.env = () => 'token';
  const source = new XSource(p);
  const calls = [];
  source.state = async () => ({ terms: ['example'], status: 'active' });
  source.collect = async (id) => {
    calls.push(id);
  };
  await source.tick();
  expect(calls).toEqual(['A', 'B']);
  await source.close();
});

test('X cancellation preserves billed responses without publishing their collected data', async () => {
  const p = plugin();
  p.env = () => 'token';
  p.variable = async () => {};
  const hold = gate();
  const began = gate();
  let calls = 0;
  const source = new XSource(p, async () => {
    calls++;
    began.release();
    await hold.promise;
    return {
      ok: true,
      json: async () => ({
        data: [{ start: '2026-10-01', end: '2026-10-02', tweet_count: 10 }],
      }),
    };
  });
  p.rows.set(source.key('A'), {
    terms: ['example'],
    status: 'active',
    cap: 5,
    posts: {},
    spend: {},
  });
  const run = source.check('A', { force: true });
  const rejected = run.catch((error) => error);
  await began.promise;
  const stopped = source.disconnect('A');
  hold.release();
  await stopped;
  expect(await rejected).toMatchObject({ name: 'AbortError' });
  const state = await source.state('A');
  expect(source.spent(state).usd).toBe(0.005);
  expect(state.counts).toBeUndefined();
  expect(state.status).toBe('disconnected');
  expect(calls).toBe(1);
  await source.close();
});

test('X disconnect blocks new checks until token removal and disconnected state are committed', async () => {
  const p = plugin();
  p.env = () => 'token';
  const removingToken = gate();
  const hold = gate();
  p.variable = async () => {
    removingToken.release();
    await hold.promise;
  };
  let requests = 0;
  const source = new XSource(p, async () => {
    requests++;
    return { ok: true, json: async () => ({ data: [] }) };
  });
  p.rows.set(source.key('A'), {
    terms: ['example'],
    status: 'active',
    cap: 5,
    posts: {},
    spend: {},
  });
  const stopped = source.disconnect('A');
  await removingToken.promise;
  try {
    await expect(source.check('A', { force: true })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(requests).toBe(0);
  } finally {
    hold.release();
    await stopped;
    await source.close();
  }
  const state = await source.state('A');
  expect(state.status).toBe('disconnected');
  expect(state.lastRun).toBeUndefined();
});

test('Chat retains separate platform starts without reading an unrelated platform', async () => {
  const source = new ChatSource(plugin());
  const hold = gate();
  const began = gate();
  const platforms = [];
  source.collect = async (_id, options) => {
    platforms.push(options.only);
    if (options.only === 'discord') {
      began.release();
      await hold.promise;
    }
  };
  source.start('A', 'discord');
  await began.promise;
  source.start('A', 'slack');
  hold.release();
  await source.runs.wait('A');
  expect(platforms).toEqual(['discord', 'slack']);
  await source.close();
});

test('health summary distinguishes the active project for every migrated collector', async () => {
  const { DataHealth } = await import('../../server/nocoreach/data-health.js');
  const p = plugin();
  p.link = async () => null;
  const hold = gate();
  const pending = [];
  const names = [
    'trends',
    'community',
    'reddit',
    'hackernews',
    'packages',
    'xSource',
    'chat',
  ];
  for (const [index, [, Source]] of sources.entries()) {
    const source = new Source(p);
    p[names[index]] = source;
    source.state = async () => ({
      status: 'active',
      terms: ['example'],
      origin: 'https://example.com',
      packages: [{ name: 'example' }],
      discord: { status: 'active', channels: [] },
      slack: { status: 'active', channels: [] },
    });
    pending.push(source.runs.run('A', () => hold.promise));
  }
  const health = new DataHealth(p);
  const active = await health.list('A');
  const idle = await health.list('B');
  expect(active.items).toHaveLength(8);
  expect(idle.items).toHaveLength(8);
  expect(
    active.items.every(
      (item) => item.messageText.key !== 'dataHealth.waitingFirstSync',
    ),
  ).toBe(true);
  expect(
    idle.items.every(
      (item) => item.messageText.key === 'dataHealth.waitingFirstSync',
    ),
  ).toBe(true);
  hold.release();
  await Promise.all(pending);
  await Promise.all(names.map((name) => p[name].close()));
});

test('Connections shutdown closes all migrated sources including the registered xSource', async () => {
  const { Connections } = await import('../../server/nocoreach/plugin.js');
  const owner = {};
  const p = plugin();
  const names = [
    'trends',
    'community',
    'reddit',
    'hackernews',
    'packages',
    'xSource',
    'chat',
  ];
  for (const [index, [, Source]] of sources.entries())
    owner[names[index]] = new Source(p);
  const hold = gate();
  const began = gate();
  const pending = owner.xSource.runs.run('A', async () => {
    began.release();
    await hold.promise;
  });
  const result = pending.catch((error) => error);
  await began.promise;
  const closing = Connections.prototype.afterDisable.call(owner);
  hold.release();
  await closing;
  expect(await result).toMatchObject({ name: 'AbortError' });
  for (const name of names)
    await expect(
      owner[name].runs.run('B', async () => undefined),
    ).rejects.toMatchObject({ name: 'AbortError' });
});
