import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { onTestFinished, vi } from 'vitest';
import { LegacyDatabase } from '../../../server/nocoreach/legacy/database.js';
import { OutboundNetwork } from '../../../server/nocoreach/outbound-network.js';
import { ProxyProfiles } from '../../../server/nocoreach/proxy-profiles.js';
import type {
  FoundVideo,
  VideoDetails,
} from '../../../server/nocoreach/youtube-dataforseo.js';
import { YouTubeLibrary } from '../../../server/nocoreach/youtube-library.js';
import {
  YouTubeSource,
  type DetailsResult,
  type SearchResult,
  type YouTubeState,
} from '../../../server/nocoreach/youtube-source.js';

export const migrations = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../../database/main/migrations', import.meta.url),
    ),
  },
];
/** An 11-character YouTube video ID for a test number. */
export const videoKey = (n: number) => `video${String(n).padStart(6, '0')}`;
/** A video as YouTube search lists it through DataForSEO. */
export const found = (
  n: number,
  extra: Partial<FoundVideo> = {},
): FoundVideo => ({
  id: videoKey(n),
  url: `https://www.youtube.com/watch?v=${videoKey(n)}`,
  title: `Video ${n}`,
  description: 'Synthetic research data',
  channel: 'Test channel',
  publishedAt: '2026-10-15',
  views: n * 100,
  duration: 60,
  ...extra,
});
/** The same video as DataForSEO's video info reads it, with likes and comments. */
export const details = (
  n: number,
  extra: Partial<VideoDetails> = {},
): VideoDetails => ({ ...found(n), likes: n * 10, comments: n, ...extra });

/** A DataForSEO reader that finds videos 1 and 2 for every term, at list prices. */
export function fakeReader() {
  return {
    ready: vi.fn((_id: string) => true),
    search: vi.fn(
      async (
        _id: string,
        _term: string,
        _manual: boolean,
      ): Promise<SearchResult> => ({
        ok: true,
        videos: [found(1), found(2)],
        costUsd: 0.002,
      }),
    ),
    details: vi.fn(
      async (
        _id: string,
        key: string,
        _manual: boolean,
      ): Promise<DetailsResult> => ({
        ok: true,
        video: details(Number(key.slice(5))),
        costUsd: 0.006,
      }),
    ),
    spend: vi.fn(async (_id: string) => ({ monthUsd: 0.5, budgetUsd: 10 })),
  };
}

/** A YouTube source on a real migrated SQLite database, with a fake DataForSEO reader. */
export async function youtubeFixture() {
  const testDb = await createTestDatabase({ migrations });
  onTestFinished(() => testDb.destroy());
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const network = new OutboundNetwork(
    new ProxyProfiles({ all: () => ({}), set: vi.fn() }),
  );
  const reader = fakeReader();
  const host = {
    db,
    network,
    project: async () => ({}),
    projectIds: async () => ['1', '2'],
    app: { logger: { warn: vi.fn() } },
  } as unknown as ConstructorParameters<typeof YouTubeSource>[0];
  const source = new YouTubeSource(host, reader);
  const library = new YouTubeLibrary(db);
  onTestFinished(async () => {
    await source.stop();
    await network.close();
  });
  const connect = async (
    project = '1',
    terms = 'NocoBase',
    extra: Record<string, unknown> = {},
  ) => {
    const current = await source.status(project);
    await source.connect(project, {
      terms,
      revision: current.revision,
      ...extra,
    });
    await source.settled(project);
    return source.status(project);
  };
  const sync = async (project = '1') => {
    await source.sync(project);
    await source.settled(project);
    return source.status(project);
  };
  /** Every saved video of a project, in ID order. */
  const videos = async (project = '1') =>
    library.byIds(
      project,
      (await library.summaries(project)).map((video) => video.id),
    );
  const stored = async (project = '1') =>
    (
      await testDb.connection
        .repository('nrSnapshots')
        .findOne({ filter: { key: `youtube:${project}` } })
    )?.payload as YouTubeState | undefined;
  /** Writes the stored state as it is, as an earlier version or an earlier day left it. */
  const store = async (project: string, payload: object) => {
    const repo = db.getRepository('nrSnapshots');
    const row = await repo.findOne({ filter: { key: `youtube:${project}` } });
    if (row) await repo.update({ filterByTk: row.id, values: { payload } });
    else await repo.create({ values: { key: `youtube:${project}`, payload } });
  };
  return {
    ...testDb,
    db,
    network,
    host,
    reader,
    source,
    library,
    connect,
    sync,
    videos,
    stored,
    store,
  };
}
