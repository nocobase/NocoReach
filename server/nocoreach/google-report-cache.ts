import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import {
  GOOGLE_HISTORY_CACHE_MS,
  GOOGLE_PARTIAL_CACHE_MS,
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
const MAX_SAVED = 32;
const MAX_MEMORY = 128;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_SAVED_BYTES = 8 * 1024 * 1024;
const MAX_MEMORY_BYTES = 16 * 1024 * 1024;
const bytes = (value: unknown) =>
  Buffer.byteLength(JSON.stringify(value), 'utf8');
function bounded(list: Entry[]): Entry[] {
  let size = 0;
  return list
    .filter((entry) => {
      const length = bytes(entry);
      if (length > MAX_ENTRY_BYTES || size + length > MAX_SAVED_BYTES)
        return false;
      size += length;
      return true;
    })
    .slice(0, MAX_SAVED);
}

function entries(payload: unknown): Entry[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('entries' in payload) ||
    !Array.isArray(payload.entries)
  )
    return [];
  return bounded(
    payload.entries.filter((entry: unknown): entry is Entry => {
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
        // Past its lifetime a report is still the copy answered while a new one is read.
        entry.at > Date.now() - GOOGLE_SAVED_REPORT_MS &&
        entry.expiresAt <= entry.at + GOOGLE_SAVED_REPORT_MS &&
        'value' in entry
      );
    }),
  );
}

// Reads inside this scope wait for a new report instead of answering from a saved copy: what a background build reads
// must be current, or the copy it saves would be old again.
const freshReads = new AsyncLocalStorage<boolean>();
export const waitForFresh = async <T>(read: () => Promise<T> | T): Promise<T> =>
  freshReads.run(true, read);

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
  private reads = new Map<string, Promise<Entry[]>>();
  private failures = new Map<string, { at: number; reason?: string }>();
  private writes = new Map<string, Promise<void>>();

  constructor(
    private readonly database?: LegacyDatabase,
    private readonly namespace = 'ga4-reports',
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
    const held =
      this.memory.get(key) ?? (await this.nearest(projectId, key, family));
    // Each caller may enrich its own response with synced Search Console rows.
    if (held?.key === key && held.expiresAt > Date.now())
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
      (error: { status?: number; message?: string } | undefined) => {
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
    const exact = this.memory.get(key) ?? saved.find((e) => e.key === key);
    if (exact) {
      this.remember(exact);
      return exact;
    }
    if (!family) return undefined;
    return [...saved, ...this.memory.values()]
      .filter((entry) => entry.family === family)
      .sort((a, b) => b.at - a.at)[0];
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
    const kept = entry.expiresAt > at && bytes(entry) <= MAX_ENTRY_BYTES;
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

  private async read(projectId: string): Promise<Entry[]> {
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

  private async save(
    projectId: string,
    key: string,
    family: string | undefined,
    entry: Entry | undefined,
  ) {
    if (!this.database) return;
    const repository = this.database.getRepository('nrSnapshots');
    const write = (this.writes.get(projectId) ?? Promise.resolve()).then(
      async () => {
        try {
          const snapshot = `${this.namespace}:${projectId}`;
          const row = await repository.findOne({ filter: { key: snapshot } });
          const old = entries(row?.get('payload'));
          // The same view's earlier window is never asked for again, so it gives its room to the new one.
          const others = old.filter(
            (saved) =>
              saved.key !== key && !(family && saved.family === family),
          );
          if (!entry && others.length === old.length) return;
          const payload = {
            entries: bounded(entry ? [entry, ...others] : others),
          };
          if (row)
            await repository.update({
              filter: { key: snapshot },
              values: { payload },
            });
          else await repository.create({ values: { key: snapshot, payload } });
        } catch {
          // The in-memory cache still works if durable storage is unavailable.
        }
      },
    );
    this.writes.set(projectId, write);
    try {
      await write;
    } finally {
      if (this.writes.get(projectId) === write) this.writes.delete(projectId);
    }
  }
}
