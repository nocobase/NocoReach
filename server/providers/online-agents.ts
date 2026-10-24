import type { Application } from '@nocobase/app-server/application';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import { OnlineAgentError, onlineErrorCode } from '../online-agent/errors.js';
import { OnlineAgentService } from '../online-agent/service.js';
import { createNocoReachOnlineHost } from '../nocoreach/online-agent/host.js';
import { nocoReachToken } from './nocoreach.js';

export const onlineAgentsToken = createServiceToken<OnlineAgentService>(
  'nocoreach/online-agents',
);
export default class OnlineAgentsProvider extends ServiceProvider<Application> {
  readonly name = 'nocoreach/online-agents';
  override register() {
    this.app.container.singleton(onlineAgentsToken, () => {
      const agents = this.app.container.resolve(agentsToken);
      const logger = this.app.container
        .resolve(loggingToken)
        .getLogger('online-agent');
      return new OnlineAgentService(
        this.app.container.resolve(databaseManagerToken),
        agents.models,
        createNocoReachOnlineHost(
          () => this.app.container.resolve(nocoReachToken),
          this.app.publicBasePath,
        ),
        (error) =>
          logger.warn(
            {
              code: onlineErrorCode(error),
            },
            'Online chat execution failed',
          ),
        () => {
          const { plugin } = this.app.container.resolve(nocoReachToken);
          if (!plugin.demoConfiguration?.enabled) return undefined;
          const modelService = plugin.demoModels?.serviceName;
          if (!modelService) throw new OnlineAgentError('modelUnavailable');
          return plugin.demoConfiguration.chatModel({
            modelService,
            model: 'demo-chat',
          });
        },
      );
    });
  }
  override async boot() {
    await this.app.container.resolve(onlineAgentsToken).initialize();
  }
  override async start() {
    await this.app.container.resolve(nocoReachToken).ready;
    this.app.container.resolve(onlineAgentsToken).start();
  }
  override async shutdown() {
    await this.app.container.resolve(onlineAgentsToken).stop();
  }
}
