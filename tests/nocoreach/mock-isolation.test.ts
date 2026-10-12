// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  assertMockDatasetMode,
  assertPristineMockDataset,
} from '../../server/nocoreach/mock-isolation.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { MOCK_DATASET_MARKER } from '../../app-plugins/nocoreach-mock/server/engine.js';

function database(rows: Record<string, Record<string, unknown>[]> = {}) {
  return {
    getRepository: (name: string) => ({
      count: vi.fn(async () => (rows[name] ?? []).length),
      find: vi.fn(async () => rows[name] ?? []),
      findOne: vi.fn(async () =>
        (rows[name] ?? []).find((row) => row.name === MOCK_DATASET_MARKER),
      ),
    }),
  } as unknown as LegacyDatabase;
}
describe('mock dataset isolation before plugin workers boot', () => {
  it('permits an empty dedicated database and inert migration metadata', async () => {
    await expect(
      assertPristineMockDataset(database()),
    ).resolves.toBeUndefined();
    await expect(
      assertPristineMockDataset(
        database({
          nrSnapshots: [
            { key: 'daily-analysis:workflow' },
            { key: 'nr-migrations:example' },
          ],
        }),
      ),
    ).resolves.toBeUndefined();
  });
  it.each([
    'nrTasks',
    'nrGoogleLinks',
    'nrSyncJobs',
    'nrSyncPartitions',
    'nrKeywordRuns',
    'nrKeywordCandidates',
    'nrYouTubeVideos',
    'nrVariables',
  ])(
    'refuses existing %s rows, including unreadable credentials',
    async (name) => {
      await expect(
        assertPristineMockDataset(
          database({ [name]: [{ secret: true, value: 'unreadable' }] }),
        ),
      ).rejects.toMatchObject({ code: 'NR_MOCK_PRISTINE_DATABASE_REQUIRED' });
    },
  );
  it.each([
    'project:1',
    'nr-members',
    'daily-analysis:occurrence:1',
    'github:1',
    null,
  ])('refuses existing business snapshot %s', async (key) => {
    await expect(
      assertPristineMockDataset(database({ nrSnapshots: [{ key }] })),
    ).rejects.toMatchObject({ code: 'NR_MOCK_PRISTINE_DATABASE_REQUIRED' });
  });
  it.each(['', 'bad-json', '{"version":1,"environment":"test"}'])(
    'refuses live boot on marker presence, regardless of value %s',
    async (value) => {
      await expect(
        assertMockDatasetMode(
          database({ nrVariables: [{ name: MOCK_DATASET_MARKER, value }] }),
          false,
        ),
      ).rejects.toMatchObject({ code: 'NR_MOCK_DATASET_CANNOT_RUN_LIVE' });
    },
  );
  it('validates mock restart markers and leaves live unmarked data alone', async () => {
    await expect(
      assertMockDatasetMode(database({ nrTasks: [{}] }), false),
    ).resolves.toBeUndefined();
    await expect(
      assertMockDatasetMode(
        database({ nrVariables: [{ name: MOCK_DATASET_MARKER, value: '' }] }),
        true,
      ),
    ).rejects.toMatchObject({ code: 'NR_MOCK_DATASET_MARKER_INVALID' });
    await expect(
      assertMockDatasetMode(
        database({
          nrTasks: [{}],
          nrVariables: [
            {
              name: MOCK_DATASET_MARKER,
              value: '{"version":1,"environment":"test"}',
              secret: false,
            },
          ],
        }),
        true,
      ),
    ).resolves.toBeUndefined();
  });
});

it('refuses first activation on durable YouTube data without a connection snapshot', async () => {
  const testDb = await createTestDatabase({
    migrations: [
      {
        packageName: 'nocoreach',
        directory: fileURLToPath(
          new URL('../../database/main/migrations', import.meta.url),
        ),
      },
    ],
  });
  onTestFinished(() => testDb.destroy());
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  await expect(assertMockDatasetMode(db, true)).resolves.toBeUndefined();
  await db.getRepository('nrYouTubeVideos').create({
    values: {
      id: '1:video000001',
      projectId: '1',
      videoId: 'video000001',
      payload: { title: 'Previously saved research' },
    },
  });
  expect(await db.getRepository('nrSnapshots').count()).toBe(0);
  await expect(assertMockDatasetMode(db, true)).rejects.toMatchObject({
    code: 'NR_MOCK_PRISTINE_DATABASE_REQUIRED',
  });
  await expect(assertMockDatasetMode(db, false)).resolves.toBeUndefined();
});
