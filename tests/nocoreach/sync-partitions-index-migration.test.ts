// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describeMigration } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import type { DatabaseManager } from '@nocobase/db';
import { expect } from 'vitest';
import {
  LegacyDatabase,
  legacyRecord,
} from '../../server/nocoreach/legacy/database.js';
import { SyncService } from '../../server/nocoreach/sync-service.js';

const projectId = '901';
const site = 'sc-domain:example.test';
const link = legacyRecord({ ga4PropertyId: '123', gscSiteUrl: site });
const project = { id: projectId, name: 'Example', domains: ['example.test'] };
const latest = '2026-10-20T08:00:00.000Z';
const expected = JSON.stringify(['123', site, 5, [latest, null], project]);

// The key saved snapshots are restored by; the index must leave it byte for byte the same.
const keyOf = (database: DatabaseManager) =>
  new SyncService({
    db: new LegacyDatabase(database, new SnowflakeIdGenerator({ workerId: 0 })),
  })
    .snapshotKey(projectId, link, project)
    .then((r: { key: string }) => r.key);

let before: string | undefined;

describeMigration('202611050001_sync_partitions_updated_index', {
  sources: [
    {
      packageName: 'nocoreach',
      directory: fileURLToPath(
        new URL('../../database/main/migrations', import.meta.url),
      ),
    },
  ],
  before: async ({ database }) => {
    const partitions = new LegacyDatabase(
      database,
      new SnowflakeIdGenerator({ workerId: 0 }),
    ).getRepository('nrSyncPartitions');
    // Ids that disagree with the write order, two rows tied on the latest write (one given with an offset), a row
    // never written (sorted last, not first), and another project's later write.
    for (const [id, owner, updatedAt] of [
      ['5', projectId, null],
      ['10', projectId, '2026-10-20T16:00:00+08:00'],
      ['20', projectId, latest],
      ['30', projectId, '2026-10-01T00:00:00.000Z'],
      ['40', projectId, '2026-10-19T23:59:59.999Z'],
      ['50', 'another', '2026-10-25T00:00:00.000Z'],
    ] as const)
      await partitions.create({
        values: {
          id,
          partitionKey: `partition:${id}`,
          projectId: owner,
          source: 'gsc',
          resource: site,
          date: '2026-10-01',
          grain: 'overview',
          payload: [{ clicks: Number(id) }],
          updatedAt,
        },
      });
    before = await keyOf(database);
    expect(before).toBe(expected);
  },
  up: async ({ database, expectCollection }) => {
    await expectCollection('nrSyncPartitions').toHaveIndex([
      'projectId',
      'updatedAt',
    ]);
    expect(before).toBe(expected);
    expect(await keyOf(database)).toBe(before);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('nrSyncPartitions').not.toHaveIndex([
      'projectId',
      'updatedAt',
    ]);
  },
});
