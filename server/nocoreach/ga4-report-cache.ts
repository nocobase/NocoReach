import { createHash } from 'node:crypto';
import { GA4_HISTORY_CACHE_MS } from '../../shared/ga4-cache.js';
import type { LegacyDatabase } from './legacy/database.js';

type Entry = { key: string; at: number; expiresAt: number; value: unknown };
const MAX_SAVED = 32;
const MAX_MEMORY = 128;

function entries(payload: unknown): Entry[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('entries' in payload) ||
    !Array.isArray(payload.entries)
  )
    return [];
  return payload.entries.filter((entry: unknown): entry is Entry => {
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
      entry.expiresAt <= entry.at + GA4_HISTORY_CACHE_MS &&
      'value' in entry
    );
  });
}

/** Completed GA4 history shared by authorized project readers and retained across restarts. */
export class Ga4ReportCache {
  private memory = new Map<string, Entry>();
  private pending = new Map<string, Promise<Entry>>();
  private writes = new Map<string, Promise<void>>();

  constructor(private readonly database?: LegacyDatabase) {}

  async load<T>(
    projectId: string,
    identity: unknown[],
    fetcher: () => Promise<T>,
    ttl: (value: T) => number = () => GA4_HISTORY_CACHE_MS,
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
      expiresAt: at + Math.min(GA4_HISTORY_CACHE_MS, Math.max(0, ttl(value))),
      value: structuredClone(value),
    };
    this.remember(entry);
    await this.save(projectId, entry);
    return entry;
  }

  private remember(entry: Entry) {
    this.memory.delete(entry.key);
    this.memory.set(entry.key, entry);
    while (this.memory.size > MAX_MEMORY)
      this.memory.delete(this.memory.keys().next().value!);
  }

  private async read(projectId: string): Promise<Entry[]> {
    if (!this.database) return [];
    try {
      const row = await this.database
        .getRepository('nrSnapshots')
        .findOne({ filter: { key: `ga4-reports:${projectId}` } });
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
          const key = `ga4-reports:${projectId}`;
          const row = await repository.findOne({ filter: { key } });
          const payload = {
            entries: [
              entry,
              ...entries(row?.get('payload')).filter(
                (saved) => saved.key !== entry.key,
              ),
            ].slice(0, MAX_SAVED),
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
