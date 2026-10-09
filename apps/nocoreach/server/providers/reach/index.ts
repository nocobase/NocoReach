import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { loggingToken } from '@nocobase/app-server/logging';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import {
  secretsServiceToken,
  createSecretsTableStore,
} from '@nocobase/app-server/secrets';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import type { ScheduleExecutor } from '@nocobase/jobs';
import { ReachStore } from './store.cjs';
import { ReachOperations } from './operations.cjs';
import { registerAnalysisSchedule } from './analysis-schedule.js';
import { configureReachAI } from './ai-config.js';
import { ReachDomain } from './domain/runtime.cjs';
// Existing business modules are JavaScript; this boundary keeps framework services app-owned.
export const reachToken = createServiceToken<any>('app/nocoreach');
export default class ReachProvider extends ServiceProvider<Application> {
  readonly name = 'app/nocoreach';
  private executor?: ScheduleExecutor;
  private analysisJobs?: ReturnType<typeof registerAnalysisSchedule>;
  override register(): void {
    this.app.container.singleton(reachToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const users = this.app.container.resolve(userAdministrationServiceToken);
      const authorization = this.app.container.resolve(authorizationToken);
      const secrets = this.app.container.resolve(secretsServiceToken);
      const settings = new Map<string, string>();
      const ai = this.app.container.resolve(aiManagerToken);
      const domain = new ReachDomain({
        store: new ReachStore(database, users, authorization),
        users,
        authorization,
        ai,
        settings,
        notification: this.app.container.resolve(notificationServiceToken),
        logger: this.app.container.resolve(loggingToken).getLogger('nocoreach'),
        routes: new ReachOperations(),
        saveSetting: async (
          name: string,
          value: string | null,
          secret: boolean,
        ) => {
          const repository = database.repository('nrSettings');
          const where = { name };
          if (value === null) {
            await repository.deleteMany({ filter: where });
            settings.delete(name);
            return;
          }
          // Seal all values so the registered rotation store never encounters plaintext.
          const sealed = secrets.seal(value, {
            purpose: 'nocoreach/settings',
            aad: [name],
          });
          await repository.upsertOne({
            filter: where,
            create: { name, value: sealed, secret },
            update: { value: sealed, secret },
          });
          settings.set(name, value);
        },
        notificationChannels: () =>
          this.app.config.get<
            Record<string, { provider: string; enabled?: boolean }>
          >('notification.channels') || {},
        configureAI: (
          name: string,
          input: Parameters<typeof configureReachAI>[2],
        ) => configureReachAI(this.app, name, input),
      }) as any;
      domain.initializeSettings = async () => {
        for (const row of await database.repository('nrSettings').findMany())
          settings.set(
            String(row.name),
            secrets.open(String(row.value), {
              purpose: 'nocoreach/settings',
              aad: [String(row.name)],
            }),
          );
      };
      return domain;
    });
    this.app.container
      .resolve(secretsServiceToken)
      .registerStore(
        createSecretsTableStore({
          name: 'nocoreach-settings',
          table: 'nrSettings',
          key: 'name',
          columns: [
            {
              column: 'value',
              purpose: 'nocoreach/settings',
              aad: (row) => [String(row.name)],
            },
          ],
          connection: () =>
            this.app.container.resolve(databaseManagerToken).connection(),
        }),
      );
  }
  override async boot(): Promise<void> {
    await this.app.container.resolve(reachToken).load();
    this.analysisJobs = registerAnalysisSchedule(this.app);
  }
  override async start(): Promise<void> {
    const reach = this.app.container.resolve(reachToken);
    await reach.initializeSettings();
    for (const start of reach.starts) await start();
    this.executor = this.app.container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('nocoreach');
    const schedules: readonly [string, string][] = [
      ['taskExecution', '*/2 * * * * *'],
      ['sync', '*/15 * * * * *'],
      ['siteContent', '0 * * * * *'],
      ['github', '0 */10 * * * *'],
      ['community', '30 */10 * * * *'],
      ['packages', '45 */10 * * * *'],
      ['rankTracking', '0 5 * * * *'],
      ['hackernews', '15 */10 * * * *'],
      ['trends', '0 35 * * * *'],
      ['competitors', '0 50 * * * *'],
      ['competitorResearch', '0 20 4 * * *'],
      ['aiQuestions', '0 40 4 * * *'],
      ['xSource', '0 55 * * * *'],
      ['chat', '0 15 * * * *'],
      ['memoryUpdates', '0 40 * * * *'],
      ['reddit', '0 25 * * * *'],
    ];
    for (const [name, cron] of schedules)
      await this.executor.addJob({
        name,
        options: { cron, tz: 'Asia/Shanghai' },
        payload: {},
        execute: async () => {
          await reach[name].tick();
        },
      });
    await this.executor.setup();
    await this.analysisJobs?.start();
  }
  override async shutdown(): Promise<void> {
    this.app.container.resolve(reachToken).taskExecution?.stop();
    await this.executor?.shutdown();
    await this.analysisJobs?.stop();
  }
}
