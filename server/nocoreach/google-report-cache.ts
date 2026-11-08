import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import {
  GOOGLE_HISTORY_CACHE_MS,
  GOOGLE_PARTIAL_CACHE_MS,
  GOOGLE_SAVED_COPY_MAX_AGE_MS,
  GOOGLE_SAVED_COPY_RETRY_MS,
  GOOGLE_SAVED_REPORT_MS,
  type SavedCopy,
} from '../../shared/google-cache.js';
import type { LegacyDatabase } from './legacy/database.js';

type Entry = {
  key: string;
  family?: string;
  at: number;
  expiresAt: number;
  value: unknown;
};
// What the project's index row (`<namespace>:<project>`) holds of a saved report: its value is kept in a row of its own
// (`<namespace>:<project>:<key>`), so saving one report writes that report and the small index rather than every report
// of the project again (up to MAX_SAVED_BYTES, 8 MB, read, parsed and written back for each one before 2026-11-08).
// An index written before then holds the values themselves (`value`); it is read as it is until the next save moves them.
type Saved = Omit<Entry, 'value'> & { bytes: number; value?: unknown };
// Traffic keeps two parts per view (website-report.ts, `period` and `periodTables`), besides the rows people opened, so
// both counts are half as large again as before; the byte limits, which the two parts share, stay as they were.
const MAX_SAVED = 48;
const MAX_MEMORY = 192;
// A report has a row of its own, so its bound no longer keeps one shared row small: Pages' figures of 16 months on 252
// (2026-11-08) took 2.2 MB, over the 2 MB bound of the shared row, and were summed again on every read. The total bounds
// the project's rows of one namespace; memory keeps its own bound.
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
const MAX_SAVED_BYTES = 16 * 1024 * 1024;
const MAX_MEMORY_BYTES = 16 * 1024 * 1024;
const bytes = (value: unknown) =>
  Buffer.byteLength(JSON.stringify(value), 'utf8');
function bounded(list: Saved[]): Saved[] {
  let size = 0;
  return list
    .filter((entry) => {
      if (entry.bytes > MAX_ENTRY_BYTES || size + entry.bytes > MAX_SAVED_BYTES)
        return false;
      size += entry.bytes;
      return true;
    })
    .slice(0, MAX_SAVED);
}

// Whether a saved report may still be answered: within its lifetime, or a copy young enough to show while a new one is
// read. Past both it only takes room.
function current(entry: unknown): entry is Omit<Entry, 'value'> {
  if (!entry || typeof entry !== 'object') return false;
  return (
    'key' in entry &&
    typeof entry.key === 'string' &&
    'at' in entry &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at) &&
    'expiresAt' in entry &&
    typeof entry.expiresAt === 'number' &&
    Number.isFinite(entry.expiresAt) &&
    entry.at <= Date.now() &&
    (entry.expiresAt > Date.now() ||
      entry.at > Date.now() - GOOGLE_SAVED_COPY_MAX_AGE_MS) &&
    entry.expiresAt <= entry.at + GOOGLE_SAVED_REPORT_MS
  );
}

function entries(payload: unknown): Saved[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('entries' in payload) ||
    !Array.isArray(payload.entries)
  )
    return [];
  const out: Saved[] = [];
  for (const entry of payload.entries as unknown[]) {
    if (!current(entry)) continue;
    // An index entry names its size; one holding its value (written before 2026-11-08) is measured.
    if ('value' in entry) out.push({ ...entry, bytes: bytes(entry) });
    else if ('bytes' in entry && typeof entry.bytes === 'number')
      out.push({ ...entry, bytes: entry.bytes });
  }
  return bounded(out);
}

// Saves of one project's reports in one namespace run one after another across every cache of that namespace in the
// process, not only within one: DataViews holds one and the Insights summary's DataViews another, and a save removes the
// rows its index does not name, so two saves at once could each remove the other's new report, or both create its row.
const saving = new WeakMap<object, Map<string, Promise<void>>>();

// Reads inside this scope wait for a new report instead of answering from a saved copy: what a background build reads
// must be current, or the copy it saves would be old again.
const freshReads = new AsyncLocalStorage<boolean>();
export const waitForFresh = async <T>(read: () => Promise<T> | T): Promise<T> =>
  freshReads.run(true, read);
/** Whether reads here wait for a new report rather than take a saved copy. */
export const readsFresh = (): boolean => Boolean(freshReads.getStore());
// Reads ahead of people: a report held for the same identity answers even past its lifetime, and only a report with
// none (a copy from its family does not count) is read, waiting as in `waitForFresh`. The sync tick readies Traffic's
// new window this way once, and leaves reading it again for freshness to the visits that show it.
const aheadReads = new AsyncLocalStorage<boolean>();
export const readAhead = async <T>(read: () => Promise<T> | T): Promise<T> =>
  aheadReads.run(true, () => waitForFresh(read));
/** Whether reads here take the report held for their identity whatever its age. */
export const readsAhead = (): boolean => Boolean(aheadReads.getStore());
const copyable = (entry: Entry): boolean =>
  entry.expiresAt > Date.now() ||
  Date.now() - entry.at <= GOOGLE_SAVED_COPY_MAX_AGE_MS;

/**
 * Completed Google reports shared by authorized project readers and retained across restarts. A report past its lifetime
 * is answered at once from its saved copy while a new one is read in the background; only a report with no saved copy
 * makes its reader wait for Google. `family` names the view a report belongs to whatever its dates, so a day's new window
 * is answered from the previous one in the same way (the report says which window it holds).
 */
export class GoogleReportCache {
  private memory = new Map<string, Entry>();
  private memorySizes = new Map<string, number>();
  private memoryBytes = 0;
  private pending = new Map<string, Promise<Entry>>();
  private reads = new Map<string, Promise<Saved[]>>();
  private failures = new Map<string, { at: number; reason?: string }>();
  private loading = new Map<string, Promise<Entry | undefined>>();

  constructor(
    private readonly database?: LegacyDatabase,
    private readonly namespace = 'ga4-reports',
    // A read in the background fails where no request sees it, so it is logged here.
    private readonly logger?: {
      warn(message: string, meta?: Record<string, unknown>): void;
    },
  ) {}

  async load<T>(
    projectId: string,
    identity: unknown[],
    fetcher: () => Promise<T>,
    ttl: (value: T) => number = () => GOOGLE_HISTORY_CACHE_MS,
    present: (value: T, expiresAt: number, saved?: SavedCopy) => T = (value) =>
      value,
    options: { family?: unknown[] } = {},
  ): Promise<T> {
    // A transaction must neither await an outside build nor publish uncommitted state.
    if (this.database?.transactionContext?.())
      return present(await fetcher(), Date.now());
    const key = createHash('sha256')
      .update(JSON.stringify([1, projectId, ...identity]))
      .digest('hex');
    const family = options.family
      ? createHash('sha256')
          .update(JSON.stringify([1, projectId, 'family', ...options.family]))
          .digest('hex')
      : undefined;
    const found =
      this.memory.get(key) ?? (await this.nearest(projectId, key, family));
    // A copy older than GOOGLE_SAVED_COPY_MAX_AGE_MS is not shown: the reader waits for the new report instead.
    const held = found && copyable(found) ? found : undefined;
    // Each caller may enrich its own response with synced Search Console rows.
    if (
      held?.key === key &&
      (held.expiresAt > Date.now() || aheadReads.getStore())
    )
      return present(structuredClone(held.value) as T, held.expiresAt);
    if (held && !freshReads.getStore()) {
      const refreshing = this.refresh(projectId, key, family, fetcher, ttl);
      const reason = refreshing ? undefined : this.failures.get(key)?.reason;
      return present(
        structuredClone(held.value) as T,
        Date.now() + GOOGLE_SAVED_COPY_RETRY_MS,
        { refreshing, savedAt: held.at, ...(reason ? { reason } : {}) },
      );
    }
    const entry = await this.start(projectId, key, family, fetcher, ttl);
    return present(structuredClone(entry.value) as T, entry.expiresAt);
  }

  /** Resolves once no report is being read in the background. */
  async settled(): Promise<void> {
    while (this.pending.size)
      await Promise.allSettled([...this.pending.values()]);
  }

  private start<T>(
    projectId: string,
    key: string,
    family: string | undefined,
    fetcher: () => Promise<T>,
    ttl: (value: T) => number,
  ): Promise<Entry> {
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.build(projectId, key, family, fetcher, ttl).finally(() =>
        this.pending.delete(key),
      );
      this.pending.set(key, pending);
    }
    return pending;
  }

  // A failed read keeps the copy and waits the partial-report delay, so a dead token or a quota error is not asked again
  // on every read of the page. Its reason goes to the page, by the rule the data views' errors follow: a message with a
  // status was written for people. Returns whether a new report is on its way.
  private refresh<T>(
    projectId: string,
    key: string,
    family: string | undefined,
    fetcher: () => Promise<T>,
    ttl: (value: T) => number,
  ): boolean {
    if (this.pending.has(key)) return true;
    const failed = this.failures.get(key);
    if (failed && Date.now() - failed.at < GOOGLE_PARTIAL_CACHE_MS)
      return false;
    void waitForFresh(() =>
      this.start(projectId, key, family, fetcher, ttl),
    ).then(
      () => this.failures.delete(key),
      (
        error: { status?: number; code?: string; message?: string } | undefined,
      ) => {
        this.logger?.warn('NocoReach report refresh failed', {
          namespace: this.namespace,
          projectId,
          status: error?.status,
          code: error?.code,
          message: error?.message,
        });
        if (this.failures.size >= MAX_MEMORY) this.failures.clear();
        this.failures.set(key, {
          at: Date.now(),
          reason: error?.status ? error.message : undefined,
        });
      },
    );
    return true;
  }

  // The report itself, or the latest of its family when this one was never read.
  private async nearest(
    projectId: string,
    key: string,
    family: string | undefined,
  ): Promise<Entry | undefined> {
    let reading = this.reads.get(projectId);
    if (!reading) {
      reading = this.read(projectId).finally(() =>
        this.reads.delete(projectId),
      );
      this.reads.set(projectId, reading);
    }
    const saved = await reading;
    const exact =
      this.memory.get(key) ??
      (await this.value(
        projectId,
        saved.find((e) => e.key === key),
      ));
    if (exact) {
      this.remember(exact);
      return exact;
    }
    if (!family) return undefined;
    // Another window's report is only ever a copy here, so its age decides, however long it lives for its own window.
    const copies = [...saved, ...this.memory.values()]
      .filter(
        (entry) =>
          entry.family === family &&
          Date.now() - entry.at <= GOOGLE_SAVED_COPY_MAX_AGE_MS,
      )
      .sort((a, b) => b.at - a.at);
    // Each copy as the index names it, read from its row: one this cache holds may be an older version of that key, or
    // one another cache has since retired.
    for (const copy of copies) {
      const entry = await this.value(projectId, copy);
      if (entry) return entry;
    }
    return undefined;
  }

  // A saved report with its value: held in the index (written before 2026-11-08) or read from its own row.
  private async value(
    projectId: string,
    saved: Saved | Entry | undefined,
  ): Promise<Entry | undefined> {
    if (!saved) return undefined;
    if ('value' in saved) {
      const { bytes: _bytes, ...entry } = saved as Saved & Entry;
      return entry;
    }
    const database = this.database;
    if (!database) return undefined;
    // One read of a row for the callers asking for the same saved report at once (pollers after a restart); a caller
    // holding a newer index of that key asks for another, as the row it reads is checked against its own `at`.
    const rowKey = `${this.namespace}:${projectId}:${saved.key}`;
    const shared = `${rowKey}|${saved.at}`;
    let loading = this.loading.get(shared);
    if (!loading) {
      loading = (async () => {
        try {
          const payload: unknown = (
            await database
              .getRepository('nrSnapshots')
              .findOne({ filter: { key: rowKey } })
          )?.get('payload');
          // The row of the report the index names, not one a save cut short wrote for a later report of that key.
          return current(payload) &&
            payload.key === saved.key &&
            payload.at === saved.at &&
            'value' in payload
            ? payload
            : undefined;
        } catch {
          return undefined;
        }
      })().finally(() => this.loading.delete(shared));
      this.loading.set(shared, loading);
    }
    return loading;
  }

  private async build<T>(
    projectId: string,
    key: string,
    family: string | undefined,
    fetcher: () => Promise<T>,
    ttl: (value: T) => number,
  ): Promise<Entry> {
    const value = await fetcher();
    const at = Date.now();
    const entry: Entry = {
      key,
      ...(family ? { family } : {}),
      at,
      expiresAt: at + Math.min(GOOGLE_SAVED_REPORT_MS, Math.max(0, ttl(value))),
      value: structuredClone(value),
    };
    // Oversized results still reach the caller, but never turn the shared snapshot into a large blob. A result that is
    // not kept also retires the old copy, or every read would answer from it and ask for a new one again.
    const size = entry.expiresAt > at ? bytes(entry) : 0;
    const kept = entry.expiresAt > at && size <= MAX_ENTRY_BYTES;
    // Every read of a report too large to keep builds it again, so it is logged (Pages' figures did on 2026-11-06).
    if (entry.expiresAt > at && !kept)
      this.logger?.warn('NocoReach report too large to keep', {
        namespace: this.namespace,
        projectId,
        bytes: size,
      });
    this.retire(key, family);
    if (kept) this.remember(entry);
    await this.save(projectId, key, family, kept ? entry : undefined);
    return entry;
  }

  private retire(key: string, family: string | undefined) {
    this.forget(key);
    if (!family) return;
    for (const entry of [...this.memory.values()])
      if (entry.family === family) this.forget(entry.key);
  }

  private forget(key: string) {
    this.memoryBytes -= this.memorySizes.get(key) ?? 0;
    this.memorySizes.delete(key);
    this.memory.delete(key);
  }

  private remember(entry: Entry) {
    this.forget(entry.key);
    const size = bytes(entry);
    if (size > MAX_ENTRY_BYTES) return;
    this.memory.set(entry.key, entry);
    this.memorySizes.set(entry.key, size);
    this.memoryBytes += size;
    while (this.memory.size > MAX_MEMORY || this.memoryBytes > MAX_MEMORY_BYTES)
      this.forget(this.memory.keys().next().value!);
  }

  private async read(projectId: string): Promise<Saved[]> {
    if (!this.database) return [];
    try {
      const row = await this.database
        .getRepository('nrSnapshots')
        .findOne({ filter: { key: `${this.namespace}:${projectId}` } });
      return entries(row?.get('payload'));
    } catch {
      // A cache read failure does not make otherwise available reports fail.
      return [];
    }
  }

  // Values first, then the index naming them, then the values it no longer names: a save that stops halfway leaves an
  // index whose values all exist, and the next save removes what it left behind.
  private async save(
    projectId: string,
    key: string,
    family: string | undefined,
    entry: Entry | undefined,
  ) {
    if (!this.database) return;
    const repository = this.database.getRepository('nrSnapshots');
    let queue = saving.get(this.database);
    if (!queue)
      saving.set(this.database, (queue = new Map<string, Promise<void>>()));
    const queued = `${this.namespace}:${projectId}`;
    const write = (queue.get(queued) ?? Promise.resolve()).then(async () => {
      try {
        const snapshot = `${this.namespace}:${projectId}`;
        const own = (k: string) => `${snapshot}:${k}`;
        const put = async (rowKey: string, payload: unknown) => {
          const row = await repository.findOne({
            filter: { key: rowKey },
            fields: ['id'],
          });
          // The row just written is not read back: a value is up to MAX_ENTRY_BYTES.
          if (row)
            await repository.update({
              filterByTk: row.get('id'),
              values: { payload },
              returning: false,
            });
          else await repository.create({ values: { key: rowKey, payload } });
        };
        const index = await repository.findOne({ filter: { key: snapshot } });
        const old = entries(index?.get('payload'));
        // The same view's earlier window is never asked for again, so it gives its room to the new one.
        const others = old.filter(
          (saved) => saved.key !== key && !(family && saved.family === family),
        );
        const legacy = old.some((saved) => 'value' in saved);
        if (!entry && others.length === old.length && !legacy) return;
        const kept = bounded(
          entry ? [{ ...entry, bytes: bytes(entry) }, ...others] : others,
        );
        for (const saved of kept)
          if ('value' in saved) {
            const { bytes: _bytes, ...value } = saved;
            await put(own(saved.key), value);
          }
        await put(snapshot, {
          entries: kept.map(({ value: _value, ...meta }) => meta),
        });
        const named = new Set(kept.map((saved) => own(saved.key)));
        for (const row of await repository.find({
          filter: { key: { $startsWith: `${snapshot}:` } },
          fields: ['id', 'key'],
        }))
          if (!named.has(String(row.get('key'))))
            await repository.destroy({
              filter: { key: String(row.get('key')) },
            });
      } catch {
        // The in-memory cache still works if durable storage is unavailable.
      }
    });
    queue.set(queued, write);
    try {
      await write;
    } finally {
      if (queue.get(queued) === write) queue.delete(queued);
    }
  }
}
