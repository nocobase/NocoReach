// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it, onTestFinished, vi } from 'vitest';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles.js';
import {
  YouTubeError,
  type Video,
} from '../../server/nocoreach/youtube-provider.js';
import {
  YouTubeSource,
  type YouTubeState,
} from '../../server/nocoreach/youtube-source.js';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const video = (title: string): Video => ({
  id: 'Im69kzhpR3I',
  url: 'https://www.youtube.com/watch?v=Im69kzhpR3I',
  title,
  description: '',
  channel: 'Test channel',
  publishedAt: null,
  views: 0,
  likes: null,
  comments: null,
  duration: 60,
  fetchedAt: new Date().toISOString(),
  provider: 'yt-dlp',
  transcript: { status: 'missing', language: null, text: '', truncated: false },
});

async function fixture(deadline?: AbortSignal) {
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
  // This regression exercises SQLite's real single-connection queue, not a
  // replacement transaction function or an in-memory repository.
  expect(testDb.dialect).toBe('sqlite');
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const network = new OutboundNetwork(
    new ProxyProfiles({ all: () => ({}), set: vi.fn() }),
  );
  const result = deferred<Video>();
  const reader = {
    search: vi.fn(async () => ['Im69kzhpR3I']),
    video: vi.fn(async (_id: string, _signal: AbortSignal) =>
      video('LAST GOOD RESULT'),
    ),
  };
  const source = new YouTubeSource(
    {
      db,
      network,
      app: { logger: { warn: vi.fn() } },
      project: async () => ({ id: '1' }),
      projectIds: async () => ['1'],
    } as unknown as ConstructorParameters<typeof YouTubeSource>[0],
    reader,
  );
  onTestFinished(async () => {
    result.resolve(video('TEST CLEANUP'));
    await source.stop();
    await network.close();
  });
  await source.connect('1', { terms: 'NocoBase', autoSync: true });
  await source.settled('1');
  const before = (await source.status('1'))!;
  const reading = deferred<AbortSignal>();
  reader.video.mockImplementationOnce((_id: string, signal: AbortSignal) => {
    reading.resolve(signal);
    return result.promise;
  });
  const timeout = deadline
    ? vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline)
    : undefined;
  let running: Awaited<ReturnType<YouTubeSource['sync']>>;
  try {
    running = await source.sync('1');
  } finally {
    timeout?.mockRestore();
  }
  const signal = await reading.promise;
  const stored = async () => {
    const row = await testDb.connection.repository('nrSnapshots').findOne({
      filter: { key: 'youtube:1' },
    });
    const videos = await testDb.connection
      .repository('nrYouTubeVideos')
      .findMany({ filter: { projectId: '1' } });
    return {
      ...(row!.payload as YouTubeState),
      videos: videos.map((v) => v.payload as Video),
    };
  };
  return { ...testDb, db, source, before, result, signal, running, stored };
}

async function queueSave(f: Awaited<ReturnType<typeof fixture>>) {
  const locked = deferred();
  const release = deferred();
  const blocker = f.database.transaction(async (connection) => {
    await connection
      .repository('nrSnapshots')
      .findOne({ filter: { key: 'youtube:1' } });
    locked.resolve();
    await release.promise;
  });
  await Promise.race([locked.promise, blocker]);
  const requested = deferred();
  let entered = false;
  const transaction = f.db.sequelize.transaction;
  const observer = vi
    .spyOn(f.db.sequelize, 'transaction')
    .mockImplementation((fn) => {
      requested.resolve();
      // Delegate to the real transaction; the connection held above blocks entry.
      return transaction(async (tx) => {
        entered = true;
        return fn(tx);
      });
    });
  try {
    f.result.resolve(video('CANCELLED NEW RESULT'));
    await requested.promise;
    expect(entered).toBe(false);
    expect(f.signal.aborted).toBe(false);
  } catch (error) {
    release.resolve();
    await blocker;
    throw error;
  } finally {
    observer.mockRestore();
  }
  return async () => {
    release.resolve();
    await blocker;
  };
}

it.each(['cancel', 'stop', 'timeout'] as const)(
  'discards a completed batch when %s arrives in the SQLite transaction queue',
  async (action) => {
    const deadline = new AbortController();
    const f = await fixture(action === 'timeout' ? deadline.signal : undefined);
    const release = await queueSave(f);
    let cancellation: Promise<unknown> | undefined;
    try {
      if (action === 'timeout') {
        deadline.abort(new DOMException('Test batch deadline', 'TimeoutError'));
        cancellation = f.source.settled('1');
      } else {
        cancellation =
          action === 'cancel'
            ? f.source.cancel('1', { runId: f.running.runId })
            : f.source.stop();
      }
      expect(f.signal.aborted).toBe(true);
    } finally {
      await release();
      await cancellation;
    }
    const stored = await f.stored();
    expect(stored.videos).toEqual(f.before.videos);
    expect(stored.fetchedAt).toBe(f.before.fetchedAt);
    expect(stored.verifiedAt).toBe(f.before.fetchedAt);
    expect(stored.lastSync).toMatchObject({
      ok: false,
      code: action === 'timeout' ? 'timeout' : 'cancelled',
      lastSuccessAt: f.before.lastSync!.lastSuccessAt,
    });
    expect(await f.source.status('1')).toMatchObject({
      syncing: false,
      runId: null,
      lastSync: stored.lastSync,
    });
    if (action === 'cancel') {
      expect(stored.autoSync).toBe(false);
      expect(stored.revision).not.toBe(f.before.revision);
      await expect(
        f.source.cancel('1', { runId: f.running.runId }),
      ).rejects.toMatchObject({ code: 'config_changed' });
    }
  },
);

it('commits a queued batch and success together when it is not cancelled', async () => {
  const f = await fixture();
  await (
    await queueSave(f)
  )();
  await f.source.settled('1');
  const stored = await f.stored();
  expect(stored.videos[0].title).toBe('CANCELLED NEW RESULT');
  expect(stored.lastSync).toMatchObject({
    ok: true,
    lastSuccessAt: stored.fetchedAt,
  });
  expect(stored.verifiedAt).toBe(stored.fetchedAt);
  expect(stored.autoSync).toBe(true);
  expect(stored.revision).toBe(f.before.revision);
});

it('rejects cancellation after the real write begins and commits one consistent success', async () => {
  const f = await fixture();
  const written = deferred<YouTubeState & { videos: Video[] }>();
  const release = deferred();
  const unsubscribe = f.connection.onRepositoryMutation(
    { id: 'hold-youtube-save', collections: ['nrSnapshots'] },
    {
      inTransaction: async (_event, connection) => {
        const row = await connection
          .repository('nrSnapshots')
          .findOne({ filter: { key: 'youtube:1' } });
        const videos = await connection
          .repository('nrYouTubeVideos')
          .findMany({ filter: { projectId: '1' } });
        written.resolve({
          ...(row!.payload as YouTubeState),
          videos: videos.map((v) => v.payload as Video),
        });
        await release.promise;
      },
    },
  );
  let cancelling: Promise<void> | undefined;
  f.result.resolve(video('COMMITTED NEW RESULT'));
  try {
    const uncommitted = await written.promise;
    expect(uncommitted.videos[0].title).toBe('COMMITTED NEW RESULT');
    expect(uncommitted.lastSync!.ok).toBe(true);
    // Resolve/reject is recorded synchronously, so a broken cancel cannot hang
    // this test by waiting for the very transaction held by the test.
    let outcome: unknown;
    cancelling = f.source.cancel('1', { runId: f.running.runId }).then(
      () => {
        outcome = 'accepted';
      },
      (error: unknown) => {
        outcome = error;
      },
    );
    await Promise.resolve();
    expect(f.signal.aborted).toBe(false);
    expect(outcome).toMatchObject({ code: 'config_changed', status: 409 });
    await cancelling;
  } finally {
    unsubscribe();
    release.resolve();
    await f.source.settled('1');
    await cancelling;
  }
  const stored = await f.stored();
  expect(stored.videos[0].title).toBe('COMMITTED NEW RESULT');
  expect(stored.lastSync).toMatchObject({
    ok: true,
    lastSuccessAt: stored.fetchedAt,
  });
  expect(stored.autoSync).toBe(true);
  expect(stored.revision).toBe(f.before.revision);
});

it('rolls back both new data and success when the real result transaction fails', async () => {
  const f = await fixture();
  let uncommitted: (YouTubeState & { videos: Video[] }) | undefined;
  const unsubscribe = f.connection.onRepositoryMutation(
    { id: 'reject-youtube-save', collections: ['nrSnapshots'] },
    {
      inTransaction: async (_event, connection) => {
        if (uncommitted) return;
        const row = await connection
          .repository('nrSnapshots')
          .findOne({ filter: { key: 'youtube:1' } });
        const videos = await connection
          .repository('nrYouTubeVideos')
          .findMany({ filter: { projectId: '1' } });
        uncommitted = {
          ...(row!.payload as YouTubeState),
          videos: videos.map((v) => v.payload as Video),
        };
        throw new YouTubeError('network_error');
      },
    },
  );
  try {
    f.result.resolve(video('ROLLED BACK RESULT'));
    await f.source.settled('1');
  } finally {
    unsubscribe();
  }
  expect(uncommitted!.videos[0].title).toBe('ROLLED BACK RESULT');
  expect(uncommitted!.lastSync!.ok).toBe(true);
  const stored = await f.stored();
  expect(stored.videos).toEqual(f.before.videos);
  expect(stored.fetchedAt).toBe(f.before.fetchedAt);
  expect(stored.verifiedAt).toBe(f.before.fetchedAt);
  expect(stored.lastSync).toMatchObject({
    ok: false,
    code: 'network_error',
    lastSuccessAt: f.before.lastSync!.lastSuccessAt,
  });
});
