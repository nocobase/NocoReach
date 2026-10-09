import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import migration from '../../database/main/migrations/202610090001_create_nocoreach';
import { ReachStore } from '../../server/providers/reach/store.cjs';
import { SyncService } from '../../server/providers/reach/domain/sync-service.cjs';
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
async function fixture() {
  const link = await store
    .repository('nrGoogleLinks')
    .create({
      values: {
        projectId: '2',
        ga4PropertyId: '123',
        gscSiteUrl: 'sc-domain:example.com',
        status: 'active',
      },
    });
  const job = await store
    .repository('nrSyncJobs')
    .create({
      values: {
        projectId: '2',
        source: 'gsc',
        resource: 'sc-domain:example.com',
        status: 'queued',
        cursor: '2026-09-01',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        recordCount: 0,
        attempts: 0,
      },
    });
  const service = new SyncService({
    store,
    link: async () => link,
    env: () => 'test',
    project: async () => ({
      analyticsPropertyId: '123',
      searchConsoleProperty: 'sc-domain:example.com',
    }),
    token: async () => 'test',
    logger: { warn: vi.fn() },
  });
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  service.collector = () => ({
    batches: [],
    syncGsc: async () => {
      entered();
      await gate;
    },
  });
  return { service, job, started, release };
}
it('keeps SQLite available during slow Google reads and commits the staged batch afterward', async () => {
  const f = await fixture();
  const step = f.service.step();
  await f.started;
  const transactions = vi.spyOn(store, 'transaction');
  expect(store.context.getStore()).toBeUndefined();
  await store.transaction(async () => {
    await store
      .repository('nrSnapshots')
      .create({ values: { key: 'concurrent-write', payload: { ok: true } } });
  });
  expect(transactions).toHaveBeenCalledTimes(1);
  f.release();
  expect(await step).toBe(true);
  const done = await store
    .repository('nrSyncJobs')
    .findOne({ filterByTk: f.job.id });
  expect(done.get('status')).toBe('succeeded');
  expect(await store.repository('nrSyncPartitions').count({})).toBe(2);
});
it('discards a downloaded batch when the user pauses the job before commit', async () => {
  const f = await fixture();
  const step = f.service.step();
  await f.started;
  await store
    .repository('nrSyncJobs')
    .update({ filterByTk: f.job.id, values: { status: 'paused' } });
  f.release();
  expect(await step).toBe(false);
  expect(await store.repository('nrSyncPartitions').count({})).toBe(0);
  expect(
    (
      await store.repository('nrSyncJobs').findOne({ filterByTk: f.job.id })
    ).get('status'),
  ).toBe('paused');
});
