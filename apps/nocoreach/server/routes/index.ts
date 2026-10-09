import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { reachRoutes } from './reach.js';

const routes: readonly AppRouteContribution<Application>[] = [reachRoutes];

export default routes;
