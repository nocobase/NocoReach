// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { createMigrator } from '@nocobase/db';
import {
  createTestDatabase,
  expectCollection,
} from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, onTestFinished, test, vi } from 'vitest';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { timeTables } from '../../database/main/migrations/202610140002_absolute_business_timestamps.js';

const sources = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
  },
];

test('installs the selected database and preserves JSON, booleans, IDs, instants and transaction boundaries', async () => {
  vi.stubEnv('TZ', 'Australia/Melbourne');
  onTestFinished(() => vi.unstubAllEnvs());
  const db = await createTestDatabase({ migrations: sources });
  onTestFinished(() => db.destroy());
  expect(db.dialect).toBe(process.env.NOCOBASE_TEST_DB_DIALECT || 'sqlite');
  for (const table of timeTables) {
    await expectCollection(db.connection, table).toHaveField('createdAt', {
      type: 'datetimeTz',
      nullable: !['nrTaskMedia', 'nrYouTubeVideos'].includes(table),
    });
  }
  const legacy = new LegacyDatabase(
    db.database,
    new SnowflakeIdGenerator({ workerId: 1 }),
  );
  const snapshots = legacy.getRepository('nrSnapshots');
  const payload = {
    text: 'Database compatibility 🚀',
    enabled: true,
    nested: [{ value: null }, { value: 42 }],
    content: 'x'.repeat(100_000),
  };
  const created = await snapshots.create({
    values: {
      id: '9007199254740993',
      key: 'dialect-test',
      payload,
      createdAt: '2026-07-14T15:00:00.123+10:00',
      updatedAt: '2026-01-14T16:00:00.123+11:00',
    },
  });
  expect(created).toMatchObject({
    id: '9007199254740993',
    payload,
    createdAt: '2026-07-14T05:00:00.123Z',
    updatedAt: '2026-01-14T05:00:00.123Z',
  });
  const links = legacy.getRepository('nrGoogleLinks');
  const link = await links.create({
    values: { projectId: 'dialect-project', scheduleEnabled: true },
  });
  expect(link.scheduleEnabled).toBe(true);
  await expect(
    legacy.sequelize.transaction(async (transaction) => {
      await snapshots.create({
        values: { key: 'rolled-back', payload: { visible: false } },
        transaction,
      });
      throw new Error('Synthetic rollback');
    }),
  ).rejects.toThrow('Synthetic rollback');
  expect(
    await snapshots.findOne({ filter: { key: 'rolled-back' } }),
  ).toBeNull();
  await links.update({
    filterByTk: link.id,
    values: { scheduleEnabled: false },
  });
  await db.connection.reconnect();
  expect(await snapshots.findOne({ filterByTk: created.id })).toMatchObject(
    created.toJSON(),
  );
  expect(await links.findOne({ filterByTk: link.id })).toMatchObject({
    scheduleEnabled: false,
  });
  expect(
    (await createMigrator({ database: db.database, sources }).latest())
      .executed,
  ).toEqual([]);
}, 120_000);

test.runIf(process.env.NOCOBASE_TEST_DB_DIALECT === 'mysql')(
  'converts historical MySQL wall timestamps with explicit provenance before changing metadata',
  async () => {
    vi.stubEnv('TZ', 'Australia/Melbourne');
    onTestFinished(() => vi.unstubAllEnvs());
    const db = await createTestDatabase();
    onTestFinished(() => db.destroy());
    await createMigrator({ database: db.database, sources }).upTo(
      '202610140001_create_task_media',
    );
    await db.connection.repository('nrSnapshots').createOne({
      values: {
        id: '1',
        key: 'historical',
        createdAt: '2026-10-14T13:00:00.123',
        updatedAt: '2026-10-14T05:00:00.123',
      },
    });
    const configuration = {
      sources: [
        {
          table: 'nrSnapshots',
          id: '1',
          field: 'createdAt',
          raw: '2026-10-14 13:00:00.123',
          timeZone: 'Asia/Shanghai',
          evidence: 'Synthetic verified source clock',
        },
      ],
      preflightOnly: true,
    };
    const migrate = () =>
      createMigrator({
        database: db.database,
        sources,
        config: {
          get: <T>(key: string) =>
            key === 'nocoreach.timeMigration'
              ? (configuration as T)
              : undefined,
        },
      }).latest();
    await expect(migrate()).rejects.toThrow(
      'Time migration preflight succeeded',
    );
    await expectCollection(db.connection, 'nrSnapshots').toHaveField(
      'createdAt',
      {
        type: 'datetime',
      },
    );
    configuration.preflightOnly = false;
    await migrate();
    await db.connection.reconnect();
    expect(
      await db.connection
        .repository('nrSnapshots')
        .findOne({ filter: { id: '1' } }),
    ).toMatchObject({
      createdAt: '2026-10-14T05:00:00.123Z',
      updatedAt: '2026-10-14T05:00:00.123Z',
    });
    expect((await migrate()).executed).toEqual([]);
  },
  120_000,
);
