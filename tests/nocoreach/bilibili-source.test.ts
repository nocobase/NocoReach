// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { BilibiliSource } from '../../server/nocoreach/bilibili-source';
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
  for (const value of [
    {},
    { terms: '' },
    { terms: 'a'.repeat(81) },
    { terms: 'one,two,three,four' },
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
        ? { findOne: async () => ({ id: 'member', roles: [] }) }
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
  expect(status.lastRun).toMatchObject({ found: 20, added: 20, capped: true });
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
    const service = new BilibiliSource(
      { ...fixture.host, network: { bind: vi.fn(), fetchCollector } } as never,
    ); // No adapter test double: use HttpBilibiliAdapter.
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
