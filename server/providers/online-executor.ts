import type { Application } from '@nocobase/app-server/application';
import {
  agentsToken,
  type Agents,
  type AgentsConfig,
} from '@nocobase/app-plugin-agents/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';

/** NocoReach always runs Online Agents, including deployments carrying the retired false override. */
export default class OnlineExecutorProvider extends ServiceProvider<Application> {
  public readonly name = 'nocoreach/online-executor';
  private executor?: Agents['online']['executor'];

  public override start(): Promise<void> {
    // The upstream plugin owns the normal executor lifecycle. Take ownership only
    // when an old configuration made it skip startup; never create another executor.
    if (
      this.executor ||
      this.app.config.get<AgentsConfig>('agents')?.server?.enabled !== false
    )
      return Promise.resolve();
    const executor = this.app.container.resolve(agentsToken).online.executor;
    executor.start();
    this.executor = executor;
    return Promise.resolve();
  }

  public override async shutdown(): Promise<void> {
    const executor = this.executor;
    this.executor = undefined;
    await executor?.stop();
  }
}
