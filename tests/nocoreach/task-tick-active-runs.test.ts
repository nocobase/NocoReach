// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterEach, expect, test, vi } from 'vitest';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database.js';
import { fakeAgents } from './agents-fixture';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import {
  ActiveRuns,
  RESCAN_MS,
} from '../../server/nocoreach/execution/active-runs.js';
import type { Run } from '../../server/nocoreach/execution/model.js';

vi.setConfig({ testTimeout: 120_000 });
afterEach(() => {
  vi.restoreAllMocks();
});

type Statement = { sql: string; bindings: unknown[] };
const key = (id: string) => `nr-task-run:1:7:${id}`;
const run = (status: Run['status'], extra: Partial<Run> = {}): Run => ({
  id: randomUUID(),
  projectId: '1',
  taskId: '7',
  planVersion: 0,
  stepId: 'analyze',
  baseArtifactId: null,
  ownerId: '1',
  actor: '1',
  inputVersion: 1,
  capabilitySnapshot: [],
  status,
  createdAt: new Date().toISOString(),
  input: '{}',
  model: { llmService: 'test', model: 'echo' },
  // A settled run keeps its transcript: the payload the tick used to read again every 2 s.
  transcript: Array.from({ length: 20 }, (_, seq) => ({
    seq,
    at: new Date().toISOString(),
    type: 'text',
    content: 'x'.repeat(200),
  })) as Run['transcript'],
  ...extra,
});
const settled = () =>
  run('succeeded', { pluginRunId: randomUUID(), pluginSettled: true });

/** A NocoReach database on SQLite, with every SQL statement recorded, and TaskService instances on it. */
async function fixture() {
  const testDb = await createNocoReachTestDatabase('fresh');
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const statements: Statement[] = [];
  (
    await testDb.connection.client<{
      on(event: 'query', fn: (q: Statement) => void): void;
    }>()
  ).on('query', (q) =>
    statements.push({ sql: q.sql, bindings: q.bindings || [] }),
  );
  const p = {
    db,
    agents: fakeAgents(),
    app: { logger: { warn() {} } },
    project: async () => ({ name: 'Synthetic' }),
  };
  const handled: { synced: string[]; simulated: string[]; finished: string[] } =
    { synced: [], simulated: [], finished: [] };
  /** A TaskService whose Runner calls are recorded. */
  const service = () => {
    const s = new TaskService(p, {} as never);
    vi.spyOn(s.runtime, 'sync').mockImplementation(async (r) => {
      handled.synced.push(r.id);
    });
    vi.spyOn(s.runtime, 'simulate').mockImplementation(async (r) => {
      handled.simulated.push(r.id);
    });
    vi.spyOn(s, 'finish').mockImplementation(async (r, _result, error) => {
      handled.finished.push(`${r.id}:${error}`);
      await s.lock('1', '7', (tx) =>
        s.put(
          key(r.id),
          { ...r, status: 'failed', error, endedAt: new Date().toISOString() },
          tx,
        ),
      );
    });
    return s;
  };
  /** Runs written around TaskService, as demo data or a classic import does. */
  const writeAround = async (runs: Run[]) => {
    for (const r of runs)
      await db
        .getRepository('nrSnapshots')
        .create({ values: { key: key(r.id), payload: r } });
  };
  const putThrough = (s: TaskService, r: Run) =>
    s.lock('1', '7', (tx) => s.put(key(r.id), r, tx));
  /** What one tick read of the runs: its statements on `nr_snapshots` that name or scan run keys. */
  const tick = async (s: TaskService) => {
    statements.length = 0;
    for (const list of Object.values(handled)) list.length = 0;
    await s.tick();
    const runs = statements.filter(
      (q) =>
        q.sql.includes('`nr_snapshots`') &&
        q.bindings.some((b) => String(b).startsWith('nr-task-run:')),
    );
    return {
      statements: runs,
      scans: runs.filter((q) => / like /.test(q.sql)).length,
      // Statements that load payloads: reads by key or by id, never the id scan.
      payloadReads: statements.filter(
        (q) =>
          q.sql.includes('`nr_snapshots`') &&
          q.sql.includes('as `payload`') &&
          !q.bindings.includes('nr-app-starts') &&
          !q.bindings.some((b) => String(b).startsWith('nr-migrations:')),
      ),
      ...structuredClone(handled),
    };
  };
  return { db, service, writeAround, putThrough, tick };
}

for (const count of [60, 600])
  test(`a tick reads only the runs with work left, among ${count} settled runs`, async () => {
    const f = await fixture();
    const queued = run('queued', { pluginRunId: randomUUID() });
    const failed = run('failed', { pluginRunId: randomUUID() });
    await f.writeAround([
      ...Array.from({ length: count }, settled),
      queued,
      failed,
      ...Array.from({ length: count }, () =>
        run('succeeded', { simulated: true }),
      ),
    ]);
    const s = f.service();
    // An instance's first tick looks at every run once.
    const first = await f.tick(s);
    expect(first.synced.sort()).toEqual([queued.id, failed.id].sort());
    expect(first.scans).toBeGreaterThan(0);
    // Later ticks read the two runs by key, in one statement whatever the number of settled runs.
    for (let i = 0; i < 3; i++) {
      const next = await f.tick(s);
      expect(next.synced.sort()).toEqual([queued.id, failed.id].sort());
      expect(next.scans).toBe(0);
      expect(next.statements).toHaveLength(1);
      expect(next.payloadReads).toHaveLength(1);
      expect(next.statements[0].bindings.slice(0, 2).sort()).toEqual(
        [key(queued.id), key(failed.id)].sort(),
      );
    }
    // The periodic scan reads ids and update times; settled payloads it already saw are not read again.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + RESCAN_MS + 1000);
    const rescanned = await f.tick(s);
    expect(rescanned.scans).toBe(Math.ceil((2 * count + 2) / 1000));
    expect(rescanned.payloadReads).toHaveLength(1);
    expect(rescanned.synced.sort()).toEqual([queued.id, failed.id].sort());
  });

test('a run written through TaskService is read on the next tick without a scan; settling it drops it', async () => {
  const f = await fixture();
  const s = f.service();
  expect((await f.tick(s)).synced).toEqual([]);
  const queued = run('queued', { pluginRunId: randomUUID() });
  await f.putThrough(s, queued);
  expect(s.activeRuns.tracked()).toEqual([key(queued.id)]);
  const next = await f.tick(s);
  expect(next.synced).toEqual([queued.id]);
  expect(next.scans).toBe(0);
  expect(next.statements).toHaveLength(1);
  // Settled, as `sync` leaves it: the next tick reads it once more, does nothing and forgets it.
  await f.putThrough(s, {
    ...queued,
    status: 'succeeded',
    pluginSettled: true,
  });
  expect(s.activeRuns.tracked()).toEqual([key(queued.id)]);
  const after = await f.tick(s);
  expect(after.synced).toEqual([]);
  expect(after.statements).toHaveLength(1);
  expect(s.activeRuns.tracked()).toEqual([]);
  expect((await f.tick(s)).statements).toHaveLength(0);
  // A settled write leaves nothing to read.
  await f.putThrough(s, settled());
  expect(s.activeRuns.tracked()).toEqual([]);
});

test('a write that rolls back leaves nothing behind after one read', async () => {
  const f = await fixture();
  const s = f.service();
  await f.tick(s);
  const queued = run('queued', { pluginRunId: randomUUID() });
  await expect(
    s.lock('1', '7', async (tx) => {
      await s.put(key(queued.id), queued, tx);
      throw new Error('rolled back');
    }),
  ).rejects.toThrow('rolled back');
  const next = await f.tick(s);
  expect(next.synced).toEqual([]);
  expect(s.activeRuns.tracked()).toEqual([]);
});

test('runs written around TaskService are found by the periodic scan, and at once when a writer asks', async () => {
  const f = await fixture();
  const old = settled();
  await f.writeAround([old]);
  const s = f.service();
  await f.tick(s);
  const imported = run('queued', { pluginRunId: randomUUID() });
  await f.writeAround([imported]);
  expect((await f.tick(s)).synced).toEqual([]);
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + RESCAN_MS + 1000);
  expect((await f.tick(s)).synced).toEqual([imported.id]);
  // A settled run changed in place is read again: its update time moved.
  const repo = f.db.getRepository('nrSnapshots');
  const row = await repo.findOne({ filter: { key: key(old.id) } });
  await repo.update({
    filterByTk: row!.id,
    values: { payload: { ...old, pluginSettled: false } },
  });
  vi.spyOn(Date, 'now').mockReturnValue(now + 2 * RESCAN_MS + 2000);
  expect((await f.tick(s)).synced.sort()).toEqual([imported.id, old.id].sort());
  // A classic import asks for a scan: the next tick finds what it wrote.
  const classic = run('running', { pluginRunId: randomUUID() });
  await f.writeAround([classic]);
  expect((await f.tick(s)).synced).not.toContain(classic.id);
  s.activeRuns.rescan();
  expect((await f.tick(s)).synced).toContain(classic.id);
});

test('a new instance, as after a restart, finds the runs still in flight', async () => {
  const f = await fixture();
  const before = f.service();
  await f.tick(before);
  const queued = run('queued', { pluginRunId: randomUUID() });
  const playing = run('running', {
    simulated: true,
    startedAt: new Date().toISOString(),
  });
  await f.putThrough(before, queued);
  await f.putThrough(before, playing);
  await f.putThrough(before, settled());
  before.stop();
  const after = f.service();
  const first = await f.tick(after);
  expect(first.synced).toEqual([queued.id]);
  expect(first.finished).toEqual([]);
  expect(after.activeRuns.tracked().sort()).toEqual(
    [key(queued.id), key(playing.id)].sort(),
  );
});

test('demo simulations are played, settled when interrupted and official runs followed, as before', async () => {
  const f = await fixture();
  const s = f.service();
  await f.tick(s);
  const minutesAgo = (m: number) =>
    new Date(Date.now() - m * 60_000).toISOString();
  const queued = run('queued', { simulated: true });
  const playing = run('running', { simulated: true, startedAt: minutesAgo(1) });
  const lost = run('running', { simulated: true, startedAt: minutesAgo(6) });
  const unsettled = run('failed', {
    pluginRunId: randomUUID(),
    error: 'replaced_by_manual',
  });
  for (const r of [
    queued,
    playing,
    lost,
    unsettled,
    settled(),
    run('succeeded', { simulated: true }),
  ])
    await f.putThrough(s, r);
  const first = await f.tick(s);
  expect(first.simulated).toEqual([queued.id]);
  expect(first.finished).toEqual([`${lost.id}:demo_simulation_interrupted`]);
  expect(first.synced).toEqual([unsettled.id]);
  // The interrupted simulation is failed now; the playing one stays until it is five minutes old.
  const second = await f.tick(s);
  expect(second.finished).toEqual([]);
  expect(s.activeRuns.tracked()).not.toContain(key(lost.id));
  expect(s.activeRuns.tracked()).toContain(key(playing.id));
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5 * 60_000);
  expect((await f.tick(s)).finished).toEqual([
    `${playing.id}:demo_simulation_interrupted`,
  ]);
});

test('a tick that reads a run before its write commits keeps it for the next tick', async () => {
  const r = run('queued', { pluginRunId: randomUUID() });
  const row = { id: '1', key: key(r.id), updatedAt: 'now', get: () => r };
  let visible = false,
    commit = () => {};
  // Another connection's read: it sees the row only once the write committed, and the commit may land meanwhile.
  const active = new ActiveRuns(() => ({
    find: async () => {
      const rows = visible ? [row] : [];
      commit();
      return rows;
    },
  }));
  const due = async () => {
    const out: string[] = [];
    for await (const x of active.due()) out.push(x.id);
    return out;
  };
  await due();
  const afterCommit: (() => unknown)[] = [];
  active.wrote(key(r.id), r, { afterCommit: (fn) => afterCommit.push(fn) });
  commit = () => {
    visible = true;
    for (const fn of afterCommit.splice(0)) fn();
  };
  expect(await due()).toEqual([]);
  expect(active.tracked()).toEqual([key(r.id)]);
  expect(await due()).toEqual([r.id]);
});
