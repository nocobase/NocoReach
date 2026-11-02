// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { BilibiliSource } from '../../server/nocoreach/bilibili-source';
// @ts-expect-error The server modules are plain JavaScript under ts-nocheck.
import { windowFor } from '../../server/nocoreach/data-views.js';
import type { BrowserCollectorConfig } from '../../server/nocoreach/browser-collector-config';
import type { CollectorResolver } from '../../server/nocoreach/collector-connections';
import {
  BilibiliError,
  bilibiliConfig,
  bilibiliMetadata,
  type BilibiliAdapter,
  type BilibiliBatch,
} from '../../server/nocoreach/bilibili-adapter';
import { adminOnly } from '../../server/nocoreach/policy';
import { contentInputs } from '../../server/nocoreach/content-source-inputs';
import { contentSignals } from '../../server/nocoreach/content-rules';
const BV1 = 'BV1MW421X7gM',
  BV2 = 'BV1ABcsztEcY';
const config: BrowserCollectorConfig = {
  id: 'local',
  name: 'Research browser',
  url: 'http://127.0.0.1:18061',
  token: 'synthetic-only-collector-test-token',
  platforms: ['bilibili'],
  projectIds: ['1', '2'],
};
const item = (
  bvid = BV1,
  completeness: 'video_metadata' | 'search_summary' = 'search_summary',
) => ({
  bvid,
  title: 'Product demo',
  views: 12,
  likes: null,
  comments: null,
  publishedAt: null,
  publishedAtPrecision: null,
  completeness,
});
const batch = (
  bvid = BV1,
  completeness: 'video_metadata' | 'search_summary' = 'search_summary',
): BilibiliBatch => ({
  collectedAt: new Date().toISOString(),
  items: [item(bvid, completeness)],
});
function setup(overrides: Partial<BilibiliAdapter> = {}) {
  const rows = new Map<string, { id: string; key: string; payload: unknown }>();
  const repo = {
    findOne: async ({ filter }: { filter: { key: string } }) => {
      const row = rows.get(filter.key);
      return row ? { ...row, get: () => row.payload } : null;
    },
    create: async ({
      values,
    }: {
      values: { key: string; payload: unknown };
    }) => {
      rows.set(values.key, { id: values.key, ...values });
    },
    update: async ({
      filterByTk,
      values,
    }: {
      filterByTk: string;
      values: { payload: unknown };
    }) => {
      rows.get(filterByTk)!.payload = values.payload;
    },
  };
  const adapter = {
    health: vi.fn(async () => ({
      toolInstalled: true as const,
      browser: 'unchecked' as const,
      login: 'unchecked' as const,
    })),
    search: vi.fn(async () => batch()),
    video: vi.fn(async (_c, req) => batch(req.bvid, 'video_metadata')),
    ...overrides,
  };
  const host = {
    collectors: {
      allowed: vi.fn<CollectorResolver['allowed']>((id) =>
        ['1', '2'].includes(id) ? [config] : [],
      ),
    },
    db: {
      getRepository: () => repo,
      sequelize: {
        transaction: <T>(fn: (tx: object) => T) => fn({}),
        query: async () => undefined,
      },
    },
    network: { bind: vi.fn() },
    project: vi.fn(async () => ({ id: '1' })),
    projectIds: vi.fn(async () => ['1']),
    app: { logger: { warn: vi.fn() } },
  };
  return {
    service: new BilibiliSource(host as never, adapter),
    adapter,
    rows,
    host,
  };
}
async function connect(
  service: BilibiliSource,
  extra: Record<string, unknown> = {},
  id = '1',
) {
  return service.connect(id, {
    collectorId: 'local',
    revision: (await service.status(id)).revision,
    terms: 'NocoBase',
    ...extra,
  });
}
function deferred() {
  let resolve!: (r: BilibiliBatch) => void;
  const promise = new Promise<BilibiliBatch>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it('validates bounded terms, exact IDs, canonical URLs and expected revision without endpoint/credential fields', () => {
  expect(
    bilibiliConfig({
      collectorId: 'local',
      revision: null,
      terms: '中,-topic,NocoBase,nocobase',
      bvids: `https://m.bilibili.com/video/${BV1}?token=discard,${BV1}`,
    }),
  ).toEqual({
    collectorId: 'local',
    revision: null,
    terms: ['中', '-topic', 'nocobase'],
    bvids: [BV1],
  });
  // Up to five terms, as YouTube takes; daily reading is switched with the same save.
  expect(
    bilibiliConfig({
      collectorId: 'local',
      revision: null,
      terms: 'one,two,three,four,five',
      autoSync: false,
    }),
  ).toMatchObject({
    terms: ['one', 'two', 'three', 'four', 'five'],
    autoSync: false,
  });
  for (const value of [
    {},
    { terms: '' },
    { terms: 'a'.repeat(81) },
    { terms: 'one,two,three,four,five,six' },
    { terms: 'valid', autoSync: 'yes' },
    { terms: 'a\u0000b' },
    { bvids: `http://127.0.0.1/video/${BV1}` },
    { bvids: 'https://b23.tv/abc' },
    { bvids: `https://evil.bilibili.com/video/${BV1}` },
    { bvids: `https://u:p@www.bilibili.com/video/${BV1}` },
    { terms: 'valid', endpoint: 'http://127.0.0.1' },
    { terms: 'valid', cookie: 'secret' },
  ])
    expect(() =>
      bilibiliConfig({ collectorId: 'local', revision: null, ...value }),
    ).toThrow();
});
it('keeps missing fields unknown, marks search zero ambiguous, preserves known detail zero and strips extra fields', () => {
  const search = bilibiliMetadata(
    {
      bvid: BV1,
      completeness: 'search_summary',
      views: 0,
      secret: 'sensitive',
    },
    'search',
  );
  expect(search).toMatchObject({
    title: null,
    views: null,
    likes: null,
    publishedAt: null,
  });
  expect(JSON.stringify(search)).not.toContain('sensitive');
  expect(
    bilibiliMetadata(
      { bvid: BV1, completeness: 'video_metadata', views: 0 },
      'video',
      BV1,
    ).views,
  ).toBe(0);
  expect(() =>
    bilibiliMetadata(item(BV2, 'video_metadata'), 'video', BV1),
  ).toThrow();
});
it('save and health remain offline/unverified; same save retains evidence, changed conditions retain marked history', async () => {
  const { service, adapter } = setup();
  await connect(service);
  expect(adapter.search).not.toHaveBeenCalled();
  await service.test('1', 'local');
  expect((await service.status('1')).verifiedAt).toBeNull();
  await service.sync('1');
  const first = await service.status('1');
  await connect(service);
  expect((await service.status('1')).revision).toBe(first.revision);
  expect((await service.status('1')).verifiedAt).toBe(first.verifiedAt);
  await connect(service, { terms: '', bvids: BV2 });
  expect(await service.status('1')).toMatchObject({
    verifiedAt: null,
    total: 1,
    recent: [{ fromEarlierConfig: true }],
  });
});
it('rejects stale editor revisions without deleting evidence or cancelling current operation', async () => {
  const d = deferred(),
    { service } = setup({ search: async () => d.promise });
  await connect(service);
  const active = service.sync('1');
  await vi.waitFor(async () =>
    expect((await service.status('1')).checking).toBe(true),
  );
  await expect(
    service.connect('1', {
      collectorId: 'local',
      revision: randomUUID(),
      terms: 'changed',
    }),
  ).rejects.toMatchObject({ code: 'conflict' });
  d.resolve(batch());
  await active;
  expect((await service.status('1')).total).toBe(1);
});
it('deduplicates within/repeated runs, preserves firstSeen and richer same-batch metadata', async () => {
  const { service } = setup({
    video: async () => ({
      ...batch(BV1, 'video_metadata'),
      items: [{ ...item(BV1, 'video_metadata'), views: 0 }],
    }),
  });
  await connect(service, { bvids: BV1 });
  const first = await service.sync('1');
  expect(first.total).toBe(1);
  expect(first.recent[0]?.views).toBe(0);
  expect(first.recent[0]?.sources.map((s) => s.kind)).toEqual([
    'video',
    'search',
  ]);
  const second = await service.sync('1');
  expect(second.lastRun?.added).toBe(0);
  expect(second.recent[0]?.firstSeenAt).toBe(first.recent[0]?.firstSeenAt);
});
it('stops on restriction, keeps prior evidence, makes no subsequent request and never retries', async () => {
  const { service, adapter } = setup();
  await connect(service);
  await service.sync('1');
  const before = (await service.status('1')).recent;
  adapter.search.mockRejectedValue(new BilibiliError('security_block'));
  await connect(service, { terms: 'first,second,third' });
  const result = await service.sync('1');
  expect(adapter.search).toHaveBeenCalledTimes(2);
  expect(result.lastRun).toMatchObject({
    ok: false,
    errorCode: 'security_block',
    found: 0,
  });
  expect(result.recent[0]?.collectedAt).toBe(before[0]?.collectedAt);
});
it('does not verify ambiguous empty; explicitly marks useful detail plus unconfirmed search partial', async () => {
  const { service } = setup({
    search: async () => {
      throw new BilibiliError('unconfirmed_empty');
    },
  });
  await connect(service);
  expect((await service.sync('1')).verifiedAt).toBeNull();
  await connect(service, { bvids: BV1 });
  const result = await service.sync('1');
  expect(result).toMatchObject({
    total: 1,
    lastRun: { ok: false, partial: true, errorCode: 'unconfirmed_empty' },
  });
  expect(result.verifiedAt).not.toBeNull();
});
it('sets an explicit rate-limit cooldown and blocks an immediate manual retry', async () => {
  const search = vi.fn(async () => {
    throw new BilibiliError('rate_limited');
  });
  const { service } = setup({ search });
  await connect(service);
  expect((await service.sync('1')).lastRun?.retryAt).toBeTruthy();
  await expect(service.sync('1')).rejects.toMatchObject({
    code: 'rate_limited',
  });
  expect(search).toHaveBeenCalledTimes(1);
});
it('one project is mutually exclusive; cancellation is request-specific and ignores late results', async () => {
  const d = deferred(),
    { service } = setup({ search: async () => d.promise });
  await connect(service);
  const pending = service.sync('1');
  await vi.waitFor(async () =>
    expect((await service.status('1')).requestId).toBeTruthy(),
  );
  await expect(service.sync('1')).rejects.toMatchObject({ code: 'busy' });
  const id = (await service.status('1')).requestId;
  await service.cancel('1', 'wrong-request');
  expect((await service.status('1')).checking).toBe(true);
  await service.cancel('1', id);
  d.resolve(batch());
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  expect(await service.status('1')).toMatchObject({
    total: 0,
    checking: false,
    verifiedAt: null,
    lastRun: { ok: false, errorCode: 'cancelled', found: 0, added: 0 },
  });
});
it('persists cancellation after a successful read without replacing evidence or its success time', async () => {
  const d = deferred();
  const search = vi.fn(async () => batch());
  const { service } = setup({ search });
  await connect(service);
  await service.sync('1');
  const before = await service.state('1');
  search.mockImplementationOnce(() => d.promise);
  const pending = service.sync('1');
  await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  const requestId = (await service.status('1')).requestId;
  await service.cancel('1', requestId);
  d.resolve(batch(BV2));
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  const after = await service.state('1');
  expect(after?.videos).toEqual(before?.videos);
  expect(after?.verifiedAt).toBe(before?.verifiedAt);
  expect(after?.lastRun).toMatchObject({
    ok: false,
    errorCode: 'cancelled',
    found: 0,
    added: 0,
    partial: false,
  });
  expect(await service.sync('1')).toMatchObject({
    checking: false,
    total: 1,
    lastRun: { ok: true, errorCode: null, added: 0 },
  });
  await service.cancel('1', requestId);
  expect((await service.status('1')).lastRun?.ok).toBe(true);
});
it('changed configuration and disconnect reject late batches without restoring connections', async () => {
  for (const change of ['connect', 'disconnect'] as const) {
    const d = deferred(),
      { service } = setup({ search: async () => d.promise });
    await connect(service);
    const pending = service.sync('1');
    await vi.waitFor(async () =>
      expect((await service.status('1')).requestId).toBeTruthy(),
    );
    if (change === 'connect') await connect(service, { terms: 'Changed' });
    else await service.disconnect('1', (await service.status('1')).revision);
    d.resolve(batch());
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(await service.status('1')).toMatchObject({
      total: 0,
      verifiedAt: null,
      connected: change === 'connect',
      lastRun: null,
    });
  }
});
it('uses the project resolver, redacts credentials and rejects unlisted collectors', async () => {
  const { service, host } = setup();
  expect((await service.status('1')).collectors).toEqual([
    { id: 'local', name: config.name },
  ]);
  expect((await service.status('3')).configured).toBe(false);
  expect(host.collectors.allowed).toHaveBeenCalledWith('1', 'bilibili');
  expect(host.collectors.allowed).toHaveBeenCalledWith('3', 'bilibili');
  await expect(
    connect(service, { collectorId: 'xhs-only' }),
  ).rejects.toMatchObject({ code: 'not_connected' });
  await expect(connect(service, {}, '3')).rejects.toMatchObject({
    code: 'not_connected',
  });
  expect(JSON.stringify(await service.status('1'))).not.toContain(config.token);
  expect(JSON.stringify(await service.status('1'))).not.toContain(config.url);
});
it('members may read but health, mutation and upstream requests remain admin-only', () => {
  expect(adminOnly('nrBilibili', 'status')).toBe(false);
  for (const action of ['connect', 'test', 'sync', 'cancel', 'disconnect'])
    expect(adminOnly('nrBilibili', action)).toBe(true);
});

it('registered production actions enforce authentication, role, project existence and no-store', async () => {
  const { LegacyResources } = await import('../../server/nocoreach/legacy/app');
  const { legacyContext, LegacyCache } =
    await import('../../server/nocoreach/legacy/context');
  const resources = new LegacyResources();
  const { service, host } = setup();
  const getRepository = host.db.getRepository;
  Object.assign(host.db, {
    getRepository: (name: string) =>
      name === 'users'
        ? {
            findOne: async () => ({
              id: 'member',
              roles: [{ name: 'nr.member' }],
            }),
          }
        : {
            ...getRepository(),
            findOne: async (params: { filter: { key: string } }) =>
              params.filter.key === 'nr-members'
                ? { get: () => ({ users: { member: 'member' } }) }
                : getRepository().findOne(params),
          },
  });
  const logger = { info() {}, warn() {}, error() {}, debug() {} };
  const app = {
    db: host.db,
    resourceManager: resources,
    acl: { allow: resources.allow.bind(resources) },
  };
  Object.assign(host, { app });
  service.register();
  const context = (
    action: string,
    user: 'anonymous' | 'member' | 'admin',
    values = {},
  ) =>
    legacyContext({
      resource: 'nrBilibili',
      action,
      method: 'POST',
      query: {},
      body: { projectId: '1', ...values },
      header: () => undefined,
      cookie: () => undefined,
      user: user === 'anonymous' ? null : { id: user },
      roles: user === 'admin' ? ['root'] : [],
      app: app as never,
      cache: new LegacyCache(),
      logger,
    });
  await expect(
    resources.action('nrBilibili', 'status')!(
      context('status', 'anonymous'),
      async () => {},
    ),
  ).rejects.toMatchObject({ status: 401 });
  for (const action of ['connect', 'test', 'sync', 'cancel', 'disconnect'])
    await expect(
      resources.action('nrBilibili', action)!(
        context(action, 'member'),
        async () => {},
      ),
    ).rejects.toMatchObject({ status: 403 });
  const member = context('status', 'member');
  await resources.action('nrBilibili', 'status')!(member, async () => {});
  expect(member.headers['Cache-Control']).toBe('no-store');
  const admin = context('connect', 'admin', {
    collectorId: 'local',
    terms: 'Demo',
    revision: null,
  });
  await resources.action('nrBilibili', 'connect')!(admin, async () => {});
  expect(admin.body).toMatchObject({ connected: true, verifiedAt: null });
  host.project.mockRejectedValueOnce(
    Object.assign(new Error('项目不存在'), { status: 404 }),
  );
  await expect(
    resources.action('nrBilibili', 'status')!(
      context('status', 'admin'),
      async () => {},
    ),
  ).rejects.toMatchObject({ status: 404 });
});

it('caps retained evidence at 500 without inventing growth or dropping current source identities', async () => {
  let run = 0;
  const { service } = setup({
    search: async () => {
      const current = run++;
      return {
        collectedAt: new Date(1700000000000 + current * 1000).toISOString(),
        items: Array.from({ length: 20 }, (_, i) =>
          item(`BV${String(current * 20 + i).padStart(10, '0')}`),
        ),
      };
    },
  });
  await connect(service);
  for (let i = 0; i < 26; i++) await service.sync('1');
  const status = await service.status('1');
  expect(status.total).toBe(500);
  expect(status.recent).toHaveLength(5);
  expect(status.lastRun).toMatchObject({ found: 520, added: 20, capped: true });
  expect(status.recent.every((v) => v.sources[0]?.value === 'NocoBase')).toBe(
    true,
  );
});

it('cancellation accepted while awaiting the snapshot lock is rechecked inside the transaction', async () => {
  let finishCollection!: (value: BilibiliBatch) => void;
  const collected = new Promise<BilibiliBatch>((resolve) => {
    finishCollection = resolve;
  });
  const { service, host } = setup({ search: () => collected });
  await connect(service);
  const pending = service.sync('1');
  // A browser already has this ID before the collection reaches its write lock.
  const requestId = (await service.status('1')).requestId;
  expect(requestId).not.toBeNull();
  let unlock!: () => void;
  const lock = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  let waiting = false;
  host.db.sequelize.query = async () => {
    waiting = true;
    await lock;
  };
  finishCollection(batch());
  await vi.waitFor(() => expect(waiting).toBe(true));
  // Cancellation aborts synchronously; its response may wait for a snapshot.
  const cancelling = service.cancel('1', requestId);
  unlock();
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await cancelling;
  expect(await service.status('1')).toMatchObject({
    total: 0,
    verifiedAt: null,
    lastRun: { ok: false, errorCode: 'cancelled', found: 0, added: 0 },
  });
});

it.each(['deadline', 'cancel'] as const)(
  'classifies batch %s through the real HTTP adapter and discards this batch',
  async (mode) => {
    const fixture = setup();
    await connect(fixture.service);
    await fixture.service.sync('1');
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const fetchCollector = vi.fn(
      async (_id: string, _url: string, options: RequestInit) => {
        const input = JSON.parse(String(options.body));
        if (input.query === 'first')
          return new Response(
            JSON.stringify({
              protocolVersion: 1,
              platform: 'bilibili',
              projectId: input.projectId,
              requestId: input.requestId,
              kind: 'search',
              ok: true,
              collectedAt: new Date().toISOString(),
              items: [item(BV2)],
            }),
          );
        return new Promise<Response>((_resolve, reject) => {
          const signal = options.signal!;
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
          if (signal.aborted) reject(signal.reason);
          entered();
        });
      },
    );
    const service = new BilibiliSource({
      ...fixture.host,
      network: { bind: vi.fn(), fetchCollector },
    } as never); // No adapter test double: use HttpBilibiliAdapter.
    await connect(service, { terms: ['first', 'wait'] });
    const before = (await service.state('1'))!.videos;
    const timeout = AbortSignal.timeout;
    const spy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) =>
        timeout.call(
          AbortSignal,
          ms === 120000 && mode === 'deadline' ? 30 : ms,
        ),
      );
    try {
      const pending = service.sync('1').catch((error) => error);
      await waiting;
      if (mode === 'cancel') {
        const status = await service.status('1');
        await service.cancel('1', status.requestId);
      }
      const result = await pending;
      if (mode === 'deadline')
        expect(result.lastRun).toMatchObject({
          ok: false,
          errorCode: 'timeout',
          partial: false,
        });
      else expect(result).toMatchObject({ code: 'cancelled' });
      const status = await service.status('1');
      expect(status.checking).toBe(false);
      expect(status.total).toBe(1);
      expect((await service.state('1'))!.videos).toEqual(before);
      expect(status.recent.map((video) => video.id)).toEqual([BV1]);
      expect(fetchCollector).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
      service.stop();
    }
  },
);

it('preserves validated search publication dates and requires matching precision', () => {
  const dated = {
    ...item(),
    publishedAt: '2026-10-15T10:00:00Z',
    publishedAtPrecision: 'minute',
  };
  expect(bilibiliMetadata(dated, 'search')).toMatchObject(dated);
  expect(
    bilibiliMetadata({ ...dated, publishedAtPrecision: null }, 'search'),
  ).toMatchObject({ publishedAt: null, publishedAtPrecision: null });
  expect(() =>
    bilibiliMetadata({ ...dated, publishedAt: 'invalid' }, 'search'),
  ).toThrow();
});

it('orders by publication before truncation, breaks ties by ID and preserves dates on refresh', async () => {
  const entries = Array.from({ length: 502 }, (_, i) => ({
    ...item(`BV${String(i).padStart(10, '0')}`),
    publishedAt: i < 2 ? null : '2026-10-15T10:00:00Z',
    publishedAtPrecision: i < 2 ? null : ('minute' as const),
  }));
  const search = vi.fn(async () => ({
    collectedAt: nowForTest(),
    items: entries.slice().reverse(),
  }));
  const { service } = setup({ search });
  await connect(service);
  await service.sync('1');
  const first = await service.status('1');
  expect(first.total).toBe(500);
  expect(first.recent.map((v) => v.id)).toEqual(
    entries.slice(2, 7).map((v) => v.bvid),
  );
  search.mockResolvedValue({
    collectedAt: nowForTest(),
    items: [{ ...entries[2], publishedAt: null, publishedAtPrecision: null }],
  });
  await service.sync('1');
  expect((await service.status('1')).recent[0]).toMatchObject({
    publishedAt: entries[2].publishedAt,
    publishedAtPrecision: 'minute',
  });
});
function nowForTest() {
  return new Date().toISOString();
}

it('lists newer publications first even when older and unknown videos were collected later', async () => {
  const { service, rows } = setup();
  await connect(service);
  await service.sync('1');
  const state = rows.get('bilibili:1')!.payload as {
    videos: Record<
      string,
      import('../../server/nocoreach/bilibili-source').BilibiliVideo
    >;
  };
  const template = state.videos[BV1];
  state.videos = Object.fromEntries(
    [
      {
        ...template,
        id: 'unknown',
        publishedAt: null,
        collectedAt: '2026-10-17T12:00:00Z',
      },
      {
        ...template,
        id: 'older',
        publishedAt: '2026-10-15T12:00:00Z',
        collectedAt: '2026-10-17T11:00:00Z',
      },
      {
        ...template,
        id: 'newer',
        publishedAt: '2026-10-16T12:00:00Z',
        collectedAt: '2026-10-17T10:00:00Z',
      },
    ].map((v) => [v.id, v]),
  );
  expect((await service.status('1')).recent.map((v) => v.id)).toEqual([
    'newer',
    'older',
    'unknown',
  ]);
});

it('enriches search discoveries, preserves search provenance and retains known metrics across incomplete refreshes', async () => {
  const video = vi.fn<BilibiliAdapter['video']>().mockResolvedValue({
    ...batch(BV1, 'video_metadata'),
    items: [
      {
        ...item(BV1, 'video_metadata'),
        views: 0,
        likes: 68,
        comments: 28,
        publishedAt: '2024-12-04T03:04:00.000Z',
        publishedAtPrecision: 'minute',
      },
    ],
  });
  const { service } = setup({ video });
  await connect(service);
  const first = await service.sync('1');
  expect(video).toHaveBeenCalledTimes(1);
  expect(first.recent[0]).toMatchObject({
    views: 0,
    likes: 68,
    comments: 28,
    publishedAt: '2024-12-04T03:04:00.000Z',
    completeness: 'video_metadata',
  });
  expect(first.recent[0].sources.map((s) => s.kind)).toEqual([
    'search',
    'video',
  ]);
  // Reading the details does not make the video its own origin on the data page.
  expect(
    (await service.report('1', { range: 'all' }, windowFor)).groups,
  ).toEqual([{ kind: 'term', name: 'NocoBase', count: 1 }]);
  video.mockResolvedValue({
    ...batch(BV1, 'video_metadata'),
    items: [
      { ...item(BV1, 'video_metadata'), title: null, views: null, likes: 0 },
    ],
  });
  const second = await service.sync('1');
  expect(second.recent[0]).toMatchObject({
    title: 'Product demo',
    likes: 0,
    comments: 28,
    publishedAt: '2024-12-04T03:04:00.000Z',
    firstSeenAt: first.recent[0].firstSeenAt,
  });
});

it('refreshes saved videos missing from search and clears their earlier-configuration marker', async () => {
  const { service, adapter } = setup();
  await connect(service);
  await service.sync('1');
  await connect(service, { terms: 'changed query' });
  expect((await service.status('1')).recent[0].fromEarlierConfig).toBe(true);
  adapter.search.mockResolvedValue(batch(BV2));
  const freshAt = '2026-10-18T08:00:00.000Z';
  adapter.video.mockClear().mockImplementation(async (_c, input) => ({
    collectedAt: freshAt,
    items: [
      {
        ...item(input.bvid, 'video_metadata'),
        views: 123,
        likes: 62,
        comments: 12,
        publishedAt: '2025-05-29T09:59:00.000Z',
        publishedAtPrecision: 'minute',
      },
    ],
  }));
  const result = await service.sync('1');
  expect(adapter.video.mock.calls.map((call) => call[1].bvid)).toEqual([
    BV1,
    BV2,
  ]);
  expect(result.recent.find((video) => video.id === BV1)).toMatchObject({
    views: 123,
    likes: 62,
    comments: 12,
    collectedAt: freshAt,
    publishedAt: '2025-05-29T09:59:00.000Z',
    fromEarlierConfig: false,
    metricFetchedAt: { views: freshAt, likes: freshAt, comments: freshAt },
  });
  expect(result.total).toBe(2);
});

it('refreshes saved videos when search has no verifiable results', async () => {
  const { service, adapter } = setup();
  await connect(service);
  await service.sync('1');
  adapter.search.mockRejectedValue(new BilibiliError('unconfirmed_empty'));
  adapter.video.mockClear().mockResolvedValue({
    ...batch(BV1, 'video_metadata'),
    items: [{ ...item(BV1, 'video_metadata'), likes: 42 }],
  });
  const result = await service.sync('1');
  expect(adapter.video).toHaveBeenCalledTimes(1);
  expect(result.recent[0].likes).toBe(42);
  expect(result.lastRun).toMatchObject({
    partial: true,
    errorCode: 'unconfirmed_empty',
  });
});

it('caps optional details, deduplicates search terms and prioritizes newest publications', async () => {
  const entries = Array.from({ length: 20 }, (_, i) => ({
    ...item(`BV${String(i).padStart(10, '0')}`),
    publishedAt: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    publishedAtPrecision: 'minute' as const,
  }));
  const { service, adapter } = setup({
    search: vi.fn(async (_c, input) => ({
      collectedAt: new Date().toISOString(),
      items:
        input.query === 'second'
          ? [item(BV2), ...entries.slice(0, 19)]
          : entries,
    })),
  });
  await connect(service, { terms: ['first', 'second', 'third'] });
  const result = await service.sync('1');
  expect(adapter.video).toHaveBeenCalledTimes(20);
  expect(adapter.video.mock.calls.map((call) => call[1].bvid)).toEqual(
    entries
      .slice()
      .reverse()
      .map((v) => v.bvid),
  );
  expect(result.total).toBe(21);
});

it.each([
  'rate_limited',
  'security_block',
  'collector_unreachable',
  'invalid_response',
] as const)(
  'keeps search results and previous metrics when enrichment fails with %s',
  async (code) => {
    const video = vi.fn<BilibiliAdapter['video']>().mockResolvedValue({
      ...batch(BV1, 'video_metadata'),
      items: [{ ...item(BV1, 'video_metadata'), likes: 68, comments: 28 }],
    });
    const { service, adapter } = setup({ video });
    await connect(service);
    await service.sync('1');
    adapter.search.mockResolvedValue({
      ...batch(),
      items: [item(BV1), item(BV2)],
    });
    video.mockClear().mockRejectedValue(new BilibiliError(code));
    const result = await service.sync('1');
    expect(result.total).toBe(2);
    expect(result.recent.find((v) => v.id === BV1)).toMatchObject({
      likes: 68,
      comments: 28,
    });
    expect(result.lastRun).toMatchObject({
      ok: false,
      partial: true,
      errorCode: code,
      found: 2,
    });
    expect(video).toHaveBeenCalledTimes(1);
    if (code === 'rate_limited') {
      expect(result.lastRun?.retryAt).toBeTruthy();
      await expect(service.sync('1')).rejects.toMatchObject({ code });
    }
  },
);

it('continues past a missing video without retrying it', async () => {
  const video = vi
    .fn<BilibiliAdapter['video']>()
    .mockRejectedValueOnce(new BilibiliError('not_found'))
    .mockImplementation(async (_c, input) => ({
      ...batch(input.bvid, 'video_metadata'),
      items: [{ ...item(input.bvid, 'video_metadata'), likes: 5 }],
    }));
  const { service } = setup({
    search: async () => ({ ...batch(), items: [item(BV1), item(BV2)] }),
    video,
  });
  await connect(service);
  const result = await service.sync('1');
  expect(video).toHaveBeenCalledTimes(2);
  expect(result.lastRun).toMatchObject({
    partial: true,
    errorCode: 'not_found',
  });
  expect(result.recent.filter((v) => v.likes === 5)).toHaveLength(1);
});

it.each(['cancel', 'deadline'] as const)(
  'honors %s during detail enrichment without accepting late detail',
  async (mode) => {
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const video = vi.fn<BilibiliAdapter['video']>(async (_c, input) => {
      entered();
      await new Promise<void>((resolve) =>
        input.signal!.addEventListener('abort', () => resolve(), {
          once: true,
        }),
      );
      return {
        ...batch(BV1, 'video_metadata'),
        items: [{ ...item(BV1, 'video_metadata'), likes: 999 }],
      };
    });
    const originalTimeout = AbortSignal.timeout;
    const spy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) =>
        originalTimeout.call(
          AbortSignal,
          ms === 10000 && mode === 'deadline' ? 30 : ms,
        ),
      );
    const { service } = setup({ video });
    try {
      await connect(service);
      const pending = service.sync('1').catch((e: unknown) => e);
      await waiting;
      if (mode === 'cancel')
        await service.cancel('1', (await service.status('1')).requestId);
      const result = await pending;
      if (mode === 'cancel') {
        expect(result).toMatchObject({ code: 'cancelled' });
        expect((await service.status('1')).total).toBe(0);
      } else {
        expect(result).toMatchObject({
          total: 1,
          lastRun: { partial: true, errorCode: 'timeout' },
        });
        expect((await service.status('1')).recent[0].likes).toBeNull();
      }
    } finally {
      spy.mockRestore();
      service.stop();
    }
  },
);

it('keeps the detail publication date when the same batch also contains a conflicting search date', async () => {
  const { service } = setup({
    video: async () => ({
      ...batch(BV1, 'video_metadata'),
      items: [
        {
          ...item(BV1, 'video_metadata'),
          publishedAt: '2026-10-01T10:00:00Z',
          publishedAtPrecision: 'minute',
        },
      ],
    }),
    search: async () => ({
      ...batch(),
      items: [
        {
          ...item(),
          publishedAt: '2026-10-02T10:00:00Z',
          publishedAtPrecision: 'minute',
        },
      ],
    }),
  });
  await connect(service, { bvids: BV1 });
  const result = await service.sync('1');
  expect(result.recent[0]).toMatchObject({
    publishedAt: '2026-10-01T10:00:00Z',
    publishedAtPrecision: 'minute',
  });
});

it('does not lose a known publication when deduplicating enrichment candidates across search terms', async () => {
  const older = Array.from({ length: 20 }, (_, i) => ({
    ...item(`BV${String(i).padStart(10, '0')}`),
    publishedAt: '2026-10-01T00:00:00Z',
    publishedAtPrecision: 'minute' as const,
  }));
  const { service, adapter } = setup({
    search: async (_config, input) => ({
      ...batch(),
      items:
        input.query === 'first'
          ? [
              {
                ...item(),
                publishedAt: '2026-10-17T00:00:00Z',
                publishedAtPrecision: 'minute',
              },
              ...older.slice(0, 19),
            ]
          : [item(), older[19]],
    }),
  });
  await connect(service, { terms: ['first', 'second'] });
  await service.sync('1');
  expect(adapter.video).toHaveBeenCalledTimes(20);
  expect(adapter.video.mock.calls[0][1].bvid).toBe(BV1);
});

it.each(['null', 'failed', 'legacy'] as const)(
  'preserves per-metric freshness across a %s detail refresh',
  async (mode) => {
    const oldAt = '2020-01-01T00:00:00Z';
    const freshAt = '2026-10-17T12:00:00Z';
    const video = vi.fn<BilibiliAdapter['video']>().mockResolvedValue({
      collectedAt: oldAt,
      items: [
        {
          ...item(BV1, 'video_metadata'),
          views: 30000,
          likes: 500,
          comments: 5,
        },
      ],
    });
    const search = vi
      .fn<BilibiliAdapter['search']>()
      .mockResolvedValue({ collectedAt: oldAt, items: [item()] });
    const { service, rows } = setup({ search, video });
    await connect(service);
    await service.sync('1');
    if (mode === 'legacy') {
      const state = rows.get('bilibili:1')!.payload as {
        videos: Record<string, { metricFetchedAt?: unknown }>;
      };
      delete state.videos[BV1].metricFetchedAt;
    }
    search.mockResolvedValue({
      collectedAt: freshAt,
      items: [{ ...item(), views: 30001 }],
    });
    if (mode === 'failed')
      video.mockRejectedValue(new BilibiliError('security_block'));
    else
      video.mockResolvedValue({
        collectedAt: freshAt,
        items: [{ ...item(BV1, 'video_metadata'), views: null, comments: 0 }],
      });
    const result = await service.sync('1');
    expect(result.recent[0]).toMatchObject({
      views: 30001,
      likes: 500,
      comments: mode === 'failed' ? 5 : 0,
      metricFetchedAt: {
        views: freshAt,
        likes: oldAt,
        comments: mode === 'failed' ? oldAt : freshAt,
      },
    });
    const inputs = await contentInputs({ bilibili: service }, '1');
    expect(
      inputs.find((input) => input.source === 'bilibili')?.items[0].metrics,
    ).toEqual({
      views: { value: 30001, at: freshAt },
      likes: { value: 500, at: oldAt },
    });
    const settings = {
      on: (id: string) => id === 'bilibili-likes',
      value: (_id: string, key: string) => (key === 'minCount' ? 100 : 7),
    };
    expect(contentSignals(inputs, settings, Date.parse(freshAt))).toEqual([]);
    await service.sync('1');
    expect(
      (await contentInputs({ bilibili: service }, '1')).find(
        (input) => input.source === 'bilibili',
      )?.items[0].metrics.likes?.at,
    ).toBe(oldAt);
  },
);

// Daily reading and a busy collector (2026-11-02).
const later = (minutes: number) => Date.now() + minutes * 60000;
it('turns daily reading on by default and switches it without a new revision', async () => {
  const { service } = setup();
  const first = await connect(service);
  expect(first).toMatchObject({ autoSync: true, automatic: true });
  expect(Date.parse(first.nextSyncAt!)).toBeLessThanOrEqual(Date.now());
  const off = await connect(service, {
    revision: first.revision,
    autoSync: false,
  });
  expect(off).toMatchObject({
    autoSync: false,
    nextSyncAt: null,
    revision: first.revision,
  });
  // Changing the terms keeps the switch.
  const changed = await connect(service, {
    revision: first.revision,
    terms: 'NocoBase,Appsmith',
  });
  expect(changed.autoSync).toBe(false);
  expect(changed.revision).not.toBe(first.revision);
});
it('queues a read the busy collector turned away, retries it three times without counting a failure, then waits for the next day', async () => {
  const search = vi.fn(async () => {
    throw new BilibiliError('busy');
  });
  const { service } = setup({ search });
  await connect(service);
  const queued = await service.sync('1');
  expect(queued).toMatchObject({
    queued: { retries: 1 },
    lastRun: null,
    failures: 0,
    pausedCode: null,
  });
  expect(Date.parse(queued.queued!.retryAt)).toBeGreaterThan(later(9));
  expect(queued.nextSyncAt).toBe(queued.queued!.retryAt);
  // The tick leaves it alone until the retry is due.
  await service.tick();
  expect(search).toHaveBeenCalledTimes(1);
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    for (const retries of [2, 3]) {
      vi.setSystemTime(later(11));
      await service.tick();
      expect((await service.status('1')).queued?.retries).toBe(retries);
    }
    vi.setSystemTime(later(11));
    await service.tick();
    const done = await service.status('1');
    expect(search).toHaveBeenCalledTimes(4);
    expect(done).toMatchObject({
      queued: null,
      failures: 0,
      pausedCode: null,
      lastRun: { ok: false, errorCode: 'busy' },
    });
    // The next attempt is the next day's read, not another retry.
    expect(done.nextSyncAt!.slice(0, 10)).not.toBe(done.lastRun!.at.slice(0, 10));
  } finally {
    vi.useRealTimers();
  }
});
it('pauses daily reading after three reads in a row got nothing through, and a read that gets through resumes it', async () => {
  const search = vi.fn(async () => {
    throw new BilibiliError('collector_unreachable');
  });
  const { service } = setup({ search });
  await connect(service);
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    for (const failures of [1, 2]) {
      const failed = await service.sync('1');
      expect(failed).toMatchObject({ failures, pausedCode: null });
      // Not a refusal by Bilibili: the shared backoff tries again the same day.
      expect(Date.parse(failed.nextSyncAt!)).toBeLessThan(later(70));
      vi.setSystemTime(later(70));
    }
    const paused = await service.sync('1');
    expect(paused).toMatchObject({
      failures: 3,
      pausedCode: 'collector_unreachable',
      nextSyncAt: null,
      autoSync: true,
    });
    vi.setSystemTime(later(24 * 60));
    await service.tick();
    expect(search).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
  search.mockImplementation(async () => batch());
  expect(await service.sync('1')).toMatchObject({
    failures: 0,
    pausedCode: null,
    lastRun: { ok: true },
  });
});
it('waits for the next day after Bilibili refuses a read', async () => {
  const { service } = setup({
    search: async () => {
      throw new BilibiliError('security_block');
    },
  });
  await connect(service);
  const refused = await service.sync('1');
  expect(refused.failures).toBe(1);
  expect(refused.nextSyncAt!.slice(0, 10)).not.toBe(
    refused.lastRun!.at.slice(0, 10),
  );
});
it('reads each connected project once a day from the tick and skips one switched off', async () => {
  const search = vi.fn(async () => batch());
  const { service, host } = setup({ search });
  host.projectIds.mockResolvedValue(['1', '2']);
  await connect(service);
  const other = await connect(service, {}, '2');
  await connect(service, { revision: other.revision, autoSync: false }, '2');
  await service.tick();
  expect(search).toHaveBeenCalledTimes(1);
  expect((await service.status('1')).lastRun?.ok).toBe(true);
  expect((await service.status('2')).lastRun).toBeNull();
  // Read today already.
  await service.tick();
  expect(search).toHaveBeenCalledTimes(1);
});
it('clearing the saved videos pauses daily reading and forgets a queued retry', async () => {
  const search = vi.fn(async () => batch());
  const { service } = setup({ search });
  await connect(service);
  await service.sync('1');
  search.mockRejectedValueOnce(new BilibiliError('busy'));
  const queued = await service.sync('1');
  expect(queued.queued).not.toBeNull();
  const cleared = await service.clear('1', queued.revision);
  expect(cleared).toMatchObject({ autoSync: false, queued: null, total: 0 });
});
it('reports when recording started and the earliest find', async () => {
  const { service } = setup();
  await connect(service);
  const read = await service.sync('1');
  expect(read.recordingSince).toBe(read.recent[0]?.firstSeenAt);
});
