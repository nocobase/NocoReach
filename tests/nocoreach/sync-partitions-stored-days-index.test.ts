// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describeMigration } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect } from 'vitest';
import { DataViews } from '../../server/nocoreach/data-views.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';

const projectId = '901';
const site = 'sc-domain:example.test';
const dates = { $in: ['2026-10-01', '2026-10-02', '2026-10-03'] };
const latest = '2026-10-20T08:00:00.000Z';

// A window's stored days are counted and dated the same with or without the index.
const storedDays = (database: never) =>
  new DataViews({
    db: new LegacyDatabase(database, new SnowflakeIdGenerator({ workerId: 0 })),
  }).storedDays(projectId, 'gsc', 'query_page', site, dates);

describeMigration('202611070001_sync_partitions_stored_days_index', {
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
    // Two days of the window, a later write on a day outside it, and a later write of another grain.
    for (const [id, date, grain, updatedAt] of [
      ['1', '2026-10-01', 'query_page', '2026-10-02T00:00:00.000Z'],
      ['2', '2026-10-03', 'query_page', latest],
      ['3', '2026-09-30', 'query_page', '2026-10-25T00:00:00.000Z'],
      ['4', '2026-10-02', 'overview', '2026-10-25T00:00:00.000Z'],
    ] as const)
      await partitions.create({
        values: {
          id,
          partitionKey: `partition:${id}`,
          projectId,
          source: 'gsc',
          resource: site,
          date,
          grain,
          payload: [{ clicks: 1 }],
          updatedAt,
        },
      });
    expect(await storedDays(database as never)).toEqual([2, latest]);
  },
  up: async ({ database, expectCollection }) => {
    await expectCollection('nrSyncPartitions').toHaveIndex([
      'projectId',
      'source',
      'grain',
      'resource',
      'date',
      'updatedAt',
    ]);
    expect(await storedDays(database as never)).toEqual([2, latest]);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('nrSyncPartitions').not.toHaveIndex([
      'projectId',
      'source',
      'grain',
      'resource',
      'date',
      'updatedAt',
    ]);
  },
});
