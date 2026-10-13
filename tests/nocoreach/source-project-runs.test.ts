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

function actionsFor(p, source, resource) {
  let actions;
  p.app = {
    resourceManager: {
      define: (definition) => {
        actions = definition.actions;
      },
    },
    acl: { allow: () => {} },
  };
  p.project = async (id) => ({ id });
  source.register();
  return async (action, values = {}) => {
    const ctx = {
      auth: { user: { id: 'root' } },
      state: { currentRoles: ['root'] },
      action: {
        resourceName: resource,
        actionName: action,
        params: { values: { projectId: '1', ...values } },
      },
      app: p.app,
      db: p.db,
      body: undefined,
      set: () => {},
      throw: (status, message) => {
        throw Object.assign(new Error(message), { status });
      },
    };
    await actions[action](ctx, async () => {});
    return ctx.body;
  };
}

for (const stop of ['disconnect', 'close']) {
  test(`X ${stop} owns a connecting paid response through its body and keeps only its accounting`, async () => {
    const p = plugin();
    const env = new Map();
    p.env = (key) => env.get(key);
    p.variable = async (key, value) => {
      if (value === null) env.delete(key);
      else env.set(key, value);
    };
    const began = gate();
    const hold = gate();
    const requests = [];
    const source = new XSource(p, async (url) => {
      requests.push(url);
      return {
        ok: true,
        json: async () => {
          began.release();
          await hold.promise;
          return { data: [] };
        },
      };
    });
    const call = actionsFor(p, source, 'nrX');
    const connecting = call('connect', {
      terms: ['Example'],
      token: 'a'.repeat(48),
      cap: 5,
    });
    const result = connecting.catch((error) => error);
    await began.promise;
    expect((await call('status')).tokenSaved).toBe(false);
    let stopped = false;
    const stopping = (
      stop === 'disconnect' ? call('disconnect') : source.close()
    ).then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    hold.release();
    await stopping;
    expect(await result).toMatchObject({ status: 409 });
    expect((await call('status')).tokenSaved).toBe(false);
    expect((await call('status')).connected).toBe(false);
    expect(source.spent(await source.state('1'))).toEqual({
      usd: 0.005,
      posts: 0,
      requests: 1,
    });
    expect(requests).toHaveLength(1);
    expect((await source.state('1')).counts).toBeUndefined();
    await source.close();
  });
}

test('Community disconnect cancels a connecting preview before it saves or starts collection', async () => {
  const p = plugin();
  const began = gate();
  const hold = gate();
  let requests = 0;
  const source = new CommunitySource(p, async () => {
    requests++;
    began.release();
    await hold.promise;
    return { text: JSON.stringify({ about: { title: 'Example' } }) };
  });
  const call = actionsFor(p, source, 'nrCommunity');
  const connecting = call('connect', { url: 'https://example.com' }).catch(
    (error) => error,
  );
  await began.promise;
  const stopping = call('disconnect');
  hold.release();
  await stopping;
  expect(await connecting).toMatchObject({ status: 409 });
  expect((await call('status')).connected).toBe(false);
  expect(requests).toBe(1);
  await source.close();
});

test('Chat disconnect cancels connection inspection before token or channel configuration is saved', async () => {
  const p = plugin();
  const env = new Map();
  p.env = (key) => env.get(key);
  p.variable = async (key, value) => {
    if (value === null) env.delete(key);
    else env.set(key, value);
  };
  const began = gate();
  const hold = gate();
  let requests = 0;
  const source = new ChatSource(p, async () => {
    requests++;
    began.release();
    await hold.promise;
    return {
      ok: true,
      json: async () => ({ ok: true, team: 'Example', user: 'bot' }),
    };
  });
  const call = actionsFor(p, source, 'nrChat');
  const connecting = call('connect', {
    platform: 'slack',
    token: 'xoxb-' + 'a'.repeat(30),
    channels: ['C1'],
  }).catch((error) => error);
  await began.promise;
  const stopping = call('disconnect', { platform: 'slack' });
  hold.release();
  await stopping;
  expect(await connecting).toMatchObject({ status: 409 });
  expect((await call('status')).slack.tokenSaved).toBe(false);
  expect((await call('status')).connected).toBe(false);
  expect(requests).toBe(1);
  await source.close();
});

test('Packages shutdown drains an in-flight add without publishing its configuration', async () => {
  const p = plugin();
  const began = gate();
  const hold = gate();
  const source = new PackagesSource(p, async () => {
    began.release();
    await hold.promise;
    return { text: JSON.stringify({ name: 'example', version: '1.0.0' }) };
  });
  const adding = source
    .add('1', { registry: 'npm', name: 'example' })
    .catch((error) => error);
  await began.promise;
  const closing = source.close();
  hold.release();
  await closing;
  expect(await adding).toBeInstanceOf(Error);
  expect(await source.state('1')).toBeNull();
});

test('Trends check action retains all-keyword work behind a running brand connection refresh', async () => {
  const p = plugin();
  p.env = () =>
    JSON.stringify({
      verifiedAt: 'verified',
      login: 'local',
      password: 'local',
      budget: 5,
    });
  const source = new TrendsSource(p);
  p.rows.set(source.key('1'), {
    status: 'active',
    product: 'Example',
    terms: ['Example'],
    keywords: [
      { id: 'k1', keyword: 'workflow', addedAt: new Date().toISOString() },
    ],
  });
  const began = gate();
  const hold = gate();
  const calls = [];
  source.d4s.run = async (_id, kind) => {
    calls.push(kind);
    if (calls.length === 1) {
      began.release();
      await hold.promise;
    }
    return {
      status: 'completed',
      result: { terms: ['Example'], points: [], top: [], rising: [] },
    };
  };
  const call = actionsFor(p, source, 'nrTrends');
  await call('connect', { product: 'Example' });
  await began.promise;
  expect((await call('check')).checking).toBe(true);
  await call('check');
  hold.release();
  await source.runs.wait('1');
  expect(calls.filter((kind) => kind === 'trends-keyword')).toHaveLength(1);
  expect((await source.state('1')).keywords[0].lastRun.ok).toBe(true);
  await source.close();
});

test('distinct connection settings wait for the active collection and are both retained', async () => {
  const p = plugin();
  const began = gate();
  const hold = gate();
  const queries = [];
  const source = new HackerNewsSource(p, async (url) => {
    queries.push(new URL(url).searchParams.get('query'));
    if (queries.length === 1) {
      began.release();
      await hold.promise;
    }
    return { text: JSON.stringify({ hits: [], nbPages: 1 }) };
  });
  await source.connect('1', { terms: ['Alpha'] });
  await began.promise;
  const second = source.connect('1', { terms: ['Beta'] });
  hold.release();
  await second;
  await source.runs.wait('1');
  expect(queries).toEqual(['"Alpha"', '"Beta"']);
  expect((await source.state('1')).terms).toEqual(['Beta']);
  await source.close();
});

test('X shutdown waits for an already-started credential save before returning', async () => {
  const p = plugin();
  const saving = gate();
  const hold = gate();
  const events = [];
  p.variable = async () => {
    saving.release();
    await hold.promise;
    events.push('saved');
  };
  const source = new XSource(p, async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));
  const call = actionsFor(p, source, 'nrX');
  const result = call('connect', {
    terms: ['Example'],
    token: 'a'.repeat(48),
    cap: 5,
  }).catch((error) => error);
  await saving.promise;
  const closing = source.close().then(() => {
    events.push('closed');
  });
  await Promise.resolve();
  expect(events).toEqual([]);
  hold.release();
  await closing;
  expect(events).toEqual(['saved', 'closed']);
  expect(await result).toMatchObject({ status: 409 });
  expect(source.spent(await source.state('1')).usd).toBe(0.005);
  expect((await source.state('1')).terms).toBeUndefined();
});

for (const kind of ['community', 'x', 'chat']) {
  test(`${kind}: cancelling a queued connection preserves the cancellation response`, async () => {
    const p = plugin();
    const env = new Map();
    p.env = (key) => env.get(key);
    p.variable = async (key, value) => {
      if (value === null) env.delete(key);
      else env.set(key, value);
    };
    const began = gate();
    const hold = gate();
    let requests = 0;
    const transport = async () => {
      if (++requests === 1) {
        began.release();
        await hold.promise;
      }
      return {
        text: JSON.stringify({
          about: { title: 'Example' },
          topic_list: { topics: [] },
        }),
        ok: true,
        json: async () => ({
          ok: true,
          data: [],
          team: 'Example',
          user: 'bot',
          url: 'https://example.slack.com',
          channels: [{ id: 'C1', name: 'help', is_member: true }],
          messages: [],
        }),
      };
    };
    const source =
      kind === 'community'
        ? new CommunitySource(p, transport, async () => {})
        : kind === 'x'
          ? new XSource(p, transport)
          : new ChatSource(p, transport);
    const call = actionsFor(
      p,
      source,
      kind === 'community' ? 'nrCommunity' : kind === 'x' ? 'nrX' : 'nrChat',
    );
    const values =
      kind === 'community'
        ? { url: 'https://example.com' }
        : kind === 'x'
          ? { terms: ['Example'], token: 'a'.repeat(48), cap: 5 }
          : {
              platform: 'slack',
              token: 'xoxb-' + 'a'.repeat(30),
              channels: ['C1'],
            };
    const peer = call('connect', { ...values, projectId: '2' });
    await began.promise;
    const connecting = call('connect', values).catch((error) => error);
    await new Promise((resolve) => setImmediate(resolve));
    const stopping = call('disconnect', { platform: 'slack' });
    hold.release();
    await stopping;
    expect(await connecting).toMatchObject({
      status: 409,
      message: 'projectRuns.cancelled',
    });
    expect((await call('status')).connected).toBe(false);
    await peer;
    await source.runs.wait('2');
    expect((await call('status', { projectId: '2' })).connected).toBe(true);
    await source.close();
  });
}

test('Trends background actions reject new work while disconnect is draining', async () => {
  const p = plugin();
  p.env = () =>
    JSON.stringify({
      verifiedAt: 'verified',
      login: 'local',
      password: 'local',
      budget: 5,
    });
  const source = new TrendsSource(p);
  p.rows.set(source.key('1'), {
    status: 'active',
    product: 'Example',
    terms: ['Example'],
    keywords: [{ id: 'k1', keyword: 'workflow' }],
  });
  const began = gate();
  const hold = gate();
  let requests = 0;
  source.d4s.run = async () => {
    requests++;
    began.release();
    await hold.promise;
    return {
      status: 'completed',
      result: { terms: ['Example'], points: [], top: [], rising: [] },
    };
  };
  const call = actionsFor(p, source, 'nrTrends');
  await call('check');
  await began.promise;
  const stopping = call('disconnect');
  await new Promise((resolve) => setImmediate(resolve));
  try {
    for (const [action, values] of [
      ['check', {}],
      ['retry', {}],
      ['retry', { keywordId: 'k1' }],
    ]) {
      await expect(call(action, values)).rejects.toMatchObject({
        status: 409,
        message: 'projectRuns.cancelled',
      });
    }
  } finally {
    hold.release();
    await stopping;
    await source.close();
  }
  expect(requests).toBe(1);
  expect((await call('status')).connected).toBe(false);
});
