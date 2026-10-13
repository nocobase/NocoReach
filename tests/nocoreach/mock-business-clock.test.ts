// @vitest-environment node
// Historical fixtures must survive the real host's collection, normalization and read paths.
// Do not fake Date or timers here: runtime scheduling must keep using the wall clock.
import { randomBytes, randomUUID } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { FIXTURE_PRODUCT } from '../../app-plugins/nocoreach-mock/server/fixtures';
import { businessNow } from '../../server/nocoreach/business-clock';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
afterEach(() => vi.restoreAllMocks());
const CLOCK = '2026-01-15T12:00:00.000Z';
const NEXT_CLOCK = '2026-02-15T12:00:00.000Z';
const END = '2026-01-14';
const DAY = 86400000;
const test = createAppTest({
  createServer: createStandaloneServer,
  env: {
    ...process.env,
    NOCOBASE_TEST_DB_SQLITE_DIRECTORY: path.join(
      tmpdir(),
      `nocoreach-mock-business-clock-${randomUUID()}`,
    ),
  },
  server: {
    env: { DB_FILENAME: undefined, APP_PUBLIC_ORIGIN: 'http://localhost' },
  },
  config: {
    app: { publicOrigin: 'http://localhost' },
    users: { initialAdmin: DEFAULT_ADMIN_CREDENTIALS },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    nocoreachMock: {
      enabled: true,
      environment: 'test',
      initializeData: false,
    },
    agents: { server: { enabled: false }, vectors: { store: false } },
    nocoreach: { publicDns: '' },
  },
});

async function setup(testApp: any) {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.ready;
  const plugin = runtime.plugin as any;
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const session = (await (await admin.fetch('/auth/get-session')).json())
    .session.id;
  const project = await plugin.projects.create({
    name: `Historical clock ${randomUUID()}`,
    domain: `clock-${randomUUID()}.example`,
  });
  const id = String(project.id);
  const call = async (
    resource: string,
    action: string,
    values: Record<string, unknown> = {},
    headers: Record<string, string> = {},
    status = 200,
  ): Promise<any> => {
    const response = await admin.fetch(`/nocoreach/${resource}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
        'X-NocoReach-Confirmation-Session': session,
        ...headers,
      },
      body: JSON.stringify({ projectId: id, ...values }),
    });
    const body = await response.json();
    expect({
      resource,
      action,
      status: response.status,
      error: response.status === status ? null : body,
    }).toEqual({ resource, action, status, error: null });
    return body.data;
  };
  await call('nrMock', 'configure', {
    enabled: true,
    scenario: 'normal',
    seed: 'historical-clock',
    clock: CLOCK,
    revision: 0,
  });
  return { plugin, id, call };
}

function denyLiveNetwork() {
  const rejected = () => {
    throw new Error('Historical mock tests must not use live upstream I/O');
  };
  const spies = [
    vi.spyOn(globalThis, 'fetch').mockImplementation(rejected),
    vi.spyOn(Socket.prototype, 'connect').mockImplementation(rejected),
    vi.spyOn(dns, 'lookup').mockImplementation(rejected),
    vi.spyOn(dns, 'resolve4').mockImplementation(rejected),
    vi.spyOn(dns, 'resolve6').mockImplementation(rejected),
  ];
  return () => {
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  };
}

const metric = (view: any, key: string) =>
  (view.kpis || view.metrics).find((item: any) => item.key === key)?.value;
const historicalWindow = (view: any) => {
  expect(view.connected).toBe(true);
  expect(view.window).toMatchObject({ start: '2026-01-08', end: END, days: 7 });
};

test('historical mock collection feeds coherent nonempty pages, overview cards and current signals', async ({
  testApp,
}) => {
  const { plugin, id, call } = await setup(testApp);
  const verifyNetwork = denyLiveNetwork();
  const wallStart = Date.now();
  expect(wallStart - Date.parse(CLOCK)).toBeGreaterThan(90 * DAY);

  await call('nrX', 'connect', {
    terms: ['NocoBloom'],
    token: 'FictionalMockOnlyNeverLiveToken01234567890123456789',
    cap: 5,
  });
  await plugin.xSource.runs.wait(id);
  const xs = await plugin.xSource.state(id);
  expect(Object.values(xs.posts)).toHaveLength(8);
  expect(Object.keys(xs.counts)).toHaveLength(7);
  expect(Object.keys(xs.spend)).toEqual([
    new Date(wallStart).toISOString().slice(0, 7),
  ]);
  expect(Date.parse(xs.lastRun.at)).toBeGreaterThanOrEqual(wallStart);
  expect(await plugin.xSource.check(id)).toEqual({ skipped: true });
  expect(
    Object.values(xs.posts).every(
      (post: any) =>
        post.createdAt.startsWith(END) && post.firstSeenAt === CLOCK,
    ),
  ).toBe(true);
  const x = await call('nrX', 'view', { range: '7' });
  historicalWindow(x);
  expect(metric(x, 'read')).toBe(8);
  expect(metric(x, 'mentions')).toBeGreaterThan(0);
  expect(x.kpis.find((item: any) => item.key === 'mentions').complete).toBe(
    true,
  );
  expect(x.spend.usd).toBeGreaterThan(0);

  for (const platform of ['slack', 'discord']) {
    const token =
      platform === 'slack'
        ? 'xoxb-FictionalMockOnlyNeverLive1234567890'
        : 'FictionalMockOnlyNeverLive1234567890.fake.FictionalMockOnlyNeverLive1234567890';
    const inspected = await call('nrChat', 'inspect', { platform, token });
    await call('nrChat', 'connect', {
      platform,
      token,
      guildId: inspected.guildId,
      channels: inspected.channels.map((channel: any) => channel.id),
    });
    await plugin.chat.runs.wait(id);
    const chat = await call('nrChat', 'view', { platform, range: '7' });
    historicalWindow(chat);
    expect(metric(chat, 'messages')).toBeGreaterThan(0);
    expect(chat.open.length).toBeGreaterThan(0);
    expect(chat.open.every((message: any) => message.createdAt < CLOCK)).toBe(
      true,
    );
  }
  const chatState = await plugin.chat.state(id);
  expect(Date.parse(chatState.lastRun.at)).toBeGreaterThanOrEqual(wallStart);
  expect(await plugin.chat.sync(id)).toEqual({ skipped: true });
  expect(Object.values(chatState.messages).length).toBeGreaterThan(8);
  expect(
    Object.values(chatState.messages).every(
      (message: any) =>
        Date.parse(message.createdAt) >= Date.parse(CLOCK) - 30 * DAY,
    ),
  ).toBe(true);

  await call(
    'nrKeywords',
    'configure',
    { monthlyBudgetUsd: 10 },
    {
      'x-noreach-research-credentials': Buffer.from(
        JSON.stringify({
          login: 'fictional@nocobloom.example',
          password: 'fake-credential-never-live',
        }),
      ).toString('base64'),
    },
  );
  await call('nrKeywords', 'check');
  await call('nrReddit', 'connect', { terms: ['NocoBloom'] });
  await plugin.reddit.runs.wait(id);
  const reddit = await call('nrReddit', 'view', { range: '7' });
  historicalWindow(reddit);
  expect(reddit.posts).toHaveLength(7);
  expect(
    reddit.posts.every(
      (post: any) => post.postedAt <= END && post.firstSeenAt === CLOCK,
    ),
  ).toBe(true);
  expect(metric(reddit, 'posts')).toBe(7);
  expect(Date.parse(reddit.lastRun.at)).toBeGreaterThanOrEqual(wallStart);
  expect(await plugin.reddit.check(id)).toEqual({
    found: 0,
    added: 0,
    errors: [],
  });

  await call('nrHackerNews', 'connect', { terms: ['NocoBloom'] });
  await plugin.hackernews.runs.wait(id);
  const hn = await call('nrDataViews', 'hackernews', { range: '7' });
  historicalWindow(hn);
  expect(hn.stories).toHaveLength(4);
  expect(hn.comments).toHaveLength(4);
  expect(metric(hn, 'mentions')).toBe(8);
  expect(
    hn.comments.every((comment: any) => !/<p>/.test(comment.excerpt)),
  ).toBe(true);

  await call('nrGitHub', 'connect', {
    url: `https://github.com/${FIXTURE_PRODUCT.repository}`,
  });
  await call(
    'nrGitHub',
    'setToken',
    {},
    {
      'x-noreach-github-token':
        'github_pat_FictionalMockOnlyNeverLive1234567890',
    },
  );
  await plugin.github.backfill(id);
  const github = await call('nrDataViews', 'github', { range: '7' });
  historicalWindow(github);
  expect(github.releases.length).toBeGreaterThan(0);
  expect(metric(github, 'views')).toBeGreaterThan(0);
  expect(
    Object.keys((await plugin.github.state(id)).daily)
      .sort()
      .at(-1),
  ).toBe(CLOCK.slice(0, 10));

  for (const [registry, name] of [
    ['npm', FIXTURE_PRODUCT.npm],
    ['pypi', 'nocobloom'],
    ['docker', 'nocobloom/nocobloom'],
  ]) {
    await call('nrPackages', 'add', { registry, name });
    await plugin.packages.runs.wait(id);
  }
  const downloads = await call('nrDataViews', 'downloads', { range: '7' });
  historicalWindow(downloads);
  expect(downloads.packages).toHaveLength(3);
  expect(metric(downloads, 'downloads')).toBeGreaterThan(0);
  expect(downloads.cutoff).toBe(END);
  const packagesState = await plugin.packages.state(id);
  for (const days of Object.values(packagesState.samples))
    expect(Object.keys(days as object)).toEqual([CLOCK.slice(0, 10)]);

  await call('nrCommunity', 'connect', { url: FIXTURE_PRODUCT.community });
  await plugin.community.runs.wait(id);
  const community = await call('nrDataViews', 'community', { range: '7' });
  historicalWindow(community);
  expect(metric(community, 'topics')).toBeGreaterThan(0);
  expect(community.daily.some((day: any) => day.topics > 0)).toBe(true);

  const overview = await call('nrDataViews', 'overview', { range: '7' });
  expect(Date.parse(overview.generatedAt)).toBeGreaterThanOrEqual(wallStart);
  expect(overview.cards.map((card: any) => card.id).sort()).toEqual([
    'discourse',
    'github',
    'mentions',
    'packages',
    'reddit',
  ]);
  for (const card of overview.cards)
    expect(card.window).toMatchObject({
      start: '2026-01-08',
      end: END,
      days: 7,
    });
  for (const [source, key, page] of [
    ['discourse', 'topics', community],
    ['mentions', 'mentions', hn],
    ['packages', 'downloads', downloads],
    ['reddit', 'posts', reddit],
  ] as const)
    expect(
      metric(
        overview.cards.find((card: any) => card.id === source),
        key,
      ),
    ).toBe(metric(page, key));

  // Normal fixtures intentionally have modest X engagement; use an ordinary supported rule setting.
  await call('nrAnalysisRules', 'save', {
    rules: { 'x-hot': { values: { minEngagement: 5 } } },
  });
  const signals = await call('nrSignals', 'current');
  expect(Date.parse(signals.computedAt)).toBeGreaterThanOrEqual(wallStart);
  expect(signals.items.length).toBeGreaterThan(0);
  expect(signals.items.map((item: any) => item.source)).toEqual(
    expect.arrayContaining([
      'x',
      'slack',
      'discord',
      'reddit',
      'hackernews',
      'github',
      'discourse',
    ]),
  );
  expect(
    signals.items.every((item: any) => item.firstSeenAt === signals.computedAt),
  ).toBe(true);
  const inputs = await plugin.signals.inputs(id);
  expect(inputs.inputs.now).toBe(Date.parse(CLOCK));

  // Switching off upstream fixtures must not hide or re-date already saved data.
  await call('nrMock', 'configure', {
    enabled: false,
    scenario: 'normal',
    seed: 'historical-clock',
    clock: CLOCK,
    revision: 1,
  });
  for (const [resource, action, values, key] of [
    ['nrX', 'view', {}, 'read'],
    ['nrReddit', 'view', {}, 'posts'],
    ['nrChat', 'view', { platform: 'slack' }, 'messages'],
    ['nrChat', 'view', { platform: 'discord' }, 'messages'],
    ['nrDataViews', 'github', {}, 'views'],
    ['nrDataViews', 'community', {}, 'topics'],
    ['nrDataViews', 'downloads', {}, 'downloads'],
    ['nrDataViews', 'hackernews', {}, 'mentions'],
  ] as const) {
    const saved = await call(resource, action, { range: '7', ...values });
    historicalWindow(saved);
    expect(metric(saved, key)).toBeGreaterThan(0);
  }
  expect((await call('nrDataViews', 'overview', { range: '7' })).cards).toEqual(
    overview.cards,
  );
  expect(
    (await call('nrSignals', 'current')).items.map((item: any) => item.key),
  ).toEqual(signals.items.map((item: any) => item.key));
  expect(Date.now()).toBeGreaterThanOrEqual(wallStart);
  expect(Date.now() - Date.parse(CLOCK)).toBeGreaterThan(90 * DAY);
  verifyNetwork();
});

test('disabled and unconfigured projects retain local read pages without invoking an upstream', async ({
  testApp,
}) => {
  const { plugin, id, call } = await setup(testApp);
  const verifyNetwork = denyLiveNetwork();
  const other = await plugin.projects.create({
    name: 'Unconfigured historical project',
    domain: `unconfigured-${randomUUID()}.example`,
  });
  await call('nrMock', 'configure', {
    enabled: false,
    scenario: 'normal',
    seed: 'historical-clock',
    clock: CLOCK,
    revision: 1,
  });
  for (const projectId of [id, String(other.id)]) {
    for (const [resource, action, values] of [
      ['nrX', 'view', {}],
      ['nrReddit', 'view', {}],
      ['nrChat', 'view', { platform: 'slack' }],
      ['nrChat', 'view', { platform: 'discord' }],
      ['nrDataViews', 'github', {}],
      ['nrDataViews', 'community', {}],
      ['nrDataViews', 'downloads', {}],
      ['nrDataViews', 'hackernews', {}],
    ] as const)
      expect(
        await call(resource, action, { projectId, range: '7', ...values }),
      ).toMatchObject({ connected: false });
    expect(
      (await call('nrDataViews', 'overview', { projectId })).cards,
    ).toEqual([]);
    expect((await call('nrSignals', 'current', { projectId })).items).toEqual(
      [],
    );
  }
  await call(
    'nrGitHub',
    'connect',
    { url: `https://github.com/${FIXTURE_PRODUCT.repository}` },
    {},
    409,
  );
  verifyNetwork();
});

test('in-flight host reads and collection retain their immutable clock across project reconfiguration', async ({
  testApp,
}) => {
  const { plugin, id, call } = await setup(testApp);
  const verifyNetwork = denyLiveNetwork();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured!: () => void;
  const entered = new Promise<void>((resolve) => {
    captured = resolve;
  });
  const old = plugin.mock.run(id, async () => {
    expect(businessNow(plugin, id)).toBe(Date.parse(CLOCK));
    captured();
    await gate;
    expect(businessNow(plugin, id)).toBe(Date.parse(CLOCK));
    await plugin.xSource.connect(id, {
      terms: ['NocoBloom'],
      token: 'FictionalMockOnlyNeverLiveToken01234567890123456789',
      cap: 5,
    });
    await plugin.xSource.runs.wait(id);
    const view = await plugin.xSource.view(
      id,
      { range: '7' },
      (await import('../../server/nocoreach/data-views')).windowFor,
    );
    return { view, signalInputs: await plugin.signals.inputs(id) };
  });
  await entered;
  try {
    await call('nrMock', 'configure', {
      enabled: true,
      scenario: 'normal',
      seed: 'historical-clock',
      clock: NEXT_CLOCK,
      revision: 1,
    });
    expect(businessNow(plugin, id)).toBe(Date.parse(NEXT_CLOCK));
  } finally {
    release();
  }
  const collected = await old;
  historicalWindow(collected.view);
  expect(metric(collected.view, 'read')).toBe(8);
  expect(collected.signalInputs.inputs.now).toBe(Date.parse(CLOCK));
  const nextView = await call('nrX', 'view', { range: '7' });
  expect(nextView.window.end).toBe('2026-02-14');
  expect(metric(nextView, 'read')).toBe(0);
  expect((await plugin.xSource.state(id)).posts).toEqual(
    expect.objectContaining(
      Object.fromEntries(
        collected.view.latest.map((post: any) => [post.id, post]),
      ),
    ),
  );
  verifyNetwork();
});
