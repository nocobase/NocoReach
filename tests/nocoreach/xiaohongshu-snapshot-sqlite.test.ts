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
import {
  normalizeSearchRows,
  type XiaohongshuAdapter,
} from '../../server/nocoreach/xiaohongshu-adapter.js';
import { XiaohongshuSource } from '../../server/nocoreach/xiaohongshu-source.js';
import type { CollectorResolver } from '../../server/nocoreach/collector-connections.js';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const collected = (id: string, title: string) => ({
  collectedAt: new Date().toISOString(),
  notes: normalizeSearchRows([
    {
      title,
      url: `https://www.xiaohongshu.com/explore/${id}`,
      likes: '7',
    },
  ]),
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
    .fn<XiaohongshuAdapter['search']>()
    .mockResolvedValue(
      collected('69a123456789abcdef012345', 'Old archived note'),
    );
  const collectors: CollectorResolver = {
    allowed: () => [
      {
        id: 'qa',
        name: 'Synthetic collector',
        platforms: ['xiaohongshu'],
        url: 'http://127.0.0.1:18061',
        token: 'synthetic-no-account-token-32-characters',
        projectIds: ['1'],
      },
    ],
  };
  const source = new XiaohongshuSource(
    { db, network, collectors } as unknown as ConstructorParameters<
      typeof XiaohongshuSource
    >[0],
    { search, health: vi.fn() },
  );
  onTestFinished(async () => {
    source.stop();
    await network.close();
    vi.restoreAllMocks();
  });
  await source.connect('1', {
    collectorId: 'qa',
    query: 'Original query',
    revision: 0,
  });
  await source.search('1', { revision: 1 });
  return { ...testDb, db, source, search };
}

// Hold the result of an actual SQLite read. On the old implementation the writer
// can finish before this stale result resumes. A transaction-bound reader must
// first release its connection so the queued writer can enter. No DB operation
// or transaction is replaced; the gates only control when their results resume.
async function holdRead(source: XiaohongshuSource) {
  const captured = deferred<boolean>();
  const release = deferred();
  const state = source.state.bind(source);
  let held = false;
  const observer = vi
    .spyOn(source, 'state')
    .mockImplementation(async (id, tx) => {
      const value = await state(id, tx);
      if (!held) {
        held = true;
        captured.resolve(Boolean(tx));
        await release.promise;
      }
      return value;
    });
  onTestFinished(() => {
    release.resolve();
    observer.mockRestore();
  });
  return { captured, release };
}

it.each(paths)('polls across a collection commit (%s)', async (path) => {
  const f = await fixture(path);
  const enteredCollector = deferred();
  const result = deferred<Awaited<ReturnType<XiaohongshuAdapter['search']>>>();
  f.search.mockImplementationOnce(() => {
    enteredCollector.resolve();
    return result.promise;
  });
  const collection = f.source.search('1', { revision: 1 });
  await enteredCollector.promise;
  const gate = await holdRead(f.source);
  const reading = f.source.view('1');
  const readerOwnsTransaction = await gate.captured.promise;
  const requested = deferred();
  let writerEntered = false;
  const transaction = f.db.sequelize.transaction;
  const observer = vi
    .spyOn(f.db.sequelize, 'transaction')
    .mockImplementation((fn) => {
      requested.resolve();
      return transaction((tx) => {
        writerEntered = true;
        return fn(tx);
      });
    });
  try {
    result.resolve(
      collected('69b123456789abcdef012345', 'Newly collected note'),
    );
    await requested.promise;
    if (readerOwnsTransaction) expect(writerEntered).toBe(false);
    else await collection;
    gate.release.resolve();
    const view = await reading;
    await collection;
    expect(view.total).toBe(view.notes.length);
    // A response that tells the other tab to stop polling must contain the final archive.
    if (!view.running)
      expect(view.notes.map((n) => n.title)).toContain('Newly collected note');
    else expect(view.notes.map((n) => n.title)).toEqual(['Old archived note']);
    const final = await f.source.view('1');
    expect(final).toMatchObject({
      total: 2,
      running: null,
      lastRun: { ok: true, count: 1 },
    });
    expect(final.latestIds).toEqual(['69b123456789abcdef012345']);
    expect(final.notes.map((n) => n.title)).toContain('Newly collected note');
  } finally {
    gate.release.resolve();
    result.resolve(collected('69b123456789abcdef012345', 'Cleanup note'));
    observer.mockRestore();
    await Promise.allSettled([reading, collection]);
  }
});

it.each(paths)('keeps revision/note atomic (%s)', async (path) => {
  const f = await fixture(path);
  const gate = await holdRead(f.source);
  const reading = f.source.view('1');
  const readerOwnsTransaction = await gate.captured.promise;
  const requested = deferred();
  const transaction = f.db.sequelize.transaction;
  const observer = vi
    .spyOn(f.db.sequelize, 'transaction')
    .mockImplementation((fn) => {
      requested.resolve();
      return transaction(fn);
    });
  const editing = f.source.connect('1', {
    collectorId: 'qa',
    query: 'Edited query',
    revision: 1,
  });
  try {
    await requested.promise;
    if (!readerOwnsTransaction) await editing;
    gate.release.resolve();
    const view = await reading;
    await editing;
    expect(view.query).toBe(
      view.revision === 1 ? 'Original query' : 'Edited query',
    );
    expect(view.latestIds).toEqual(
      view.revision === 1 ? ['69a123456789abcdef012345'] : [],
    );
    expect(await f.source.view('1')).toMatchObject({
      revision: 2,
      query: 'Edited query',
      latestIds: [],
      total: 1,
    });
  } finally {
    gate.release.resolve();
    observer.mockRestore();
    await Promise.allSettled([reading, editing]);
  }
});

it.each(paths)('joins the caller project lock (%s)', async (path) => {
  const f = await fixture(path);
  await f.db.sequelize.transaction(async () => {
    await f.source.connect('1', {
      collectorId: 'qa',
      query: 'Nested query',
      revision: 1,
    });
    expect(await f.source.view('1')).toMatchObject({
      revision: 2,
      query: 'Nested query',
      total: 1,
      latestIds: [],
    });
    expect(await f.source.status('1')).toMatchObject({
      revision: 2,
      query: 'Nested query',
      total: 1,
    });
  });
});

it.each(paths)('reads concurrently in a transaction (%s)', async (path) => {
  const f = await fixture(path);
  let both: Promise<unknown[]> | undefined;
  try {
    await f.db.sequelize.transaction(async () => {
      both = Promise.all([f.source.status('1'), f.source.view('1')]);
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
