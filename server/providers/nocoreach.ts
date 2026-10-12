// NocoReach's services, as ported from the classic plugin (server/nocoreach, docs/PORT-PLAN.md): this provider builds
// the legacy layer they run on, lets them register their actions and timers the classic way, and starts those timers on
// the application's jobs service. The NocoReach route (server/routes/nocoreach.ts) serves the registered actions.
//
// Agents owns model calls and execution. Application-owned record lifecycles share
// one persistent runtime; Scheduler owns the daily trigger and Jobs dispatches effects.
import {
  agentsToken,
  agentsAccessToken,
} from '@nocobase/app-plugin-agents/server/tokens';
import {
  notificationServiceToken,
  type NotificationConfig,
} from '@nocobase/app-plugin-notification/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import type { AppIdentityConfig } from '@nocobase/app-server/config';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import { databaseManagerToken } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { AnalysisRuntime } from '../nocoreach/analysis-runtime.js';
import {
  createNocoReachLifecycles,
  NOCOREACH_LIFECYCLE_SCOPE,
  type NocoReachLifecycles,
} from '../nocoreach/lifecycle/runtime.js';
import {
  createTaskRuntime,
  type TaskRuntime,
} from '../nocoreach/execution/runtime.js';
import { registerClassicImport } from '../nocoreach/classic-import.js';
import {
  LegacyApp,
  legacyLogger,
  type LegacyLogger,
} from '../nocoreach/legacy/app.js';
import { LegacyCache } from '../nocoreach/legacy/context.js';
import { LegacyDatabase } from '../nocoreach/legacy/database.js';
import { LegacyNotifications } from '../nocoreach/legacy/notifications.js';
import { LegacyUsers } from '../nocoreach/legacy/users.js';
import { LegacyVariables } from '../nocoreach/legacy/variables.js';
import { Connections } from '../nocoreach/plugin.js';
import { mockEngineToken } from '../../app-plugins/nocoreach-mock/server/index.js';
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
  readonly lifecycles: NocoReachLifecycles;
  readonly analysis: AnalysisRuntime;
  readonly tasks: TaskRuntime;
  /** Resolves once the services have registered their actions; requests wait for it. */
  readonly ready: Promise<void>;
}

export const nocoReachToken: ServiceToken<NocoReachRuntime> =
  createServiceToken<NocoReachRuntime>('nocoreach/runtime');

export default class NocoReachProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nocoreach/provider';
  private executor: ScheduleExecutor | undefined;
  private markReady: () => void = () => {};

  public override register(): void {
    this.app.container.singleton(agentsAccessToken, () => ({
      scopeOf: async (identity) => {
        const runtime = this.app.container.resolve(nocoReachToken);
        if (identity.principal.type !== 'user') return 'none';
        const role: unknown = await roleOf(
          runtime.legacy.db,
          identity.principal.id,
        );
        // Membership grants only edits to one's own records. Global management remains an explicit settings grant.
        return role ? { users: [identity.principal.id] } : 'none';
      },
    }));
    this.app.container.singleton(nocoReachToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const logger = legacyLogger(
        this.app.container.resolve(loggingToken).getLogger('nocoreach'),
      );
      const db = new LegacyDatabase(
        database,
        this.app.container.resolve(idGeneratorToken),
      );
      const users = new LegacyUsers(db);
      db.define('users', users);
      const variables = new LegacyVariables(
        db,
        this.app.container.resolve(secretsServiceToken),
      );
      const legacy = new LegacyApp(db, logger, variables);
      const identity = this.app.config.get<AppIdentityConfig>('app');
      const basePath = identity?.publicBasePath ?? '/main';
      // Task and analysis notifications: `pm.get('notification-manager')` and its channels, answered by the
      // Notification plugin; in-app messages go to the configured in-app channel, the header's inbox.
      if (this.app.container.has(notificationServiceToken)) {
        const notifications = new LegacyNotifications(
          () => this.app.container.resolve(notificationServiceToken),
          () =>
            this.app.config.get<NotificationConfig>('notification')?.channels ??
            {},
          users,
          { basePath, origin: identity?.publicOrigin },
        );
        legacy.provide('notification-manager', notifications.plugin);
        db.define('notificationChannels', notifications.repository());
      }
      setCallbackPath(`${basePath}/api/nocoreach/nrGoogle/callback`);
      setPublicDns(
        this.app.config.get<NocoReachConfig>('nocoreach')?.publicDns ?? '',
      );
      const plugin = new Connections(legacy, variables, {
        basePath,
        publicOrigin: identity?.publicOrigin,
        browserCollectors:
          this.app.config.get<NocoReachConfig>('nocoreach')
            ?.browserCollectors ?? [],
        mock: this.app.container.has(mockEngineToken)
          ? this.app.container.resolve(mockEngineToken)
          : undefined,
      });
      plugin.agents = this.app.container.resolve(agentsToken);
      const ready = new Promise<void>((resolve) => (this.markReady = resolve));
      const jobs = this.app.container.resolve(jobExecutorServiceToken);
      const lifecycles = createNocoReachLifecycles({
        database,
        jobs: jobs.getJobExecutor(NOCOREACH_LIFECYCLE_SCOPE),
        schedule: jobs.getScheduleExecutor(NOCOREACH_LIFECYCLE_SCOPE),
        logger,
        onSweep: async () => {
          await ready;
          const recovered = await Promise.allSettled([
            analysis.sweep(),
            tasks.observations.sweep(),
          ]);
          const failures = recovered.flatMap((result) =>
            result.status === 'rejected' ? [result.reason as unknown] : [],
          );
          if (failures.length)
            throw new AggregateError(
              failures,
              'NocoReach lifecycle recovery failed',
            );
        },
      });
      const tasks = createTaskRuntime({
        database,
        lifecycle: lifecycles.runtime,
        legacy: db,
        variables,
        service: () => plugin.taskExecution,
        logger,
      });
      plugin.taskLifecycle = tasks.lifecycle;
      plugin.taskRunStore = tasks.runs;
      plugin.taskObservations = tasks.observations;
      const analysis = new AnalysisRuntime({
        database,
        lifecycle: lifecycles.runtime,
        appName: this.app.appName,
        scheduler: this.app.container.has(schedulerServiceToken)
          ? this.app.container.resolve(schedulerServiceToken)
          : undefined,
        host: () => plugin,
        ready,
        logger,
      });
      plugin.analysisRuntime = analysis;
      return {
        legacy,
        plugin,
        users,
        variables,
        cache: new LegacyCache(),
        logger,
        lifecycles,
        tasks,
        analysis,
        ready,
      };
    });
  }

  public override async boot(): Promise<void> {
    this.app.container.resolve(nocoReachToken).analysis.registerSchedule();
  }

  public override async start(): Promise<void> {
    const runtime = this.app.container.resolve(nocoReachToken);
    await runtime.variables.load();
    await runtime.plugin.load();
    await runtime.tasks.initialize();
    const agents = this.app.container.resolve(agentsToken);
    const inConnection = <T>(
      conn: Parameters<LegacyDatabase['withConnection']>[0],
      fn: () => Promise<T>,
    ): Promise<T> => runtime.legacy.db.withConnection(conn, fn);
    agents.people.provide({
      list: (conn) =>
        inConnection(conn, async () => runtime.plugin.members.joined()),
      names: (conn, ids) =>
        inConnection(conn, async () => {
          const rows = await Promise.all(
            ids.map((id) => runtime.users.findOne({ filterByTk: id })),
          );
          return new Map(
            rows
              .filter(Boolean)
              .map((row) => [
                String(row!.id),
                String(row!.nickname || row!.username || row!.id),
              ]),
          );
        }),
      inactive: (conn, ids) =>
        inConnection(conn, async () => {
          const roles = await Promise.all(
            ids.map((id) => roleOf(runtime.legacy.db, id)),
          );
          return new Set(ids.filter((_, index) => !roles[index]));
        }),
    });
    agents.conversations.contextKinds.register(
      'nocoreachProject',
      (conn, userId, ids) =>
        inConnection(conn, async () => {
          const found = new Map();
          if (!(await roleOf(runtime.legacy.db, userId))) return found;
          for (const id of ids) {
            const row: unknown = await runtime.plugin.projects.row(
              id,
              undefined,
            );
            if (row && typeof row === 'object' && 'payload' in row) {
              const project = row.payload;
              if (
                project &&
                typeof project === 'object' &&
                'name' in project &&
                typeof project.name === 'string'
              )
                found.set(id, { title: project.name, key: null, url: null });
            }
          }
          return found;
        }),
    );
    // The one-time import of the classic installation's data (`pnpm nocobase app import-classic`).
    registerClassicImport(runtime);
    this.markReady();
    await runtime.legacy.emit('afterStart');
    await runtime.lifecycles.start();
    // Classic timers ran in the server's local time; so do these.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.executor = this.app.container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('nocoreach');
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
    const runtime = this.app.container.resolveIfCreated?.(nocoReachToken);
    try {
      await runtime?.lifecycles.shutdown();
      await runtime?.plugin.afterDisable?.();
    } finally {
      await runtime?.plugin.network.close();
    }
  }
}
