import type { Application } from '@nocobase/app-server/application';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import { createOnlineStore } from '../online-agent/database-store.js';
import { createOnlineExecutor } from '../online-agent/executor.js';
import { OnlineAgentError, type ModelPort } from '../online-agent/contracts.js';
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
      const models: ModelPort = {
        stream: (request) => agents.models.gateway.stream(request),
        async resolve(model, context) {
          const selected =
            model ??
            (
              await agents.models.services.defaults(
                context as DatabaseConnection | undefined,
              )
            ).effectiveChat;
          if (!selected) throw new OnlineAgentError('modelRequired');
          // A task enqueue joins its business transaction. The worker validates the model again before I/O.
          if (!context) {
            try {
              await agents.models.services.connectionFor(selected, 'chat');
            } catch {
              throw new OnlineAgentError('modelUnavailable');
            }
          }
          return { modelService: selected.modelService, model: selected.model };
        },
      };
      const logger = this.app.container
        .resolve(loggingToken)
        .getLogger('online-agent');
      return new OnlineAgentService(
        createOnlineStore(this.app.container.resolve(databaseManagerToken)),
        models,
        createOnlineExecutor(models),
        createNocoReachOnlineHost(() =>
          this.app.container.resolve(nocoReachToken),
        ),
        () =>
          logger.warn(
            'Online Agent worker failed; its persisted run remains available for inspection.',
          ),
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
