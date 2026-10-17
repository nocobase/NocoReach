// @vitest-environment node
import { fileURLToPath } from 'node:url';
import {
  createTestDatabase,
  describeMigration,
} from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it, onTestFinished, vi } from 'vitest';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles.js';
import { YouTubeSource } from '../../server/nocoreach/youtube-source.js';
import {
  YouTubeError,
  type Video,
} from '../../server/nocoreach/youtube-provider.js';

const migrations = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
  },
];
const id = (n: number) => `video${String(n).padStart(6, '0')}`;
const video = (n: number, at = '2020-01-01T00:00:00.000Z'): Video => ({
  id: id(n),
  url: `https://www.youtube.com/watch?v=${id(n)}`,
  title: `Video ${n}`,
  description: 'Synthetic research data',
  channel: 'Test channel',
  publishedAt: null,
  views: n,
  likes: n,
  comments: n,
  duration: 60,
  fetchedAt: at,
  provider: 'yt-dlp',
  transcript: {
    status: 'manual',
    language: 'en',
    text: 'Previously read caption',
    truncated: false,
  },
});
async function fixture() {
  const testDb = await createTestDatabase({ migrations });
  onTestFinished(() => testDb.destroy());
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const network = new OutboundNetwork(
    new ProxyProfiles({ all: () => ({}), set: vi.fn() }),
  );
  const reader = {
    search: vi.fn(async () => [id(1), id(2)]),
    video: vi.fn(async (key: string) => video(Number(key.slice(5)))),
  };
  const host = {
    collectors: { allowed: () => [] },
    db,
    network,
    project: async () => ({}),
    projectIds: async () => ['1', '2'],
    app: { logger: { warn: vi.fn() } },
  } as unknown as ConstructorParameters<typeof YouTubeSource>[0];
  const source = new YouTubeSource(host, reader);
  onTestFinished(async () => {
    await source.stop();
    await network.close();
  });
  const connect = async (project = '1', terms = 'Original criteria') => {
    const current = await source.status(project);
    await source.connect(project, {
      terms,
      revision: current.revision,
      autoSync: true,
    });
    await source.settled(project);
    return source.status(project);
  };
  const sync = async () => {
    await source.sync('1');
    await source.settled('1');
    return source.status('1');
  };
  return { ...testDb, db, network, host, reader, source, connect, sync };
}

it('appends discoveries, merges valid metrics, preserves first-seen and caption provenance, and survives disconnect/restart', async () => {
  const f = await fixture();
  const first = await f.connect();
  f.reader.search.mockResolvedValue([id(2), id(3)]);
  f.reader.video.mockImplementation(async (key) => ({
    ...video(Number(key.slice(5)), '2026-10-12T12:00:00.000Z'),
    views: null,
    likes: 0,
    comments: null,
    transcript: {
      status: 'failed',
      language: null,
      text: '',
      truncated: false,
    },
  }));
  const second = await f.sync();
  expect(second.total).toBe(3);
  const existing = second.videos.find((v) => v.id === id(2))!;
  expect(existing).toMatchObject({
    views: 2,
    likes: 0,
    comments: 2,
    firstSeenAt: first.videos.find((v) => v.id === id(2))!.firstSeenAt,
    metricFetchedAt: {
      views: '2020-01-01T00:00:00.000Z',
      likes: '2026-10-12T12:00:00.000Z',
    },
    transcript: { text: 'Previously read caption' },
    transcriptRefreshFailed: true,
    transcriptFetchedAt: '2020-01-01T00:00:00.000Z',
  });
  f.reader.search.mockResolvedValue([]);
  expect((await f.connect('1', 'Entirely different criteria')).total).toBe(3);
  const current = await f.source.status('1');
  await f.source.disconnect('1', { revision: current.revision });
  await f.source.stop();
  const restarted = new YouTubeSource(f.host, f.reader);
  onTestFinished(() => restarted.stop());
  expect(await restarted.status('1')).toMatchObject({
    configured: false,
    autoSync: false,
    total: 3,
  });
  expect(
    (await restarted.status('1')).videos.find((v) => v.id === id(1)),
  ).toEqual(first.videos.find((v) => v.id === id(1)));
  await expect(restarted.sync('1')).rejects.toMatchObject({
    code: 'invalid_input',
  });
});

it('keeps a whole prior batch when an update fails after the first fetched video', async () => {
  const f = await fixture();
  const first = await f.connect();
  f.reader.video.mockImplementation(async (key) => {
    if (key === id(2)) throw new YouTubeError('network_error');
    return { ...video(1), views: 999 };
  });
  expect((await f.sync()).videos).toEqual(first.videos);
  expect((await f.source.status('1')).lastSync).toMatchObject({
    ok: false,
    code: 'network_error',
  });
});

it('paginates saved records deterministically and deletes only the confirmed project while pausing reads', async () => {
  const f = await fixture();
  await f.connect('2');
  for (let batch = 0; batch < 3; batch++) {
    f.reader.search.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => id(batch * 15 + i + 1)),
    );
    if (!batch) await f.connect();
    else await f.sync();
  }
  const pages = await Promise.all(
    [1, 2, 3].map((page) => f.source.status('1', page)),
  );
  expect(pages.map((p) => p.videos.length)).toEqual([20, 20, 5]);
  expect(new Set(pages.flatMap((p) => p.videos.map((v) => v.id))).size).toBe(
    45,
  );
  expect(pages[0].total).toBe(45);
  expect((await f.source.status('1', 999)).page).toBe(3);
  await expect(f.source.status('1', -1)).rejects.toMatchObject({
    code: 'invalid_input',
  });
  await expect(
    f.source.clear('1', { revision: 'stale' }),
  ).rejects.toMatchObject({ code: 'config_changed' });
  const cleared = await f.source.clear('1', { revision: pages[0].revision });
  expect(cleared).toMatchObject({
    total: 0,
    configured: true,
    autoSync: false,
  });
  expect(cleared.revision).not.toBe(pages[0].revision);
  expect((await f.source.status('2')).total).toBe(2);
  await expect(
    f.source.clear('1', { revision: pages[0].revision }),
  ).rejects.toMatchObject({ code: 'config_changed' });
  await f.migrate(migrations);
  expect((await f.source.status('1')).total).toBe(0);
});

it('does not expire or write saved records when parallel readers join or roll back a SQLite transaction', async () => {
  const f = await fixture();
  const before = await f.connect();
  const writes = vi.fn();
  const unsubscribe = f.connection.onRepositoryMutation(
    { id: 'observe-reads', collections: ['nrYouTubeVideos', 'nrSnapshots'] },
    { inTransaction: writes },
  );
  onTestFinished(unsubscribe);
  const rollback = new Error('Roll back the caller');
  await expect(
    f.db.sequelize.transaction(async () => {
      const statuses = await Promise.all([
        f.source.status('1'),
        f.source.status('1'),
      ]);
      expect(statuses.map((s) => s.videos)).toEqual([
        before.videos,
        before.videos,
      ]);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  expect(writes).not.toHaveBeenCalled();
  expect((await f.source.status('1')).videos).toEqual(before.videos);
});

describeMigration('202610120001_persist_youtube_videos', {
  sources: migrations,
  reversible: false,
  before: async ({ connection }) => {
    for (const project of ['1', '2'])
      await connection.repository('nrSnapshots').createOne({
        values: {
          id: project,
          key: `youtube:${project}`,
          payload: {
            revision: `revision-${project}`,
            terms: ['Legacy'],
            videos: [video(1)],
          },
        },
      });
  },
  up: async ({ connection, expectCollection }) => {
    await expectCollection('nrYouTubeVideos').toHaveIndex(
      ['projectId', 'videoId'],
      { unique: true },
    );
    const rows = await connection.repository('nrYouTubeVideos').findMany();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.projectId))).toEqual(new Set(['1', '2']));
    expect(rows[0].payload).toMatchObject({
      title: 'Video 1',
      views: 1,
      metricFetchedAt: { views: '2020-01-01T00:00:00.000Z' },
    });
    const source = await connection
      .repository('nrSnapshots')
      .findOne({ filter: { key: 'youtube:1' } });
    expect(source!.payload).toEqual({
      revision: 'revision-1',
      terms: ['Legacy'],
    });
  },
});

it('analysis reads only the current discovery batch and never another project or disconnected library', async () => {
  const f = await fixture();
  await f.connect('1');
  expect((await f.source.analysisData('1')).map((v) => v.id).sort()).toEqual([
    id(1),
    id(2),
  ]);
  expect(await f.source.analysisData('2')).toEqual([]);
  f.reader.search.mockResolvedValue([id(3)]);
  await f.connect('1', 'Changed criteria');
  expect((await f.source.status('1')).total).toBe(3);
  expect((await f.source.analysisData('1')).map((v) => v.id)).toEqual([id(3)]);
  await f.source.disconnect('1', {
    revision: (await f.source.status('1')).revision,
  });
  expect(await f.source.analysisData('1')).toEqual([]);
});

it('orders publication dates across database pages, places unknowns last and preserves dates on refresh', async () => {
  const f = await fixture();
  const { YouTubeLibrary } =
    await import('../../server/nocoreach/youtube-library.js');
  const library = new YouTubeLibrary(f.db);
  await library.save(
    '1',
    Array.from({ length: 45 }, (_, i) => ({
      ...video(
        i + 1,
        `2026-09-${String(28 - (i % 28)).padStart(2, '0')}T00:00:00.000Z`,
      ),
      publishedAt:
        i < 2
          ? null
          : `2026-10-${String(Math.ceil((i - 1) / 2)).padStart(2, '0')}`,
    })),
  );
  const pages = await Promise.all(
    [1, 2, 3].map((page) => library.list('1', page)),
  );
  const ids = pages.flatMap((page) => page.videos.map((v) => v.id));
  const expected = Array.from({ length: 43 }, (_, i) => i + 3)
    .sort((a, b) => Math.ceil((b - 2) / 2) - Math.ceil((a - 2) / 2) || a - b)
    .concat([1, 2])
    .map(id);
  expect(ids).toEqual(expected);
  await library.save('1', [video(45)]);
  expect((await library.list('1')).videos[0]).toMatchObject({
    id: id(45),
    publishedAt: '2026-10-22',
  });
  await library.save('1', [{ ...video(45), publishedAt: '2026-10-01' }]);
  expect((await library.list('1')).videos[0].id).toBe(id(43));
});

describeMigration('202610170001_youtube_publication_order', {
  sources: migrations,
  reversible: true,
  before: async ({ connection }) => {
    for (let n = 1; n <= 105; n++) {
      await connection.repository('nrYouTubeVideos').createOne({
        values: {
          id: `1:${id(n)}`,
          projectId: '1',
          videoId: id(n),
          payload: {
            ...video(n),
            publishedAt: n === 1 ? null : n === 2 ? '2026-02-30' : '2026-10-15',
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }
  },
  up: async ({ connection, expectCollection }) => {
    await expectCollection('nrYouTubeVideos').toHaveIndex([
      'projectId',
      'publishedAtKnown',
      'publishedAt',
      'id',
    ]);
    const rows = await connection
      .repository('nrYouTubeVideos')
      .findMany({ limit: 200 });
    rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    expect(rows).toHaveLength(105);
    expect(rows.slice(0, 2).map((r) => r.publishedAt)).toEqual([null, null]);
    expect(
      rows
        .slice(2)
        .every((r) => r.publishedAt === '2026-10-15' && r.publishedAtKnown),
    ).toBe(true);
  },
});
