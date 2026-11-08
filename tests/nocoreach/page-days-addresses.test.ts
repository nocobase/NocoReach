// @vitest-environment node
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it } from 'vitest';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { fillDays, sumPageDays } from '../../server/nocoreach/page-days.js';

const property = '123';

// More addresses summed than a sum reads by id (2,000), their ids spread over several spans of 5,000 by another
// project's addresses created between them, so the reads by span skip and bound the rows they read.
it('names every address summed, read by spans of ids when there are many, leaving out other projects', async () => {
  const testDb = await createNocoReachTestDatabase('fresh');
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const partitions = db.getRepository('nrSyncPartitions');
  const store = (projectId: string, date: string, pages: string[]) =>
    partitions.create({
      values: {
        partitionKey: JSON.stringify([
          projectId,
          'ga4',
          property,
          date,
          'page',
        ]),
        projectId,
        source: 'ga4',
        resource: property,
        date,
        grain: 'page',
        payload: pages.map((page, i) => ({
          host: 'example.test',
          page,
          views: 1 + (i % 3),
          conversions: 0,
        })),
      },
    });
  const pages = (prefix: string, from: number, n: number) =>
    Array.from({ length: n }, (_, i) => `/${prefix}/${from + i}`);
  // Project 1's addresses in three runs, 6,000 of project 2's between the first two.
  await store('1', '2026-10-01', pages('a', 0, 1500));
  await fillDays(db, '1', 'ga4', property);
  await store('2', '2026-10-01', pages('b', 0, 6000));
  await fillDays(db, '2', 'ga4', property);
  await store('1', '2026-10-02', pages('a', 1500, 1500));
  await fillDays(db, '1', 'ga4', property);
  const { rows } = await sumPageDays(db, '1', 'ga4', property, [
    { start: '2026-10-01', end: '2026-10-02' },
  ]);
  expect(rows).toHaveLength(3000);
  expect(new Set(rows.map((r) => r.path))).toEqual(
    new Set(pages('a', 0, 3000)),
  );
  expect(rows.reduce((n, r) => n + (r.views ?? 0), 0)).toBe(
    2 * (500 * 1 + 500 * 2 + 500 * 3),
  );
  // A short range sums few addresses, read by id.
  const day = await sumPageDays(db, '1', 'ga4', property, [
    { start: '2026-10-02', end: '2026-10-02' },
  ]);
  expect(new Set(day.rows.map((r) => r.path))).toEqual(
    new Set(pages('a', 1500, 1500)),
  );
}, 120000);
