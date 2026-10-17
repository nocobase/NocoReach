import { describe, expect, it, vi } from 'vitest';
import { YouTubeSource } from '../../server/nocoreach/youtube-source.js';
import {
  YouTubeError,
  type Video,
} from '../../server/nocoreach/youtube-provider.js';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';
import { DataHealth } from '../../server/nocoreach/data-health.js';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles.js';

const ID = 'Im69kzhpR3I';
const video = (id = ID): Video => ({
  id,
  url: `https://www.youtube.com/watch?v=${id}`,
  title: 'Video',
  description: '',
  channel: 'Author',
  publishedAt: '2026-10-10',
  views: 10,
  likes: null,
  comments: null,
  duration: 60,
  fetchedAt: new Date().toISOString(),
  provider: 'yt-dlp',
  transcript: { status: 'missing', language: null, text: '', truncated: false },
});
function setup() {
  const rows = new Map<string, { id: string; payload: unknown }>();
  const repo = {
    findOne: vi.fn(async ({ filter }: { filter: { key: string } }) => {
      const row = rows.get(filter.key);
      return row ? { id: row.id, get: () => row.payload } : null;
    }),
    update: vi.fn(
      async ({
        filterByTk,
        values,
      }: {
        filterByTk: string;
        values: { payload: unknown };
      }) => {
        rows.get(filterByTk)!.payload = values.payload;
      },
    ),
    create: vi.fn(
      async ({ values }: { values: { key: string; payload: unknown } }) => {
        rows.set(values.key, { id: values.key, payload: values.payload });
      },
    ),
  };
  const saved = new Map<string, Record<string, unknown>>();
  const wrap = (row: Record<string, unknown>) => ({
    ...row,
    get: (key: string) => row[key],
  });
  const videoRepo = {
    findOne: async ({ filterByTk }: { filterByTk: string }) =>
      saved.has(filterByTk) ? wrap(saved.get(filterByTk)!) : null,
    create: async ({ values }: { values: Record<string, unknown> }) => {
      saved.set(String(values.id), values);
    },
    update: async ({
      filterByTk,
      values,
    }: {
      filterByTk: string;
      values: Record<string, unknown>;
    }) => {
      saved.set(filterByTk, { ...saved.get(filterByTk), ...values });
    },
    count: async ({ filter }: { filter: { projectId: string } }) =>
      [...saved.values()].filter((row) => row.projectId === filter.projectId)
        .length,
    find: async ({
      filter,
      offset,
      limit,
    }: {
      filter: { projectId: string };
      offset: number;
      limit: number;
    }) =>
      [...saved.values()]
        .filter((row) => row.projectId === filter.projectId)
        .slice(offset, offset + limit)
        .map(wrap),
    destroy: async ({ filter }: { filter: { projectId: string } }) => {
      for (const [key, row] of saved)
        if (row.projectId === filter.projectId) saved.delete(key);
    },
  };
  const actions: Record<
    string,
    (ctx: unknown, next: () => Promise<void>) => Promise<void>
  > = {};
  const db = {
    transactionContext: () => undefined,
    getRepository: (name: string) =>
      name === 'nrYouTubeVideos'
        ? videoRepo
        : name === 'users'
          ? { findOne: async () => ({ id: 2, roles: [{ name: 'nr.member' }] }) }
          : repo,
    sequelize: {
      transaction: async (fn: (tx: object) => unknown) => fn({}),
      query: vi.fn(),
    },
  };
  const profiles = new ProxyProfiles({ all: () => ({}), set: vi.fn() });
  const network = new OutboundNetwork(profiles);
  const host = {
    collectors: { allowed: () => [] },
    db,
    network,
    project: vi.fn(async () => ({ id: '1' })),
    projectIds: vi.fn(async () => ['1', '2']),
    app: {
      resourceManager: {
        define: ({ actions: registered }: { actions: typeof actions }) =>
          Object.assign(actions, registered),
      },
      acl: { allow: vi.fn() },
      logger: { warn: vi.fn() },
    },
  };
  const reader = {
    search: vi.fn(async () => [ID]),
    video: vi.fn(async (id: string) => video(id)),
  };
  const source = new YouTubeSource(
    host as unknown as ConstructorParameters<typeof YouTubeSource>[0],
    reader,
  );
  const context = (
    action: string,
    values: object = {},
    role = 'root',
    authenticated = true,
  ) => ({
    auth: authenticated ? { user: { id: '1' } } : undefined,
    state: { currentRoles: [role] },
    db,
    action: {
      resourceName: 'nrYouTube',
      actionName: action,
      params: { values: { projectId: '1', ...values } },
    },
    set: vi.fn(),
    throw: (status: number, message: string) => {
      throw Object.assign(new Error(message), { status });
    },
    body: null,
  });
  return { source, reader, rows, repo, host, actions, context, network };
}
async function connect(s: ReturnType<typeof setup>, extra: object = {}) {
  await s.source.connect('1', { terms: 'NocoBase', ...extra });
  await s.source.settled('1');
  return s.source.status('1');
}

describe('YouTube source lifecycle', () => {
  it('passes project scope and distinct request IDs for every search and video', async () => {
    const s = setup();
    await connect(s);
    const search = s.reader.search.mock.calls[0] as unknown as [
      string,
      AbortSignal,
      { projectId: string; requestId: string },
    ];
    const detail = s.reader.video.mock.calls[0] as unknown as [
      string,
      AbortSignal,
      { projectId: string; requestId: string },
    ];
    expect(search[2]).toEqual({
      projectId: '1',
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(detail[2].projectId).toBe('1');
    expect(detail[2].requestId).not.toBe(search[2].requestId);
  });
  it('uses Collector by default and preserves existing data when migration config is missing', async () => {
    const s = setup();
    const original = await connect(s, { autoSync: true });
    const fetch = vi.spyOn(s.network, 'fetchCollector');
    const production = new YouTubeSource(
      s.host as unknown as ConstructorParameters<typeof YouTubeSource>[0],
    );
    await production.sync('1');
    await production.settled('1');
    const status = await production.status('1');
    expect(status.videos).toEqual(original.videos);
    expect(status.lastSync).toMatchObject({
      ok: false,
      code: 'collector_not_configured',
      needsAttention: true,
    });
    expect(status.nextSyncAt).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('remains unconnected until an actual read succeeds, supports empty results, defaults to manual', async () => {
    const s = setup();
    let resolve!: (v: string[]) => void;
    s.reader.search.mockImplementationOnce(
      () => new Promise((r) => (resolve = r)),
    );
    const first = await s.source.connect('1', { terms: 'NocoBase' });
    expect(first).toMatchObject({
      configured: true,
      connected: false,
      syncing: true,
      autoSync: false,
    });
    resolve([]);
    await s.source.settled('1');
    expect(await s.source.status('1')).toMatchObject({
      connected: true,
      total: 0,
      syncing: false,
      analyticsAvailable: false,
    });
    await s.source.tick();
    expect(s.reader.search).toHaveBeenCalledTimes(1);
  });
  it('records real results, provenance, caption failures, and optional daily schedule', async () => {
    const s = setup();
    s.reader.video.mockResolvedValue({
      ...video(),
      transcript: {
        status: 'failed',
        text: '',
        language: 'en',
        truncated: false,
        errorCode: 'network_error',
      },
    });
    const st = await connect(s, { autoSync: true });
    expect(st).toMatchObject({
      connected: true,
      total: 1,
      autoSync: true,
      lastSync: { ok: true, errors: [expect.stringContaining('字幕')] },
    });
    expect(st.nextSyncAt).toBeTruthy();
    expect(st.videos[0]).toMatchObject({
      views: 10,
      likes: null,
      provider: 'yt-dlp',
    });
    await s.source.tick();
    expect(s.reader.search).toHaveBeenCalledTimes(1);
  });
  it('retains last good data on network failure and stops automatic retries on access denial', async () => {
    const s = setup();
    const original = await connect(s, { autoSync: true });
    s.reader.search.mockRejectedValueOnce(new YouTubeError('access_denied'));
    await s.source.sync('1');
    await s.source.settled('1');
    const failed = await s.source.status('1');
    expect(failed.videos).toEqual(original.videos);
    expect(failed.lastSync).toMatchObject({
      ok: false,
      code: 'access_denied',
      needsAttention: true,
    });
    expect(failed.nextSyncAt).toBeNull();
    await s.source.tick();
    expect(s.reader.search).toHaveBeenCalledTimes(2);
  });
  it('deduplicates repeated syncs and scopes concurrent projects through the network context', async () => {
    const s = setup();
    const projects: string[] = [];
    s.reader.search.mockImplementation(async () => {
      s.network.selected('youtube');
      projects.push('scoped');
      return [ID];
    });
    await Promise.all([
      s.source.connect('1', { terms: 'Project one' }),
      s.source.connect('2', { terms: 'Project two' }),
    ]);
    await Promise.all([s.source.settled('1'), s.source.settled('2')]);
    expect(projects).toHaveLength(2);
    let resolve!: (v: string[]) => void;
    s.reader.search.mockImplementationOnce(
      () => new Promise((r) => (resolve = r)),
    );
    const current = await s.source.sync('1');
    const repeated = await s.source.sync('1');
    expect(repeated.runId).toBe(current.runId);
    resolve([]);
    await s.source.settled('1');
    expect(s.reader.search).toHaveBeenCalledTimes(3);
  });
  it('matches cancellation to runId, stops work, pauses automation and retains prior data', async () => {
    const s = setup();
    const old = await connect(s, { autoSync: true });
    s.reader.search.mockImplementationOnce(
      (_term: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(new YouTubeError('cancelled')),
            { once: true },
          ),
        ),
    );
    const running = await s.source.sync('1');
    await expect(
      s.source.cancel('1', { runId: 'stale' }),
    ).rejects.toMatchObject({ code: 'config_changed' });
    const after = await s.source.cancel('1', { runId: running.runId });
    expect(after).toMatchObject({
      autoSync: false,
      syncing: false,
      lastSync: { code: 'cancelled' },
    });
    expect(after.videos).toEqual(old.videos);
    await s.source.tick();
    expect(s.reader.search).toHaveBeenCalledTimes(2);
  });
  it('rejects stale saves/disconnects and retains records when conditions change', async () => {
    const s = setup();
    const old = await connect(s);
    await expect(
      s.source.connect('1', { terms: 'Different' }),
    ).rejects.toMatchObject({ code: 'config_changed' });
    await expect(
      s.source.disconnect('1', { revision: 'old' }),
    ).rejects.toMatchObject({ code: 'config_changed' });
    s.reader.search.mockRejectedValueOnce(new YouTubeError('network_error'));
    await s.source.connect('1', { terms: 'Different', revision: old.revision });
    await s.source.settled('1');
    const changed = await s.source.status('1');
    expect(changed).toMatchObject({
      connected: false,
      total: 1,
      terms: ['Different'],
    });
    await s.source.disconnect('1', { revision: changed.revision });
    expect(await s.source.status('1')).toMatchObject({
      configured: false,
      connected: false,
      total: 1,
    });
  });
  it('retains old saved content and stops in-flight work on shutdown', async () => {
    const s = setup();
    await connect(s);
    const row = s.rows.get('youtube:1')!;
    row.payload = {
      ...(row.payload as object),
      fetchedAt: '2000-01-01T00:00:00Z',
    };
    expect(await s.source.status('1')).toMatchObject({
      connected: true,
      total: 1,
    });
    await s.source.stop();
    await expect(s.source.sync('1')).rejects.toMatchObject({
      code: 'cancelled',
    });
  });
  it.each(['tool_error', 'upstream_error', 'access_denied'] as const)(
    'pauses automatic retries for %s and reports the same in data health',
    async (code) => {
      const s = setup();
      await connect(s, { autoSync: true });
      s.reader.search.mockRejectedValueOnce(new YouTubeError(code));
      await s.source.sync('1');
      await s.source.settled('1');
      const failed = await s.source.status('1');
      expect(failed.lastSync).toMatchObject({ code, needsAttention: true });
      expect(failed.nextSyncAt).toBeNull();
      const health = await new DataHealth({
        youtube: s.source,
        link: async () => null,
        env: () => '',
      }).list('1');
      expect(health.items[0].message).toContain('请手动重试');
      expect(health.items[0].message).not.toContain('将自动重试');
      await s.source.tick();
      expect(s.reader.search).toHaveBeenCalledTimes(2);
    },
  );
  it('re-reads a terminal result when an in-flight status captured a stale snapshot', async () => {
    const s = setup();
    let complete!: (v: string[]) => void;
    s.reader.search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await s.source.connect('1', { terms: 'NocoBase' });
    const payload = structuredClone(s.rows.get('youtube:1')!.payload);
    let release!: () => void;
    s.repo.findOne.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { id: 'youtube:1', get: () => payload };
    });
    const pending = s.source.status('1');
    complete([]);
    await s.source.settled('1');
    release();
    expect(await pending).toMatchObject({
      syncing: false,
      connected: true,
      lastSync: { ok: true },
    });
  });
  it('prevents a disconnect and initial sync state read from launching detached work', async () => {
    const s = setup();
    const old = await connect(s);
    const payload = structuredClone(s.rows.get('youtube:1')!.payload);
    let release!: () => void;
    s.repo.findOne.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { id: 'youtube:1', get: () => payload };
    });
    const syncing = s.source.sync('1');
    const disconnecting = s.source.disconnect('1', { revision: old.revision });
    await Promise.resolve();
    await expect(s.source.sync('1')).rejects.toMatchObject({
      code: 'config_changed',
    });
    release();
    await Promise.all([syncing, disconnecting]);
    expect(await s.source.status('1')).toMatchObject({
      configured: false,
      syncing: false,
    });
    expect(s.reader.search).toHaveBeenCalledTimes(1);
  });
  it('registers actual handlers and enforces authentication/admin permissions', async () => {
    const s = setup();
    s.source.register();
    await expect(
      s.actions.status(s.context('status', {}, 'root', false), async () => {}),
    ).rejects.toMatchObject({ status: 401 });
    // Assigned NocoReach member; status remains available, management is admin-only.
    s.rows.set('nr-members', {
      id: 'nr-members',
      payload: { users: { '1': 'member' } },
    });
    for (const action of ['connect', 'sync', 'cancel', 'disconnect', 'clear'])
      await expect(
        s.actions[action](s.context(action, {}, 'member'), async () => {}),
      ).rejects.toMatchObject({ status: 403 });
    const ctx = s.context('status', {}, 'member');
    await s.actions.status(ctx, async () => {});
    expect(ctx.body).toMatchObject({ connected: false });
    const admin = s.context('connect', { terms: 'NocoBase' });
    await s.actions.connect(admin, async () => {});
    await s.source.settled('1');
    expect(await s.source.status('1')).toMatchObject({ connected: true });
  });
});
