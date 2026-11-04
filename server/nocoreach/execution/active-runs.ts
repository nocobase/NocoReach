import type { Run } from './model';

// The task tick (`TaskService.tick`, every 2 s) has work only for runs that a Runner or the demo simulation still owes
// an answer for, yet it used to page through every `nr-task-run:` row ever written, payloads included, with OFFSET and
// a sort of all of them for each page. On SQLite's synchronous driver each tick held the whole process: 220 ms with
// 1,000 settled runs and 5.2 s with 5,000, when the NocoReach timers sharing its executor stopped firing (2026-11-04
// measurement on a copy of the demo database). The tick now reads only the keys kept here, by key.
//
// `TaskService.put` adds the key of every run it writes that needs the tick, and adds it again once the write commits;
// the tick drops a key once the row it reads back no longer needs it or is gone, never on a write, so a rolled-back
// write cannot hide a run. Every in-process writer of runs goes through `TaskService.put`. Rows written around it are
// found by a scan of ids and update times every `RESCAN_MS`, which reads the payloads only of rows it has not seen
// settled with that update time; an instance's first tick reads them all, so a restart finds the runs in flight.

export const RUN_PREFIX = 'nr-task-run:';
/**
 * How often runs written without `TaskService.put` are looked for. The writers that do so write settled runs only
 * (demo data, demo upgrades) or ask for a scan (a classic import), so this only bounds the delay for a writer nobody
 * knows of yet; with 5,000 runs a scan reads ids for about 40 ms in pages of `IDS_PAGE`.
 */
export const RESCAN_MS = 10 * 60_000;
const IDS_PAGE = 1000;
const BATCH = 100;

/** What `TaskService.tick` does something for: a demo simulation to play or to settle, an official run to follow. */
export const needsTick = (r: Partial<Run> | null | undefined): boolean =>
  Boolean(
    r &&
    ((r.simulated && (r.status === 'queued' || r.status === 'running')) ||
      (r.pluginRunId && !r.pluginSettled)),
  );

interface Row {
  readonly id?: unknown;
  readonly key?: unknown;
  readonly updatedAt?: unknown;
  get(key: string): unknown;
}
/** The part of the `nrSnapshots` repository (legacy/database.ts) read here. */
export interface SnapshotRows {
  find(options: Record<string, unknown>): Promise<Row[]>;
}
// SQLite answers synchronously: give way to other requests between two reads (docs/DEVELOPMENT.md, Backend and data).
const pause = () => new Promise((resolve) => setImmediate(resolve));

export class ActiveRuns {
  /** Keys of the runs the tick reads, each with the number of the write that last added it. */
  private readonly keys = new Map<string, number>();
  /** Runs the last scan read settled: id → update time. */
  private settled = new Map<string, string>();
  private writes = 0;
  private scannedAt = 0;

  constructor(private readonly rows: () => SnapshotRows) {}

  /** The keys the next tick reads. */
  tracked(): string[] {
    return [...this.keys.keys()];
  }

  /** `TaskService.put` wrote `payload` under `key` inside `tx`. */
  wrote(key: string, payload: unknown, tx?: unknown) {
    if (!key.startsWith(RUN_PREFIX) || !needsTick(payload as Run)) return;
    const add = () => {
      this.keys.set(key, ++this.writes);
    };
    add();
    // A tick reading on another connection before the commit does not see the row yet and drops the key.
    const outer = tx as { afterCommit?(fn: () => unknown): void } | null;
    if (typeof outer?.afterCommit === 'function') outer.afterCommit(add);
  }

  /** Reads every run again on the next tick, after a writer that bypasses `TaskService.put` (classic import). */
  rescan() {
    this.scannedAt = 0;
    this.settled.clear();
  }

  /** The runs the tick has work for, in batches by key; a key whose row no longer needs it is dropped. */
  async *due(stopped: () => boolean = () => false): AsyncGenerator<Run> {
    if (Date.now() - this.scannedAt >= RESCAN_MS) await this.scan(stopped);
    const keys = [...this.keys];
    for (let i = 0; i < keys.length && !stopped(); i += BATCH) {
      if (i) await pause();
      const batch = keys.slice(i, i + BATCH),
        found = new Set<string>();
      const rows = await this.rows().find({
        filter: { key: { $in: batch.map(([key]) => key) } },
      });
      for (const row of rows) {
        const r = row.get('payload') as Run;
        if (!needsTick(r)) continue;
        found.add(String(row.key));
        yield r;
      }
      // A write that added the key again meanwhile keeps it for the next tick.
      for (const [key, write] of batch)
        if (!found.has(key) && this.keys.get(key) === write)
          this.keys.delete(key);
    }
  }

  private async scan(stopped: () => boolean) {
    const settled = new Map<string, string>(),
      unread: string[] = [];
    for (let last: string | undefined; ;) {
      const page = await this.rows().find({
        filter: {
          key: { $startsWith: RUN_PREFIX },
          ...(last ? { id: { $gt: last } } : {}),
        },
        fields: ['id', 'key', 'updatedAt'],
        sort: 'id',
        limit: IDS_PAGE,
      });
      for (const row of page) {
        const id = String(row.id),
          at = String(row.updatedAt);
        if (this.keys.has(String(row.key))) continue;
        if (this.settled.get(id) === at) settled.set(id, at);
        else unread.push(id);
      }
      if (page.length < IDS_PAGE || stopped()) break;
      last = String(page[page.length - 1].id);
      await pause();
    }
    for (let i = 0; i < unread.length && !stopped(); i += BATCH) {
      await pause();
      const rows = await this.rows().find({
        filter: { id: { $in: unread.slice(i, i + BATCH) } },
      });
      for (const row of rows) {
        const key = String(row.key);
        if (key.startsWith(RUN_PREFIX) && needsTick(row.get('payload') as Run))
          this.keys.set(key, ++this.writes);
        else settled.set(String(row.id), String(row.updatedAt));
      }
    }
    if (stopped()) return;
    this.settled = settled;
    this.scannedAt = Date.now();
  }
}
