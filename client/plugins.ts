import nocoreachMock from '../app-plugins/nocoreach-mock/client/index.js';
import { MockSettingsPage } from './mock-integrations.js';
import mail from '@nocobase/app-plugin-mail/client';
import agents from '@nocobase/app-plugin-agents/client';
import defaultAccess from '@nocobase/app-plugin-authz-default-access/client';
import sharingRules from '@nocobase/app-plugin-authz-sharing-rules/client';
import restrictionRules from '@nocobase/app-plugin-authz-restriction-rules/client';
import {
  defineClientPlugins,
  type AppClientPlugins,
} from '@nocobase/app-client/plugins';
import apiKeys from '@nocobase/app-plugin-api-keys/client';
import authentication from '@nocobase/app-plugin-authentication/client';
import authorization from '@nocobase/app-plugin-authorization/client';
import databaseExplorer from '@nocobase/app-plugin-database-explorer/client';
import users from '@nocobase/app-plugin-users/client';
import notificationInApp from '@nocobase/app-plugin-notification-in-app/client';
import i18n from '@nocobase/app-plugin-i18n/client';
import notification from '@nocobase/app-plugin-notification/client';
import scheduler from '@nocobase/app-plugin-scheduler/client';
import file from '@nocobase/app-plugin-file/client';
import demoMode from '@nocobase/app-plugin-demo-mode/client';

// Array order is contribution order. A plugin is enabled by appearing in this
// list; removing its entry and its import disables it.
const clientPlugins: AppClientPlugins = defineClientPlugins([
  authentication(),
  authorization(),
  defaultAccess(),
  sharingRules(),
  restrictionRules(),
  databaseExplorer(),
  users(),
  apiKeys(),
  i18n(),
  // NocoReach owns the /inbox page (client/pages/inbox.tsx) and its header button (InboxHeaderButton).
  notificationInApp({ inboxRoute: false, headerButton: false }),
  notification(),
  file(),
  scheduler(),
  // NocoReach has no mailbox pages; Mail stays registered for its accounts and sending only.
  mail({ workspaceRoutes: false }),
  // NocoReach renders its own Agent panel, chat pages and header (client/extensions/nocobase-agent-chat/ and
  // client/layouts/), so the plugin's header button, panel and conversation pages stay out.
  agents({ headerAction: false, panel: false, chatRoutes: false }),
  nocoreachMock({
    page: MockSettingsPage,
    parent: 'nocoreach:nav-settings',
    navigation: false,
  }),
  demoMode(),
]);

export default clientPlugins;
