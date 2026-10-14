import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import { nocoReachToken } from './nocoreach.js';
import { ManualTasks } from '../nocoreach/manual-tasks.js';

export const manualTasksToken = createServiceToken<ManualTasks>(
  'nocoreach/manual-tasks',
);

export default class ManualTasksProvider extends ServiceProvider<Application> {
  public readonly name = 'nocoreach/manual-tasks';
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  public override async boot(): Promise<void> {
    this.app.container.instance(
      manualTasksToken,
      new ManualTasks(
        this.app.container.resolve(nocoReachToken),
        this.app.container.resolve(databaseManagerToken),
        this.app.container.resolve(serverFileRepositoryManagerToken),
        this.app.container.resolve(driveManagerToken),
        this.app.publicBasePath ?? '',
      ),
    );
  }
  public override async start(): Promise<void> {
    const clean = () => {
      if (this.pending) return;
      this.pending = this.app.container
        .resolve(manualTasksToken)
        .cleanup()
        .catch(() => {
          this.app.container
            .resolve(nocoReachToken)
            .logger.warn(
              'Task media cleanup failed; pending records will be retried.',
            );
        })
        .finally(() => {
          this.pending = undefined;
        });
    };
    clean();
    this.timer = setInterval(clean, 60000);
    this.timer.unref();
  }
  public override async shutdown(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.pending;
  }
}
