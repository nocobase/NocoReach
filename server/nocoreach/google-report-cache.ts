import { createHash } from 'node:crypto';
import { GOOGLE_HISTORY_CACHE_MS } from '../../shared/google-cache.js';
import type { LegacyDatabase } from './legacy/database.js';

type Entry = { key: string; at: number; expiresAt: number; value: unknown };
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
        entry.expiresAt > Date.now() &&
        entry.expiresAt <= entry.at + GOOGLE_HISTORY_CACHE_MS &&
        'value' in entry
      );
    }),
  );
}

/** Completed Google reports shared by authorized project readers and retained across restarts. */
export class GoogleReportCache {
  private memory = new Map<string, Entry>();
  private memorySizes = new Map<string, number>();
  private memoryBytes = 0;
  private pending = new Map<string, Promise<Entry>>();
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
    present: (value: T, expiresAt: number) => T = (value) => value,
  ): Promise<T> {
    // A transaction must neither await an outside build nor publish uncommitted state.
    if (this.database?.transactionContext?.())
      return present(await fetcher(), Date.now());
    const key = createHash('sha256')
      .update(JSON.stringify([1, projectId, ...identity]))
      .digest('hex');
    const cached = this.memory.get(key);
    if (cached && cached.expiresAt > Date.now())
      return present(structuredClone(cached.value) as T, cached.expiresAt);
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.build(projectId, key, fetcher, ttl).finally(() =>
        this.pending.delete(key),
      );
      this.pending.set(key, pending);
    }
    // Each caller may enrich its own response with synced Search Console rows.
    const entry = await pending;
    return present(structuredClone(entry.value) as T, entry.expiresAt);
  }

  private async build<T>(
    projectId: string,
    key: string,
    fetcher: () => Promise<T>,
    ttl: (value: T) => number,
  ): Promise<Entry> {
    const saved = (await this.read(projectId)).find(
      (entry) => entry.key === key,
    );
    if (saved) {
      this.remember(saved);
      return saved;
    }
    const value = await fetcher();
    const at = Date.now();
    const entry = {
      key,
      at,
      expiresAt:
        at + Math.min(GOOGLE_HISTORY_CACHE_MS, Math.max(0, ttl(value))),
      value: structuredClone(value),
    };
    // Oversized results still reach the caller, but never turn the shared snapshot into a large blob.
    if (entry.expiresAt > at && bytes(entry) <= MAX_ENTRY_BYTES) {
      this.remember(entry);
      await this.save(projectId, entry);
    }
    return entry;
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

  private async save(projectId: string, entry: Entry) {
    if (!this.database) return;
    const repository = this.database.getRepository('nrSnapshots');
    const write = (this.writes.get(projectId) ?? Promise.resolve()).then(
      async () => {
        try {
          const key = `${this.namespace}:${projectId}`;
          const row = await repository.findOne({ filter: { key } });
          const payload = {
            entries: bounded([
              entry,
              ...entries(row?.get('payload')).filter(
                (saved) => saved.key !== entry.key,
              ),
            ]),
          };
          if (row)
            await repository.update({ filter: { key }, values: { payload } });
          else await repository.create({ values: { key, payload } });
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
