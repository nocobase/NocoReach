// @vitest-environment node
// Opt-in against a disposable local Postgres. This suite creates and drops only its own databases.
// Set PM375_POSTGRES_HOST to its Unix socket directory (or isolated host), and optionally
// PM375_POSTGRES_PORT/USER. PM375_POSTGRES_DRIVER may point to the official driver module file URL
// in a task-local install; otherwise resolve the installed @nocobase/db-postgres package.
// Run: pnpm exec vitest run tests/nocoreach/postgres-timestamps.test.ts
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import type { Knex } from 'knex';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseDriverDefinition,
  type MigrationContext,
} from '@nocobase/db';
import { expectCollection } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import migration, {
  timeTables,
} from '../../database/main/migrations/202610140002_absolute_business_timestamps';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database';
import { ClassicSource } from '../../cli/commands/lib/classic-source';
import { classicTimes } from '../../cli/commands/import-classic';

const sources = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
  },
];
const instant = '2026-10-14T05:00:00.123Z';
const reader = (value: unknown) => ({
  get: <T>(key: string) =>
    key === 'nocoreach.timeMigration' ? (value as T) : undefined,
});

async function isolatedPostgres() {
  const connection = {
    host: process.env.PM375_POSTGRES_HOST!,
    port: Number(process.env.PM375_POSTGRES_PORT ?? 5432),
    user: process.env.PM375_POSTGRES_USER ?? 'postgres',
  };
  const admin = new pg.Client({ ...connection, database: 'postgres' });
  await admin.connect();
  const database = `pm375_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${database}"`);
  const native = new pg.Client({ ...connection, database });
  await native.connect();
  onTestFinished(async () => {
    await native.end();
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
  });
  return {
    native,
    connection: {
      ...connection,
      database,
      schema: 'public',
      password: undefined,
    },
  };
}

async function target(old = false) {
  const isolated = await isolatedPostgres();
  // The optional official driver may live in a task-local installation without changing app dependencies.
  const { postgresDriver } = (
    process.env.PM375_POSTGRES_DRIVER
      ? await import(/* @vite-ignore */ process.env.PM375_POSTGRES_DRIVER)
      : await import('@nocobase/db-postgres')
  ) as {
    postgresDriver: DatabaseDriverDefinition;
  };
  const database = createDatabaseManager({
    drivers: { postgres: postgresDriver },
    connections: {
      main: {
        dialect: 'postgres',
        host: isolated.connection.host,
        port: isolated.connection.port,
        username: isolated.connection.user,
        database: isolated.connection.database,
        schema: ['public'],
        pool: { min: 1, max: 1 },
      },
    },
  });
  onTestFinished(() => database.disconnect());
  const connection = database.connection();
  const client = await connection.client<Knex>();
  // Prove conversion is independent of the original session timezone, not just the runner TZ.
  await client.raw("SET TIME ZONE 'Australia/Melbourne'");
  const runner = () => createMigrator({ database, sources });
  if (old) await runner().upTo('202610140001_create_task_media');
  else await runner().latest();
  return { ...isolated, database, connection, client, runner };
}

async function rawTimes(db: Awaited<ReturnType<typeof target>>) {
  return (
    await db.native.query(
      'SELECT id::text, created_at::text AS c, updated_at::text AS u FROM nr_tasks ORDER BY id',
    )
  ).rows;
}

describe.runIf(Boolean(process.env.PM375_POSTGRES_HOST))(
  'real Postgres timestamp target and classic source',
  () => {
    for (const zone of ['UTC', 'Asia/Shanghai', 'Australia/Melbourne']) {
      it(`fresh install/create/read/update preserves absolute instants under ${zone}`, async () => {
        vi.stubEnv('TZ', zone);
        onTestFinished(() => {
          vi.unstubAllEnvs();
        });
        const db = await target();
        const legacy = new LegacyDatabase(
          db.database,
          new SnowflakeIdGenerator({ workerId: 0 }),
        );
        const repo = legacy.getRepository('nrTasks');
        for (const at of [
          instant,
          '2026-07-14T15:00:00.123+10:00',
          '2026-01-14T16:00:00.123+11:00',
        ]) {
          const created = await repo.create({
            values: { createdAt: at, updatedAt: at },
          });
          const expected = new Date(at).toISOString();
          expect(created.createdAt).toBe(expected);
          await db.connection.reconnect();
          expect(
            (await repo.findOne({ filterByTk: created.id }))?.updatedAt,
          ).toBe(expected);
          const [updated] = await repo.update({
            filterByTk: created.id,
            values: { title: 'Updated' },
          });
          expect(updated.createdAt).toBe(expected);
          expect(Date.parse(String(updated.updatedAt))).toBeGreaterThan(
            Date.now() - 5000,
          );
        }
        expect(
          (await repo.create({ values: { createdAt: null, updatedAt: null } }))
            .createdAt,
        ).toBeNull();
        for (const table of timeTables) {
          for (const field of ['createdAt', 'updatedAt'])
            await expectCollection(db.connection, table).toHaveField(field, {
              type: 'datetimeTz',
              nullable: !['nrTaskMedia', 'nrYouTubeVideos'].includes(table),
            });
        }
        await expectCollection(db.connection, 'nrTaskMedia').toHaveField(
          'expiresAt',
          { type: 'datetimeTz', nullable: false },
        );
        expect((await db.runner().latest()).executed).toHaveLength(0);
      });
    }

    it('upgrades unmapped timestamp columns as UTC rather than the database session zone', async () => {
      const db = await target(true);
      await db.native.query("SET TIME ZONE 'Australia/Melbourne'");
      await db.native.query(
        "INSERT INTO nr_tasks (id, created_at, updated_at) VALUES (1, '2026-10-14 13:00:00.123', '2026-04-05 02:30:00')",
      );
      const runner = createMigrator({ database: db.database, sources });
      await runner.latest();
      const row = await db.connection
        .repository('nrTasks')
        .findOne({ filter: { id: '1' } });
      expect(row).toMatchObject({
        createdAt: '2026-10-14T13:00:00.123Z',
        updatedAt: '2026-04-05T02:30:00.000Z',
      });
      expect((await runner.latest()).executed).toEqual([]);
    });

    it('preflights original wall values, preserves native offset instants, constraints and indexes, then retries and skips', async () => {
      const db = await target(true);
      // Simulate a correctly migrated/imported native timestamptz column alongside historical walls.
      await db.connection.builder.alterCollection('nrTasks', (c) => {
        c.alterField('updatedAt', { type: 'datetimeTz', nullable: true });
      });
      await db.native.query(
        "INSERT INTO nr_tasks (id, created_at, updated_at) VALUES (1, '2026-10-14 13:00:00.123', '2026-10-14 16:00:00.123+11'), (2, NULL, NULL)",
      );
      const before = await rawTimes(db);
      const schema = async () =>
        (
          await db.native.query(
            "SELECT table_name, column_name, data_type, datetime_precision, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name LIKE 'nr_%' ORDER BY table_name, ordinal_position",
          )
        ).rows;
      const constraints = async () =>
        (
          await db.native.query(
            "SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY tbl, conname",
          )
        ).rows;
      const indexes = async () =>
        (
          await db.native.query(
            "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname",
          )
        ).rows;
      const beforeSchema = await schema(),
        beforeConstraints = await constraints(),
        beforeIndexes = await indexes();
      const config = {
        sources: [] as Array<{
          table: string;
          id: string;
          field: string;
          raw: string;
          timeZone: string;
          evidence: string;
        }>,
        preflightOnly: true,
      };
      const runner = () =>
        createMigrator({
          database: db.database,
          sources,
          config: reader(config),
        });
      await expect(runner().upTo(migration.name)).rejects.toThrow(
        /Historical NocoReach UTC default/,
      );
      expect(await rawTimes(db)).toEqual(before);
      expect(await schema()).toEqual(beforeSchema);
      expect(await constraints()).toEqual(beforeConstraints);
      expect(await indexes()).toEqual(beforeIndexes);
      await expectCollection(db.connection, 'nrTasks').toHaveField(
        'createdAt',
        { type: 'datetime' },
      );
      expect(
        (await runner().history()).some((row) => row.name === migration.name),
      ).toBe(false);
      config.sources.push({
        table: 'nrTasks',
        id: '1',
        field: 'createdAt',
        raw: before[0]!.c as string,
        timeZone: 'Asia/Shanghai',
        evidence: 'Synthetic verified source batch',
      });
      config.preflightOnly = true;
      await expect(runner().upTo(migration.name)).rejects.toThrow(
        /preflight succeeded/,
      );
      expect(await rawTimes(db)).toEqual(before);
      expect(await schema()).toEqual(beforeSchema);
      config.preflightOnly = false;
      const statements: string[] = [];
      const observe = ({ sql }: { sql: string }) => statements.push(sql);
      db.client.on('query', observe);
      await runner().upTo(migration.name);
      db.client.off('query', observe);
      if (process.env.PM375_POSTGRES_COST_REPORT)
        await writeFile(
          process.env.PM375_POSTGRES_COST_REPORT,
          JSON.stringify({
            total: statements.length,
            statements: statements.map((sql) =>
              sql.trim().split(/\s+/)[0].toLowerCase(),
            ),
          }),
        );
      expect(await constraints()).toEqual(beforeConstraints);
      expect(await indexes()).toEqual(beforeIndexes);
      const afterSchema = await schema();
      expect(afterSchema).toEqual(
        beforeSchema.map((column) =>
          timeTables.some(
            (table) =>
              table.replace(/[A-Z]/g, (s) => '_' + s.toLowerCase()) ===
              column.table_name,
          ) &&
          ['created_at', 'updated_at', 'expires_at'].includes(
            column.column_name as string,
          )
            ? { ...column, data_type: 'timestamp with time zone' }
            : column,
        ),
      );
      expect(
        await db.connection
          .repository('nrTasks')
          .findOne({ filter: { id: '1' } }),
      ).toMatchObject({ createdAt: instant, updatedAt: instant });
      expect((await rawTimes(db))[0]).toMatchObject({
        c: '2026-10-14 05:00:00.123+00',
        u: '2026-10-14 05:00:00.123+00',
      });
      expect((await db.client.raw('SHOW TIME ZONE')).rows[0].TimeZone).toBe(
        'Australia/Melbourne',
      );
      expect((await runner().upTo(migration.name)).executed).toHaveLength(0);
    });

    it('rolls back original data and DDL on injected SQL failure, then reruns successfully', async () => {
      const db = await target(true);
      await db.native.query(
        "INSERT INTO nr_tasks (id, created_at) VALUES (1, '2026-10-14 13:00:00.123')",
      );
      const before = await rawTimes(db);
      const config = reader({
        sources: [
          {
            table: 'nrTasks',
            id: '1',
            field: 'createdAt',
            raw: before[0]!.c,
            timeZone: 'Asia/Shanghai',
            evidence: 'Synthetic rollback exercise',
          },
        ],
      });
      await expect(
        db.database.transaction(async (connection) => {
          let alterations = 0;
          const builder = {
            alterCollection: async (
              ...args: Parameters<typeof connection.builder.alterCollection>
            ) => {
              await connection.builder.alterCollection(...args);
              if (++alterations === 2)
                await (
                  await connection.client<Knex>()
                ).raw('ALTER TABLE pm375_nonexistent ADD COLUMN fail integer');
            },
          };
          await migration.up({
            config,
            connection,
            query: connection.query,
            builder,
          } as unknown as MigrationContext);
        }),
      ).rejects.toThrow(/pm375_nonexistent/);
      expect(await rawTimes(db)).toEqual(before);
      await expectCollection(db.connection, 'nrTasks').toHaveField(
        'createdAt',
        { type: 'datetime' },
      );
      expect(
        (
          await db.native.query(
            "SELECT data_type FROM information_schema.columns WHERE table_name = 'nr_tasks' AND column_name = 'created_at'",
          )
        ).rows[0].data_type,
      ).toBe('timestamp without time zone');
      await createMigrator({ database: db.database, sources, config }).latest();
      expect(
        (
          await db.connection
            .repository('nrTasks')
            .findOne({ filter: { id: '1' } })
        )?.createdAt,
      ).toBe(instant);
    });

    it('converts mixed historical writer zones field by field, rejects DST ambiguity before writes, and accepts a proven source instant', async () => {
      const db = await target(true);
      await db.native.query(
        "INSERT INTO nr_tasks (id, created_at, updated_at) VALUES (1, '2026-07-14 13:00:00.123', '2026-07-14 15:00:00.123'), (2, '2026-01-14 13:00:00.123', '2026-01-14 16:00:00.123'), (3, '2026-04-05 02:30:00.123', '2026-10-04 02:30:00.123')",
      );
      const before = await rawTimes(db);
      const mappings = before.flatMap((row) =>
        ['createdAt', 'updatedAt'].map((field) => ({
          table: 'nrTasks',
          id: String(row.id),
          field,
          raw: String(field === 'createdAt' ? row.c : row.u),
          timeZone:
            row.id === '3' || field === 'updatedAt'
              ? 'Australia/Melbourne'
              : 'Asia/Shanghai',
          evidence: 'Synthetic historical writer deployment and import batch',
        })),
      );
      const runner = (provenance: unknown) =>
        createMigrator({
          database: db.database,
          sources,
          config: reader({ sources: provenance }),
        });
      await expect(runner(mappings).latest()).rejects.toThrow(
        /Ambiguous.*Nonexistent/,
      );
      expect(await rawTimes(db)).toEqual(before);
      await expectCollection(db.connection, 'nrTasks').toHaveField(
        'updatedAt',
        { type: 'datetime' },
      );
      await runner(
        mappings.map((mapping) =>
          mapping.id === '3'
            ? {
                ...mapping,
                timeZone: undefined,
                instant:
                  mapping.field === 'createdAt'
                    ? '2026-04-04T15:30:00.123Z'
                    : '2026-10-03T16:30:00.123Z',
                evidence:
                  'Synthetic source absolute instant from original import backup',
              }
            : mapping,
        ),
      ).latest();
      for (const [id, expected] of [
        ['1', '2026-07-14T05:00:00.123Z'],
        ['2', '2026-01-14T05:00:00.123Z'],
      ])
        expect(
          await db.connection.repository('nrTasks').findOne({ filter: { id } }),
        ).toMatchObject({ createdAt: expected, updatedAt: expected });
      expect(
        await db.connection
          .repository('nrTasks')
          .findOne({ filter: { id: '3' } }),
      ).toMatchObject({
        createdAt: '2026-04-04T15:30:00.123Z',
        updatedAt: '2026-10-03T16:30:00.123Z',
      });
    });

    it('reads real classic microsecond text in a stable read-only snapshot and truncates to API milliseconds', async () => {
      const db = await isolatedPostgres();
      await db.native.query(
        'CREATE TABLE "nrTasks" (id text PRIMARY KEY, "createdAt" timestamptz, "updatedAt" timestamp)',
      );
      for (const [id, fraction] of [
        '123456',
        '123000',
        '000001',
        '999999',
      ].entries())
        await db.native.query('INSERT INTO "nrTasks" VALUES ($1, $2, $3)', [
          String(id),
          `2026-10-14 13:00:00.${fraction}+08`,
          `2026-10-14 13:00:00.${fraction}`,
        ]);
      await db.native.query(
        "INSERT INTO \"nrTasks\" VALUES ('4', '2026-12-31 23:59:59.999999+00', '2026-04-05 01:59:59.999999'), ('5', NULL, NULL), ('6', '2026-10-03 15:59:59.999999+00', '2026-10-04 01:59:59.999999')",
      );
      const source = await ClassicSource.open(db.connection);
      onTestFinished(() => source.close());
      const columns = (await source.importColumns('nrTasks'))!;
      const rows = await source.page('nrTasks', columns, null, 20);
      expect(rows[0]).toMatchObject({
        createdAt: '2026-10-14 05:00:00.123456+00',
        updatedAt: '2026-10-14 13:00:00.123456',
      });
      for (const row of rows.slice(0, 4)) {
        const normalized = classicTimes(row, 'Asia/Shanghai');
        expect(normalized.createdAt).toBe(
          `2026-10-14T05:00:00.${String(row.createdAt).split('.')[1]!.slice(0, 3)}Z`,
        );
        expect(normalized.updatedAt).toBe(normalized.createdAt);
        expect(() => classicTimes(row)).toThrow(/unproven/);
      }
      expect(classicTimes(rows[4]!, 'Australia/Melbourne')).toMatchObject({
        createdAt: '2026-12-31T23:59:59.999Z',
        updatedAt: '2026-04-04T14:59:59.999Z',
      });
      expect(classicTimes(rows[5]!)).toMatchObject({
        createdAt: null,
        updatedAt: null,
      });
      expect(classicTimes(rows[6]!, 'Australia/Melbourne').updatedAt).toBe(
        '2026-10-03T15:59:59.999Z',
      );
      await db.native.query(
        'UPDATE "nrTasks" SET "createdAt" = now() WHERE id = $1',
        ['0'],
      );
      expect(await source.page('nrTasks', columns, null, 20)).toEqual(rows);
      // Verify the real source transaction rejects writes without exposing its connection publicly.
      const sourceClient = (source as unknown as { client: pg.Client }).client;
      await expect(
        sourceClient.query('DELETE FROM "nrTasks"'),
      ).rejects.toMatchObject({ code: '25006' });
    });
  },
);
