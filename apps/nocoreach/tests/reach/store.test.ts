import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import migration from '../../database/main/migrations/202610090001_create_nocoreach';
import { ReachStore } from '../../server/providers/reach/store.cjs';
import { DataViews } from '../../server/providers/reach/domain/data-views.cjs';
import { Projects } from '../../server/providers/reach/domain/projects.cjs';
let database: DatabaseManager;
let store: InstanceType<typeof ReachStore>;
beforeEach(async () => {
  database = createDatabaseManager({
    connections: { main: sqlite({ filename: ':memory:' }) },
  });
  await database.connect();
  await migration.up({ builder: database.builder() } as never);
  store = new ReachStore(database, {}, {});
});
afterEach(async () => {
  await database.destroy();
});
describe('NocoReach native SQLite persistence', () => {
  it('selects enabled Google schedules without matching disabled or unset links', async () => {
    const links = store.repository('nrGoogleLinks');
    for (const [projectId, scheduleEnabled] of [
      ['enabled', true],
      ['disabled', false],
      ['unset', null],
    ]) {
      await links.create({ values: { projectId, scheduleEnabled } });
    }
    const matching = async (condition: unknown) =>
      (await links.find({ filter: { scheduleEnabled: condition } }))
        .map((row: { get: (key: string) => unknown }) => row.get('projectId'))
        .sort();
    expect(await matching(true)).toEqual(['enabled']);
    expect(await matching(false)).toEqual(['disabled']);
    expect(await matching({ $eq: true })).toEqual(['enabled']);
    expect(await matching({ $ne: true })).toEqual(['disabled']);
    expect(await matching({ $in: [true, false] })).toEqual([
      'disabled',
      'enabled',
    ]);
    expect(await matching({ $notIn: [false] })).toEqual(['enabled']);
    await links.update({
      filter: { scheduleEnabled: true },
      values: { scheduleEnabled: false },
    });
    expect(await matching(true)).toEqual([]);
  });

  it('creates isolated projects, rejects duplicate domains, and reads after writes', async () => {
    const projects = new Projects({ store });
    expect(await projects.list()).toEqual([]);
    const first = await projects.create({
      name: 'Test One',
      domain: 'one.example.com',
    });
    const second = await projects.create({
      name: 'Test Two',
      domain: 'two.example.com',
    });
    expect(first.id).not.toBe(second.id);
    expect(await projects.list()).toHaveLength(2);
    await expect(
      projects.create({ name: 'Duplicate', domain: 'one.example.com' }),
    ).rejects.toThrow('已有项目');
  });
  it('rolls back nested repository writes on transaction failure', async () => {
    const snapshots = store.repository('nrSnapshots');
    await expect(
      store.transaction(async () => {
        await snapshots.create({
          values: { key: 'transaction-test', payload: { x: 1 } },
        });
        throw Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      await snapshots.find({ filter: { key: 'transaction-test' } }),
    ).toEqual([]);
  });
  it('serializes simultaneous project creation', async () => {
    const projects = new Projects({ store });
    const rows = await Promise.all(
      ['one', 'two', 'three'].map((n) =>
        projects.create({ name: n, domain: `${n}.example.org` }),
      ),
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
  });
});

it('renders Search Console using native string date partitions with inclusive boundaries', async () => {
  const parts = store.repository('nrSyncPartitions');
  for (const date of ['2026-08-31', '2026-09-01', '2026-09-07', '2026-09-08']) {
    await parts.create({
      values: {
        partitionKey: date,
        projectId: '2',
        source: 'gsc',
        grain: 'query_page',
        resource: 'sc-domain:example.com',
        date,
        payload: [
          {
            keyword: 'test',
            page: 'https://example.com/',
            clicks: 1,
            impressions: 2,
            position: 1,
          },
        ],
      },
    });
  }
  const daily = Array.from({ length: 7 }, (_, i) => ({
    date: '2026-09-0' + (i + 1),
    clicks: 1,
    impressions: 2,
    position: 1,
  }));
  const views = new DataViews({
    store,
    sync: {
      snapshots: async () => [{ key: 'history-search', payload: daily }],
    },
  });
  const view = await views.buildSearch(
    '2',
    { range: '7' },
    { get: () => 'sc-domain:example.com' },
    {},
    null,
  );
  expect(view.connected).toBe(true);
  expect(view.pairDays).toBe(2);
  expect(view.queries.rows[0].clicks).toBe(2);
  expect(view.totals.clicks).toBe(7);
});
