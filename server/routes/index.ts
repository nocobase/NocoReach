import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { nocoReachRoutes } from './nocoreach.js';

const routes: readonly AppRouteContribution<Application>[] = [
  nocoReachRoutes,
];

export default routes;
