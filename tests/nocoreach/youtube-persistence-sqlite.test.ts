// @vitest-environment node
import { describeMigration } from '@nocobase/app-testing/server';
import { expect, it, onTestFinished, vi } from 'vitest';
import { YouTubeSource } from '../../server/nocoreach/youtube-source.js';
import type { Video } from '../../server/nocoreach/youtube-provider.js';
import {
  details,
  found,
  migrations,
  videoKey as id,
  youtubeFixture,
} from './fixtures/youtube.js';

/** A video the earlier Collector reader (yt-dlp) saved, with captions. */
const video = (n: number, at = '2020-01-01T00:00:00.000Z'): Video => ({
  ...details(n, { views: n, likes: n, comments: n, publishedAt: null }),
  fetchedAt: at,
  provider: 'yt-dlp',
  transcript: {
    status: 'manual',
    language: 'en',
    text: 'Previously read caption',
    truncated: false,
  },
});

it('appends discoveries, merges valid metrics, keeps first-seen times and captions, and survives disconnect and restart', async () => {
  const f = await youtubeFixture();
  await f.library.save('1', [video(2)]);
  await f.connect();
  const first = await f.videos();
  expect(first.map((v) => v.id)).toEqual([id(1), id(2)]);
  // Video 2 was saved already, so only video 1's likes and comments are read.
  expect(f.reader.details.mock.calls.map((c) => c[1])).toEqual([id(1)]);
  expect(first[1]).toMatchObject({
    views: 200,
    likes: 2,
    comments: 2,
    firstSeenAt: '2020-01-01T00:00:00.000Z',
    metricFetchedAt: { likes: '2020-01-01T00:00:00.000Z' },
    transcript: { text: 'Previously read caption' },
    transcriptFetchedAt: '2020-01-01T00:00:00.000Z',
    provider: 'dataforseo',
  });
  f.reader.search.mockResolvedValue({
    ok: true,
    videos: [found(2, { views: null }), found(3)],
    costUsd: 0.002,
  });
  f.reader.details.mockImplementation(async (_id, key) => ({
    ok: true,
    video: details(Number(key.slice(5)), { likes: 0, comments: null }),
    costUsd: 0.006,
  }));
  const second = await f.sync();
  expect(second.total).toBe(3);
  const after = await f.videos();
  expect(after[1]).toMatchObject({ views: 200, likes: 2, comments: 2 });
  expect(after[2]).toMatchObject({ likes: 0, comments: null });
  f.reader.search.mockResolvedValue({ ok: true, videos: [], costUsd: 0.002 });
  expect((await f.connect('1', 'Entirely different terms')).total).toBe(3);
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
  expect((await f.videos())[0]).toEqual(after[0]);
  await expect(restarted.sync('1')).rejects.toMatchObject({
    code: 'invalid_input',
  });
});

it('keeps every saved video when a read gets nothing through', async () => {
  const f = await youtubeFixture();
  await f.connect();
  const before = await f.videos();
  f.reader.search.mockResolvedValue({
    ok: false,
    missed: 'failed',
    costUsd: 0,
  });
  await f.sync();
  expect(await f.videos()).toEqual(before);
  expect((await f.source.status('1')).lastSync).toMatchObject({
    ok: false,
    code: 'upstream_error',
  });
});

it('clears only the confirmed project and pauses its daily reading', async () => {
  const f = await youtubeFixture();
  await f.connect('2');
  const status = await f.connect();
  await expect(
    f.source.clear('1', { revision: 'stale' }),
  ).rejects.toMatchObject({ code: 'config_changed' });
  const cleared = await f.source.clear('1', { revision: status.revision });
  expect(cleared).toMatchObject({
    total: 0,
    configured: true,
    autoSync: false,
    recent: [],
  });
  expect(cleared.revision).not.toBe(status.revision);
  expect((await f.source.status('2')).total).toBe(2);
  await expect(
    f.source.clear('1', { revision: status.revision }),
  ).rejects.toMatchObject({ code: 'config_changed' });
  await f.migrate(migrations);
  expect((await f.source.status('1')).total).toBe(0);
});

it('does not write when parallel status reads join or roll back a SQLite transaction', async () => {
  const f = await youtubeFixture();
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
      expect(statuses.map((s) => s.recent)).toEqual([
        before.recent,
        before.recent,
      ]);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  expect(writes).not.toHaveBeenCalled();
  expect((await f.source.status('1')).recent).toEqual(before.recent);
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

it('analysis reads only the current read and never another project or a disconnected library', async () => {
  const f = await youtubeFixture();
  await f.connect('1');
  expect((await f.source.analysisData('1')).map((v) => v.id).sort()).toEqual([
    id(1),
    id(2),
  ]);
  expect(await f.source.analysisData('2')).toEqual([]);
  f.reader.search.mockResolvedValue({
    ok: true,
    videos: [found(3)],
    costUsd: 0.002,
  });
  await f.connect('1', 'Changed terms');
  expect((await f.source.status('1')).total).toBe(3);
  expect((await f.source.analysisData('1')).map((v) => v.id)).toEqual([id(3)]);
  await f.source.disconnect('1', {
    revision: (await f.source.status('1')).revision,
  });
  expect(await f.source.analysisData('1')).toEqual([]);
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

it('keeps publication dates on refresh and does not restore an invalid legacy one', async () => {
  const f = await youtubeFixture();
  await f.library.save('1', [
    video(1),
    { ...video(2), publishedAt: '2020-01-01' },
  ]);
  const [previous] = await f.library.byIds('1', [id(1)]);
  // The publication migration deliberately leaves legacy payloads intact.
  await f.db.getRepository('nrYouTubeVideos').update({
    filterByTk: `1:${id(1)}`,
    values: {
      payload: { ...previous, publishedAt: '2026-02-30' },
      publishedAt: null,
      publishedAtKnown: false,
    },
  });
  await f.library.save('1', [video(1), video(2)]);
  const result = await f.library.byIds('1', [id(1), id(2)]);
  expect(result.map((v) => v.publishedAt)).toEqual([null, '2020-01-01']);
  const stored = await f.db
    .getRepository('nrYouTubeVideos')
    .findOne({ filterByTk: `1:${id(1)}` });
  expect(stored?.get('publishedAt')).toBeNull();
  expect(stored?.get('publishedAtKnown')).toBe(false);
});

it('reports every saved video of a large library and returns full records for the requested page only', async () => {
  const f = await youtubeFixture();
  // @ts-expect-error The server modules are plain JavaScript under ts-nocheck.
  const { windowFor } = await import('../../server/nocoreach/data-views.js');
  // More than one summary batch (500 rows), and another project's record.
  await f.library.save(
    '1',
    Array.from({ length: 501 }, (_, i) => ({
      ...video(i + 1),
      publishedAt: `2026-0${1 + (i % 9)}-15`,
    })),
  );
  await f.library.save('2', [video(9999)]);
  const report = await f.source.report(
    '1',
    { range: 'all', limit: 3 },
    windowFor,
  );
  expect(report.matched).toBe(501);
  expect(report.total).toBe(501);
  expect(report.kpis.find((k) => k.key === 'total')?.value).toBe(501);
  expect(report.kpis.find((k) => k.key === 'views')?.value).toBe(
    (501 * 502) / 2,
  );
  expect(report.videos).toHaveLength(3);
  expect(report.videos.every((v) => v.publishedAt === '2026-09-15')).toBe(true);
  expect(report.videos[0].transcript?.text).toBe('Previously read caption');
});
