// The classic NocoBase application surface the ported NocoReach services call while registering: `resourceManager`
// (their HTTP actions), `acl.allow` (which of them answer without a session), `cronJobManager` (their timers),
// `pm.get` (other plugins), `on('afterStart')`, `logger` and `environment.getVariables()`. Here they only collect what
// the services register; the NocoReach provider starts the timers and the NocoReach route serves the actions.
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
