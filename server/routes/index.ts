import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { onlineAgentRoutes } from './online-agents.js';
import { accessKeyRoutes } from './access-keys.js';
import { scheduleManagementRoutes } from './schedules.js';
import { nocoReachRoutes } from './nocoreach.js';
import { taskAgentRoutes } from './task-agent.js';
import { manualTaskRoutes, taskMediaContentRoutes } from './manual-tasks.js';

const routes: readonly AppRouteContribution<Application>[] = [
  accessKeyRoutes,
  nocoReachRoutes,
  onlineAgentRoutes,
  scheduleManagementRoutes,
  taskAgentRoutes,
  manualTaskRoutes,
  taskMediaContentRoutes,
];

export default routes;
