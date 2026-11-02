// @vitest-environment node
import { expect, it, onTestFinished, vi } from 'vitest';
import type { Video } from '../../server/nocoreach/youtube-provider.js';
import { YouTubeError } from '../../server/nocoreach/youtube-provider.js';
import type {
  DetailsResult,
  YouTubeSource,
  YouTubeState,
} from '../../server/nocoreach/youtube-source.js';
import {
  details,
  found,
  videoKey,
  youtubeFixture,
} from './fixtures/youtube.js';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const result = (title: string): DetailsResult => ({
  ok: true,
  video: details(1, { title }),
  costUsd: 0.006,
});

async function fixture(deadline?: AbortSignal) {
  const f = await youtubeFixture();
  // This regression exercises SQLite's real single-connection queue, not a
  // replacement transaction function or an in-memory repository.
  expect(f.dialect).toBe('sqlite');
  const { source, reader } = f;
  reader.search.mockResolvedValue({
    ok: true,
    videos: [found(1)],
    costUsd: 0.002,
  });
  reader.details.mockResolvedValue(result('LAST GOOD RESULT'));
  // The video is tracked, so every read reads its details after the searches and the saved-video lookup.
  await f.connect('1', 'NocoBase', { autoSync: true, videoUrls: videoKey(1) });
  const stored = async () => {
    const videos = await f.connection
      .repository('nrYouTubeVideos')
      .findMany({ filter: { projectId: '1' } });
    return {
      ...(await f.stored())!,
      videos: videos.map((v) => v.payload as Video),
    };
  };
  const before = await stored();
  // The next read waits for the video's details until the test releases the result.
  const pending = deferred<DetailsResult>();
  const reading = deferred();
  // Release a read a failed test left waiting, before the source stops (later hooks run first).
  onTestFinished(() => pending.resolve(result('TEST CLEANUP')));
  reader.details.mockImplementationOnce(() => {
    reading.resolve();
    return pending.promise;
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
  await reading.promise;
  return { ...f, before, result: pending, running, stored };
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
    f.result.resolve(result('CANCELLED NEW RESULT'));
    await requested.promise;
    expect(entered).toBe(false);
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
  // The first successful read verified the source; later reads keep that time.
  expect(stored.verifiedAt).toBe(f.before.verifiedAt);
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
  f.result.resolve(result('COMMITTED NEW RESULT'));
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
        throw new YouTubeError('upstream_error');
      },
    },
  );
  try {
    f.result.resolve(result('ROLLED BACK RESULT'));
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
    code: 'upstream_error',
    lastSuccessAt: f.before.lastSync!.lastSuccessAt,
  });
});
