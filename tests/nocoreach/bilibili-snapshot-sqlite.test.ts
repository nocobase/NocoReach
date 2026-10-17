// @vitest-environment node
import {
  createNocoReachTestDatabase,
  nocoReachSchemaPaths as paths,
  type NocoReachSchemaPath,
} from '../fixtures/nocoreach-database.js';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it, onTestFinished, vi } from 'vitest';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles.js';
import type {
  BilibiliAdapter,
  BilibiliBatch,
} from '../../server/nocoreach/bilibili-adapter.js';
import { BilibiliSource } from '../../server/nocoreach/bilibili-source.js';
import type { CollectorResolver } from '../../server/nocoreach/collector-connections.js';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const batch = (bvid: string, title: string): BilibiliBatch => ({
  collectedAt: new Date().toISOString(),
  items: [
    {
      bvid,
      title,
      views: 12,
      likes: null,
      comments: null,
      publishedAt: null,
      publishedAtPrecision: null,
      completeness: 'search_summary',
    },
  ],
});

async function fixture(path: NocoReachSchemaPath) {
  const testDb = await createNocoReachTestDatabase(path);
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const network = new OutboundNetwork(
    new ProxyProfiles({ all: () => ({}), set: vi.fn() }),
  );
  const search = vi
    .fn<BilibiliAdapter['search']>()
    .mockResolvedValue(batch('BV1MW421X7gM', 'Old Bilibili video'));
  const collectors: CollectorResolver = {
    allowed: () => [
      {
        id: 'qa',
        name: 'Synthetic collector',
        platforms: ['bilibili'],
        url: 'http://127.0.0.1:18061',
        token: 'synthetic-no-account-token-32-characters',
        projectIds: ['1'],
      },
    ],
  };
  const source = new BilibiliSource(
    { db, network, collectors } as unknown as ConstructorParameters<
      typeof BilibiliSource
    >[0],
    { search, video: vi.fn(), health: vi.fn() },
  );
  onTestFinished(async () => {
    source.stop();
    await network.close();
    vi.restoreAllMocks();
  });
  await source.connect('1', {
    collectorId: 'qa',
    terms: 'Original query',
    revision: null,
  });
  await source.sync('1');
  return { ...testDb, db, source, search };
}

it.each(paths)('polls across a Bilibili commit (%s)', async (path) => {
  const f = await fixture(path);
  const enteredCollector = deferred();
  const result = deferred<BilibiliBatch>();
  f.search.mockImplementationOnce(() => {
    enteredCollector.resolve();
    return result.promise;
  });
  const collection = f.source.sync('1');
  await enteredCollector.promise;
  const captured = deferred<boolean>();
  const release = deferred();
  const state = f.source.state.bind(f.source);
  let held = false;
  const readObserver = vi
    .spyOn(f.source, 'state')
    .mockImplementation(async (id, tx) => {
      const value = await state(id, tx);
      if (!held) {
        held = true;
        captured.resolve(Boolean(tx));
        await release.promise;
      }
      return value;
    });
  const reading = f.source.status('1');
  const readerOwnsTransaction = await captured.promise;
  const requested = deferred();
  let writerEntered = false;
  const transaction = f.db.sequelize.transaction;
  const writeObserver = vi
    .spyOn(f.db.sequelize, 'transaction')
    .mockImplementation((fn) => {
      requested.resolve();
      return transaction((tx) => {
        writerEntered = true;
        return fn(tx);
      });
    });
  try {
    result.resolve(batch('BV1ABcsztEcY', 'New Bilibili video'));
    await requested.promise;
    if (readerOwnsTransaction) expect(writerEntered).toBe(false);
    else await collection;
    release.resolve();
    const status = await reading;
    await collection;
    if (!status.checking)
      expect(status.recent.map((v) => v.title)).toContain('New Bilibili video');
    else
      expect(status.recent.map((v) => v.title)).toEqual(['Old Bilibili video']);
    expect(status.requestId === null).toBe(!status.checking);
    const final = await f.source.status('1');
    expect(final).toMatchObject({
      checking: false,
      requestId: null,
      total: 2,
      lastRun: { ok: true },
    });
    expect(final.recent.map((v) => v.title)).toContain('New Bilibili video');
  } finally {
    release.resolve();
    result.resolve(batch('BV1ABcsztEcY', 'Cleanup video'));
    writeObserver.mockRestore();
    readObserver.mockRestore();
    await Promise.allSettled([reading, collection]);
  }
});

it.each(paths)('joins the caller Bilibili lock (%s)', async (path) => {
  const f = await fixture(path);
  const before = await f.source.status('1');
  await f.db.sequelize.transaction(async () => {
    const connected = await f.source.connect('1', {
      collectorId: 'qa',
      terms: 'Nested query',
      revision: before.revision,
    });
    expect(connected.terms).toEqual(['Nested query']);
    const status = await f.source.status('1');
    expect(status).toMatchObject({
      total: 1,
      terms: ['Nested query'],
      checking: false,
    });
    expect(status.revision).not.toBe(before.revision);
  });
});

it.each(paths)('reads concurrently in a transaction (%s)', async (path) => {
  const f = await fixture(path);
  let both: Promise<unknown[]> | undefined;
  try {
    await f.db.sequelize.transaction(async () => {
      both = Promise.all([f.source.status('1'), f.source.status('1')]);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          both.then((values) => ({ completed: true as const, values })),
          new Promise<{ completed: false }>((resolve) => {
            timer = setTimeout(() => resolve({ completed: false }), 500);
          }),
        ]);
        expect(
          result.completed,
          'parallel reads must finish before their outer transaction releases locks',
        ).toBe(true);
        if (result.completed)
          for (const value of result.values)
            expect(value).toMatchObject({ total: 1 });
      } finally {
        clearTimeout(timer);
      }
    });
  } finally {
    // A negative-control timeout unwinds the real outer transaction and releases
    // its locks. Drain the readers only afterward so the fixture can shut down.
    if (both) await both.catch(() => undefined);
  }
});
