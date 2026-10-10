// NocoReach's services, as ported from the classic plugin (server/nocoreach, docs/PORT-PLAN.md): this provider builds
// the legacy layer they run on, lets them register their actions and timers the classic way, and starts those timers on
// the application's jobs service. The NocoReach route (server/routes/nocoreach.ts) serves the registered actions.
//
// Agents owns model calls and task execution. The remaining adapters provide notifications and the workflow that
// ran the daily analysis from the Scheduler plugin — a schedule defined in code whose firings run the service's own
// instruction on a job executor, so administrators see each run at /settings/schedules.
import { agentsToken, agentsAccessToken } from '@nocobase/app-plugin-agents/server/tokens';
import { notificationServiceToken, type NotificationConfig } from '@nocobase/app-plugin-notification/server';
import type {
  JsonObject,
  ScheduleExecutionCompletion,
  ScheduleTargetHandle,
  ScheduleTargetObservation,
} from '@nocobase/app-plugin-scheduler/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import type { AppIdentityConfig } from '@nocobase/app-server/config';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import { databaseManagerToken } from '@nocobase/db';
import {
  Job,
  JobInterruptedError,
  type JobClass,
  type JobExecutionContext,
  type JobExecutor,
  type ScheduleExecutor,
} from '@nocobase/jobs';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { DEFAULT_CRON, NODE_TYPE, WORKFLOW_TITLE } from '../nocoreach/daily-analysis.js';
import { registerClassicImport } from '../nocoreach/classic-import.js';
import { LegacyApp, legacyLogger, type LegacyLogger } from '../nocoreach/legacy/app.js';
import { LegacyCache } from '../nocoreach/legacy/context.js';
import { LegacyDatabase } from '../nocoreach/legacy/database.js';
import { LegacyNotifications } from '../nocoreach/legacy/notifications.js';
import {
  JOB_STATUS,
  LegacyWorkflows,
  ScheduledRuns,
  STALE_RUN_MS,
  type ScheduledRun,
} from '../nocoreach/legacy/schedule.js';
import { LegacyUsers } from '../nocoreach/legacy/users.js';
import { LegacyVariables } from '../nocoreach/legacy/variables.js';
import { Connections } from '../nocoreach/plugin.js';
import { roleOf, setCallbackPath } from '../nocoreach/policy.js';
import { setPublicDns } from '../nocoreach/public-sources.js';
import type { NocoReachConfig } from '../config/nocoreach.js';

export interface NocoReachRuntime {
  readonly legacy: LegacyApp;
  readonly plugin: Connections;
  readonly users: LegacyUsers;
  readonly variables: LegacyVariables;
  readonly cache: LegacyCache;
  readonly logger: LegacyLogger;
  /** The classic workflow plugin: the daily analysis registers its instruction here and its schedule is read here. */
  readonly workflows: LegacyWorkflows;
  /** Each firing of the daily analysis schedule, as it ran. */
  readonly analysisRuns: ScheduledRuns;
  /** Resolves once the services have registered their actions; requests wait for it. */
  readonly ready: Promise<void>;
}

export const nocoReachToken: ServiceToken<NocoReachRuntime> =
  createServiceToken<NocoReachRuntime>('nocoreach/runtime');

/** The daily analysis on the Scheduler: the schedule's stable key, its target type and the job that does the work. */
const ANALYSIS_SCHEDULE = 'nocoreach.daily-analysis';
const ANALYSIS_TARGET = 'app.nocoreach.daily-analysis';
const ANALYSIS_JOB = 'nocoreach.daily-analysis';

interface AnalysisPayload {
  readonly occurrenceId: string;
}

const analysisReference = (occurrenceId: string) => ({ type: ANALYSIS_TARGET, id: occurrenceId });

/** What the instruction returned — `{ <projectId>: run entry }` — as the occurrence's outcome: short, no model output. */
export function analysisCompletion(status: number, result: unknown): ScheduleExecutionCompletion {
  const entries = Object.entries((result ?? {}) as Record<string, Record<string, unknown>>);
  if (typeof (result as { error?: unknown })?.error === 'string')
    return { status: 'failed', reason: String((result as { error: string }).error) };
  const projects: Record<string, JsonObject> = {};
  for (const [id, r] of entries)
    projects[id] = {
      ok: Boolean(r?.ok),
      ...(typeof r?.items === 'number' ? { items: r.items } : {}),
      ...(typeof r?.skipped === 'string' ? { skipped: r.skipped } : {}),
      ...(typeof r?.error === 'string' ? { error: r.error.slice(0, 300) } : {}),
    };
  const failed = entries.filter(([, r]) => !r?.ok);
  return status === JOB_STATUS.RESOLVED && !failed.length
    ? { status: 'succeeded', result: { projects } }
    : {
        status: 'failed',
        reason: failed.map(([id, r]) => `项目 ${id}：${String(r?.error ?? '分析失败')}`).join('；').slice(0, 500),
        result: { projects },
      };
}

export function analysisObservation(run: ScheduledRun | null): ScheduleTargetObservation {
  if (!run) return { state: 'unknown', reason: 'no-run-record' };
  if (run.status === 'succeeded' || run.status === 'failed')
    return {
      state: 'completed',
      completion: { status: run.status, ...(run.reason ? { reason: run.reason } : {}), ...(run.result ? { result: run.result as JsonObject } : {}) },
    };
  // Accepted or running, and silent since: the process that ran it was stopped, and it will not report.
  if (Date.now() - Date.parse(run.updatedAt) > STALE_RUN_MS)
    return { state: 'completed', completion: { status: 'failed', reason: '运行被中断（服务重启）' } };
  return { state: run.status };
}

export default class NocoReachProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nocoreach/provider';
  private executor: ScheduleExecutor | undefined;
  private analysisJob: JobClass<AnalysisPayload> | undefined;
  private analysisExecutor: Promise<JobExecutor> | undefined;
  private markReady: () => void = () => {};

  public override register(): void {
    this.app.container.singleton(agentsAccessToken, () => ({
      scopeOf: async (identity) => {
        const runtime = this.app.container.resolve(nocoReachToken);
        if (identity.principal.type !== 'user') return 'none';
        const role = await roleOf(runtime.legacy.db, identity.principal.id);
        // Membership grants only edits to one's own records. Global management remains an explicit settings grant.
        return role ? { users: [identity.principal.id] } : 'none';
      },
    }));
    this.app.container.singleton(nocoReachToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const logger = legacyLogger(this.app.container.resolve(loggingToken).getLogger('nocoreach'));
      const db = new LegacyDatabase(database, this.app.container.resolve(idGeneratorToken));
      const users = new LegacyUsers(db);
      db.define('users', users);
      const variables = new LegacyVariables(db, this.app.container.resolve(secretsServiceToken));
      const legacy = new LegacyApp(db, logger, variables);
      // The daily analysis workflow: its instruction is captured here and run when the Scheduler fires (boot()).
      const workflows = new LegacyWorkflows(database, { [WORKFLOW_TITLE]: ANALYSIS_SCHEDULE });
      if (this.app.container.has(schedulerServiceToken)) {
        legacy.provide('workflow', workflows.plugin);
        db.define('workflows', workflows.repository());
      }
      const identity = this.app.config.get<AppIdentityConfig>('app');
      const basePath = identity?.publicBasePath ?? '/main';
      // Task and analysis notifications: `pm.get('notification-manager')` and its channels, answered by the
      // Notification plugin; in-app messages go to the configured in-app channel, the header's inbox.
      if (this.app.container.has(notificationServiceToken)) {
        const notifications = new LegacyNotifications(
          () => this.app.container.resolve(notificationServiceToken),
          () => this.app.config.get<NotificationConfig>('notification')?.channels ?? {},
          users,
          { basePath, origin: identity?.publicOrigin },
        );
        legacy.provide('notification-manager', notifications.plugin);
        db.define('notificationChannels', notifications.repository());
      }
      setCallbackPath(`${basePath}/api/nocoreach/nrGoogle/callback`);
      setPublicDns(this.app.config.get<NocoReachConfig>('nocoreach')?.publicDns ?? '');
      const plugin = new Connections(legacy, variables, { basePath });
      plugin.agents = this.app.container.resolve(agentsToken);
      const ready = new Promise<void>((resolve) => (this.markReady = resolve));
      const analysisRuns = new ScheduledRuns(db, 'daily-analysis:occurrence');
      return { legacy, plugin, users, variables, cache: new LegacyCache(), logger, workflows, analysisRuns, ready };
    });
  }

  // The daily analysis schedule (classic: the "NocoReach 每日分析" workflow at 9:00 server time). A firing is accepted at
  // once and run on a job executor; the run's record answers the Scheduler's questions after a restart. The service's
  // own minute timer still retries a failed day and catches up a missed one (DailyAnalysis.tick), as before.
  public override async boot(): Promise<void> {
    if (!this.app.container.has(schedulerServiceToken)) return;
    const scheduler = this.app.container.resolve(schedulerServiceToken);
    const runtime = () => this.app.container.resolve(nocoReachToken);
    const handle: ScheduleTargetHandle = scheduler.registerTarget({
      type: ANALYSIS_TARGET,
      title: WORKFLOW_TITLE,
      validate: (config) =>
        config !== null && typeof config === 'object' && !Array.isArray(config)
          ? { valid: true }
          : { valid: false, reason: 'config-must-be-an-object' },
      start: async (_config, { occurrenceId }) => {
        // A recovered start of the same firing returns the same reference and submits nothing new.
        if (!(await runtime().analysisRuns.get(occurrenceId))) {
          await runtime().analysisRuns.put(occurrenceId, { status: 'pending' });
          await (await this.analysisJobs()).addJob(new this.analysisJob!({ occurrenceId }));
        }
        return { state: 'accepted', reference: analysisReference(occurrenceId) };
      },
      inspect: async (reference) => analysisObservation(await runtime().analysisRuns.get(reference.id)),
      describe: async () => ({
        targetLabel: WORKFLOW_TITLE,
        description: '逐个项目计算信号，由在线 AI 写本期观察和建议',
        state: 'ready',
      }),
    });

    // The job reaches the services and the handle by closure: a job receives only its payload.
    this.analysisJob = class DailyAnalysisJob extends Job<AnalysisPayload> {
      public static readonly jobName = ANALYSIS_JOB;

      public async execute({ signal }: JobExecutionContext): Promise<void> {
        const { occurrenceId } = this.payload;
        const nr = runtime();
        await nr.ready;
        const reference = analysisReference(occurrenceId);
        const done = await nr.analysisRuns.get(occurrenceId);
        if (done && (done.status === 'succeeded' || done.status === 'failed')) {
          const observed = analysisObservation(done);
          if (observed.state === 'completed') await handle.reportCompletion(occurrenceId, reference, observed.completion);
          return;
        }
        await nr.analysisRuns.put(occurrenceId, { status: 'running' });
        let completion: ScheduleExecutionCompletion;
        try {
          // The classic instruction: every project in turn, skipping one that already succeeded today.
          const Instruction = nr.workflows.instruction(NODE_TYPE);
          if (!Instruction) throw new Error('每日分析没有注册');
          const { status, result } = await new Instruction({}).run();
          completion = analysisCompletion(status, result);
        } catch (error) {
          // Shutdown: the task returns to waiting and runs again after the restart.
          if (signal.aborted) throw new JobInterruptedError();
          completion = { status: 'failed', reason: String((error as Error)?.message || '分析失败').slice(0, 300) };
        }
        await nr.analysisRuns.put(occurrenceId, {
          status: completion.status === 'succeeded' ? 'succeeded' : 'failed',
          ...(completion.reason ? { reason: completion.reason } : {}),
          ...(completion.result ? { result: completion.result } : {}),
        });
        await handle.reportCompletion(occurrenceId, reference, completion);
      }
    };

    // Classic timers ran in the server's local time; so does this schedule (DailyAnalysis.tick reads it the same way).
    scheduler.defineSchedule({
      key: ANALYSIS_SCHEDULE,
      title: WORKFLOW_TITLE,
      description: '每天运行一次 NocoReach 分析：计算信号并由在线 AI 写本期观察和建议。没跑成的当天会补跑或重试。',
      schedule: { cron: DEFAULT_CRON, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      target: { type: ANALYSIS_TARGET, config: {} },
    });
  }

  public override async start(): Promise<void> {
    const runtime = this.app.container.resolve(nocoReachToken);
    await runtime.variables.load();
    await runtime.plugin.load();
    const agents = this.app.container.resolve(agentsToken);
    const inConnection = (conn: Parameters<LegacyDatabase['withConnection']>[0], fn: () => Promise<any>) => runtime.legacy.db.withConnection(conn, fn);
    agents.people.provide({
      list: conn => inConnection(conn, async () => runtime.plugin.members.joined()),
      names: (conn, ids) => inConnection(conn, async () => {
        const rows = await Promise.all(ids.map(id => runtime.users.findOne({ filterByTk: id })));
        return new Map(rows.filter(Boolean).map(row => [String(row!.id), String(row!.nickname || row!.username || row!.id)]));
      }),
      inactive: (conn, ids) => inConnection(conn, async () => {
        const roles = await Promise.all(ids.map(id => roleOf(runtime.legacy.db, id)));
        return new Set(ids.filter((_, index) => !roles[index]));
      }),
    });
    agents.conversations.contextKinds.register('nocoreachProject', (conn, userId, ids) => inConnection(conn, async () => {
      const found = new Map();
      if (!await roleOf(runtime.legacy.db, userId)) return found;
      for (const id of ids) {
        const row = await runtime.plugin.projects.row(id, undefined);
        if (row) found.set(id, { title: row.get('payload').name, key: null, url: null });
      }
      return found;
    }));
    // The one-time import of the classic installation's data (`pnpm nocobase app import-classic`).
    registerClassicImport(runtime);
    this.markReady();
    await runtime.legacy.emit('afterStart');
    if (this.analysisJob) await this.analysisJobs();
    // Classic timers ran in the server's local time; so do these.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.executor = this.app.container.resolve(jobExecutorServiceToken).getScheduleExecutor('nocoreach');
    for (const job of runtime.legacy.jobs)
      await this.executor.addJob({
        name: job.name,
        options: { cron: job.cronTime, tz },
        payload: {},
        execute: async () => {
          await job.onTick();
        },
      });
    await this.executor.setup();
  }

  public override async shutdown(): Promise<void> {
    await this.executor?.shutdown();
    const analysis = await this.analysisExecutor?.catch(() => undefined);
    this.analysisExecutor = undefined;
    await analysis?.shutdown();
    await this.app.container.resolveIfCreated?.(nocoReachToken)?.plugin.afterDisable?.();
  }

  // The Scheduler may fire before this provider's start(): both share one setup.
  private analysisJobs(): Promise<JobExecutor> {
    this.analysisExecutor ??= (async () => {
      const executor = this.app.container.resolve(jobExecutorServiceToken).getJobExecutor('nocoreach');
      executor.registerJob(this.analysisJob!);
      await executor.setup();
      return executor;
    })();
    return this.analysisExecutor;
  }
}
