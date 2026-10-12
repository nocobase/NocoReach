// @vitest-environment node
import { createTestDatabase } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it, onTestFinished, vi } from 'vitest';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles.js';
import {
  YouTubeSource,
  type YouTubeState,
} from '../../server/nocoreach/youtube-source.js';

async function fixture(ageDays = 30) {
  const testDb = await createTestDatabase();
  onTestFinished(() => testDb.destroy());
  expect(testDb.dialect).toBe('sqlite');
  await testDb.connection.builder.createCollection('nrSnapshots', (c) => {
    c.bigInt('id').notNull();
    c.string('key', { length: 255 }).nullable();
    c.json('payload').nullable();
    c.datetime('createdAt').nullable();
    c.datetime('updatedAt').nullable();
    c.primary('id');
    c.index('key');
  });
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const network = new OutboundNetwork(
    new ProxyProfiles({ all: () => ({}), set: vi.fn() }),
  );
  const source = new YouTubeSource(
    {
      db,
      network,
      app: { logger: { warn: vi.fn() } },
      project: async () => ({ id: '1' }),
      projectIds: async () => ['1'],
    } as unknown as ConstructorParameters<typeof YouTubeSource>[0],
    { search: vi.fn(), video: vi.fn() },
  );
  onTestFinished(async () => {
    await source.stop();
    await network.close();
  });
  const fetchedAt = new Date(Date.now() - ageDays * 86400000).toISOString();
  const before: YouTubeState = {
    revision: 'saved-revision',
    terms: ['NocoBase'],
    videoIds: [],
    autoSync: false,
    verifiedAt: fetchedAt,
    fetchedAt,
    lastSync: null,
    videos: [
      {
        id: 'Im69kzhpR3I',
        url: 'https://www.youtube.com/watch?v=Im69kzhpR3I',
        title: 'Previously archived public content',
        description: 'Retained content must really be removed when expired.',
        channel: 'Test channel',
        publishedAt: null,
        views: 1,
        likes: null,
        comments: null,
        duration: 60,
        fetchedAt,
        provider: 'yt-dlp',
        transcript: {
          status: 'missing',
          language: null,
          text: '',
          truncated: false,
        },
      },
    ],
  };
  await db.getRepository('nrSnapshots').create({
    values: { key: 'youtube:1', payload: before },
  });
  const stored = async () => {
    const row = await testDb.connection.repository('nrSnapshots').findOne({
      filter: { key: 'youtube:1' },
    });
    return row!.payload as YouTubeState;
  };
  return { ...testDb, db, source, before, stored };
}

async function beforeTransactionEnds<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      promise.then((value) => ({ completed: true as const, value })),
      new Promise<{ completed: false }>((resolve) => {
        timer = setTimeout(() => resolve({ completed: false }), 500);
      }),
    ]);
    expect(
      result.completed,
      'expiry reads must finish before their outer transaction releases its locks',
    ).toBe(true);
    if (!result.completed)
      throw new Error('Unreachable after timeout assertion');
    return result.value;
  } finally {
    clearTimeout(timer);
  }
}

it('purges expired content for concurrent status reads inside one SQLite transaction', async () => {
  const f = await fixture();
  let readers: Promise<unknown[]> | undefined;
  try {
    await f.db.sequelize.transaction(async () => {
      readers = Promise.all([f.source.status('1'), f.source.status('1')]);
      const statuses = await beforeTransactionEnds(readers);
      for (const status of statuses)
        expect(status).toMatchObject({
          total: 0,
          videos: [],
          fetchedAt: null,
          expired: true,
        });
      // Inspect the real uncommitted row on the caller's connection, not status().
      const row = await f.db
        .getRepository('nrSnapshots')
        .findOne({ filter: { key: 'youtube:1' } });
      expect(row!.get('payload')).toEqual({
        ...f.before,
        videos: [],
        fetchedAt: null,
      });
    });
  } finally {
    // A failing baseline unwinds the real transaction before draining its readers.
    // No lock is released by the test while the success assertion is running.
    if (readers) await readers.catch(() => undefined);
  }
  expect(await f.stored()).toEqual({
    ...f.before,
    videos: [],
    fetchedAt: null,
  });
});

it('retries expiry after the caller rolls back the physical purge', async () => {
  const f = await fixture();
  const rollback = new Error('Roll back the caller transaction');
  await expect(
    f.db.sequelize.transaction(async () => {
      expect(await f.source.status('1')).toMatchObject({
        total: 0,
        expired: true,
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  expect(await f.stored()).toEqual(f.before);
  await f.db.sequelize.transaction(async () => {
    expect(await f.source.status('1')).toMatchObject({
      total: 0,
      expired: true,
    });
  });
  expect(await f.stored()).toEqual({
    ...f.before,
    videos: [],
    fetchedAt: null,
  });
});

it('allows retry in the same transaction after an expiry attempt fails', async () => {
  const f = await fixture();
  const failure = new Error(
    'Transient failure before acquiring the write lock',
  );
  const query = vi
    .spyOn(f.db.sequelize, 'query')
    .mockRejectedValueOnce(failure);
  try {
    await f.db.sequelize.transaction(async () => {
      await expect(f.source.status('1')).rejects.toBe(failure);
      expect(await f.source.status('1')).toMatchObject({
        total: 0,
        expired: true,
      });
    });
  } finally {
    query.mockRestore();
  }
  expect(await f.stored()).toEqual({
    ...f.before,
    videos: [],
    fetchedAt: null,
  });
});

it('preserves fresh public content during parallel reads in the same transaction', async () => {
  const f = await fixture(28);
  await f.db.sequelize.transaction(async () => {
    const statuses = await beforeTransactionEnds(
      Promise.all([f.source.status('1'), f.source.status('1')]),
    );
    for (const status of statuses)
      expect(status).toMatchObject({
        total: 1,
        videos: f.before.videos,
        expired: false,
      });
  });
  expect(await f.stored()).toEqual(f.before);
});

it('also persists an expiry purge for parallel callers outside a transaction', async () => {
  const f = await fixture();
  const statuses = await Promise.all([
    f.source.status('1'),
    f.source.status('1'),
  ]);
  for (const status of statuses)
    expect(status).toMatchObject({ total: 0, videos: [], expired: true });
  expect(await f.stored()).toEqual({
    ...f.before,
    videos: [],
    fetchedAt: null,
  });
});

it('does not wait for an outside expiry queued behind the caller SQLite connection', async () => {
  const f = await fixture();
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  const read = deferred();
  const resume = deferred();
  const queued = deferred();
  const repo = f.db.getRepository('nrSnapshots');
  const findOne = repo.findOne.bind(repo);
  const transaction = f.db.sequelize.transaction;
  let pause = true;
  const repositoryObserver = vi
    .spyOn(f.db, 'getRepository')
    .mockReturnValue(repo);
  const readObserver = vi
    .spyOn(repo, 'findOne')
    .mockImplementation(async (options) => {
      const row = await findOne(options);
      if (pause && !f.db.transactionContext()) {
        pause = false;
        read.resolve();
        await resume.promise;
      }
      return row;
    });
  const transactionObserver = vi
    .spyOn(f.db.sequelize, 'transaction')
    .mockImplementation((fn) => {
      if (!f.db.transactionContext() && !pause) queued.resolve();
      return transaction(fn);
    });
  let outsideDone = false;
  const outside = f.source.status('1').then((status) => {
    outsideDone = true;
    return status;
  });
  try {
    await read.promise;
    // Enter through the original function so queued signals only the outside purge.
    await transaction(async () => {
      resume.resolve();
      await queued.promise;
      expect(outsideDone).toBe(false);
      const status = await beforeTransactionEnds(f.source.status('1'));
      expect(status).toMatchObject({ total: 0, expired: true });
      expect(outsideDone).toBe(false);
    });
    expect(await outside).toMatchObject({ total: 0, expired: true });
    expect(await f.stored()).toEqual({
      ...f.before,
      videos: [],
      fetchedAt: null,
    });
  } finally {
    resume.resolve();
    await outside.catch(() => undefined);
    transactionObserver.mockRestore();
    readObserver.mockRestore();
    repositoryObserver.mockRestore();
  }
});
