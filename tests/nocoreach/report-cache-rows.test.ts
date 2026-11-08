// @vitest-environment node
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterEach, expect, it, vi } from 'vitest';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { GoogleReportCache } from '../../server/nocoreach/google-report-cache.js';
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
