// @vitest-environment node
import { createTestDatabase } from '@nocobase/app-testing/server';
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

async function fixture() {
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
  });
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
  const source = new XiaohongshuSource(
    { db, network } as unknown as ConstructorParameters<
      typeof XiaohongshuSource
    >[0],
    [
      {
        id: 'qa',
        name: 'Synthetic collector',
        platforms: ['xiaohongshu'],
        url: 'http://127.0.0.1:18061',
        token: 'synthetic-no-account-token-32-characters',
        projectIds: ['1'],
      },
    ],
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
    authorized: true,
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

it('keeps another tab polling when collection commits during its SQLite view read', async () => {
  const f = await fixture();
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

it('does not combine a new connection revision with the previous latest-note selection', async () => {
  const f = await fixture();
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
    authorized: true,
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

it('joins a caller transaction without deadlocking its existing project lock', async () => {
  const f = await fixture();
  await f.db.sequelize.transaction(async () => {
    await f.source.connect('1', {
      collectorId: 'qa',
      query: 'Nested query',
      authorized: true,
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
