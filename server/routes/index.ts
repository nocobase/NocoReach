import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { onlineAgentRoutes } from './online-agents.js';
import { accessKeyRoutes } from './access-keys.js';
import { memberAccessRoutes } from './member-access.js';
import { scheduleManagementRoutes } from './schedules.js';
import { nocoReachRoutes } from './nocoreach.js';
import { chatBusinessRoutes } from './chat-business.js';
import { taskAgentRoutes } from './task-agent.js';
import { manualTaskRoutes, taskMediaContentRoutes } from './manual-tasks.js';
import { connectRoutes } from './connect.js';

const routes: readonly AppRouteContribution<Application>[] = [
  accessKeyRoutes,
  memberAccessRoutes,
  nocoReachRoutes,
  onlineAgentRoutes,
  scheduleManagementRoutes,
  taskAgentRoutes,
  chatBusinessRoutes,
  manualTaskRoutes,
  taskMediaContentRoutes,
  connectRoutes,
];

export default routes;
