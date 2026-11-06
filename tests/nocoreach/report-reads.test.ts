// @vitest-environment node
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterEach, expect, it, vi } from 'vitest';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { DataViews } from '../../server/nocoreach/data-views.js';
import { SearchIndex } from '../../server/nocoreach/search-index.js';
import { readsFresh } from '../../server/nocoreach/google-report-cache.js';

vi.mock('../../server/nocoreach/policy.js', async (original) => ({
  ...(await original<typeof import('../../server/nocoreach/policy.js')>()),
  requireAccess: async () => undefined,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const DAY = 86400000;
async function fixture() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-10-20T09:00:00Z');
  const testDb = await createNocoReachTestDatabase('fresh');
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  return { db, plugin: { db } as never };
}
const settled = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 20));
};

it('remembers across a restart who opened a project lately, for three days', async () => {
  const { plugin } = await fixture();
  const views = new DataViews(plugin);
  expect(await views.recentlyRead('1')).toBe(false);
  views.noteRead('1');
  await settled();
  const restarted = new DataViews(plugin);
  expect(await restarted.recentlyRead('1')).toBe(true);
  expect(await restarted.recentlyRead('2')).toBe(false);
  vi.setSystemTime(Date.now() + 3 * DAY - 1);
  expect(await new DataViews(plugin).recentlyRead('1')).toBe(true);
  vi.setSystemTime(Date.now() + 1);
  expect(await new DataViews(plugin).recentlyRead('1')).toBe(false);
});

it('counts a project just connected as read, so its first open does not wait', async () => {
  const { plugin } = await fixture();
  const views = new DataViews(plugin);
  expect(await views.recentlyRead('1', '2026-10-19T09:00:00Z')).toBe(true);
  expect(await views.recentlyRead('1', '2026-10-01T09:00:00Z')).toBe(false);
  expect(await views.recentlyRead('1', null)).toBe(false);
});

it('saves the time at most hourly, and a refused write leaves the memory copy working', async () => {
  const { db, plugin } = await fixture();
  const views = new DataViews(plugin);
  const repository = db.getRepository('nrSnapshots');
  const create = vi.spyOn(repository, 'create');
  vi.spyOn(db, 'getRepository').mockReturnValue(repository);
  views.noteRead('1');
  await settled();
  views.noteRead('1');
  await settled();
  expect(create).toHaveBeenCalledTimes(1);
  create.mockRejectedValue(new Error('This is a demo.'));
  views.noteRead('2');
  await settled();
  expect(await views.recentlyRead('2')).toBe(true);
});

it('counts only a person opening Search performance or Traffic, not internal reads or other actions', async () => {
  const { plugin } = await fixture();
  const views = new DataViews(plugin);
  const actions: Record<
    string,
    (ctx: unknown, next: () => Promise<void>) => Promise<void>
  > = {};
  (views as unknown as { p: unknown }).p = {
    ...(plugin as object),
    project: async () => ({}),
    app: {
      resourceManager: {
        define: (d: { actions: typeof actions }) =>
          Object.assign(actions, d.actions),
      },
      acl: { allow() {} },
    },
  };
  const search = vi.spyOn(views, 'search').mockResolvedValue({} as never);
  vi.spyOn(views, 'website').mockResolvedValue({} as never);
  vi.spyOn(views, 'ranks').mockResolvedValue({} as never);
  views.register();
  const request = (projectId: string) => ({
    action: { params: { values: { projectId } } },
  });
  await actions.ranks(request('1'), async () => {});
  await views.search('1', {} as never);
  expect(search).toHaveBeenCalledTimes(1);
  expect(views.readAt.has('1')).toBe(false);
  await actions.search(request('1'), async () => {});
  expect(views.readAt.has('1')).toBe(true);
  await actions.website(request('2'), async () => {});
  expect(views.readAt.has('2')).toBe(true);
});

it('answers from a saved copy only for a page that says it shows one; API keys and scripts wait for a new report', async () => {
  const { plugin } = await fixture();
  const actions: Record<
    string,
    (ctx: unknown, next: () => Promise<void>) => Promise<void>
  > = {};
  const host = {
    ...(plugin as object),
    project: async () => ({}),
    app: {
      resourceManager: {
        define: (d: { actions: typeof actions }) =>
          Object.assign(actions, d.actions),
      },
      acl: { allow() {} },
    },
  };
  const views = new DataViews(plugin);
  (views as unknown as { p: unknown }).p = host;
  const seen: boolean[] = [];
  vi.spyOn(views, 'search').mockImplementation(async () => {
    seen.push(readsFresh());
    return {} as never;
  });
  views.register();
  const request = (values: Record<string, unknown>) => ({
    action: { params: { values: { projectId: '1', ...values } } },
  });
  await actions.search(request({ acceptSaved: true }), async () => {});
  await actions.search(request({}), async () => {});
  expect(seen).toEqual([false, true]);
  const index = new SearchIndex(host as never);
  vi.spyOn(index, 'sitemaps').mockImplementation(async () => {
    seen.push(readsFresh());
    return {} as never;
  });
  index.register();
  await actions.sitemaps(request({ acceptSaved: true }), async () => {});
  await actions.sitemaps(request({}), async () => {});
  expect(seen.slice(2)).toEqual([false, true]);
});

it('remembers the ranges chosen on a page across a restart, the latest two within six days', async () => {
  const { plugin } = await fixture();
  const views = new DataViews(plugin);
  views.noteView('1', 'website', '90');
  await settled();
  vi.setSystemTime(Date.now() + 1000);
  views.noteView('1', 'website', 'all');
  views.noteView('1', 'website', 'custom');
  views.noteView('1', 'website', '28');
  views.noteView('1', 'pages', '28');
  await settled();
  vi.setSystemTime(Date.now() + 1000);
  views.noteView('1', 'website', '7');
  await settled();
  const restarted = new DataViews(plugin);
  expect(await restarted.recentViews('1', 'website')).toEqual(['7', 'all']);
  expect(await restarted.recentViews('1', 'pages')).toEqual(['28']);
  expect(await restarted.recentViews('1', 'search')).toEqual([]);
  expect(await restarted.recentlyRead('1')).toBe(false);
  vi.setSystemTime(Date.now() + 6 * DAY);
  expect(await new DataViews(plugin).recentViews('1', 'website')).toEqual([]);
});

it('keeps the saved ranges when a restarted instance saves a read time first', async () => {
  const { plugin } = await fixture();
  new DataViews(plugin).noteView('1', 'search', '90');
  await settled();
  new DataViews(plugin).noteRead('1');
  await settled();
  expect(await new DataViews(plugin).recentViews('1', 'search')).toEqual(['90']);
});
