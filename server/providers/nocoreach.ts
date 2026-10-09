// NocoReach's services, as ported from the classic plugin (server/nocoreach, docs/PORT-PLAN.md): this provider builds
// the legacy layer they run on, lets them register their actions and timers the classic way, and starts those timers on
// the application's jobs service. The NocoReach route (server/routes/nocoreach.ts) serves the registered actions.
import type { Application } from '@nocobase/app-server/application';
import type { AppIdentityConfig } from '@nocobase/app-server/config';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import { databaseManagerToken } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import type { Logger } from '@nocobase/logging';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { LegacyApp } from '../nocoreach/legacy/app.js';
import { LegacyCache } from '../nocoreach/legacy/context.js';
import { LegacyDatabase } from '../nocoreach/legacy/database.js';
import { LegacyUsers } from '../nocoreach/legacy/users.js';
import { LegacyVariables } from '../nocoreach/legacy/variables.js';
import { Connections } from '../nocoreach/plugin.js';
import { setCallbackPath } from '../nocoreach/policy.js';

export interface NocoReachRuntime {
  readonly legacy: LegacyApp;
  readonly plugin: Connections;
  readonly users: LegacyUsers;
  readonly variables: LegacyVariables;
  readonly cache: LegacyCache;
  readonly logger: Logger;
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
    this.app.container.singleton(nocoReachToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const logger = this.app.container.resolve(loggingToken).getLogger('nocoreach');
      const db = new LegacyDatabase(database, this.app.container.resolve(idGeneratorToken));
      const users = new LegacyUsers(database);
      db.define('users', users);
      const variables = new LegacyVariables(db, this.app.container.resolve(secretsServiceToken));
      const legacy = new LegacyApp(db, logger, variables);
      const basePath = this.app.config.get<AppIdentityConfig>('app').publicBasePath;
      setCallbackPath(`${basePath}/api/nocoreach/nrGoogle/callback`);
      const plugin = new Connections(legacy, variables, { basePath });
      const ready = new Promise<void>((resolve) => (this.markReady = resolve));
      return { legacy, plugin, users, variables, cache: new LegacyCache(), logger, ready };
    });
  }

  public override async start(): Promise<void> {
    const runtime = this.app.container.resolve(nocoReachToken);
    await runtime.variables.load();
    await runtime.plugin.load();
    this.markReady();
    await runtime.legacy.emit('afterStart');
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
    await this.app.container.resolveIfCreated?.(nocoReachToken)?.plugin.afterDisable?.();
  }
}
