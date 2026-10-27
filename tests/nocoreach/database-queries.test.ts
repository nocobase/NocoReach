// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let legacy: LegacyDatabase;
beforeAll(async () => {
  db = await createTestDatabase({
    migrations: [
      {
        packageName: 'nocoreach',
        directory: fileURLToPath(
          new URL('../../database/main/migrations', import.meta.url),
        ),
      },
    ],
  });
  legacy = new LegacyDatabase(
    db.database,
    new SnowflakeIdGenerator({ workerId: 2 }),
  );
}, 120_000);
afterAll(async () => {
  await db?.destroy();
});

test('case-insensitive searches preserve the project scope for every pattern shape', async () => {
  const tasks = legacy.getRepository('nrTasks');
  for (const [projectId, title] of [
    ['search', 'NocoReach Growth'],
    ['search', 'unrelated'],
    ['other', 'NocoReach Growth'],
  ])
    await tasks.create({ values: { projectId, title } });
  for (const pattern of ['%REACH%', 'noco%', '%GROWTH', 'NOCOREACH GROWTH']) {
    const rows = await tasks.find({
      filter: { projectId: 'search', title: { $iLike: pattern } },
    });
    expect(rows.map((row) => row.title)).toEqual(['NocoReach Growth']);
  }
  expect(
    await tasks.count({
      filter: { projectId: 'search', title: { $iLike: '%missing%' } },
    }),
  ).toBe(0);
});

test('JSON uses native structural filters and cannot accidentally become a text LIKE', async () => {
  const snapshots = legacy.getRepository('nrSnapshots');
  for (const [key, tags] of [
    ['json-one', ['growth', 'seo']],
    ['json-two', ['regrowth']],
  ] as const)
    await snapshots.create({
      values: { key, payload: { tags, enabled: true, text: 'NocoReach' } },
    });
  const rows = await db.database.repository('nrSnapshots').findMany({
    filter: (filter) =>
      filter.and([
        filter.string('key').startsWith('json-'),
        filter.json('payload').path(['tags']).has('growth'),
        filter.json('payload').path(['enabled']).eq(true),
      ]),
  });
  expect(rows.map((row) => row.key)).toEqual(['json-one']);
  await expect(
    snapshots.find({ filter: { payload: { $like: '%growth%' } } }),
  ).rejects.toThrow();
});

test('boolean writes and filters use true and false, rejecting numeric flags before storage', async () => {
  const links = legacy.getRepository('nrGoogleLinks');
  const row = await links.create({
    values: { projectId: 'boolean', scheduleEnabled: true },
  });
  expect(
    await links.count({
      filter: { projectId: 'boolean', scheduleEnabled: true },
    }),
  ).toBe(1);
  await links.update({
    filterByTk: row.id,
    values: { scheduleEnabled: false },
  });
  expect(
    await links.findOne({
      filter: { projectId: 'boolean', scheduleEnabled: { $eq: false } },
    }),
  ).toMatchObject({ scheduleEnabled: false });
  await expect(
    links.update({ filterByTk: row.id, values: { scheduleEnabled: 1 } }),
  ).rejects.toThrow();
  expect(await links.findOne({ filterByTk: row.id })).toMatchObject({
    scheduleEnabled: false,
  });
});

test('varchar bounds apply to creates and transactional updates, counting Unicode code points', async () => {
  const tasks = legacy.getRepository('nrTasks');
  const title = '🚀'.repeat(255);
  const row = await tasks.create({
    values: { projectId: 'length', title, brief: 'x'.repeat(1000) },
  });
  expect(row.title).toBe(title);
  await expect(
    tasks.create({ values: { projectId: 'length', title: title + 'x' } }),
  ).rejects.toMatchObject({ code: 'INVALID_MUTATION', field: 'title' });
  await expect(
    legacy.sequelize.transaction(async (transaction) => {
      await tasks.update({
        filterByTk: row.id,
        values: { title: 'x'.repeat(256) },
        transaction,
      });
    }),
  ).rejects.toMatchObject({ code: 'INVALID_MUTATION', field: 'title' });
  expect(await tasks.findOne({ filterByTk: row.id })).toMatchObject({
    title,
    brief: 'x'.repeat(1000),
  });
  expect(await tasks.count({ filter: { projectId: 'length' } })).toBe(1);
});

test('pagination uses the unique ID to break timestamp ties and preserves explicit ID direction', async () => {
  const tasks = legacy.getRepository('nrTasks');
  for (const id of ['30', '10', '40', '20'])
    await tasks.create({
      values: {
        id,
        projectId: 'pagination',
        title: id,
        createdAt: '2026-10-27T00:00:00.000Z',
      },
    });
  const page = async (offset: number, sort?: string[]) =>
    (
      await tasks.find({
        filter: { projectId: 'pagination' },
        sort,
        offset,
        limit: 2,
      })
    ).map((row) => row.id);
  expect([
    ...(await page(0, ['-createdAt'])),
    ...(await page(2, ['-createdAt'])),
  ]).toEqual(['10', '20', '30', '40']);
  expect([...(await page(0)), ...(await page(2))]).toEqual([
    '10',
    '20',
    '30',
    '40',
  ]);
  expect(await page(0, ['-createdAt', '-id'])).toEqual(['40', '30']);
});
