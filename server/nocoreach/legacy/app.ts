// The classic NocoBase application surface the ported NocoReach services call while registering: `resourceManager`
// (their HTTP actions), `acl.allow` (which of them answer without a session), `cronJobManager` (their timers),
// `pm.get` (other plugins), `on('afterStart')`, `logger` and `environment.getVariables()`. Here they only collect what
// the services register; the NocoReach provider starts the timers and the NocoReach route serves the actions.
import { AsyncLocalStorage } from 'node:async_hooks';

import type { ScheduleJob } from '@nocobase/jobs';
import type { Logger } from '@nocobase/logging';
import type { LegacyDatabase } from './database.js';
import type { LegacyVariables } from './variables.js';

export type LegacyAction = (ctx: any, next: () => Promise<void>) => Promise<void>;

/** The classic (winston) logger call shape the ported code uses: message first, then details. */
export interface LegacyLogger {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
  debug(message: string, details?: unknown): void;
}

/** NocoBase 3 logs with pino, which takes the details first; this keeps the classic order working. */
export function legacyLogger(logger: Logger): LegacyLogger {
  const call =
    (level: 'info' | 'warn' | 'error' | 'debug') =>
    (message: string, details?: unknown) => {
      if (details instanceof Error) logger[level]({ err: details }, message);
      else if (details && typeof details === 'object') logger[level](details as object, message);
      else if (details !== undefined) logger[level]({ details }, message);
      else logger[level](message);
    };
  return { info: call('info'), warn: call('warn'), error: call('error'), debug: call('debug') };
}
export type AccessLevel = 'public' | 'loggedIn';

export interface LegacyJob {
  readonly name: string;
  readonly cronTime: string;
  readonly onTick: () => unknown;
}

/** How long the timers stay held after the classic import's last call: a CLI that stops lets them run again. */
export const IMPORT_HOLD_LEASE_MS = 5 * 60_000;

/**
 * How long one timer firing may keep NocoReach's schedule executor before the other timers run again. The executor runs
 * one firing at a time (the built-in memory jobs configuration has a concurrency of 1); see `LegacyApp.tick`.
 */
export const FIRING_DEADLINE_MS = 60_000;

/** How long shutdown waits for timer work still running before the sources and the network close under it. */
export const SHUTDOWN_GRACE_MS = 15_000;

/**
 * How often a timer whose firing still runs is reported again while its firings are skipped: a firing that never ends
 * keeps its timer from firing for the life of the process.
 */
export const OVERRUN_REPORT_MS = 10 * 60_000;

/**
 * Keeps NocoReach's background work off the data while `pnpm nocobase app import-classic` writes it
 * (server/nocoreach/classic-import.ts): the timers act on a project as soon as its snapshot lands, and would otherwise
 * work on half a dataset. Each import call renews a lease instead of holding until `finish`, so a CLI that dies midway
 * lets the timers run again. In memory: NocoReach and its timers run in one process.
 */
export class ImportHold {
  private until = 0;
  private readonly work = new Set<Promise<unknown>>();

  get held(): boolean {
    return Date.now() < this.until;
  }

  /** Holds, or renews the hold, for `lease` from now. */
  hold(lease = IMPORT_HOLD_LEASE_MS): void {
    this.until = Date.now() + lease;
  }

  release(): void {
    this.until = 0;
  }

  /** Background work that `idle()` waits for. */
  track<T>(work: Promise<T>): Promise<T> {
    this.work.add(work);
    const done = () => this.work.delete(work);
    work.then(done, done);
    return work;
  }

  /** True once the tracked work has finished, false if some still runs after `ms`. */
  async idle(ms: number): Promise<boolean> {
    const deadline = Date.now() + ms;
    while (this.work.size) {
      const left = deadline - Date.now();
      if (left <= 0) return false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled([...this.work]),
        new Promise((resolve) => (timer = setTimeout(resolve, left))),
      ]);
      clearTimeout(timer);
    }
    return true;
  }
}

export class LegacyResources {
  private readonly actions = new Map<string, Record<string, LegacyAction>>();
  private readonly levels = new Map<string, AccessLevel>();

  define({ name, actions }: { name: string; actions: Record<string, LegacyAction> }) {
    this.actions.set(name, { ...(this.actions.get(name) || {}), ...actions });
  }

  allow(resource: string, actions: string | string[], level: AccessLevel) {
    for (const action of Array.isArray(actions) ? actions : [actions])
      this.levels.set(`${resource}:${action}`, level);
  }

  action(resource: string, action: string): LegacyAction | undefined {
    return this.actions.get(resource)?.[action];
  }

  level(resource: string, action: string): AccessLevel {
    return this.levels.get(`${resource}:${action}`) || 'loggedIn';
  }

  list(): { resource: string; action: string }[] {
    return [...this.actions].flatMap(([resource, actions]) =>
      Object.keys(actions).map((action) => ({ resource, action })),
    );
  }
}

export class LegacyApp {
  readonly resources = new LegacyResources();
  readonly jobs: LegacyJob[] = [];
  readonly importHold = new ImportHold();
  /** How long one firing may keep the schedule executor (see `tick`). */
  firingDeadline = FIRING_DEADLINE_MS;
  /** How often a timer still running past its deadline is reported again (see `tick`). */
  overrunReport = OVERRUN_REPORT_MS;
  /** Timers whose last firing outlived its deadline and still runs: when it started, last reported, firings skipped. */
  private readonly overrunning = new Map<string, { started: number; reported: number; skipped: number }>();
  /** Firings still running, which `settle` waits for, each with the state its async context carries. */
  private readonly firings = new Map<Promise<unknown>, { abandoned: boolean }>();
  private readonly firing = new AsyncLocalStorage<{ abandoned: boolean }>();
  private readonly plugins = new Map<string, unknown>();
  private readonly listeners = new Map<string, (() => unknown)[]>();
  readonly resourceManager: { define: LegacyResources['define'] };
  readonly acl: { allow: LegacyResources['allow']; use: (...args: unknown[]) => void };
  readonly cronJobManager: {
    addJob(job: { cronTime: string; onTick: () => unknown; name?: string }): LegacyJob;
    removeJob(job: LegacyJob): void;
  };
  readonly pm: { get(name: string): any };
  readonly environment: { getVariables(): Record<string, string> };

  constructor(
    readonly db: LegacyDatabase,
    readonly logger: LegacyLogger,
    variables: LegacyVariables,
  ) {
    this.resourceManager = { define: (o) => this.resources.define(o) };
    // `acl.use` guarded NocoBase's own table API from NocoReach members; NocoBase 3 has no generic table API to guard.
    this.acl = { allow: (r, a, l) => this.resources.allow(r, a, l), use: () => {} };
    this.cronJobManager = {
      addJob: ({ cronTime, onTick, name }) => {
        const job = { name: name || `job-${this.jobs.length + 1}`, cronTime, onTick };
        this.jobs.push(job);
        return job;
      },
      removeJob: (job) => {
        const i = this.jobs.indexOf(job);
        if (i >= 0) this.jobs.splice(i, 1);
      },
    };
    this.pm = { get: (name) => this.plugins.get(name) ?? null };
    this.environment = { getVariables: () => variables.all() };
  }

  /**
   * One firing of a timer the services registered, as the provider's schedule executor calls it. While the classic
   * import holds the timers the firing is skipped, not queued: the next one does the work.
   *
   * The executor runs one firing at a time, so a firing that does not end would stop every other timer. One still
   * running after `deadline`, or when `signal` aborts as the executor shuts down, is left to finish on its own: nothing
   * cancels it, so its job keeps its own retries, billing and status, and the import hold still waits for it. The
   * executor goes on to the other timers, and this timer's next firings are skipped until it ends, so it never runs
   * twice at once.
   *
   * Overrunning is routine for the longer reads (a Google sync step, a source's first read), so it is logged at info; a
   * timer still running `overrunReport` later is logged again at warn on each skipped firing past that interval.
   */
  async tick(
    job: LegacyJob,
    { deadline = this.firingDeadline, signal }: { deadline?: number; signal?: AbortSignal } = {},
  ): Promise<boolean> {
    if (this.importHold.held) return false;
    const overrun = this.overrunning.get(job.name);
    if (overrun) {
      overrun.skipped++;
      if (Date.now() - overrun.reported >= this.overrunReport) {
        overrun.reported = Date.now();
        this.logger.warn('NocoReach timer still running; its firings are skipped until it ends', {
          job: job.name,
          ms: Date.now() - overrun.started,
          skipped: overrun.skipped,
        });
      }
      return false;
    }
    const started = Date.now();
    const state = { abandoned: false };
    const work = this.importHold.track(new Promise((resolve) => this.firing.run(state, () => resolve(job.onTick()))));
    this.firings.set(work, state);
    const settled = () => this.firings.delete(work);
    work.then(settled, settled);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: (() => void) | undefined;
    const released = new Promise<'deadline' | 'shutdown'>((resolve) => {
      timer = setTimeout(() => resolve('deadline'), deadline);
      stop = () => resolve('shutdown');
      if (signal?.aborted) stop();
      else signal?.addEventListener('abort', stop, { once: true });
    });
    try {
      const outcome = await Promise.race([work.then(() => undefined), released]);
      if (!outcome) return true;
      this.overrunning.set(job.name, { started, reported: Date.now(), skipped: 0 });
      const what =
        outcome === 'deadline' ? 'NocoReach timer that outlived its deadline' : 'NocoReach timer left running at shutdown';
      this.logger.info(
        outcome === 'deadline'
          ? 'NocoReach timer still running after its deadline; the other timers run meanwhile'
          : 'NocoReach timer still running at shutdown; shutdown goes on',
        { job: job.name, ms: Date.now() - started },
      );
      const ended = (error?: unknown) => {
        const skipped = this.overrunning.get(job.name)?.skipped ?? 0;
        this.overrunning.delete(job.name);
        const details = { job: job.name, ms: Date.now() - started, skipped };
        if (error === undefined) this.logger.info(`${what} finished`, details);
        else this.logger.warn(`${what} failed`, { ...details, message: (error as Error)?.message });
      };
      work.then(
        () => ended(),
        (error: unknown) => ended(error ?? new Error('rejected')),
      );
      return true;
    } finally {
      clearTimeout(timer);
      if (stop) signal?.removeEventListener('abort', stop);
    }
  }

  /**
   * A timer as the provider adds it to NocoBase 3's schedule executor. The executor's signal aborts at shutdown, which
   * then stops waiting for the firing.
   */
  scheduleJob(job: LegacyJob, tz: string): ScheduleJob<Record<string, never>> {
    return {
      name: job.name,
      options: { cron: job.cronTime, tz },
      payload: {},
      execute: async ({ signal }) => {
        await this.tick(job, { signal });
      },
    };
  }

  /** Waits up to `ms` for timer firings still running; true once none is. Other tracked work is not waited for. */
  async settle(ms: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([...this.firings.keys()]),
      new Promise((resolve) => (timer = setTimeout(resolve, ms))),
    ]);
    clearTimeout(timer);
    return this.firings.size === 0;
  }

  /**
   * At shutdown, after `settle`: the firings still running, and the work they started, write nothing more through the
   * classic database (`LegacyDatabase.refuseWritesWhen`), so the network closing under them is not recorded as their
   * failure. They end as in a killed process: a sync job stays `running`, a day is not marked as read, no failure waits
   * for a retry. Returns how many there were.
   */
  abandon(): number {
    for (const state of this.firings.values()) state.abandoned = true;
    return this.firings.size;
  }

  /** Whether the caller runs in a firing `abandon` gave up on. */
  abandoned(): boolean {
    return this.firing.getStore()?.abandoned === true;
  }

  /** Makes a NocoBase 3 capability answer a classic `pm.get(name)`. */
  provide(name: string, plugin: unknown) {
    this.plugins.set(name, plugin);
  }

  on(event: string, fn: () => unknown) {
    this.listeners.set(event, [...(this.listeners.get(event) || []), fn]);
  }

  async emit(event: string) {
    for (const fn of this.listeners.get(event) || [])
      await Promise.resolve()
        .then(fn)
        .catch((e: Error) => this.logger.warn(`NocoReach ${event} handler failed`, { message: e?.message }));
  }
}
