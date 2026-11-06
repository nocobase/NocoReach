// Reads of many tasks: the periodic scans of every task (release checks, effects, article publishing, one-time repairs),
// a project's tasks in id order (Data sources › Website source, Results) and a project's task list, newest first
// (`TaskService.tasks`: the task list, the Tasks badge, snoozed tasks every minute; `TaskData.tasks`).
//
// NocoBase 3 orders every Repository read by a nulls-last `case` that no index serves, so each page these read with
// `offset` read and sorted every matching row again, `evidence` (about 5.5 KB a task) included. On SQLite's synchronous
// driver the whole read held the process: with 10,000 tasks `articleFlow.tick` took 18 s every minute, `verifyReleases`
// and `observeEffects` 16 to 17 s each, and the first tick after a start 49.7 s; with 5,000 tasks in each of two
// projects `wakeSnoozed` took 9 s every minute (2026-11-05 measurement on copies of the demo database). See
// docs/DEVELOPMENT.md, Backend and data.
//
// - `pagesById` reads the next page after the last id read (`id > last`), so a page sorts only the rows after it and
//   a scan visits the same rows in the same order as the offset pages did. A row written during a scan is no worse off
//   either: one with a higher id is still visited when the scan gets there, and none is visited twice or skipped
//   because another was added or removed before it.
// - `tasksInOrder` reads a project's ids once in the order asked for, which the database applies exactly as it did to
//   the offset pages (nulls, ties and its own date comparison included), then the rows by key.
//
// Both give way to other requests between two reads.

/** A task row as the legacy repository returns it (legacy/database.ts `legacyRecord`). */
export interface TaskRow {
  readonly id?: unknown;
  toJSON?(): Record<string, unknown>;
}
/** The part of the `nrTasks` repository read here. */
export interface TaskRows<R extends TaskRow = TaskRow> {
  find(options: Record<string, unknown>): Promise<R[]>;
}
// SQLite answers synchronously: give way to other requests between two reads (docs/DEVELOPMENT.md, Backend and data).
const pause = () => new Promise((resolve) => setImmediate(resolve));
const idOf = (row: TaskRow) => String(row.id ?? row.toJSON?.().id);

/**
 * Every task matching `filter` (every task without one), in id order, `size` rows a page. The next page is read once
 * the caller has finished with the one before, as the offset pages were.
 */
export async function* pagesById<R extends TaskRow>(
  rows: TaskRows<R>,
  {
    filter,
    fields,
    size = 100,
  }: {
    filter?: Record<string, unknown>;
    fields?: string[];
    size?: number;
  } = {},
): AsyncGenerator<R[]> {
  for (let last: string | undefined; ;) {
    const where = last ? { ...filter, id: { $gt: last } } : filter;
    const page = await rows.find({
      ...(where ? { filter: where } : {}),
      ...(fields ? { fields } : {}),
      sort: 'id',
      limit: size,
    });
    yield page;
    if (page.length < size) return;
    last = idOf(page[page.length - 1]);
    await pause();
  }
}

/**
 * A project's tasks as plain objects, in the order `sort` gives, at most `limit` of them: the ids in that order first,
 * then the rows by key, `size` at a time. The keys alone are looked up, as `SyncService.build` does: with the project in
 * the same filter SQLite searched the project's index for each read instead. The project is checked on the rows read.
 */
export async function tasksInOrder(
  rows: TaskRows,
  project: string | number,
  {
    sort,
    limit,
    size = 200,
  }: { sort: string[]; limit?: number; size?: number },
): Promise<Record<string, unknown>[]> {
  const ids = (
    await rows.find({
      filter: { projectId: project },
      fields: ['id'],
      sort,
      ...(limit ? { limit } : {}),
    })
  ).map(idOf);
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += size) {
    await pause();
    const chunk = ids.slice(i, i + size),
      found = new Map<string, Record<string, unknown>>();
    for (const row of await rows.find({ filter: { id: { $in: chunk } } })) {
      const task = row.toJSON ? row.toJSON() : (row as Record<string, unknown>);
      if (String(task.projectId) === String(project))
        found.set(String(task.id), task);
    }
    // A task removed since its id was read is left out.
    for (const id of chunk) if (found.has(id)) out.push(found.get(id)!);
  }
  return out;
}
