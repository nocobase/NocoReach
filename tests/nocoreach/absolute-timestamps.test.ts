// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Knex } from 'knex';
import {
  createDatabaseManager,
  createMigrator,
  type MigrationContext,
} from '@nocobase/db';
import { sqliteDriver } from '@nocobase/db-sqlite';
import {
  createTestDatabase,
  expectCollection,
} from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it, onTestFinished, vi } from 'vitest';
import migration, {
  timeTables,
} from '../../database/main/migrations/202610140002_absolute_business_timestamps';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database';
import { timestamp, wallTimestamp } from '../../shared/timestamps';
import { classicTimes } from '../../cli/commands/import-classic';
import { importRow } from '../../server/nocoreach/classic-import';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database';

const sources = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
  },
];
const target = migration.name;
const instant = '2026-10-14T05:00:00.000Z';
const reader = (value: unknown) => ({
  get: <T>(key: string) =>
    key === 'nocoreach.timeMigration' ? (value as T) : undefined,
});

it('defaults newly added fixture callers to the real fresh schema', async () => {
  const db = await createNocoReachTestDatabase();
  await expectCollection(db.connection, 'nrSnapshots').toHaveField(
    'createdAt',
    { type: 'datetimeTz' },
  );
});
async function oldDatabase() {
  const db = await createTestDatabase();
  onTestFinished(() => db.destroy());
  await createMigrator({ database: db.database, sources }).upTo(
    '202610140001_create_task_media',
  );
  return db;
}
async function insertRaw(
  db: Awaited<ReturnType<typeof oldDatabase>>,
  row: Record<string, unknown>,
) {
  const compiled = db.connection.query
    .insertInto('nrTasks')
    .values(row)
    .compile();
  await (
    await db.connection.client<Knex>()
  ).raw(compiled.sql, compiled.parameters as Knex.RawBinding[]);
}
async function rawCreation(db: Awaited<ReturnType<typeof oldDatabase>>) {
  const compiled = db.connection.query
    .selectFrom('nrTasks')
    .select('createdAt as v')
    .compile();
  return (
    await (
      await db.connection.client<Knex>()
    ).raw(compiled.sql, compiled.parameters as Knex.RawBinding[])
  )[0].v;
}
async function rawTaskTimes(db: Awaited<ReturnType<typeof oldDatabase>>) {
  const compiled = db.connection.query
    .selectFrom('nrTasks')
    .select(['id as k', 'createdAt as c', 'updatedAt as u'])
    .orderBy('id')
    .compile();
  return (await db.connection.client<Knex>()).raw(
    compiled.sql,
    compiled.parameters as Knex.RawBinding[],
  );
}

it('validates absolute instants, nullable imports and source clocks without silently inventing dates', () => {
  for (const value of [
    instant,
    '2026-10-14T13:00:00+08:00',
    '2026-10-14T16:00:00+11:00',
    Date.parse(instant),
    String(Date.parse(instant)),
    new Date(instant),
  ])
    expect(timestamp(value)).toBe(instant);
  expect(timestamp(null)).toBeNull();
  for (const value of [
    '',
    undefined,
    '2026-02-30T01:00:00Z',
    '2026-10-14T05:00:00',
    '2026-10-14T05:00:00-00:00',
    '2026-10-14T24:00:00Z',
    new Date(NaN),
  ])
    expect(() => timestamp(value)).toThrow();
  expect(
    classicTimes(
      { id: '1', createdAt: '2026-10-14 13:00:00', updatedAt: null },
      'Asia/Shanghai',
    ),
  ).toEqual({ id: '1', createdAt: instant, updatedAt: null });
  expect(
    classicTimes({ createdAt: '2026-10-14 05:00:00.000000+00' }).createdAt,
  ).toBe(instant);
  expect(() => classicTimes({ createdAt: '2026-10-14 05:00:00' })).toThrow(
    /unproven/,
  );
  expect(
    importRow('nrTasks', { id: '1', createdAt: null }, new Map(), new Set()),
  ).toMatchObject({ createdAt: null, updatedAt: null });
  expect(() =>
    importRow('nrTasks', { id: '1', createdAt: '' }, new Map(), new Set()),
  ).toThrow(/createdAt/);
});

it('uses date-specific Melbourne offsets and rejects DST gaps and folds', () => {
  expect(wallTimestamp('2026-07-14T15:00:00.123', 'Australia/Melbourne')).toBe(
    '2026-07-14T05:00:00.123Z',
  );
  expect(wallTimestamp('2026-01-14T16:00:00.123', 'Australia/Melbourne')).toBe(
    '2026-01-14T05:00:00.123Z',
  );
  expect(() =>
    wallTimestamp('2026-04-05T02:30:00', 'Australia/Melbourne'),
  ).toThrow(/Ambiguous/);
  expect(() =>
    wallTimestamp('2026-10-04T02:30:00', 'Australia/Melbourne'),
  ).toThrow(/Nonexistent/);
  expect(wallTimestamp('2026-04-05T01:59:59', 'Australia/Melbourne')).toBe(
    '2026-04-04T14:59:59.000Z',
  );
  expect(wallTimestamp('2026-10-04T03:00:00', 'Australia/Melbourne')).toBe(
    '2026-10-03T16:00:00.000Z',
  );
});

for (const zone of ['UTC', 'Asia/Shanghai', 'Australia/Melbourne']) {
  it(`fresh SQLite install and legacy create/read/update preserve instants under ${zone}`, async () => {
    vi.stubEnv('TZ', zone);
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const db = await createTestDatabase({ migrations: sources });
    onTestFinished(() => db.destroy());
    const legacy = new LegacyDatabase(
      db.database,
      new SnowflakeIdGenerator({ workerId: 0 }),
    );
    const repo = legacy.getRepository('nrTasks');
    for (const at of [
      instant,
      '2026-07-14T15:00:00+10:00',
      '2026-01-14T16:00:00+11:00',
    ]) {
      const row = await repo.create({
        values: { createdAt: at, updatedAt: at },
      });
      expect(row.createdAt).toBe(timestamp(at));
      expect(row.updatedAt).toBe(timestamp(at));
      expect(
        (await repo.findOne({ filterByTk: row.id }))?.toJSON().updatedAt,
      ).toBe(timestamp(at));
      await db.connection.reconnect();
      expect((await repo.findOne({ filterByTk: row.id }))?.updatedAt).toBe(
        timestamp(at),
      );
      const [updated] = await repo.update({
        filterByTk: row.id,
        values: { title: 'Updated' },
      });
      expect(updated.createdAt).toBe(timestamp(at));
      expect(Date.parse(String(updated.updatedAt))).toBeGreaterThan(
        Date.now() - 5000,
      );
    }
    await expect(
      repo.create({ values: { createdAt: '2026-10-14T05:00:00' } }),
    ).rejects.toThrow(/offset/);
    expect(
      (await repo.create({ values: { createdAt: null, updatedAt: null } }))
        .createdAt,
    ).toBeNull();
    for (const table of timeTables) {
      await expectCollection(db.connection, table).toHaveField('createdAt', {
        type: 'datetimeTz',
        nullable: table !== 'nrTaskMedia' && table !== 'nrYouTubeVideos',
      });
      await expectCollection(db.connection, table).toHaveField('updatedAt', {
        type: 'datetimeTz',
      });
    }
    await expectCollection(db.connection, 'nrTaskMedia').toHaveField(
      'expiresAt',
      { type: 'datetimeTz', nullable: false },
    );
    await expectCollection(db.connection, 'nrTaskMedia').toHaveIndex([
      'taskId',
      'expiresAt',
    ]);
    await expectCollection(db.connection, 'nrTasks').toHaveIndex(['taskKey'], {
      unique: true,
    });
    expect(
      (await createMigrator({ database: db.database, sources }).latest())
        .executed,
    ).toHaveLength(0);
  });
}

it('preflights mixed deployments, protects offset/epoch/null values, blocks unknown sources with zero partial writes, then retries', async () => {
  const db = await oldDatabase();
  const raw = [
    {
      id: '1',
      createdAt: '2026-10-14T13:00:00',
      updatedAt: '2026-10-14T16:00:00',
    },
    {
      id: '2',
      createdAt: '2026-10-14T13:00:00+08:00',
      updatedAt: String(Date.parse(instant)) + '.0',
    },
    { id: '3', createdAt: null, updatedAt: null },
  ];
  for (const row of raw) await insertRaw(db, row);
  const config = {
    sources: [
      {
        table: 'nrTasks',
        id: '1',
        field: 'createdAt',
        raw: raw[0].createdAt,
        timeZone: 'Asia/Shanghai',
        evidence: 'Synthetic legacy import batch A',
      },
    ],
    preflightOnly: false,
  };
  const runner = () =>
    createMigrator({ database: db.database, sources, config: reader(config) });
  const before = await rawTaskTimes(db);
  await expect(runner().latest()).rejects.toThrow(
    /updatedAt.*Missing proven source/,
  );
  expect(await rawTaskTimes(db)).toEqual(before);
  await expectCollection(db.connection, 'nrTasks').toHaveField('createdAt', {
    type: 'datetime',
  });
  expect((await runner().history()).some((row) => row.name === target)).toBe(
    false,
  );
  config.sources.push({
    table: 'nrTasks',
    id: '1',
    field: 'updatedAt',
    raw: raw[0].updatedAt,
    timeZone: 'Australia/Melbourne',
    evidence: 'Synthetic deployment B update',
  });
  config.preflightOnly = true;
  await expect(runner().latest()).rejects.toThrow(
    /preflight succeeded; no changes/,
  );
  expect(await rawTaskTimes(db)).toEqual(before);
  config.preflightOnly = false;
  const physicalBefore = await Promise.all(
    timeTables.map((table) => db.connection.collections.getPhysical(table)),
  );
  const statements: string[] = [];
  const client = await db.connection.client<Knex>();
  const observe = ({ sql }: { sql: string }) => statements.push(sql);
  client.on('query', observe);
  await runner().latest();
  client.off('query', observe);
  const counts = Object.fromEntries(
    [
      'select',
      'insert',
      'update',
      'delete',
      'create',
      'drop',
      'alter',
      'begin',
      'commit',
      'pragma',
    ].map((kind) => [
      kind,
      statements.filter((sql) => sql.toLowerCase().startsWith(kind)).length,
    ]),
  );
  if (process.env.PM375_COST_REPORT)
    await writeFile(
      process.env.PM375_COST_REPORT,
      JSON.stringify({ total: statements.length, ...counts }),
    );
  expect(
    await Promise.all(
      timeTables.map((table) => db.connection.collections.getPhysical(table)),
    ),
  ).toEqual(physicalBefore);
  expect(
    await db.connection.query
      .selectFrom('nrTasks')
      .select(['createdAt', 'updatedAt'])
      .orderBy('id')
      .execute(),
  ).toEqual([
    { createdAt: instant, updatedAt: instant },
    { createdAt: instant, updatedAt: instant },
    { createdAt: null, updatedAt: null },
  ]);
  expect((await runner().latest()).executed).toHaveLength(0);
});

it('uses authoritative import source instants and never reapplies a writer timezone to correct offsets', async () => {
  const db = await oldDatabase();
  const row = {
    id: '1',
    createdAt: '2026-10-14T03:00:00',
    updatedAt: '2026-10-14T13:00:00+08:00',
  };
  await insertRaw(db, row);
  await createMigrator({
    database: db.database,
    sources,
    config: reader({
      sources: [
        {
          table: 'nrTasks',
          id: '1',
          field: 'createdAt',
          raw: row.createdAt,
          instant,
          evidence:
            'Synthetic original source backup; target had undergone a prior import conversion',
        },
        {
          table: 'nrTasks',
          id: '1',
          field: 'updatedAt',
          raw: row.updatedAt,
          timeZone: 'Asia/Shanghai',
          evidence:
            'Synthetic source writer zone; stored offset already identifies the instant',
        },
      ],
    }),
  }).latest();
  expect(await rawTaskTimes(db)).toEqual([{ k: '1', c: instant, u: instant }]);
});

for (const problem of ['duplicate', 'stale', 'unused'] as const) {
  it(`rejects ${problem} source mappings with zero data or schema changes`, async () => {
    const db = await oldDatabase();
    const raw = '2026-10-14T13:00:00';
    await insertRaw(db, { id: '1', createdAt: raw, updatedAt: instant });
    const source = {
      table: 'nrTasks',
      id: '1',
      field: 'createdAt',
      raw,
      timeZone: 'Asia/Shanghai',
      evidence: 'Synthetic audited writer',
    };
    const mappings =
      problem === 'duplicate'
        ? [source, { ...source }]
        : problem === 'stale'
          ? [{ ...source, raw: raw + '.001' }]
          : [source, { ...source, id: '999' }];
    const before = await rawTaskTimes(db);
    const runner = createMigrator({
      database: db.database,
      sources,
      config: reader({ sources: mappings }),
    });
    await expect(runner.latest()).rejects.toThrow(
      problem === 'duplicate'
        ? /Duplicate/
        : problem === 'stale'
          ? /does not match storage/
          : /Unused source/,
    );
    expect(await rawTaskTimes(db)).toEqual(before);
    await expectCollection(db.connection, 'nrTasks').toHaveField('createdAt', {
      type: 'datetime',
    });
    expect((await runner.history()).some((row) => row.name === target)).toBe(
      false,
    );
  });
}

it('truncates classic microseconds to milliseconds without rounding or guessing a timezone', () => {
  for (const fraction of ['123456', '123000', '000001', '999999']) {
    const expected = `2026-10-14T05:00:00.${fraction.slice(0, 3)}Z`;
    expect(
      classicTimes({ createdAt: `2026-10-14 05:00:00.${fraction}+00` })
        .createdAt,
    ).toBe(expected);
    expect(
      classicTimes(
        { createdAt: `2026-10-14 13:00:00.${fraction}` },
        'Asia/Shanghai',
      ).createdAt,
    ).toBe(expected);
    expect(() =>
      classicTimes({ createdAt: `2026-10-14 13:00:00.${fraction}` }),
    ).toThrow(/unproven/);
  }
  expect(
    classicTimes({ createdAt: '2026-12-31 23:59:59.999999+00' }).createdAt,
  ).toBe('2026-12-31T23:59:59.999Z');
  expect(() =>
    classicTimes(
      { createdAt: '2026-04-05 02:30:00.123456' },
      'Australia/Melbourne',
    ),
  ).toThrow(/Ambiguous/);
  expect(() =>
    classicTimes(
      { createdAt: '2026-10-04 02:30:00.123456' },
      'Australia/Melbourne',
    ),
  ).toThrow(/Nonexistent/);
});

for (const bad of [
  '2026-02-30T01:00:00',
  '2026-04-05T02:30:00',
  '2026-10-04T02:30:00',
  '',
]) {
  it(`rejects invalid/DST storage ${bad} before any schema or data mutation`, async () => {
    const db = await oldDatabase();
    await insertRaw(db, { id: '1', createdAt: bad, updatedAt: instant });
    const config = {
      sources: [
        {
          table: 'nrTasks',
          id: '1',
          field: 'createdAt',
          raw: bad,
          timeZone: 'Australia/Melbourne',
          evidence: 'Synthetic proven zone',
        },
      ],
    };
    await expect(
      createMigrator({
        database: db.database,
        sources,
        config: reader(config),
      }).latest(),
    ).rejects.toThrow(/preflight failed/);
    expect(await rawCreation(db)).toBe(bad);
    await expectCollection(db.connection, 'nrTasks').toHaveField('createdAt', {
      type: 'datetime',
    });
  });
}

it('rolls back DML and DDL on a later failure, and restores a SQLite backup with matching old history and storage', async () => {
  const db = await oldDatabase();
  const row = { id: '1', createdAt: '2026-10-14T13:00:00', updatedAt: instant };
  await insertRaw(db, row);
  const config = reader({
    sources: [
      {
        table: 'nrTasks',
        id: '1',
        field: 'createdAt',
        raw: row.createdAt,
        timeZone: 'Asia/Shanghai',
        evidence: 'Synthetic backup exercise',
      },
    ],
  });
  const directory = await mkdtemp(join(tmpdir(), 'timestamp-restore-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const backup = join(directory, 'before.sqlite');
  const client = await db.connection.client<Knex>();
  await client.raw('VACUUM INTO ?', [backup]);
  await expect(
    db.database.transaction(async (connection) => {
      let alterations = 0;
      const builder = {
        alterCollection: async (
          ...args: Parameters<typeof connection.builder.alterCollection>
        ) => {
          const result = await connection.builder.alterCollection(...args);
          if (++alterations === 2) throw new Error('Injected DDL failure');
          return result;
        },
      };
      await migration.up({
        config,
        connection,
        query: connection.query,
        builder,
      } as unknown as MigrationContext);
    }),
  ).rejects.toThrow(/Injected DDL failure/);
  expect(await rawCreation(db)).toBe(row.createdAt);
  await expectCollection(db.connection, 'nrTasks').toHaveField('createdAt', {
    type: 'datetime',
  });
  await createMigrator({ database: db.database, sources, config }).latest();
  const restored = createDatabaseManager({
    drivers: { sqlite: sqliteDriver },
    connections: { main: { dialect: 'sqlite', filename: backup } },
  });
  onTestFinished(() => restored.disconnect());
  const connection = restored.connection();
  const restoredRaw = connection.query
    .selectFrom('nrTasks')
    .select('createdAt as v')
    .compile();
  expect(
    (
      await (
        await connection.client<Knex>()
      ).raw(restoredRaw.sql, restoredRaw.parameters as Knex.RawBinding[])
    )[0].v,
  ).toBe(row.createdAt);
  await expectCollection(connection, 'nrTasks').toHaveField('createdAt', {
    type: 'datetime',
  });
  const restoredRunner = createMigrator({
    database: restored,
    sources,
    config,
  });
  expect(
    (await restoredRunner.history()).some((item) => item.name === target),
  ).toBe(false);
  await restoredRunner.latest();
  expect(
    (await connection.repository('nrTasks').findOne({ filter: { id: '1' } }))
      ?.createdAt,
  ).toBe(instant);
});
