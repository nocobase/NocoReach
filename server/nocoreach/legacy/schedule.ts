// The classic workflow plugin as the daily analysis used it — a "schedule" workflow found by title, whose `enabled` and
// `config.repeat` (cron) say whether and when it runs, and a custom node registered with `registerInstruction` that does
// the work — rebuilt on NocoBase 3's Scheduler plugin. The NocoReach provider defines the schedule and, when it fires,
// runs the instruction class the service registered here; administrators see every run and switch the schedule on or
// off through the official Scheduler API/CLI.
//
// The Scheduler has no service to read a schedule back, only its authorized HTTP API. `workflows` therefore reads the
// schedule's own row (`scheduleDefinitions`) — read-only, never written — so the service's retry and catch-up timer
// stops when an administrator switches the schedule off, as it did for a disabled workflow.
import type { DatabaseManager } from '@nocobase/db';
import type { JsonObject } from '@nocobase/app-plugin-scheduler/server';

import { legacyRecord, type LegacyDatabase, type LegacyRecord, type LegacyRepository } from './database.js';
import { toFilter } from './filters.js';

type Values = Record<string, unknown>;

/** The classic `Instruction` the daily analysis subclasses: `new Instruction(workflow).run()` → `{ status, result }`. */
export type LegacyInstruction = new (workflow?: unknown) => { run(...args: unknown[]): Promise<{ status: number; result?: unknown }> };

/** The classic job statuses (`JOB_STATUS`) the instruction returns. */
export const JOB_STATUS = { RESOLVED: 1, FAILED: -1 } as const;

export class LegacyWorkflows {
  private readonly instructions = new Map<string, LegacyInstruction>();
  /** What `pm.get('workflow')` answers: only `registerInstruction`, which the daily analysis calls while registering. */
  readonly plugin: { registerInstruction(type: string, instruction: LegacyInstruction): void };

  /** `schedules`: classic workflow title → the Scheduler key of the schedule that replaced it. */
  constructor(
    private readonly db: DatabaseManager,
    private readonly schedules: Readonly<Record<string, string>>,
  ) {
    this.plugin = { registerInstruction: (type, instruction) => void this.instructions.set(type, instruction) };
  }

  instruction(type: string): LegacyInstruction | undefined {
    return this.instructions.get(type);
  }

  /** The Scheduler's row of a schedule, or null when it has not been synchronized (or Scheduler is not installed). */
  async definition(key: string): Promise<Values | null> {
    try {
      const filter = toFilter({ key });
      const rows = (await this.db.repository('scheduleDefinitions').findMany({ ...(filter ? { filter } : {}), limit: 1 })) as Values[];
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  /** `db.getRepository('workflows')`: a classic schedule workflow, answered from the Scheduler's definition. */
  repository(): LegacyRepository {
    const shape = (title: string, row: Values): LegacyRecord =>
      legacyRecord({
        id: row.id,
        title,
        type: 'schedule',
        current: true,
        // Switched off by an administrator, or removed from code (finalized): either way it no longer runs.
        enabled: row.enabled !== false && (row.lifecycleState ?? 'active') === 'active',
        config: { mode: 0, repeat: row.cron, timezone: row.timezone },
      });
    const find = async (options: Values = {}) => {
      const title = (options.filter as Values | undefined)?.title;
      const titles = typeof title === 'string' ? [title] : Object.keys(this.schedules);
      const out: LegacyRecord[] = [];
      for (const t of titles) {
        const key = this.schedules[t];
        const row = key ? await this.definition(key) : null;
        if (row) out.push(shape(t, row));
      }
      return out;
    };
    const fixed = async (): Promise<never> => {
      throw new Error('NocoReach schedules are defined in code and synchronized by the Scheduler plugin');
    };
    return {
      find,
      findOne: async (options) => (await find(options))[0] ?? null,
      count: async (options) => (await find(options)).length,
      create: fixed,
      update: fixed,
      destroy: fixed,
    };
  }
}

/** One firing of a schedule as NocoReach ran it, kept so the Scheduler can ask after it (`inspect`) across restarts. */
export interface ScheduledRun {
  readonly occurrenceId: string;
  readonly status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  readonly acceptedAt: string;
  readonly updatedAt: string;
  readonly reason?: string;
  readonly result?: JsonObject;
}

/** A run that has not finished this long after it last moved was cut off by a restart and will not report. */
export const STALE_RUN_MS = 2 * 60 * 60 * 1000;

/** The runs, one `nrSnapshots` row each (`<prefix>:<occurrenceId>`), as the service keeps its other state. */
export class ScheduledRuns {
  constructor(
    private readonly db: LegacyDatabase,
    private readonly prefix: string,
  ) {}

  private key(occurrenceId: string) {
    return `${this.prefix}:${occurrenceId}`;
  }

  async get(occurrenceId: string): Promise<ScheduledRun | null> {
    const row = await this.db.getRepository('nrSnapshots').findOne({ filter: { key: this.key(occurrenceId) } });
    return (row?.get('payload') as ScheduledRun) ?? null;
  }

  async put(occurrenceId: string, values: Partial<ScheduledRun>): Promise<ScheduledRun> {
    const repo = this.db.getRepository('nrSnapshots');
    const key = this.key(occurrenceId);
    const now = new Date().toISOString();
    const row = await repo.findOne({ filter: { key } });
    const current = (row?.get('payload') as ScheduledRun | undefined) ?? { occurrenceId, status: 'pending', acceptedAt: now };
    const next = { ...current, ...values, occurrenceId, updatedAt: now } as ScheduledRun;
    if (row) await repo.update({ filterByTk: row.id, values: { payload: next } });
    else await repo.create({ values: { key, payload: next } });
    return next;
  }
}
