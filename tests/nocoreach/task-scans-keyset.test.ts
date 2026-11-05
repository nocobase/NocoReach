// @vitest-environment node
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterEach, expect, test, vi } from 'vitest';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database.js';
import { fakeAgents } from './agents-fixture';
import {
  LegacyDatabase,
  type LegacyRecord,
  type LegacyRepository,
} from '../../server/nocoreach/legacy/database.js';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import { listResults } from '../../server/nocoreach/execution/result-view.js';
import { projectWork } from '../../server/nocoreach/execution/model.js';
import { tasksInOrder } from '../../server/nocoreach/execution/task-scan.js';
import { TaskData } from '../../server/nocoreach/task-data.js';

vi.setConfig({ testTimeout: 120_000 });
afterEach(() => {
  vi.restoreAllMocks();
});

type Task = Record<string, any>;
type Statement = { sql: string; bindings: unknown[] };
type Knex = {
  on(event: 'query', fn: (q: Statement) => void): void;
  raw(sql: string, bindings?: unknown[]): Promise<unknown>;
};
type Read = { options: Record<string, any>; rows: Task[] };

const TIE_A = '2026-03-01T08:00:00.000Z',
  TIE_B = '2026-05-20T12:30:00.000Z';
const work = (extra: Record<string, unknown> = {}) => ({
  ...projectWork({ evidence: {} }),
  ...extra,
});
/**
 * 300 tasks of three projects (about 230 in the first: more than a page of 200), inserted out of id order. Ids have gaps
 * and two to four digits, with a few of fifteen, so a text comparison would order them differently; `createdAt` has
 * ties within a project and nulls.
 */
function taskRows(evidence: (i: number) => Task = () => ({})) {
  return Array.from({ length: 300 }, (_, i) => {
    const slot = (i * 113) % 300,
      id = i % 61 === 7 ? String(395831555391488 + i) : String(90 + 13 * slot);
    const createdAt =
      i % 17 === 3
        ? null
        : i % 5 === 0
          ? TIE_A
          : i % 7 === 0
            ? TIE_B
            : new Date(
                Date.parse('2025-06-01T00:00:00Z') +
                  ((i * 7919) % 1000) * 60000,
              ).toISOString();
    return {
      id,
      taskKey: `scan:${id}`,
      projectId: i % 13 < 10 ? '1' : i % 13 < 12 ? '2' : '3',
      title: `Task ${i}`,
      status: 'open',
      brief: `Brief ${i}`,
      createdAt,
      evidence: { no: i, ...evidence(i) },
    };
  });
}

/** The tasks on SQLite through the legacy repository, a TaskService on them, and every read and statement recorded. */
async function fixture(rows: Task[], extra: Record<string, unknown> = {}) {
  const testDb = await createNocoReachTestDatabase('fresh');
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  // One transaction for the inserts: one write to disk instead of 300.
  await db.sequelize.transaction(async (transaction) => {
    for (const values of rows)
      await db.getRepository('nrTasks').create({ values, transaction });
  });
  const client = await testDb.connection.client<Knex>();
  const statements: Statement[] = [];
  client.on('query', (q) =>
    statements.push({ sql: q.sql, bindings: q.bindings || [] }),
  );
  // The scans' own reads of `nrTasks` (`find`); a task read by key (`findOne`) is not one of them.
  const reads: Read[] = [];
  const repository = db.getRepository.bind(db);
  vi.spyOn(db, 'getRepository').mockImplementation(
    (name: string): LegacyRepository => {
      const repo = repository(name);
      if (name !== 'nrTasks') return repo;
      return {
        ...repo,
        find: async (options: Record<string, any> = {}) => {
          const found = await repo.find(options);
          reads.push({ options, rows: found.map((r) => r.toJSON()) });
          return found;
        },
      };
    },
  );
  const p = {
    db,
    agents: fakeAgents(),
    app: { logger: { warn() {} } },
    project: async () => ({ name: 'Synthetic' }),
    projectIds: async () => ['1', '2', '3'],
    ...extra,
  };
  const s = new TaskService(p, {} as never);
  /** What `fn` read: its `find` calls on `nrTasks` and its SQL on `nr_tasks`. */
  const record = async (fn: () => Promise<unknown>) => {
    reads.length = 0;
    statements.length = 0;
    await fn();
    return {
      reads: [...reads],
      selects: statements.filter(
        (q) => /^select/i.test(q.sql) && q.sql.includes('`nr_tasks`'),
      ),
    };
  };
  return { db, s, p, client, record };
}

/** How the scans read the tasks before: pages with an offset (the code this change replaced). */
async function offsetRead(
  db: LegacyDatabase,
  {
    filter,
    fields,
    sort,
    size,
    cap = Infinity,
  }: {
    filter?: Record<string, unknown>;
    fields?: string[];
    sort: string | string[];
    size: number;
    cap?: number;
  },
) {
  const rows: Task[] = [];
  for (let offset = 0; offset < cap; offset += size) {
    const page: LegacyRecord[] = await db.getRepository('nrTasks').find({
      ...(filter ? { filter } : {}),
      ...(fields ? { fields } : {}),
      sort,
      limit: size,
      offset,
    });
    rows.push(...page.map((r) => r.toJSON()));
    if (page.length < size) break;
  }
  return rows;
}
const ids = (rows: Task[]) => rows.map((r) => String(r.id));

const periodic: [string, (s: TaskService) => Promise<unknown>][] = [
  ['articleFlow.tick', (s) => s.articleFlow.tick()],
  ['verifyReleases', (s) => s.verifyReleases(async () => ({ text: '' }))],
  ['observeEffects', (s) => s.observeEffects()],
  ['archiveLegacy', (s) => s.archiveLegacy()],
  ['repairNotes', (s) => s.articleFlow.repairNotes()],
];
for (const [name, scan] of periodic)
  test(`${name} visits the rows the offset pages did, in the same order, by id without an offset`, async () => {
    const f = await fixture(taskRows(), { articles: {} });
    const before = await offsetRead(f.db, { sort: 'id', size: 100 });
    expect(before).toHaveLength(300);
    // Numeric id order across ids of different lengths.
    expect(new Set(before.map((r) => String(r.id).length))).toEqual(
      new Set([2, 3, 4, 15]),
    );
    const { reads, selects } = await f.record(() => scan(f.s));
    // Three full pages, then an empty one, as before.
    expect(reads.map((r) => r.rows.length)).toEqual([100, 100, 100, 0]);
    expect(reads.flatMap((r) => r.rows)).toEqual(before);
    // Each page after the first starts after the last id of the one before.
    expect(reads.map((r) => r.options.filter?.id?.$gt)).toEqual([
      undefined,
      ...[99, 199, 299].map((i) => String(before[i]!.id)),
    ]);
    expect(selects).toHaveLength(4);
    for (const q of selects) expect(q.sql).not.toMatch(/offset/i);
    for (const [i, q] of selects.entries())
      if (i) {
        expect(q.sql).toMatch(/`repository_root`\.`id` > \?/);
        expect(q.bindings).toContain(reads[i]!.options.filter.id.$gt);
      }
  });

test('a project read by id, Data sources and Results, visits what the offset pages did', async () => {
  const f = await fixture(taskRows());
  for (const project of ['1', '2', '3']) {
    // Website source's repositories (`eachTask`, pages of 200 with three fields).
    const fields = ['id', 'title', 'evidence'];
    const before = await offsetRead(f.db, {
      filter: { projectId: project },
      fields,
      sort: ['id'],
      size: 200,
    });
    const seen: Task[] = [];
    const each = await f.record(() =>
      (
        f.s as unknown as {
          eachTask(p: string, fn: (t: Task) => void): Promise<void>;
        }
      ).eachTask(project, (t) => seen.push(t)),
    );
    expect(seen).toEqual(before);
    expect(each.reads.flatMap((r) => r.rows)).toEqual(before);
    for (const q of each.selects) expect(q.sql).not.toMatch(/offset/i);
    // Results (pages of 100, every field).
    const all = await offsetRead(f.db, {
      filter: { projectId: project },
      sort: 'id',
      size: 100,
    });
    const results = await f.record(() =>
      listResults(
        f.s as unknown as Parameters<typeof listResults>[0],
        project,
        {},
      ),
    );
    expect(results.reads.flatMap((r) => r.rows)).toEqual(all);
    for (const r of results.reads)
      expect(r.options.filter.projectId).toBe(project);
    for (const q of results.selects) expect(q.sql).not.toMatch(/offset/i);
  }
  // The first project spans two pages of 200 and three of 100.
  expect(
    (
      await offsetRead(f.db, {
        filter: { projectId: '1' },
        sort: 'id',
        size: 100,
      })
    ).length,
  ).toBeGreaterThan(200);
});

test('a project task list is the offset pages’ list, element for element: nulls last, ties by id', async () => {
  const f = await fixture(taskRows());
  for (const project of ['1', '2', '3', '404']) {
    const before = await offsetRead(f.db, {
      filter: { projectId: project },
      sort: ['-createdAt', '-id'],
      size: 200,
    });
    const { reads, selects } = await f.record(() => f.s.tasks(project));
    expect(await f.s.tasks(project)).toEqual(before);
    for (const q of selects) expect(q.sql).not.toMatch(/offset/i);
    // The ids once, in the database's order and without the large columns, then the rows by key, 200 at a time.
    expect(reads[0]!.options).toEqual({
      filter: { projectId: project },
      fields: ['id'],
      sort: ['-createdAt', '-id'],
    });
    expect(selects[0]!.sql).not.toMatch(/evidence/);
    expect(selects[0]!.sql).toMatch(/order by case when .*`created_at`/);
    expect(reads.slice(1).map((r) => r.options.filter.id.$in.length)).toEqual(
      before.length
        ? [
            ...Array.from(
              { length: Math.floor(before.length / 200) },
              () => 200,
            ),
            ...(before.length % 200 ? [before.length % 200] : []),
          ]
        : [],
    );
    if (project !== '1') continue;
    // The order is the database's: ties on `createdAt` by id, then the tasks without one, by id too.
    const nulls = before.filter((t) => t.createdAt === null);
    const tied = before.filter((t) => t.createdAt === TIE_A);
    expect(nulls.length).toBeGreaterThan(3);
    expect(tied.length).toBeGreaterThan(3);
    expect(before.slice(-nulls.length)).toEqual(nulls);
    expect(ids(tied)).toEqual(
      [...ids(tied)].sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : -1)),
    );
    // A key read looks the keys up, not the project's index.
    const plan = (await f.client.raw(
      `explain query plan ${selects[1]!.sql}`,
      selects[1]!.bindings,
    )) as { detail: string }[];
    expect(plan.map((r) => r.detail).join('\n')).toMatch(
      /USING INDEX sqlite_autoindex_nr_tasks_1 \(id=\?\)/,
    );
  }
});

test('the data summary’s tasks keep their order and their cap', async () => {
  const f = await fixture(taskRows());
  const data = new TaskData({ db: f.db });
  for (const project of ['1', '2']) {
    const before = await offsetRead(f.db, {
      filter: { projectId: project },
      sort: ['-createdAt'],
      size: 200,
      cap: 2000,
    });
    const { selects } = await f.record(() => data.tasks(project));
    expect(await data.tasks(project)).toEqual(before);
    for (const q of selects) expect(q.sql).not.toMatch(/offset/i);
  }
  // The cap, smaller here: the first rows in the same order, read 50 at a time.
  const capped = await offsetRead(f.db, {
    filter: { projectId: '1' },
    sort: ['-createdAt'],
    size: 50,
    cap: 150,
  });
  expect(capped).toHaveLength(150);
  expect(
    await tasksInOrder(f.db.getRepository('nrTasks'), '1', {
      sort: ['-createdAt'],
      limit: 150,
      size: 50,
    }),
  ).toEqual(capped);
});

const publishing = (targetId = 'blog') => ({
  work: work({ release: { state: 'publishing', article: { targetId } } }),
});

test('Article publishing’s tick publishes each interrupted task once, in id order, including one added behind it', async () => {
  // Publishing tasks at both ends of the first page, in the middle of the second and on the last.
  const rows = taskRows(),
    byId = [...rows].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  const marked = [0, 99, 100, 150, 299].map((i) => byId[i]!.id);
  for (const r of rows)
    if (marked.includes(r.id)) r.evidence = { ...r.evidence, ...publishing() };
  const f = await fixture(rows, { articles: {} });
  const published: string[] = [];
  let added = false;
  vi.spyOn(f.s.articleFlow, 'publish').mockImplementation(
    async (_project: string, taskId: string) => {
      published.push(taskId);
      if (added) return;
      added = true;
      // Written while the tick runs: one after every id read so far, and one before them.
      for (const id of ['999999999999999', '1'])
        await f.db.getRepository('nrTasks').create({
          values: {
            id,
            taskKey: `added:${id}`,
            projectId: '2',
            title: `Added ${id}`,
            evidence: publishing(),
          },
        });
    },
  );
  await f.s.articleFlow.tick();
  // The task added after the scan's position is published in the same tick; the one added before it waits for the next
  // tick, and no task is published twice.
  expect(published).toEqual([...marked, '999999999999999']);
  published.length = 0;
  await f.s.articleFlow.tick();
  expect(published).toEqual(['1', ...marked, '999999999999999']);

  // The offset pages, for comparison: a task added before the position moves the rest down a row, so the last task of
  // the first page is read again at the top of the second.
  const visits: string[] = [];
  let inserted = false;
  for (let offset = 0; ; offset += 100) {
    const page = await f.db
      .getRepository('nrTasks')
      .find({ sort: 'id', limit: 100, offset });
    for (const row of page) {
      visits.push(String(row.id));
      if (inserted) continue;
      inserted = true;
      await f.db.getRepository('nrTasks').create({
        values: {
          id: '2',
          taskKey: 'added:2',
          projectId: '2',
          title: 'Added 2',
        },
      });
    }
    if (page.length < 100) break;
  }
  expect(visits.length).toBeGreaterThan(new Set(visits).size);
});

test('Release verification checks the due releases in id order across pages', async () => {
  const rows = taskRows(),
    byId = [...rows].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  const due = [5, 99, 100, 101, 250].map((i) => byId[i]!.id);
  const past = new Date(Date.now() - 60_000).toISOString(),
    later = new Date(Date.now() + 86_400_000).toISOString();
  for (const r of rows)
    if (due.includes(r.id) || r.id === byId[120]!.id)
      r.evidence = {
        ...r.evidence,
        work: work({
          release: {
            state: 'verifying',
            pages: [`https://example.test/${r.id}`],
            verifyText: 'shipped sentence',
            nextCheckAt: r.id === byId[120]!.id ? later : past,
            deadline: later,
          },
        }),
      };
  const f = await fixture(rows);
  const opened: string[] = [];
  await f.s.verifyReleases(async (url) => {
    opened.push(url);
    return { text: 'not yet' };
  });
  expect(opened).toEqual(due.map((id) => `https://example.test/${id}`));
  for (const id of due) {
    const r = projectWork(
      await f.s.task(rows.find((t) => t.id === id)!.projectId, id),
    ).release!;
    expect(r.checks).toBe(1);
    expect(Date.parse(r.nextCheckAt!)).toBeGreaterThan(Date.now());
  }
});

test('Snoozed tasks wake in task-list order, each once, across pages and projects', async () => {
  const now = new Date('2026-11-05T09:00:00Z');
  const snooze = (until: string) => ({
    until,
    day: until.slice(0, 10),
    reason: 'waiting',
  });
  const rows = taskRows((i) =>
    i % 9 === 4
      ? {
          work: work({
            humanOwnerId: '1',
            ...(i % 27 === 13 ? { stage: 'done' } : {}),
            snooze: snooze(
              i % 18 === 4
                ? '2026-11-06T09:00:00.000Z'
                : '2026-11-05T09:00:00.000Z',
            ),
          }),
        }
      : {},
  );
  const sent: string[] = [];
  const f = await fixture(rows, {
    notifications: {
      snoozeDue: async (task: Task) => {
        sent.push(String(task.id));
      },
    },
  });
  // What wakes, in the order the task list gives, read the old way.
  const expected: string[] = [],
    stays: string[] = [],
    finished: string[] = [];
  for (const project of ['1', '2', '3'])
    for (const t of await offsetRead(f.db, {
      filter: { projectId: project },
      sort: ['-createdAt', '-id'],
      size: 200,
    })) {
      const s = t.evidence?.work?.snooze;
      if (!s) continue;
      if (Date.parse(s.until) > now.getTime()) stays.push(String(t.id));
      else if (t.evidence.work.stage === 'done') finished.push(String(t.id));
      else expected.push(String(t.id));
    }
  expect(expected.length).toBeGreaterThanOrEqual(10);
  expect(stays.length).toBeGreaterThan(3);
  expect(finished.length).toBeGreaterThan(0);
  expect(
    expected.some((id) => rows.find((r) => r.id === id)!.createdAt === null),
  ).toBe(true);
  let woke = 0;
  const { selects } = await f.record(async () => {
    woke = await f.s.wakeSnoozed(now);
  });
  for (const q of selects) expect(q.sql).not.toMatch(/offset/i);
  expect(woke).toBe(expected.length);
  expect(sent).toEqual(expected);
  for (const id of [...expected, ...finished, ...stays]) {
    const t = rows.find((r) => r.id === id)!,
      w = projectWork(await f.s.task(t.projectId, id));
    expect({ id, snoozed: Boolean(w.snooze) }).toEqual({
      id,
      snoozed: stays.includes(id),
    });
  }
  // Nothing is due any more.
  sent.length = 0;
  expect(await f.s.wakeSnoozed(now)).toBe(0);
  expect(sent).toEqual([]);
});
