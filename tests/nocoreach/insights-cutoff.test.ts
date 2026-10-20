// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { SyncService } from '../../server/nocoreach/sync-service.js';
import { buildSnapshots } from '../../server/nocoreach/sync-data.js';

async function fixture() {
  const testDb = await createNocoReachTestDatabase();
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const resources = { ga4: '123', gsc: 'sc-domain:example.test' };
  const project = {
    id: '12',
    analyticsPropertyId: resources.ga4,
    searchConsoleProperty: resources.gsc,
  };
  const link = {
    ga4PropertyId: resources.ga4,
    gscSiteUrl: resources.gsc,
    status: 'ready_for_sync',
  };
  const sync = new SyncService({
    db,
    env: () => 'credential',
    link: async () => ({ get: (key: keyof typeof link) => link[key] }),
    project: async () => project,
  });
  const parts = db.getRepository('nrSyncPartitions');
  vi.spyOn(sync, 'repo').mockReturnValue(parts);
  const reads = vi.spyOn(parts, 'find');
  const save = (
    source: keyof typeof resources,
    date: string,
    payload: object[] = [{ date, views: 0, clicks: 0 }],
    extra = {},
  ) =>
    parts.create({
      values: {
        partitionKey: crypto.randomUUID(),
        projectId: project.id,
        source,
        resource: resources[source],
        grain: 'overview',
        date,
        payload,
        ...extra,
      },
    });
  return { db, sync, parts, reads, save, link, project };
}

it('matches the snapshot cutoff for empty, single-source, zero-valued and combined overview data', async () => {
  const { sync, parts, save, project } = await fixture();
  expect(await sync.availableThrough(project.id)).toBeNull();
  await save('ga4', '2026-10-18', []);
  await save('gsc', '2026-10-18', []);
  expect(await sync.availableThrough(project.id)).toBeNull();
  await save('ga4', '2026-10-16');
  expect(await sync.availableThrough(project.id)).toBe('2026-10-16');
  await save('gsc', '2026-10-15');
  expect(await sync.availableThrough(project.id)).toBe('2026-10-15');
  const snapshot = buildSnapshots(
    (await parts.find({ filter: { projectId: project.id } })).map((row) =>
      row.toJSON(),
    ),
    project,
  );
  expect(await sync.availableThrough(project.id)).toBe(
    snapshot.find((row) => row.key === 'project')?.payload.end,
  );
  await parts.destroy({ filter: { projectId: project.id, source: 'ga4' } });
  expect(await sync.availableThrough(project.id)).toBe('2026-10-15');
});

it('reads only current-project, current-resource overview payloads in bounded pages', async () => {
  const { sync, save, reads, project } = await fixture();
  await save('ga4', '2026-10-16');
  await save('gsc', '2026-10-15');
  await save('ga4', '2026-10-19', undefined, { projectId: '99' });
  await save('ga4', '2026-10-19', undefined, { resource: 'old-property' });
  await save('gsc', '2026-10-19', undefined, {
    resource: 'sc-domain:old.test',
  });
  await save(
    'gsc',
    '2026-10-19',
    [{ date: '2026-10-19', body: 'large detail'.repeat(1000) }],
    { grain: 'query_page' },
  );
  await save('ga4', '2026-10-19', undefined, { grain: 'page' });
  expect(await sync.availableThrough(project.id)).toBe('2026-10-15');
  expect(reads).toHaveBeenCalledTimes(2);
  for (const [options] of reads.mock.calls) {
    expect(options).toMatchObject({
      fields: ['date', 'payload'],
      limit: 32,
      filter: { projectId: project.id, grain: 'overview' },
    });
    expect(options?.filter).toHaveProperty('resource');
  }
  for (const result of reads.mock.results)
    expect(await result.value).toHaveLength(1);
});

it('finds the last actual day beyond a page of successful empty responses', async () => {
  const { sync, save, reads, project } = await fixture();
  await save('gsc', '2026-08-31');
  for (let day = 1; day <= 40; day++) {
    const date = new Date(Date.UTC(2026, 8, day)).toISOString().slice(0, 10);
    await save('gsc', date, []);
  }
  expect(await sync.availableThrough(project.id)).toBe('2026-08-31');
  expect(reads).toHaveBeenCalledTimes(3);
});

it('retains connection validation and does not query partitions for disconnected resources', async () => {
  const { sync, reads, link, project } = await fixture();
  link.status = 'disconnected';
  await expect(sync.availableThrough(project.id)).rejects.toMatchObject({
    code: 'NOCOREACH_GOOGLE_NOT_CONNECTED',
  });
  expect(reads).not.toHaveBeenCalled();
  link.status = 'ready_for_sync';
  project.analyticsPropertyId = 'changed-property';
  await expect(sync.availableThrough(project.id)).rejects.toMatchObject({
    status: 409,
  });
  expect(reads).not.toHaveBeenCalled();
});

it('reads the caller transaction without sharing uncommitted cutoff values', async () => {
  const { db, sync, save, project } = await fixture();
  await save('ga4', '2026-10-15');
  await expect(
    db.sequelize.transaction(async () => {
      await save('ga4', '2026-10-18');
      expect(await sync.availableThrough(project.id)).toBe('2026-10-18');
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  expect(await sync.availableThrough(project.id)).toBe('2026-10-15');
});
