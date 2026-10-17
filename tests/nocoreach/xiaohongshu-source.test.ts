// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { XiaohongshuSource } from '../../server/nocoreach/xiaohongshu-source';
import {
  parseBrowserCollectors,
  type BrowserCollectorConfig,
} from '../../server/nocoreach/browser-collector-config';
import type { CollectorResolver } from '../../server/nocoreach/collector-connections';
import {
  HttpXiaohongshuAdapter,
  normalizeSearchRows,
  XiaohongshuError,
  type XiaohongshuAdapter,
} from '../../server/nocoreach/xiaohongshu-adapter';
import {
  LegacyCache,
  legacyContext,
} from '../../server/nocoreach/legacy/context';
import {
  LegacyResources,
  type LegacyApp,
} from '../../server/nocoreach/legacy/app';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles';

const config: BrowserCollectorConfig = {
  id: 'desktop',
  name: 'Team browser',
  platforms: ['xiaohongshu'],
  url: 'https://collector.example/xhs',
  token: 'test-only-collector-token-32-characters',
  projectIds: ['1'],
};
const row = {
  title: '产品介绍',
  url: 'https://www.xiaohongshu.com/search_result/69a123456789abcdef012345?xsec_token=note-link-only&cookie=drop',
  likes: '1.2万',
  published_at: '2026-03-01',
  author: 'not retained',
};
const now = () => new Date().toISOString();
function fixture(adapter?: XiaohongshuAdapter) {
  const rows = new Map<string, { id: string; payload: unknown }>();
  let counter = 0;
  const repo = {
    async findOne({ filter }: { filter: { key: string } }) {
      const record = rows.get(filter.key);
      return record
        ? { id: record.id, get: () => structuredClone(record.payload) }
        : null;
    },
    async create({ values }: { values: { key: string; payload: unknown } }) {
      rows.set(values.key, {
        id: String(++counter),
        payload: structuredClone(values.payload),
      });
    },
    async update({
      filterByTk,
      values,
    }: {
      filterByTk: string;
      values: { payload: unknown };
    }) {
      for (const entry of rows.values())
        if (entry.id === filterByTk)
          entry.payload = structuredClone(values.payload);
    },
  };
  const db = {
    getRepository: (name: string) =>
      name === 'users'
        ? {
            findOne: async ({ filterByTk }: { filterByTk: string }) => ({
              id: filterByTk,
              roles: filterByTk === '2' ? [{ name: 'nr.member' }] : [],
            }),
          }
        : repo,
    sequelize: {
      transaction: async <T>(fn: (t: object) => Promise<T>) => fn({}),
      query: async () => undefined,
    },
  };
  rows.set('nr-members', {
    id: 'members',
    payload: { users: { '2': 'member' } },
  });
  const resources = new LegacyResources();
  const plugin = {
    collectors: {
      allowed: vi.fn<CollectorResolver['allowed']>((id) =>
        id === '1' ? [config] : [],
      ),
    },
    db,
    project: vi.fn(async (id: string) => {
      if (!['1', '2'].includes(id))
        throw Object.assign(new Error('missing'), { status: 404 });
    }),
    app: {
      resourceManager: { define: resources.define.bind(resources) },
      acl: { allow: resources.allow.bind(resources) },
    },
    network: { fetchCollector: vi.fn() },
  };
  const goodAdapter: XiaohongshuAdapter = adapter ?? {
    health: vi.fn(async () => ({
      toolInstalled: true,
      browser: 'unchecked',
      login: 'unchecked',
    })),
    search: vi.fn(async () => ({
      collectedAt: now(),
      notes: normalizeSearchRows([row]),
    })),
  };
  const source = new XiaohongshuSource(
    plugin as unknown as ConstructorParameters<typeof XiaohongshuSource>[0],
    goodAdapter,
  );
  source.register();
  const call = async (action: string, values: object = {}, actor = '1') => {
    const ctx = legacyContext({
      resource: 'nrXiaohongshu',
      action,
      method: 'POST',
      query: {},
      body: { projectId: '1', ...values },
      user: actor ? { id: actor } : null,
      roles: actor === '1' ? ['root'] : [],
      header: () => undefined,
      cookie: () => undefined,
      app: { ...plugin.app, db } as unknown as LegacyApp,
      cache: new LegacyCache(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    });
    await resources.action('nrXiaohongshu', action)!(ctx, async () => {});
    return ctx.body as Record<string, unknown>;
  };
  return {
    source,
    call,
    rows,
    repo,
    db,
    collectors: plugin.collectors,
    adapter: goodAdapter,
  };
}
const connect = (
  f: ReturnType<typeof fixture>,
  revision = 0,
  query = 'NocoBase',
) =>
  f.call('connect', {
    collectorId: 'desktop',
    query,
    revision,
  });
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Xiaohongshu data and deployment contract', () => {
  it('keeps inferred dates separate and drops author/untrusted query fields', () => {
    const [note] = normalizeSearchRows([row]);
    expect(note).toMatchObject({
      likes: null,
      likesText: '1.2万',
      publishedAt: null,
      estimatedPublishedAt: '2026-03-01',
    });
    expect(note.url).toContain('xsec_token=note-link-only');
    expect(note.url).not.toContain('cookie');
    expect(JSON.stringify(note)).not.toContain('not retained');
    expect(
      normalizeSearchRows([
        { ...row, likes: '12', published_at: '2026-02-30' },
      ])[0],
    ).toMatchObject({ likes: 12, estimatedPublishedAt: null });
  });
  it('never turns missing or ambiguous upstream zero counts into real zero', () => {
    for (const likes of [null, undefined, '', 0, '0'])
      expect(normalizeSearchRows([{ ...row, likes }])[0]).toMatchObject({
        likes: null,
        likesText: null,
      });
  });
  it('rejects wrong schemas, too many rows and foreign/credential URLs', () => {
    for (const value of [
      {},
      Array(21).fill(row),
      [{ ...row, likes: -1 }],
      [{ ...row, title: '' }],
      [
        {
          ...row,
          url: 'https://evil.example/explore/69a123456789abcdef012345',
        },
      ],
      [
        {
          ...row,
          url: 'https://user:pass@www.xiaohongshu.com/explore/69a123456789abcdef012345',
        },
      ],
    ])
      expect(() => normalizeSearchRows(value)).toThrow(XiaohongshuError);
    expect(() => normalizeSearchRows([])).toThrow(
      expect.objectContaining({ code: 'no_results' }),
    );
  });
  it('accepts only secure deployment URLs and unique IDs', () => {
    expect(parseBrowserCollectors([config])).toHaveLength(1);
    expect(
      parseBrowserCollectors([{ ...config, url: 'http://127.0.0.1:18061' }]),
    ).toHaveLength(1);
    for (const changed of [
      { url: 'http://example.com' },
      { url: 'http://localhost:18061' },
      { url: 'https://u:p@example.com' },
      { url: 'https://example.com?token=secret' },
      { token: 'short' },
      { projectIds: [] },
    ])
      expect(() =>
        parseBrowserCollectors([{ ...config, ...changed }]),
      ).toThrow();
    expect(() => parseBrowserCollectors([config, config])).toThrow();
  });
});

it('enforces anonymous/member/admin and scoped collector selection', async () => {
  const f = fixture();
  await expect(f.call('status', {}, '')).rejects.toMatchObject({ status: 401 });
  await expect(f.call('status', {}, '3')).rejects.toMatchObject({
    status: 403,
  });
  expect(await f.call('view', {}, '2')).toMatchObject({
    connected: false,
    notes: [],
  });
  for (const action of ['connect', 'test', 'search', 'cancel', 'disconnect'])
    await expect(f.call(action, {}, '2')).rejects.toMatchObject({
      status: 403,
    });
  const status = await f.call('status', { projectId: '2' });
  expect(status.collectors).toEqual([]);
  expect(f.collectors.allowed).toHaveBeenCalledWith('2', 'xiaohongshu');
  await expect(
    f.call('connect', {
      collectorId: 'desktop',
      query: 'test',
      revision: 0,
      projectId: '2',
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(f.call('status', { projectId: '999' })).rejects.toMatchObject({
    status: 404,
  });
  await expect(f.call('status', { projectId: '../1' })).rejects.toMatchObject({
    status: 400,
  });
  expect(JSON.stringify(await f.call('status'))).not.toContain(config.token);
  expect(JSON.stringify(await f.call('status'))).not.toContain(config.url);
});

it('health and connection do not claim platform verification; search persists real results', async () => {
  const f = fixture();
  expect(await f.call('test', { collectorId: 'desktop' })).toMatchObject({
    browser: 'unchecked',
    login: 'unchecked',
  });
  expect(await connect(f)).toMatchObject({ connected: true, verifiedAt: null });
  const result = await f.call('search', { revision: 1 });
  expect(result).toMatchObject({
    total: 1,
    lastRun: { ok: true, count: 1 },
    running: null,
  });
  expect(result.verifiedAt).toBeTypeOf('string');
  expect(await f.call('view', {}, '2')).toMatchObject({ total: 1 });
  expect(JSON.stringify([...f.rows.values()])).not.toContain('not retained');
  expect(JSON.stringify([...f.rows.values()])).not.toContain(config.token);
  expect(await f.call('disconnect', { revision: 1 })).toMatchObject({
    connected: false,
    total: 1,
  });
  await expect(f.call('search', { revision: 2 })).rejects.toMatchObject({
    status: 409,
  });
});

it('validates query and expected revision', async () => {
  const f = fixture();
  for (const query of ['', 'x', '--help', 'abc\nxyz', 'x'.repeat(61)])
    await expect(connect(f, 0, query)).rejects.toMatchObject({ status: 400 });
  await connect(f);
  await expect(connect(f, 0)).rejects.toMatchObject({ status: 409 });
});

it('failed collection preserves old successful notes and records a safe error code', async () => {
  const f = fixture();
  await connect(f);
  await f.call('search', { revision: 1 });
  vi.mocked(f.adapter.search).mockRejectedValueOnce(
    new XiaohongshuError('login_required'),
  );
  await expect(f.call('search', { revision: 1 })).rejects.toMatchObject({
    code: 'login_required',
  });
  expect(await f.call('view')).toMatchObject({
    total: 1,
    lastRun: { ok: false, errorCode: 'login_required' },
  });
});

it('records the HTTP deadline as timeout, not user cancellation, and retains old notes', async () => {
  const deadline = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockReturnValue(deadline.signal);
  let stall = false;
  const fetchCollector = vi.fn(
    async (_projectId: string, _url: string | URL, init: RequestInit) => {
      if (stall)
        return new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener(
            'abort',
            () => reject(init.signal!.reason),
            {
              once: true,
            },
          );
        });
      return Response.json({
        ...JSON.parse(String(init.body)),
        ok: true,
        kind: 'search',
        collectedAt: now(),
        items: [row],
      });
    },
  );
  const f = fixture(new HttpXiaohongshuAdapter({ fetchCollector }));
  await connect(f);
  const previous = await f.call('search', { revision: 1 });
  stall = true;
  const pending = f.call('search', { revision: 1 });
  const rejected = pending.catch((error: unknown) => error);
  await vi.waitFor(() => expect(fetchCollector).toHaveBeenCalledTimes(2));
  expect(timeout).toHaveBeenLastCalledWith(80000);
  deadline.abort(new DOMException('Deadline expired', 'TimeoutError'));
  expect(await rejected).toMatchObject({ code: 'timeout', status: 504 });
  expect(await f.call('view')).toMatchObject({
    total: 1,
    notes: previous.notes,
    verifiedAt: previous.verifiedAt,
    running: null,
    lastRun: { ok: false, errorCode: 'timeout' },
  });
});

it('rejects concurrent searches and discards in-flight data when disconnected', async () => {
  const f = fixture();
  await connect(f);
  let finish!: (v: Awaited<ReturnType<XiaohongshuAdapter['search']>>) => void;
  vi.mocked(f.adapter.search).mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const pending = f.call('search', { revision: 1 });
  await vi.waitFor(() => expect(f.adapter.search).toHaveBeenCalled());
  await expect(f.call('search', { revision: 1 })).rejects.toMatchObject({
    code: 'busy',
  });
  await f.call('disconnect', { revision: 1 });
  finish({ collectedAt: now(), notes: normalizeSearchRows([row]) });
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  expect(await f.call('view')).toMatchObject({
    connected: false,
    total: 0,
    lastRun: null,
  });
});

it('cancellation is tied to the current project and request ID', async () => {
  const f = fixture();
  await connect(f);
  vi.mocked(f.adapter.search).mockImplementationOnce(
    (_config, request) =>
      new Promise((_resolve, reject) => {
        request.signal!.addEventListener(
          'abort',
          () => reject(new XiaohongshuError('cancelled')),
          { once: true },
        );
      }),
  );
  const pending = f.call('search', { revision: 1 });
  await vi.waitFor(() => expect(f.adapter.search).toHaveBeenCalled());
  const status = await f.call('status');
  await expect(f.call('cancel', { requestId: 'wrong' })).rejects.toMatchObject({
    status: 409,
  });
  await f.call('cancel', { requestId: status.running });
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  expect(await f.call('status')).toMatchObject({
    running: null,
    lastRun: { ok: false, errorCode: 'cancelled' },
  });
});

describe('HTTP adapter response binding', () => {
  const input = { projectId: '1', requestId: randomUUID(), query: 'NocoBase' };
  const good = {
    protocolVersion: 1,
    platform: 'xiaohongshu',
    ...input,
    ok: true,
    kind: 'search',
    collectedAt: now(),
    items: [row],
  };
  it('binds request identity, strips transport secrets, and rejects malformed/stale success', async () => {
    const fetchCollector = vi.fn(async () => Response.json(good));
    const adapter = new HttpXiaohongshuAdapter({ fetchCollector });
    expect((await adapter.search(config, input)).notes).toHaveLength(1);
    const args = vi.mocked(fetchCollector).mock.calls[0] as unknown as [
      string,
      URL,
      RequestInit,
    ];
    expect(args[2]).toMatchObject({
      redirect: 'error',
      headers: { Authorization: `Bearer ${config.token}` },
    });
    for (const changes of [
      { requestId: randomUUID() },
      { projectId: '2' },
      { kind: 'health' },
      { collectedAt: '2020-01-01T00:00:00Z' },
      { items: 'bad' },
    ]) {
      fetchCollector.mockResolvedValueOnce(
        Response.json({ ...good, ...changes }),
      );
      await expect(adapter.search(config, input)).rejects.toMatchObject({
        code: 'invalid_response',
      });
    }
  });
  it('maps upstream failures and never leaks raw error text', async () => {
    const fetchCollector = vi.fn(async () => Response.json(good));
    const adapter = new HttpXiaohongshuAdapter({ fetchCollector });
    for (const [status, code] of [
      [401, 'collector_unauthorized'],
      [403, 'collector_unauthorized'],
      [409, 'busy'],
      [500, 'collector_unreachable'],
    ] as const) {
      fetchCollector.mockResolvedValueOnce(
        new Response('secret credentials', { status }),
      );
      await expect(adapter.search(config, input)).rejects.toMatchObject({
        code,
      });
    }
    fetchCollector.mockResolvedValueOnce(
      Response.json({
        ...good,
        ok: false,
        errorCode: 'security_block',
        message: 'secret',
      }),
    );
    await expect(adapter.search(config, input)).rejects.toMatchObject({
      code: 'security_block',
    });
    fetchCollector.mockRejectedValueOnce(
      Object.assign(new Error('secret'), { name: 'TimeoutError' }),
    );
    await expect(adapter.search(config, input)).rejects.toMatchObject({
      code: 'timeout',
    });
  });
});

it('only the explicitly configured collector boundary permits loopback HTTP', async () => {
  const network = new OutboundNetwork({
    resolve: () => undefined,
  } as unknown as ProxyProfiles);
  await expect(
    network.send(undefined, 'http://127.0.0.1:18061/health'),
  ).rejects.toMatchObject({ status: 400 });
  expect(() =>
    network.fetchCollector('1', 'http://remote.example/health', {}),
  ).toThrow();
  expect(() =>
    network.fetchCollector('wrong', 'https://remote.example/health', {}),
  ).toThrow();
  await network.close();
});

it('accepts cancellation while waiting for the save transaction and never persists that result', async () => {
  const f = fixture();
  await connect(f);
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(f.db.sequelize, 'query').mockImplementationOnce(async () => {
    entered();
    await gate;
  });
  const pending = f.call('search', { revision: 1 });
  const rejected = pending.catch((error: unknown) => error);
  await waiting;
  const status = await f.call('status');
  await f.call('cancel', { requestId: status.running });
  release();
  expect(await rejected).toMatchObject({ code: 'cancelled' });
  expect(await f.call('view')).toMatchObject({
    total: 0,
    verifiedAt: null,
    lastRun: { ok: false, errorCode: 'cancelled' },
  });
});
it('does not acknowledge cancellation after a result has entered the atomic save phase', async () => {
  const f = fixture();
  await connect(f);
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const update = f.repo.update.bind(f.repo);
  vi.spyOn(f.repo, 'update').mockImplementationOnce(async (input) => {
    entered();
    await gate;
    return update(input);
  });
  const pending = f.call('search', { revision: 1 });
  await waiting;
  const status = await f.call('status');
  await expect(
    f.call('cancel', { requestId: status.running }),
  ).rejects.toMatchObject({
    status: 409,
    message: '采集结果正在保存，已无法取消，请稍后查看结果。',
  });
  release();
  await pending;
  expect(await f.call('view')).toMatchObject({
    total: 1,
    lastRun: { ok: true },
  });
});
