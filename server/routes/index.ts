import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { nocoReachRoutes } from './nocoreach.js';
import { taskAgentRoutes } from './task-agent.js';
import { manualTaskRoutes, taskMediaContentRoutes } from './manual-tasks.js';

const routes: readonly AppRouteContribution<Application>[] = [
  nocoReachRoutes,
  taskAgentRoutes,
  manualTaskRoutes,
  taskMediaContentRoutes,
];

export default routes;
