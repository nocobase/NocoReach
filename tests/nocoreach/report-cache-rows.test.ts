// @vitest-environment node
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterEach, expect, it, vi } from 'vitest';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import {
  GoogleReportCache,
  waitForFresh,
} from '../../server/nocoreach/google-report-cache.js';
import { isProjectSnapshot } from '../../server/nocoreach/demo-data/clear.js';

afterEach(() => vi.useRealTimers());

async function fixture() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-11-08T06:00:00Z');
  const testDb = await createNocoReachTestDatabase();
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const snapshots = db.getRepository('nrSnapshots');
  const rows = async () =>
    (
      await snapshots.find({
        filter: { key: { $startsWith: 'google-local-reports:1' } },
      })
    ).map((r) => ({
      key: String(r.get('key')),
      payload: r.get('payload') as Record<string, unknown>,
      updatedAt: String(r.get('updatedAt')),
    }));
  const index = async () =>
    (await rows()).find((r) => r.key === 'google-local-reports:1')?.payload as
      { entries: Record<string, unknown>[] } | undefined;
  return { db, snapshots, rows, index };
}

const cache = (db: LegacyDatabase) =>
  new GoogleReportCache(db, 'google-local-reports');

it('keeps each report in a row of its own, named by a small index, and reads them back after a restart', async () => {
  const { db, rows, index } = await fixture();
  const first = cache(db);
  const big = 'x'.repeat(100000);
  expect(await first.load('1', ['a'], async () => ({ a: big }))).toEqual({
    a: big,
  });
  expect(await first.load('1', ['b'], async () => ({ b: 2 }))).toEqual({
    b: 2,
  });
  const saved = await index();
  expect(saved?.entries).toHaveLength(2);
  // The index holds no value, only what finds and bounds the reports.
  for (const entry of saved!.entries) {
    expect(entry).not.toHaveProperty('value');
    expect(Object.keys(entry).sort()).toEqual(
      ['at', 'bytes', 'expiresAt', 'key'].sort(),
    );
  }
  expect((await rows()).map((r) => r.key).sort()).toEqual(
    [
      'google-local-reports:1',
      ...saved!.entries.map((e) => `google-local-reports:1:${String(e.key)}`),
    ].sort(),
  );
  // A restart reads each back from its row without building it again.
  const restarted = cache(db),
    build = vi.fn(async () => ({ a: 'rebuilt' }));
  expect(await restarted.load('1', ['a'], build)).toEqual({ a: big });
  expect(build).not.toHaveBeenCalled();
});

it('saves one report without writing the others again', async () => {
  const { db, rows } = await fixture();
  const reports = cache(db);
  await reports.load('1', ['a'], async () => ({ a: 'x'.repeat(50000) }));
  const before = await rows();
  vi.setSystemTime('2026-11-08T06:05:00Z');
  await reports.load('1', ['b'], async () => ({ b: 2 }));
  const after = await rows();
  const a = (list: typeof before) =>
    list.find(
      (r) =>
        r.key.startsWith('google-local-reports:1:') &&
        'a' in ((r.payload as { value?: object }).value ?? {}),
    )!;
  // Report a's row is untouched; only the index and b's new row were written.
  expect(a(after).updatedAt).toBe(a(before).updatedAt);
  expect(after).toHaveLength(3);
});

it('removes the rows of reports a family replaces, and rows no index names', async () => {
  const { db, snapshots, rows, index } = await fixture();
  const reports = cache(db);
  await reports.load(
    '1',
    ['day', 1],
    async () => ({ day: 1 }),
    undefined,
    undefined,
    {
      family: ['view'],
    },
  );
  // A row a save left behind before naming it, as when the process stopped between the two writes.
  await snapshots.create({
    values: { key: 'google-local-reports:1:orphan', payload: { value: 1 } },
  });
  vi.setSystemTime('2026-11-09T06:00:00Z');
  await reports.load(
    '1',
    ['day', 2],
    async () => ({ day: 2 }),
    undefined,
    undefined,
    {
      family: ['view'],
    },
  );
  // The day before answers at once as a copy; the new day is read and saved in the background.
  await reports.settled();
  const saved = await index();
  expect(saved?.entries).toHaveLength(1);
  expect((await rows()).map((r) => r.key).sort()).toEqual(
    [
      'google-local-reports:1',
      `google-local-reports:1:${String(saved!.entries[0]!.key)}`,
    ].sort(),
  );
  // Another project's rows are not touched.
  expect(isProjectSnapshot('google-local-reports:1:abc', '1')).toBe(true);
  expect(isProjectSnapshot('google-local-reports:1:abc', '2')).toBe(false);
});

it('reads an index saved with its values (before 2026-11-08), and moves them into rows of their own on the next save', async () => {
  const { db, snapshots, rows, index } = await fixture();
  const at = Date.now() - 1000;
  // The key the cache gives the identity ['old'] of project 1.
  const { createHash } = await import('node:crypto');
  const key = (identity: unknown[]) =>
    createHash('sha256')
      .update(JSON.stringify([1, '1', ...identity]))
      .digest('hex');
  await snapshots.create({
    values: {
      key: 'google-local-reports:1',
      payload: {
        entries: [
          {
            key: key(['old']),
            at,
            expiresAt: at + 3600000,
            value: { old: true },
          },
        ],
      },
    },
  });
  const reports = cache(db),
    build = vi.fn(async () => ({ old: false }));
  expect(await reports.load('1', ['old'], build)).toEqual({ old: true });
  expect(build).not.toHaveBeenCalled();
  await reports.load('1', ['new'], async () => ({ fresh: true }));
  const saved = await index();
  expect(saved?.entries.map((e) => e.key).sort()).toEqual(
    [key(['old']), key(['new'])].sort(),
  );
  expect(saved!.entries.every((e) => !('value' in e))).toBe(true);
  expect(await rows()).toHaveLength(3);
  // Both read back from their rows after a restart.
  const restarted = cache(db);
  expect(await restarted.load('1', ['old'], build)).toEqual({ old: true });
  expect(build).not.toHaveBeenCalled();
});

it('keeps both reports when two caches of one namespace save at once', async () => {
  const { db, rows, index } = await fixture();
  // DataViews and the Insights summary's DataViews each hold a cache of the same namespace.
  const one = cache(db),
    other = cache(db);
  await Promise.all([
    one.load('1', ['a'], async () => ({ a: 1 })),
    other.load('1', ['b'], async () => ({ b: 2 })),
    one.load('1', ['c'], async () => ({ c: 3 })),
  ]);
  const saved = await index();
  expect(saved?.entries).toHaveLength(3);
  const keys = (await rows()).map((r) => r.key);
  expect(keys).toHaveLength(4);
  expect(new Set(keys).size).toBe(4);
  for (const entry of saved!.entries)
    expect(keys).toContain(`google-local-reports:1:${String(entry.key)}`);
});

it('reads a row once for the callers asking at once, and only the row of the report the index names', async () => {
  const { db, snapshots } = await fixture();
  await cache(db).load('1', ['a'], async () => ({ a: 1 }));
  const restarted = cache(db);
  const findOne = vi.spyOn(snapshots, 'findOne');
  const repository = vi.spyOn(db, 'getRepository').mockReturnValue(snapshots);
  const build = vi.fn(async () => ({ a: 'rebuilt' }));
  try {
    const answers = await Promise.all(
      [1, 2, 3].map(() => restarted.load('1', ['a'], build)),
    );
    expect(answers).toEqual([{ a: 1 }, { a: 1 }, { a: 1 }]);
    expect(build).not.toHaveBeenCalled();
    const valueReads = findOne.mock.calls.filter((c) =>
      String((c[0] as { filter: { key: string } }).filter.key).startsWith(
        'google-local-reports:1:',
      ),
    );
    expect(valueReads).toHaveLength(1);
  } finally {
    repository.mockRestore();
  }
  // A row whose time is not the index's (a save cut short before its index) is not answered: the report is built again.
  const row = (
    await snapshots.find({
      filter: { key: { $startsWith: 'google-local-reports:1:' } },
    })
  )[0]!;
  await snapshots.update({
    filter: { key: String(row.get('key')) },
    values: {
      payload: {
        ...(row.get('payload') as object),
        at: Date.now() - 10,
        value: { a: 'other' },
      },
    },
  });
  expect(await cache(db).load('1', ['a'], build)).toEqual({ a: 'rebuilt' });
});

it("shares a row's read only between callers holding the same saved report", async () => {
  const { db } = await fixture();
  const first = cache(db);
  await first.load('1', ['a'], async () => ({ a: 1 }));
  const index = (
    await db
      .getRepository('nrSnapshots')
      .findOne({ filter: { key: 'google-local-reports:1' } })
  )?.get('payload') as { entries: Record<string, unknown>[] };
  const saved = index.entries[0]!;
  // One caller holds an older index of the key, the other the current one; each is answered by its own `at`.
  const reader = cache(db) as unknown as {
    value(p: string, s: Record<string, unknown>): Promise<unknown>;
  };
  const [older, current] = await Promise.all([
    reader.value('1', { ...saved, at: Number(saved.at) - 1000 }),
    reader.value('1', saved),
  ]);
  expect(older).toBeUndefined();
  expect(current).toMatchObject({ value: { a: 1 } });
});

it("answers a view's new window from the copy the index names, not an older one this cache holds", async () => {
  const { db } = await fixture();
  const view = { family: ['view'] };
  // This cache reads day 1 and holds it.
  const holder = cache(db);
  await holder.load(
    '1',
    ['day', 1],
    async () => ({ day: 1 }),
    () => 1000,
    undefined,
    view,
  );
  // Another cache of the namespace (the Insights summary's) reads day 1 again once it has expired.
  vi.setSystemTime(Date.now() + 2000);
  await waitForFresh(() =>
    cache(db).load(
      '1',
      ['day', 1],
      async () => ({ day: '1 again' }),
      undefined,
      undefined,
      view,
    ),
  );
  // The new day is still being read: the copy answered is the one the index names.
  const pending = () => new Promise<{ day: number }>(() => undefined);
  expect(
    await holder.load('1', ['day', 2], pending, undefined, undefined, view),
  ).toEqual({
    day: '1 again',
  });
});
