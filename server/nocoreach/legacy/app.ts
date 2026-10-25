// The classic NocoBase application surface the ported NocoReach services call while registering: `resourceManager`
// (their HTTP actions), `acl.allow` (which of them answer without a session), `cronJobManager` (their timers),
// `pm.get` (other plugins), `on('afterStart')`, `logger` and `environment.getVariables()`. Here they only collect what
// the services register; the NocoReach provider starts the timers and the NocoReach route serves the actions.
import type { LegacyContext } from './context.js';
import type { Logger } from '@nocobase/logging';
import type { LegacyDatabase } from './database.js';
import type { LegacyVariables } from './variables.js';

export type LegacyAction = (ctx: LegacyContext, next: () => Promise<void>) => Promise<void>;

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
      else if (details && typeof details === 'object') logger[level](details, message);
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
  private readonly plugins = new Map<string, unknown>();
  private readonly listeners = new Map<string, (() => unknown)[]>();
  readonly resourceManager: { define: LegacyResources['define'] };
  readonly acl: { allow: LegacyResources['allow']; use: (...args: unknown[]) => void };
  readonly cronJobManager: {
    addJob(job: { cronTime: string; onTick: () => unknown; name?: string }): LegacyJob;
    removeJob(job: LegacyJob): void;
  };
  readonly pm: { get(name: string): unknown };
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
   */
  async tick(job: LegacyJob): Promise<boolean> {
    if (this.importHold.held) return false;
    await this.importHold.track(new Promise((resolve) => resolve(job.onTick())));
    return true;
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
