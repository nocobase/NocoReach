import { fileURLToPath } from 'node:url';
import { createMigrator } from '@nocobase/db';
import {
  createTestDatabase,
  expectCollection,
} from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, onTestFinished } from 'vitest';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';

export const nocoReachSchemaPaths = ['fresh', 'upgrade'] as const;
export type NocoReachSchemaPath = (typeof nocoReachSchemaPaths)[number];
const sources = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
  },
];
const instant = '2026-10-14T05:00:00.000Z';

/** Exercise the actual schema history instead of maintaining an independent test schema. */
export async function createNocoReachTestDatabase(
  path: NocoReachSchemaPath = 'fresh',
) {
  const testDb = await createTestDatabase(
    path === 'fresh' ? { migrations: sources } : {},
  );
  onTestFinished(() => testDb.destroy());
  expect(testDb.dialect).toBe('sqlite');
  if (path === 'upgrade') {
    await createMigrator({ database: testDb.database, sources }).upTo(
      '202610140001_create_task_media',
    );
    const provenance: Array<{
      table: string;
      id: string;
      field: 'createdAt' | 'updatedAt';
      raw: string;
      timeZone: string;
      evidence: string;
    }> = [];
    for (const table of ['nrSnapshots', 'nrSyncPartitions']) {
      await expectCollection(testDb.connection, table).toHaveField(
        'createdAt',
        { type: 'datetime' },
      );
      // Observe the old Repository create result: datetime returns wall time without any offset.
      const row = {
        id: '1',
        createdAt: '2026-10-14T13:00:00.000',
        updatedAt: '2026-10-14T16:00:00.000',
      };
      const old = await testDb.connection
        .repository(table)
        .createOne({ values: row });
      expect(old.record).toMatchObject({
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      for (const field of ['createdAt', 'updatedAt'] as const)
        provenance.push({
          table,
          id: row.id,
          field,
          raw: row[field],
          timeZone:
            field === 'createdAt' ? 'Asia/Shanghai' : 'Australia/Melbourne',
          evidence: 'Synthetic verified historical writer batch',
        });
    }
    await createMigrator({
      database: testDb.database,
      sources,
      config: {
        get: <T>(key: string) =>
          key === 'nocoreach.timeMigration'
            ? ({ sources: provenance } as T)
            : undefined,
      },
    }).latest();
    for (const table of ['nrSnapshots', 'nrSyncPartitions']) {
      expect(
        await testDb.connection
          .repository(table)
          .findOne({ filter: { id: '1' } }),
      ).toMatchObject({ createdAt: instant, updatedAt: instant });
    }
  }
  const legacy = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  for (const table of ['nrSnapshots', 'nrSyncPartitions']) {
    for (const field of ['createdAt', 'updatedAt'])
      await expectCollection(testDb.connection, table).toHaveField(field, {
        type: 'datetimeTz',
        nullable: true,
      });
    // Check the exact create-return path that rejected the old test schema, then refresh the persisted row.
    const created = await legacy.getRepository(table).create({
      values: {
        id: '2',
        createdAt: '2026-10-14T13:00:00+08:00',
        updatedAt: '2026-10-14T16:00:00+11:00',
      },
    });
    expect(created.toJSON()).toMatchObject({
      createdAt: instant,
      updatedAt: instant,
    });
    expect(
      (
        await legacy.getRepository(table).findOne({ filterByTk: '2' })
      )?.toJSON(),
    ).toMatchObject({ createdAt: instant, updatedAt: instant });
  }
  // Calendar partition dates must remain string fields for the range assertions.
  await expectCollection(testDb.connection, 'nrSyncPartitions').toHaveField(
    'date',
    { type: 'string' },
  );
  return testDb;
}
