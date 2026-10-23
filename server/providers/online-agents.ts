import type { Application } from '@nocobase/app-server/application';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import { OnlineChatSettingsStore } from '../nocoreach/online-agent/settings.js';
import { registerOnlineChat } from '../nocoreach/online-agent/register.js';
import { nocoReachToken } from './nocoreach.js';

export const onlineChatSettingsToken =
  createServiceToken<OnlineChatSettingsStore>('nocoreach/online-chat-settings');
/** The online assistant runs on the Agents plugin's OnlineAgent; NocoReach contributes its tools, scope and settings. */
export default class OnlineAgentsProvider extends ServiceProvider<Application> {
  readonly name = 'nocoreach/online-agents';
  override register() {
    this.app.container.singleton(
      onlineChatSettingsToken,
      () =>
        new OnlineChatSettingsStore(
          this.app.container.resolve(databaseManagerToken),
        ),
    );
  }
  override async boot() {
    const container = this.app.container;
    registerOnlineChat(
      container.resolve(agentsToken),
      () => container.resolve(nocoReachToken),
      () => container.resolve(onlineChatSettingsToken).get(),
      this.app.publicBasePath,
    );
  }
}
