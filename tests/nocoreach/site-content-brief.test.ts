// @vitest-environment node
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterEach, expect, it, vi } from 'vitest';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { SiteContent } from '../../server/nocoreach/site-content.js';
import { DataHealth } from '../../server/nocoreach/data-health.js';

afterEach(() => vi.useRealTimers());

async function fixture() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-11-08T06:00:00Z');
  const testDb = await createNocoReachTestDatabase();
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  // mutate takes a Postgres advisory lock; SQLite has none to take.
  const sequelize = db.sequelize as unknown as {
    query: (...a: unknown[]) => Promise<unknown>;
  };
  const query = sequelize.query.bind(sequelize);
  sequelize.query = async (sql: unknown, ...rest: unknown[]) =>
    String(sql).includes('pg_advisory_xact_lock') ? [] : query(sql, ...rest);
  const site = new SiteContent({ db });
  const page = (n: number, fetched: boolean) => ({
    url: `https://ex.com/p${n}`,
    type: 'docs',
    origin: 'https://ex.com',
    ...(fetched ? { fetchedAt: '2026-11-07T00:00:00Z' } : {}),
  });
  await db.getRepository('nrSnapshots').create({
    values: {
      key: 'site-content:1',
      payload: {
        sites: [{ origin: 'https://ex.com', confirmedAt: '2026-11-01' }],
        pages: [page(1, true), page(2, false), page(3, true)],
        refresh: { at: '2026-11-07T00:00:00Z', ok: true },
      },
    },
  });
  return { db, site, page };
}

it("keeps the sites, refresh and page counts while the state's row stays the same", async () => {
  const { site } = await fixture();
  const state = vi.spyOn(site, 'state');
  const brief = await site.brief('1');
  expect(brief).toEqual({
    sites: [{ origin: 'https://ex.com', confirmedAt: '2026-11-01' }],
    refresh: { at: '2026-11-07T00:00:00Z', ok: true },
    pages: 3,
    fetched: 2,
  });
  expect(Object.isFrozen(brief)).toBe(true);
  expect(await site.brief('1')).toBe(brief);
  expect(state).toHaveBeenCalledTimes(1);
  expect(await site.brief('2')).toBeNull();
});

it('reads the state again after a write, through mutate or any other', async () => {
  const { db, site, page } = await fixture();
  await site.brief('1');
  await site.mutate('1', (s: { pages: unknown[] }) => ({
    ...s,
    pages: [...s.pages, page(4, true)],
  }));
  expect((await site.brief('1'))?.pages).toBe(4);
  // A write outside mutate (an import) moves updatedAt.
  vi.setSystemTime('2026-11-08T06:01:00Z');
  await db.getRepository('nrSnapshots').update({
    filter: { key: 'site-content:1' },
    values: { payload: { sites: [], pages: [] } },
  });
  expect((await site.brief('1'))?.sites).toEqual([]);
  await db
    .getRepository('nrSnapshots')
    .destroy({ filter: { key: 'site-content:1' } });
  expect(await site.brief('1')).toBeNull();
});

it('gives the menu and Data health the site from the brief, not the whole state', async () => {
  const { site } = await fixture();
  const health = new DataHealth({
    siteContent: site,
    link: async () => null,
    env: () => null,
  });
  const state = vi.spyOn(site, 'state');
  expect((await health.connected('1')).site).toBe(true);
  expect((await health.connected('1')).site).toBe(true);
  // One read of the state for the first brief; the second poll reads none.
  expect(state).toHaveBeenCalledTimes(1);
  const item = (await health.list('1')).items.find(
    (i: { id: string }) => i.id === 'site',
  );
  expect(item.note).toMatch(/3/);
  expect(item.note).toMatch(/2/);
  expect(state).toHaveBeenCalledTimes(1);
});

it('reads a state with no pages, and reads it again after five minutes whatever its row', async () => {
  const { db, site } = await fixture();
  await db.getRepository('nrSnapshots').update({
    filter: { key: 'site-content:1' },
    values: { payload: { sites: [{ origin: 'https://ex.com' }] } },
  });
  expect(await site.brief('1')).toMatchObject({ pages: 0, fetched: 0 });
  const state = vi.spyOn(site, 'state');
  await site.brief('1');
  expect(state).not.toHaveBeenCalled();
  vi.setSystemTime(Date.now() + 5 * 60000 + 1);
  await site.brief('1');
  expect(state).toHaveBeenCalledTimes(1);
});
