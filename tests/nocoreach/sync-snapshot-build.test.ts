// @vitest-environment node
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database.js';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterEach, expect, it, vi } from 'vitest';
import {
  LegacyDatabase,
  legacyRecord,
} from '../../server/nocoreach/legacy/database.js';
import { SyncService } from '../../server/nocoreach/sync-service.js';
import { buildSnapshots } from '../../server/nocoreach/sync-data.js';

// The rows build() hands to the snapshot builder (the days other than page days, then each page day), so they can be
// compared with the paged read's.
const received: Record<string, unknown>[][] = [];
vi.mock('../../server/nocoreach/sync-data.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../server/nocoreach/sync-data.js')
    >();
  return {
    ...actual,
    snapshotBuilder: vi.fn(
      (base: Record<string, unknown>[], project: unknown) => {
        const rows = [...base],
          builder = actual.snapshotBuilder(base, project);
        received.push(rows);
        return {
          add(p: Record<string, unknown>) {
            rows.push(p);
            builder.add(p);
          },
          finish: () => builder.finish(),
        };
      },
    ),
  };
});

type Knex = {
  on(event: 'query', fn: (q: { sql: string }) => void): void;
  off(event: 'query', fn: (q: { sql: string }) => void): void;
  raw(sql: string, bindings?: unknown[]): Promise<unknown>;
};

afterEach(() => {
  vi.useRealTimers();
  received.length = 0;
});

const projectId = '901';
const site = 'sc-domain:example.test';
const url = 'https://example.test/docs/a';
const link = legacyRecord({
  ga4PropertyId: '123',
  gscSiteUrl: site,
  status: 'active',
});
const project = {
  id: projectId,
  name: 'Example',
  analyticsPropertyId: '123',
  searchConsoleProperty: site,
  domains: ['example.test'],
};
const dateAt = (offset: number) =>
  new Date(Date.parse('2026-09-27T00:00:00Z') + offset * 86400000)
    .toISOString()
    .slice(0, 10);

// How build() read the partitions before: pages of 200 in id order, each with an offset.
async function pagedRows(db: LegacyDatabase, id: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await db
      .getRepository('nrSyncPartitions')
      .find({ filter: { projectId: id }, sort: ['id'], offset, limit: 200 });
    rows.push(
      ...page
        .map((r) => r.toJSON())
        .filter(
          (r) =>
            r.resource ===
            (r.source === 'ga4'
              ? link.get('ga4PropertyId')
              : link.get('gscSiteUrl')),
        ),
    );
    if (page.length < 200) break;
  }
  return rows;
}

// Five partitions a day for 60 days (300 linked rows, two reads by key), with ids of two to four digits that do not
// follow the index's (project, source, date) order, plus partitions of another project and of an earlier resource.
async function fixture() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-09-30T12:00:00Z');
  const testDb = await createNocoReachTestDatabase();
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const partitions = db.getRepository('nrSyncPartitions');
  const days = 60,
    kinds = [
      ['ga4', 'overview'],
      ['ga4', 'source'],
      ['ga4', 'page'],
      ['gsc', 'overview'],
      ['gsc', 'query_page'],
    ] as const;
  // A fixed permutation of 0..299, so a later day may get a smaller id.
  const slots = Array.from(
    { length: days * kinds.length },
    (_, i) => (i * 113) % (days * kinds.length),
  );
  const payload = (source: string, grain: string, date: string, n: number) =>
    grain === 'overview'
      ? source === 'ga4'
        ? [{ date, views: n, sessions: n % 13, conversions: n % 3 }]
        : [{ date, clicks: n % 17, impressions: n }]
      : grain === 'source'
        ? [
            {
              source: 'github.com',
              medium: 'referral',
              sessions: n % 5,
              views: n,
              conversions: n % 2,
            },
            {
              source: 'old.reddit.com',
              medium: 'referral',
              sessions: n % 7,
              views: n % 11,
              conversions: 0,
            },
          ]
        : grain === 'page'
          ? [
              {
                host: 'example.test',
                page: `/docs/${n % 7}`,
                views: n,
                sessions: n % 9,
                conversions: n % 4,
              },
            ]
          : [
              {
                keyword: `k${n % 11}`,
                page: url,
                clicks: n % 5,
                impressions: 40 + n,
                position: 1 + (n % 30),
              },
            ];
  let n = 0;
  for (let day = 0; day < days; day++)
    for (const [source, grain] of kinds) {
      const date = dateAt(day - days + 1),
        id = String(90 + 13 * slots[n]!);
      await partitions.create({
        values: {
          id,
          partitionKey: JSON.stringify([projectId, source, date, grain]),
          projectId,
          source,
          resource: source === 'ga4' ? '123' : site,
          date,
          grain,
          payload: payload(source, grain, date, n++),
        },
      });
    }
  for (const [id, values] of [
    ['95', { projectId: 'another', source: 'gsc', resource: site }],
    ['96', { projectId, source: 'gsc', resource: 'sc-domain:old.test' }],
    ['5000', { projectId, source: 'ga4', resource: '999' }],
  ] as const)
    await partitions.create({
      values: {
        id,
        partitionKey: `extra:${id}`,
        date: dateAt(0),
        grain: 'overview',
        payload: [
          { date: dateAt(0), clicks: 999, impressions: 999, views: 999 },
        ],
        ...values,
      },
    });
  const sync = new SyncService({
    db,
    env: () => 'synthetic',
    link: async () => link,
    project: async () => project,
  });
  return { db, sync, client: await testDb.connection.client<Knex>() };
}

// In id order, as the paged read gave them.
const handed = () =>
  [...received.at(-1)!].sort((a, b) =>
    BigInt(a.id as string) < BigInt(b.id as string) ? -1 : 1,
  );

// SQLite's plan for a statement Knex emitted, its placeholders bound to '1'.
const planOf = async (client: Knex, sql: string) => {
  const bindings = Array.from(sql.matchAll(/\?/g), () => '1');
  const rows = (await client.raw(`explain query plan ${sql}`, bindings)) as {
    detail: string;
  }[];
  return rows.map((r) => r.detail).join('\n');
};

// What `statements` sends to nr_sync_partitions.
async function partitionReads(
  client: Knex,
  statements: () => Promise<unknown>,
) {
  const sql: string[] = [];
  const log = (q: { sql: string }) => {
    if (/nr_sync_partitions/.test(q.sql) && /^select/i.test(q.sql))
      sql.push(q.sql);
  };
  client.on('query', log);
  try {
    await statements();
  } finally {
    client.off('query', log);
  }
  return sql;
}

it('builds the same snapshots from the same rows in id order as the paged read did', async () => {
  const { db, sync } = await fixture();
  const built = await sync.build(projectId, link, project);
  const rows = handed();
  const paged = await pagedRows(db, projectId);
  expect(rows).toHaveLength(300);
  expect(rows).toEqual(paged);
  // Numeric id order, across ids of different lengths: 90, 103, …, 999, 1002, …
  const ids = rows.map((r: { id: string }) => BigInt(r.id));
  expect(
    ids.every((id: bigint, i: number) => i === 0 || ids[i - 1]! < id),
  ).toBe(true);
  expect(new Set(rows.map((r: { id: string }) => r.id.length))).toEqual(
    new Set([2, 3, 4]),
  );
  expect(JSON.stringify(built)).toBe(
    JSON.stringify(buildSnapshots(paged, project)),
  );
  // Rows of another project or resource never reach the snapshots.
  const history = (key: string) =>
    built.find((s: { key: string }) => s.key === key).payload;
  expect(
    history('history-web').map((r: { views: number }) => r.views),
  ).not.toContain(999);
  expect(
    history('history-search').map((r: { clicks: number }) => r.clicks),
  ).not.toContain(999);
});

it('sorts only the ids of every stored day, and reads the days by key without an offset', async () => {
  const { sync, client } = await fixture();
  const statements = await partitionReads(client, () =>
    sync.build(projectId, link, project),
  );
  // The ids, then the 180 days other than page days in one read by key, then the 120 page days 7 at a time. NocoBase 3
  // still sorts each read in a temporary B-tree (its id order is a nulls-last `case`), but only the ids of every stored
  // day, and the payloads a read at a time.
  expect(statements).toHaveLength(2 + Math.ceil(120 / 7));
  for (const sql of statements) expect(sql).not.toMatch(/offset/i);
  const [listing, ...byKey] = statements as [string, ...string[]];
  expect(listing).not.toMatch(/payload/);
  for (const sql of byKey) expect(sql).toMatch(/payload/);
  // Either index that leads with the project serves the ids; SQLite picks between them without statistics.
  expect(await planOf(client, listing)).toMatch(
    /SEARCH .* USING INDEX ix_nr_sync_partitions_project_(source_date|updated_at) \(project_id=\?\)/,
  );
  for (const sql of byKey)
    expect(await planOf(client, sql)).toMatch(
      /SEARCH .* USING INDEX sqlite_autoindex_nr_sync_partitions_1 \(id=\?\)/,
    );
});

it("reads the latest write for the snapshots' key from the (project, updatedAt) index, not past every payload", async () => {
  const { sync, client } = await fixture();
  const statements = await partitionReads(client, () =>
    sync.snapshotKey(projectId, link, project),
  );
  // The count, then the latest write, of the days other than page days and of the page days the snapshots read. The
  // nulls-last `case` order still sorts in a temporary B-tree, but updated_at now comes from the index: stored after the
  // payload, it was read through every payload of the project. Grain and date are stored before it.
  expect(statements).toHaveLength(4);
  const latest = statements.filter((sql) => /order by/i.test(sql));
  expect(latest).toHaveLength(2);
  for (const sql of latest) {
    expect(sql).toMatch(/updated_at/);
    expect(sql).not.toMatch(/payload/);
    expect(await planOf(client, sql)).toMatch(
      /SEARCH .* USING INDEX ix_nr_sync_partitions_project_updated_at \(project_id=\?\)/,
    );
  }
});

it('reads uncommitted rows inside a transaction without keeping them, and restores a kept build by its key', async () => {
  const { db, sync } = await fixture();
  const outside = await sync.snapshots(projectId);
  await Promise.all([...(sync.keeping?.values() || [])]);
  const kept = await db
    .getRepository('nrSnapshots')
    .findOne({ filter: { key: `sync-snapshots:${projectId}` } });
  expect(kept?.get('payload').value).toEqual(
    JSON.parse(JSON.stringify(outside)),
  );
  const changed = dateAt(0);
  // A later write, so the stored data's key moves inside the transaction.
  vi.setSystemTime('2026-09-30T13:00:00Z');
  await expect(
    db.sequelize.transaction(async () => {
      await db.getRepository('nrSyncPartitions').update({
        filter: { projectId, source: 'ga4', grain: 'overview', date: changed },
        values: {
          payload: [
            { date: changed, views: 4242, sessions: 1, conversions: 0 },
          ],
        },
      });
      const inside = new SyncService(sync.p),
        build = vi.spyOn(inside, 'build');
      const snapshots = await inside.snapshots(projectId);
      expect(build).toHaveBeenCalledTimes(1);
      expect(handed()).toEqual(await pagedRows(db, projectId));
      expect(
        snapshots
          .find((s: { key: string }) => s.key === 'history-web')
          .payload.find((r: { date: string }) => r.date === changed).views,
      ).toBe(4242);
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  // The build inside the transaction was never kept; the committed copy still matches and is restored.
  const restarted = new SyncService(sync.p),
    build = vi.spyOn(restarted, 'build');
  expect(await restarted.snapshots(projectId)).toEqual(outside);
  expect(build).not.toHaveBeenCalled();
});
