import { randomUUID } from 'node:crypto';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type {
  ScheduleExecutionCompletion,
  ScheduleTargetHandle,
  ScheduleTargetObservation,
} from '@nocobase/app-plugin-scheduler/server';
import type { SchedulerService } from '@nocobase/app-plugin-scheduler/server/tokens';
import {
  defineEffect,
  defineLifecycle,
  LifecycleError,
  SYSTEM_ACTOR,
  type EffectContext,
  type JsonObject,
  type LifecycleRecord,
  type LifecycleRuntime,
  type TransitionContext,
} from '@nocobase/lifecycle';

import type { MockEngine } from '../../app-plugins/nocoreach-mock/server/engine.js';
import type { MockRunContext } from '../../app-plugins/nocoreach-mock/server/types.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
import {
  ANALYSIS_TITLE,
  DEFAULT_CRON,
  scheduledToday,
} from './daily-analysis.js';
import type { LegacyDatabase } from './legacy/database.js';
import { NOCOREACH_LIFECYCLE_COLLECTIONS } from './lifecycle/runtime.js';
import { record as recordAttempt, lastSuccess } from './sync-policy.js';

export const ANALYSIS_LIFECYCLE = 'nocoreach.analysis';
export const ANALYSIS_COLLECTION = 'nrAnalysisRuns';
export const ANALYSIS_OCCURRENCES = 'nrAnalysisOccurrences';
export const ANALYSIS_SCHEDULE = 'nocoreach.daily-analysis';
export const ANALYSIS_TARGET = 'app.nocoreach.daily-analysis';
const ANALYSIS_EFFECT = 'nocoreach.analysis.execute';
const RETRY_MINUTES = [5, 15, 60] as const;
const CATCHUP_GRACE_MS = 15 * 60_000;
const UTC_ZONES = new Set(['UTC', 'Etc/UTC', 'GMT', 'Etc/GMT']);
const localScheduleZone = (timezone: string): boolean => {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    timezone === local || (UTC_ZONES.has(timezone) && UTC_ZONES.has(local))
  );
};
// Three bounded model requests (report, optional rewrite and missing verdicts),
// each at most four minutes. This is shorter than the shared 15 minute lease.
const ANALYSIS_TIMEOUT_MS = 13 * 60_000;
const TERMINAL = new Set(['succeeded', 'failed', 'unknown', 'skipped']);
type AnalysisState =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'unknown'
  | 'skipped';
type AnalysisTrigger = 'manual' | 'schedule' | 'catchup';

export type AnalysisEntry = JsonObject & {
  readonly at: string;
  readonly trigger: string;
  readonly ok: boolean;
  readonly ms: number;
  /** Known system errors stay semantic; upstream text is retained verbatim. */
  readonly error?: string;
  readonly retryable?: boolean;
};

/** The algorithm asks for a durable marker before I/O and a fence around writes. */
export interface AnalysisExecution {
  readonly at?: string;
  readonly signal?: AbortSignal;
  readonly beforeModel?: () => Promise<void>;
  readonly commit?: <T>(write: () => Promise<T>) => Promise<T>;
}

export interface AnalysisRun extends LifecycleRecord {
  readonly status: AnalysisState;
  readonly lifecycleVersion: number;
  readonly statusChangedAt: string | Date;
  readonly runKey: string;
  readonly activeKey: string;
  readonly projectId: string;
  readonly trigger: AnalysisTrigger;
  readonly day: string;
  readonly attempt: number;
  readonly requestedAt: string | Date;
  readonly requestedBy: string | null;
  readonly startedAt: string | Date | null;
  readonly completedAt: string | Date | null;
  readonly retryAt: string | Date | null;
  readonly requestStartedAt: string | Date | null;
  readonly requestToken: string | null;
  readonly result: {
    readonly entry?: AnalysisEntry;
    readonly history?: AnalysisEntry[];
  } | null;
  readonly mockSnapshot: Readonly<MockRunContext> | null;
}

interface AnalysisHost {
  readonly db: LegacyDatabase;
  readonly mock?: MockEngine;
  readonly analysis: {
    run(
      id: string,
      trigger: string,
      execution: AnalysisExecution,
    ): Promise<AnalysisEntry>;
  };
  readonly notifications?: {
    analysisFailed(id: string, error?: string): Promise<unknown>;
  };
  projectIds(): Promise<Array<string | number>>;
}

export interface AnalysisRuntimeOptions {
  readonly database: DatabaseManager;
  readonly lifecycle: LifecycleRuntime;
  readonly scheduler?: SchedulerService;
  readonly appName: string;
  readonly host: () => AnalysisHost;
  readonly ready: Promise<void>;
  readonly logger: { warn(message: string, details?: unknown): void };
  readonly clock?: () => Date;
}

interface AnalysisTypes {
  record: AnalysisRun;
  state: AnalysisState;
  services: {
    analysis: AnalysisRuntime;
    effectActive(token: unknown, attempt: unknown): Promise<boolean>;
  };
}

interface Occurrence {
  readonly id: string;
  readonly acceptedAt: string | Date;
  readonly projectRuns: Record<string, string>;
}

interface LegacyState {
  readonly runs?: AnalysisEntry[];
  readonly last?: AnalysisLast;
  readonly runningSince?: string | null;
  readonly retry?: { attempt: number; nextAt: string; reason?: string } | null;
}

interface AnalysisLast {
  readonly at: string;
  readonly ok: boolean;
  readonly attempts: number;
  readonly errors: string[];
  readonly lastSuccessAt?: string | null;
}

interface ScheduleProjection {
  readonly id: string;
  readonly appName: string;
  readonly key: string;
  readonly enabled: boolean;
  readonly lifecycleState: string;
  readonly cron: string;
  readonly timezone: string;
}

const iso = (value: Date | string): string => new Date(value).toISOString();
export const analysisDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const reference = (id: string) => ({ type: ANALYSIS_TARGET, id });
const entryOf = (input: JsonObject): AnalysisEntry =>
  input.entry as unknown as AnalysisEntry;
const retryDelay = (
  run: AnalysisRun,
  entry: AnalysisEntry,
): number | undefined =>
  !entry.ok && entry.retryable && run.trigger !== 'manual'
    ? RETRY_MINUTES[run.attempt - 1]
    : undefined;
const historyWith = (run: AnalysisRun, entry: AnalysisEntry) => ({
  entry,
  history: [entry, ...(run.result?.history ?? [])].slice(0, 4),
});
const systemOnly = ({ actor }: { actor: { system?: boolean } }) =>
  actor.system === true;
const sameRequest = ({
  record,
  input,
}: {
  record: AnalysisRun;
  input: JsonObject;
}) =>
  (typeof input.token === 'string' && input.token === record.requestToken) || {
    code: 'analysisRequestChanged',
    kind: 'precondition' as const,
    message: 'The analysis request is no longer current.',
  };
const ownsRequest = async (context: TransitionContext<AnalysisTypes>) => {
  if (!systemOnly(context)) return false;
  const same = sameRequest(context);
  if (same !== true) return same;
  return (
    (await context.services.effectActive(
      context.input.token,
      context.input.effectAttempt,
    )) || {
      code: 'analysisEffectExpired',
      kind: 'precondition' as const,
      message: 'The analysis worker no longer owns this attempt.',
    }
  );
};

const execute = defineEffect<AnalysisTypes>({
  name: ANALYSIS_EFFECT,
  // The model gateway has no business idempotency key. Never let a lease reclaim
  // or generic executor retry repeat an attempt whose cost is not known.
  retry: { attempts: 1 },
  timeoutMs: ANALYSIS_TIMEOUT_MS,
  run: (context) => context.services.analysis.execute(context),
});

const notifyFailure = defineEffect<AnalysisTypes>({
  name: 'nocoreach.analysis.notify-failure',
  retry: { attempts: 1 },
  timeoutMs: 30_000,
  run: async ({ record, services }) => {
    if (record.trigger !== 'manual')
      await services.analysis.notifyFailure(record);
  },
});

export const analysisLifecycle = defineLifecycle<AnalysisTypes>({
  name: ANALYSIS_LIFECYCLE,
  collection: ANALYSIS_COLLECTION,
  initial: 'queued',
  states: [
    'queued',
    'running',
    'waiting',
    ...(['succeeded', 'failed', 'unknown', 'skipped'] as const).map((name) => ({
      name,
      final: true,
    })),
  ],
  transitions: {
    launch: {
      from: ['queued', 'waiting'],
      to: 'running',
      manual: false,
      guard: (context) =>
        systemOnly(context) &&
        context.input.attempt === context.record.attempt + 1,
      set: ({ record, now }) => ({
        activeKey: `project:${record.projectId}`,
        attempt: record.attempt + 1,
        startedAt: now.toISOString(),
        retryAt: null,
        requestToken: null,
        requestStartedAt: null,
      }),
      effects: [execute],
    },
    claim: {
      from: 'running',
      to: 'running',
      manual: false,
      guard: async (context) =>
        systemOnly(context) &&
        context.record.requestToken === null &&
        context.input.attempt === context.record.attempt &&
        (await context.services.effectActive(
          context.input.token,
          context.input.effectAttempt,
        )),
      validate: (input) =>
        typeof input.token === 'string' && input.token
          ? []
          : [{ field: 'token', message: 'A request token is required.' }],
      set: ({ input }) => ({ requestToken: input.token }),
    },
    request: {
      from: 'running',
      to: 'running',
      manual: false,
      guard: ownsRequest,
      set: ({ record, now }) => ({
        requestStartedAt: record.requestStartedAt ?? now.toISOString(),
      }),
    },
    checkpoint: {
      from: 'running',
      to: 'running',
      manual: false,
      guard: ownsRequest,
    },
    settle: {
      from: 'running',
      to: ['succeeded', 'waiting', 'failed'],
      manual: false,
      guard: ownsRequest,
      route: ({ record, input }) =>
        entryOf(input).ok
          ? 'succeeded'
          : retryDelay(record, entryOf(input)) !== undefined
            ? 'waiting'
            : 'failed',
      set: ({ record, input, to, now }) => {
        const entry = entryOf(input),
          delay = retryDelay(record, entry);
        return {
          activeKey: `run:${record.id}`,
          result: historyWith(record, entry),
          completedAt: to === 'waiting' ? null : now.toISOString(),
          retryAt:
            delay === undefined
              ? null
              : new Date(Date.parse(entry.at) + delay * 60_000).toISOString(),
        };
      },
    },
    interrupt: {
      from: 'running',
      to: ['unknown', 'waiting', 'failed'],
      manual: false,
      guard: systemOnly,
      route: ({ record, input }) =>
        input.uncertain === true
          ? 'unknown'
          : retryDelay(record, entryOf(input)) !== undefined
            ? 'waiting'
            : 'failed',
      set: ({ record, input, to, now }) => ({
        activeKey: `run:${record.id}`,
        result: historyWith(record, entryOf(input)),
        completedAt: to === 'waiting' ? null : now.toISOString(),
        retryAt:
          to === 'waiting'
            ? new Date(
                now.getTime() + RETRY_MINUTES[record.attempt - 1] * 60_000,
              ).toISOString()
            : null,
      }),
    },
    skip: {
      from: ['queued', 'waiting'],
      to: 'skipped',
      manual: false,
      guard: systemOnly,
      set: ({ record, now }) => ({
        activeKey: `run:${record.id}`,
        completedAt: now.toISOString(),
        retryAt: null,
        result: {
          ...record.result,
          entry: {
            at: now.toISOString(),
            trigger: record.trigger,
            ok: true,
            ms: 0,
            skipped: 'already-succeeded-today',
          },
        },
      }),
    },
    expire: {
      from: ['queued', 'waiting'],
      to: 'failed',
      manual: false,
      guard: systemOnly,
      set: ({ record, now }) => ({
        activeKey: `run:${record.id}`,
        completedAt: now.toISOString(),
        retryAt: null,
        result: {
          ...record.result,
          entry: {
            ...(record.result?.entry ?? {}),
            at: now.toISOString(),
            trigger: record.trigger,
            ok: false,
            retryable: false,
            ms: 0,
            error: 'analysis.retryExpired',
          },
        },
      }),
    },
    importLegacy: {
      from: 'queued',
      to: ['waiting', 'failed', 'unknown', 'skipped'],
      manual: false,
      guard: systemOnly,
      route: ({ input }) =>
        input.status as 'waiting' | 'failed' | 'unknown' | 'skipped',
      set: ({ record, input, to, now }) => ({
        activeKey: `run:${record.id}`,
        attempt: Number(input.attempt) || 0,
        retryAt: input.retryAt ?? null,
        result: {
          entry: input.entry,
          history: to === 'unknown' ? [input.entry] : [],
        },
        completedAt: to === 'waiting' ? null : now.toISOString(),
      }),
    },
  },
  onEnter: { failed: [notifyFailure], unknown: [notifyFailure] },
});

/** Business execution state is read from nrAnalysisRuns, never an in-process promise. */
export class AnalysisRuntime {
  private readonly initializingMockProjects = new Set<string>();
  private readonly clock: () => Date;
  private handle?: ScheduleTargetHandle;

  constructor(private readonly options: AnalysisRuntimeOptions) {
    this.clock = options.clock ?? (() => new Date());
    options.lifecycle.register(analysisLifecycle, {
      services: (handle) => ({
        analysis: this,
        effectActive: async (token, attempt) => {
          if (
            typeof token !== 'string' ||
            !token.startsWith(`${ANALYSIS_LIFECYCLE}:`) ||
            typeof attempt !== 'number'
          )
            return false;
          const repository = (
            (handle as DatabaseConnection | undefined) ?? options.database
          ).repository(NOCOREACH_LIFECYCLE_COLLECTIONS.effectRuns);
          return Boolean(
            await repository.findOne({
              filter: {
                id: token.slice(ANALYSIS_LIFECYCLE.length + 1),
                status: 'running',
                attempts: attempt,
              },
            }),
          );
        },
      }),
    });
    options.lifecycle.on(
      'completed',
      { lifecycle: ANALYSIS_LIFECYCLE },
      async ({ record }) => {
        if (TERMINAL.has(String(record.status))) await this.reportCompletions();
      },
    );
  }

  registerSchedule(): void {
    const scheduler = this.options.scheduler;
    if (!scheduler) return;
    this.handle = scheduler.registerTarget({
      type: ANALYSIS_TARGET,
      title: ANALYSIS_TITLE,
      validate: (config) =>
        config !== null &&
        typeof config === 'object' &&
        !Array.isArray(config) &&
        Object.keys(config).length === 0
          ? { valid: true }
          : { valid: false, reason: 'config-must-be-empty-object' },
      start: async (_config, { occurrenceId }) => {
        await this.acceptOccurrence(occurrenceId);
        return { state: 'accepted', reference: reference(occurrenceId) };
      },
      inspect: (ref) => this.inspect(ref.id),
      describe: async () => ({ targetLabel: ANALYSIS_TITLE, state: 'ready' }),
    });
    scheduler.defineSchedule({
      key: ANALYSIS_SCHEDULE,
      title: ANALYSIS_TITLE,
      description: systemMessageText(
        'dailyAnalysis.runsNocoreachAnalysisOnceDay',
      ),
      schedule: {
        cron: DEFAULT_CRON,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      target: { type: ANALYSIS_TARGET, config: {} },
    });
  }

  private repository(connection?: DatabaseConnection) {
    return (connection ?? this.options.database).repository<AnalysisRun>(
      ANALYSIS_COLLECTION,
    );
  }

  async schedule() {
    if (!this.options.scheduler) return null;
    // Scheduler beta.17 exposes define/register but no internal read API. Retain
    // the existing read-only projection solely for administrator enable/disable;
    // neither scheduler state nor definitions are written through this boundary.
    const row = await this.options.database
      .repository<ScheduleProjection>('scheduleDefinitions')
      .findOne({
        filter: { appName: this.options.appName, key: ANALYSIS_SCHEDULE },
      });
    return row
      ? {
          id: String(row.id),
          enabled: row.enabled !== false && row.lifecycleState === 'active',
          cron: String(row.cron ?? DEFAULT_CRON),
          timezone: String(row.timezone ?? 'UTC'),
        }
      : null;
  }

  private async legacyState(
    projectId: string,
    connection?: DatabaseConnection,
  ): Promise<LegacyState> {
    const row = await (connection ?? this.options.database)
      .repository('nrSnapshots')
      .findOne({ filter: { key: `daily-analysis:${projectId}` } });
    return (row?.payload as LegacyState) ?? {};
  }

  private snapshot(projectId: string) {
    const mock = this.options.host().mock;
    return mock?.enabled && mock.status(projectId).simulated
      ? mock.capture(projectId)
      : null;
  }

  private assertSnapshot(run: AnalysisRun): void {
    const mock = this.options.host().mock;
    if (!run.mockSnapshot && !mock?.enabled) return;
    const current = mock?.status(run.projectId);
    if (
      !run.mockSnapshot ||
      !current?.simulated ||
      current.revision !== run.mockSnapshot.revision
    )
      throw Object.assign(new Error('analysis.configurationChanged'), {
        code: 'ANALYSIS_CONFIGURATION_CHANGED',
      });
  }

  /** Seed only isolated mock data before application readiness, using durable execution. */
  async initializeMockProject(projectId: string): Promise<AnalysisEntry> {
    const snapshot = this.snapshot(projectId);
    if (!snapshot) throw new Error('NR_MOCK_DEMO_REQUIRES_SIMULATED_PROJECT');
    this.initializingMockProjects.add(projectId);
    try {
      const run = await this.options.database.transaction((connection) =>
        this.enqueueIn(connection, {
          projectId,
          trigger: 'manual',
          day: analysisDay(this.clock()),
          runKey: `mock-demo:${projectId}`,
          snapshot,
        }),
      );
      const effects = await this.options.lifecycle.listEffectRuns({
        lifecycle: ANALYSIS_LIFECYCLE,
        recordId: String(run.id),
        status: 'queued',
      });
      for (const effect of effects)
        await this.options.lifecycle.runEffect(effect.id);
      const settled = await this.repository().findOne({
        filter: { id: run.id },
      });
      if (settled?.status !== 'succeeded' || !settled.result?.entry)
        throw new Error('NR_MOCK_DEMO_ANALYSIS_NOT_SUCCEEDED');
      return settled.result.entry;
    } finally {
      this.initializingMockProjects.delete(projectId);
    }
  }

  async enqueue(
    projectId: string,
    trigger: AnalysisTrigger,
    requestedBy?: string,
  ): Promise<AnalysisRun> {
    await this.options.ready;
    const day = analysisDay(this.clock()),
      snapshot = this.snapshot(projectId);
    const runKey =
      trigger === 'manual'
        ? `manual:${projectId}:${randomUUID()}`
        : `daily:${projectId}:${day}`;
    try {
      return await this.options.database.transaction((connection) =>
        this.enqueueIn(connection, {
          projectId,
          trigger,
          requestedBy,
          day,
          runKey,
          snapshot,
        }),
      );
    } catch (error) {
      // The unique day and active project keys arbitrate independent processes.
      // An error without a winning record is a real persistence failure.
      const existing =
        (await this.repository().findOne({ filter: { runKey } })) ??
        (await this.repository().findOne({
          filter: { activeKey: `project:${projectId}` },
        }));
      if (existing) return existing;
      throw error;
    }
  }

  private async enqueueIn(
    connection: DatabaseConnection,
    input: {
      projectId: string;
      trigger: AnalysisTrigger;
      requestedBy?: string;
      day: string;
      runKey: string;
      snapshot: Readonly<MockRunContext> | null;
    },
  ): Promise<AnalysisRun> {
    const repo = this.repository(connection);
    const existing =
      (await repo.findOne({ filter: { runKey: input.runKey } })) ??
      (await repo.findOne({
        filter: { activeKey: `project:${input.projectId}` },
      }));
    if (existing) return existing;
    const legacy =
      input.trigger === 'manual'
        ? {}
        : await this.legacyState(input.projectId, connection);
    const succeeded =
      input.trigger !== 'manual' &&
      ((await repo.findOne({
        filter: {
          projectId: input.projectId,
          day: input.day,
          status: 'succeeded',
        },
      })) ||
        legacy.runs?.some(
          (entry) => entry.ok && analysisDay(new Date(entry.at)) === input.day,
        ));
    const { record } = await this.options.lifecycle.create(
      ANALYSIS_LIFECYCLE,
      {
        projectId: input.projectId,
        trigger: input.trigger,
        day: input.day,
        runKey: input.runKey,
        activeKey: `project:${input.projectId}`,
        requestedBy: input.requestedBy ?? null,
        requestedAt: this.clock().toISOString(),
        attempt: 0,
        mockSnapshot: input.snapshot,
        startedAt: null,
        completedAt: null,
        retryAt: null,
        requestStartedAt: null,
        requestToken: null,
        result: null,
      },
      {
        actor: input.requestedBy ? { id: input.requestedBy } : SYSTEM_ACTOR,
        transaction: connection,
      },
    );
    const options = { actor: SYSTEM_ACTOR, transaction: connection };
    if (succeeded)
      return (
        await this.options.lifecycle.fire(
          ANALYSIS_LIFECYCLE,
          record.id,
          'skip',
          options,
        )
      ).record as AnalysisRun;
    const automatic = legacy.runs?.find(
      (entry) =>
        entry.trigger !== 'manual' &&
        analysisDay(new Date(entry.at)) === input.day,
    );
    const interrupted =
      legacy.runningSince &&
      analysisDay(new Date(legacy.runningSince)) === input.day;
    if (automatic || interrupted) {
      const entry: AnalysisEntry = interrupted
        ? {
            at: String(legacy.runningSince),
            trigger: 'schedule',
            ok: false,
            ms: 0,
            retryable: false,
            error: 'analysis.interruptedUnknown',
          }
        : automatic!;
      return (
        await this.options.lifecycle.fire(
          ANALYSIS_LIFECYCLE,
          record.id,
          'importLegacy',
          {
            ...options,
            input: {
              status: interrupted
                ? 'unknown'
                : legacy.retry
                  ? 'waiting'
                  : 'failed',
              attempt: interrupted ? 1 : (legacy.retry?.attempt ?? 1),
              retryAt: interrupted ? null : (legacy.retry?.nextAt ?? null),
              entry,
            },
          },
        )
      ).record as AnalysisRun;
    }
    return (
      await this.options.lifecycle.fire(
        ANALYSIS_LIFECYCLE,
        record.id,
        'launch',
        { ...options, input: { attempt: 1 } },
      )
    ).record as AnalysisRun;
  }

  async acceptOccurrence(occurrenceId: string): Promise<void> {
    await this.options.ready;
    const occurrenceRepo =
      this.options.database.repository<Occurrence>(ANALYSIS_OCCURRENCES);
    if (await occurrenceRepo.findOne({ filter: { id: occurrenceId } })) return;
    // An old accepted occurrence must stay attached to its original execution.
    if (await this.legacyOccurrence(occurrenceId)) return;
    const projects = (await this.options.host().projectIds()).map(String);
    const now = this.clock(),
      day = analysisDay(now);
    const snapshots = new Map(projects.map((id) => [id, this.snapshot(id)]));
    // Retrying this short transaction only resolves concurrent admission races;
    // no model/network work takes place until its effect rows commit.
    for (let attempt = 0; ; attempt++) {
      try {
        await this.options.database.transaction(async (connection) => {
          const occurrences =
            connection.repository<Occurrence>(ANALYSIS_OCCURRENCES);
          if (await occurrences.findOne({ filter: { id: occurrenceId } }))
            return;
          const projectRuns: Record<string, string> = {};
          for (const projectId of projects) {
            const run = await this.enqueueIn(connection, {
              projectId,
              trigger: 'schedule',
              day,
              runKey: `daily:${projectId}:${day}`,
              snapshot: snapshots.get(projectId)!,
            });
            projectRuns[projectId] = String(run.id);
          }
          await occurrences.createOne({
            values: {
              id: occurrenceId,
              acceptedAt: now.toISOString(),
              projectRuns,
            },
          });
        });
        return;
      } catch (error) {
        if (await occurrenceRepo.findOne({ filter: { id: occurrenceId } }))
          return;
        if (attempt >= 2) throw error;
      }
    }
  }

  async execute(context: EffectContext<AnalysisTypes>): Promise<void> {
    const { record, idempotencyKey: token, signal } = context;
    if (!this.initializingMockProjects.has(record.projectId))
      await this.options.ready;
    if (
      record.status !== 'running' ||
      record.requestToken !== null ||
      record.attempt !== context.input.attempt
    )
      return;
    signal.throwIfAborted();
    const claimed = await this.options.lifecycle.fire(
      ANALYSIS_LIFECYCLE,
      record.id,
      'claim',
      {
        actor: SYSTEM_ACTOR,
        input: {
          token,
          attempt: record.attempt,
          effectAttempt: context.attempt,
        },
        expect: { version: record.lifecycleVersion },
      },
    );
    const run = claimed.record as AnalysisRun;
    const guard = () => {
      signal.throwIfAborted();
      this.assertSnapshot(run);
    };
    const beforeModel = async () => {
      guard();
      await this.options.lifecycle.fire(ANALYSIS_LIFECYCLE, run.id, 'request', {
        actor: SYSTEM_ACTOR,
        input: { token, effectAttempt: context.attempt },
      });
      guard();
    };
    const commit = <T>(write: () => Promise<T>) =>
      this.options.database.transaction(async (connection) => {
        guard();
        await this.options.lifecycle.fire(
          ANALYSIS_LIFECYCLE,
          run.id,
          'checkpoint',
          {
            actor: SYSTEM_ACTOR,
            input: { token, effectAttempt: context.attempt },
            transaction: connection,
          },
        );
        const result = await this.options
          .host()
          .db.withConnection(connection, write);
        // Setting changes or cancellation that raced a write roll back its entire
        // transaction, including the lifecycle checkpoint and strategy snapshot.
        guard();
        return result;
      });
    const runAlgorithm = () =>
      this.options
        .host()
        .analysis.run(run.projectId, run.attempt > 1 ? 'retry' : run.trigger, {
          at: iso(run.startedAt!),
          signal,
          beforeModel,
          commit,
        });
    let entry: AnalysisEntry;
    try {
      guard();
      entry = run.mockSnapshot
        ? await this.options
            .host()
            .mock!.runSnapshot(run.mockSnapshot, runAlgorithm)
        : await runAlgorithm();
    } catch (error) {
      if (signal.aborted) throw error;
      entry = {
        at: iso(run.startedAt!),
        trigger: run.trigger,
        ok: false,
        ms: 0,
        retryable: false,
        error: String((error as Error).message).slice(0, 300),
      };
    }
    signal.throwIfAborted();
    // The outcome and retry deadline are durable before acknowledging the job.
    // A crash before this commit is uncertain after requestStartedAt was set.
    await this.options.lifecycle.fire(ANALYSIS_LIFECYCLE, run.id, 'settle', {
      actor: SYSTEM_ACTOR,
      input: { token, effectAttempt: context.attempt, entry },
    });
  }

  async notifyFailure(run: AnalysisRun): Promise<void> {
    const error = run.result?.entry?.error;
    await this.options
      .host()
      .notifications?.analysisFailed(
        run.projectId,
        error ? systemMessageText(error) : error,
      );
  }

  async state(projectId: string) {
    const legacy = await this.legacyState(projectId);
    const repo = this.repository();
    const rows = await repo.findMany({
      filter: { projectId },
      sort: (sort) => [
        sort.field('requestedAt').desc(),
        sort.field('id').desc(),
      ],
      limit: 30,
    });
    const entries = rows
      .flatMap((run) => run.result?.history ?? [])
      .sort((a, b) => b.at.localeCompare(a.at));
    const runs = [...entries, ...(legacy.runs ?? [])]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 30);
    let last = legacy.last ?? null;
    for (const entry of [...entries].reverse())
      last = recordAttempt(last, {
        at: entry.at,
        ok: entry.ok,
        errors: entry.ok ? [] : [entry.error],
      }) as AnalysisLast;
    const waiting = await repo.findOne({
      filter: { projectId, status: 'waiting' },
      sort: (sort) => sort.field('id').desc(),
    });
    const success = await repo.findOne({
      filter: { projectId, status: 'succeeded' },
      sort: (sort) => sort.field('id').desc(),
    });
    return {
      runs,
      last: last
        ? {
            ...last,
            lastSuccessAt:
              success?.result?.entry?.at ??
              (lastSuccess(last) as string | null),
          }
        : null,
      running: await repo.exists({
        filter: { activeKey: `project:${projectId}` },
      }),
      retry: waiting?.retryAt
        ? {
            attempt: waiting.attempt,
            nextAt: iso(waiting.retryAt),
            reason: waiting.result?.entry?.error,
          }
        : null,
    };
  }

  async status(projectId: string) {
    const state = await this.state(projectId),
      schedule = await this.schedule();
    return {
      ...state,
      runs: state.runs.slice(0, 10),
      schedule: schedule
        ? {
            // Keep the existing response property while the UI moves to Scheduler IDs.
            workflowId: schedule.id,
            scheduleId: schedule.id,
            enabled: schedule.enabled,
            cron: schedule.cron,
          }
        : null,
    };
  }

  private async succeededToday(
    projectId: string,
    day: string,
  ): Promise<boolean> {
    return (
      Boolean(
        await this.repository().findOne({
          filter: { projectId, day, status: 'succeeded' },
        }),
      ) ||
      Boolean(
        (await this.legacyState(projectId)).runs?.some(
          (entry) => entry.ok && analysisDay(new Date(entry.at)) === day,
        ),
      )
    );
  }

  /** Called by the shared Lifecycle Jobs sweep; no private minute timer remains. */
  async sweep(): Promise<void> {
    await this.options.ready;
    const now = this.clock(),
      today = analysisDay(now);
    // Long-running calls and future retry deadlines must not consume the entire
    // retry batch. Due retries sort before future ones, across project history.
    const [running, pending] = await Promise.all([
      this.repository().findMany({
        filter: { status: 'running' },
        sort: (sort) => sort.field('statusChangedAt').asc(),
        limit: 200,
      }),
      this.repository().findMany({
        filter: (filter) =>
          filter.or(
            ['queued', 'waiting'].map((status) =>
              filter.string('status').eq(status),
            ),
          ),
        sort: (sort) => [
          sort.field('retryAt').asc(),
          sort.field('requestedAt').asc(),
        ],
        limit: 200,
      }),
    ]);
    const active = [...running, ...pending];
    const schedule = await this.schedule();
    for (const run of active) {
      try {
        if (run.status === 'running') {
          const effects = await this.options.lifecycle.listEffectRuns({
            lifecycle: ANALYSIS_LIFECYCLE,
            recordId: String(run.id),
            effect: ANALYSIS_EFFECT,
          });
          const latest = run.requestToken
            ? effects.find(
                (effect) =>
                  `${ANALYSIS_LIFECYCLE}:${effect.id}` === run.requestToken,
              )
            : effects.at(-1);
          if (
            !latest ||
            ['succeeded', 'failed', 'dead', 'cancelled'].includes(latest.status)
          ) {
            // A forced retry of an expired effect can acknowledge a fenced no-op.
            // Its success is not a business result: settle always commits first.
            const uncertain = Boolean(run.requestStartedAt);
            const entry: AnalysisEntry = {
              at: iso(run.startedAt ?? run.requestedAt),
              trigger: run.attempt > 1 ? 'retry' : run.trigger,
              ms: Math.max(
                0,
                now.getTime() -
                  new Date(run.startedAt ?? run.requestedAt).getTime(),
              ),
              ok: false,
              retryable: !uncertain,
              error: uncertain
                ? 'analysis.interruptedUnknown'
                : 'analysis.interruptedBeforeRequest',
            };
            await this.options.lifecycle.fire(
              ANALYSIS_LIFECYCLE,
              run.id,
              'interrupt',
              {
                actor: SYSTEM_ACTOR,
                input: { uncertain, entry },
                expect: { version: run.lifecycleVersion },
              },
            );
          }
          continue;
        }
        if (run.trigger !== 'manual' && run.day !== today) {
          await this.options.lifecycle.fire(
            ANALYSIS_LIFECYCLE,
            run.id,
            'expire',
            { actor: SYSTEM_ACTOR, expect: { version: run.lifecycleVersion } },
          );
          continue;
        }
        if (
          run.trigger !== 'manual' &&
          (await this.succeededToday(run.projectId, today))
        ) {
          await this.options.lifecycle.fire(
            ANALYSIS_LIFECYCLE,
            run.id,
            'skip',
            { actor: SYSTEM_ACTOR, expect: { version: run.lifecycleVersion } },
          );
          continue;
        }
        if (run.trigger !== 'manual' && !schedule?.enabled) continue;
        if (
          run.status === 'waiting' &&
          (!run.retryAt || new Date(run.retryAt).getTime() > now.getTime())
        )
          continue;
        if (
          (await this.repository().findOne({
            filter: { activeKey: `project:${run.projectId}` },
          })) &&
          run.status === 'waiting'
        )
          continue;
        await this.options.lifecycle.fire(
          ANALYSIS_LIFECYCLE,
          run.id,
          'launch',
          {
            actor: SYSTEM_ACTOR,
            input: { attempt: run.attempt + 1 },
            expect: { version: run.lifecycleVersion },
          },
        );
      } catch (error) {
        if (!(
          error instanceof LifecycleError &&
          ['CONFLICT', 'INVALID_STATE', 'GUARD_REJECTED'].includes(error.code)
        ))
          this.options.logger.warn('Analysis recovery deferred', {
            id: String(run.id),
            error: String(error),
          });
      }
    }
    if (schedule?.enabled) {
      // Legacy catchup and business-day deduplication use the server's local
      // calendar. A schedule moved to another zone is delivered by Scheduler;
      // do not guess its wall clock and make a paid call before it is due.
      const due = localScheduleZone(schedule.timezone)
        ? scheduledToday(schedule.cron, now)
        : null;
      if (due && now.getTime() - due.getTime() >= CATCHUP_GRACE_MS) {
        for (const id of (await this.options.host().projectIds()).map(String)) {
          try {
            await this.enqueue(id, 'catchup');
          } catch (error) {
            this.options.logger.warn('Analysis catchup deferred', {
              projectId: id,
              error: String(error),
            });
          }
        }
      }
    }
    await this.reportCompletions();
  }

  private async legacyOccurrence(
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.options.database
      .repository('nrSnapshots')
      .findOne({ filter: { key: `daily-analysis:occurrence:${id}` } });
    return (row?.payload as Record<string, unknown>) ?? null;
  }

  async inspect(occurrenceId: string): Promise<ScheduleTargetObservation> {
    const occurrence = await this.options.database
      .repository<Occurrence>(ANALYSIS_OCCURRENCES)
      .findOne({ filter: { id: occurrenceId } });
    if (!occurrence) {
      const old = await this.legacyOccurrence(occurrenceId);
      if (!old) return { state: 'unknown', reason: 'no-run-record' };
      if (old.status === 'succeeded' || old.status === 'failed')
        return {
          state: 'completed',
          completion: {
            status: old.status,
            ...(typeof old.reason === 'string' ? { reason: old.reason } : {}),
            ...(old.result ? { result: old.result as JsonObject } : {}),
          },
        };
      // Retired execution has no durable request marker. Do not rerun a possible
      // paid call; preserve the occurrence and report the uncertainty honestly.
      return {
        state: 'completed',
        completion: {
          status: 'failed',
          reason: systemMessageText('analysis.interruptedUnknown'),
        },
      };
    }
    const projects: Record<string, JsonObject> = {};
    let running = false,
      pending = false,
      missing = false;
    for (const [projectId, id] of Object.entries(occurrence.projectRuns)) {
      const run = await this.repository().findOne({ filter: { id } });
      if (!run) {
        missing = true;
        continue;
      }
      running ||= run.status === 'running';
      pending ||= run.status === 'queued' || run.status === 'waiting';
      const entry = run.result?.entry;
      projects[projectId] = {
        ok: run.status === 'succeeded' || run.status === 'skipped',
        ...(typeof entry?.items === 'number' ? { items: entry.items } : {}),
        ...(run.status === 'skipped'
          ? { skipped: systemMessageText('analysis.alreadySucceededToday') }
          : {}),
        ...(entry?.error
          ? { error: systemMessageText(entry.error).slice(0, 300) }
          : {}),
      };
    }
    // An accepted delivery whose data was explicitly replaced cannot safely be
    // replayed. Keep the receipt terminal so Scheduler redelivery cannot requeue it.
    if (missing)
      return {
        state: 'completed',
        completion: { status: 'failed', reason: 'analysis-run-missing' },
      };
    if (running) return { state: 'running' };
    if (pending) return { state: 'pending' };
    const failed = Object.entries(projects).filter(([, result]) => !result.ok);
    const completion: ScheduleExecutionCompletion = {
      status:
        failed.length || !Object.keys(projects).length ? 'failed' : 'succeeded',
      ...(failed.length
        ? {
            reason: failed
              .map(
                ([id, result]) =>
                  `${id}: ${typeof result.error === 'string' ? result.error : 'analysis-failed'}`,
              )
              .join('; ')
              .slice(0, 500),
          }
        : {}),
      ...(!Object.keys(projects).length ? { reason: 'no-projects' } : {}),
      result: { projects },
    };
    return { state: 'completed', completion };
  }

  private async reportCompletions(): Promise<void> {
    if (!this.handle) return;
    // Inspection is the durable recovery path; this callback reduces UI latency.
    const recent = await this.options.database
      .repository<Occurrence>(ANALYSIS_OCCURRENCES)
      .findMany({
        sort: (sort) => sort.field('acceptedAt').desc(),
        limit: 30,
      });
    for (const occurrence of recent) {
      try {
        const observation = await this.inspect(occurrence.id);
        if (observation.state === 'completed')
          await this.handle.reportCompletion(
            occurrence.id,
            reference(occurrence.id),
            observation.completion,
          );
      } catch (error) {
        this.options.logger.warn('Analysis completion will be reconciled', {
          occurrenceId: occurrence.id,
          error: String(error),
        });
      }
    }
  }
}
