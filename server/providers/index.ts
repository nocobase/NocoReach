import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import NocoReachProvider from './nocoreach.js';
import OnlineAgentsProvider from './online-agents.js';
import ManualTasksProvider from './manual-tasks.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  NocoReachProvider,
  OnlineAgentsProvider,
  ManualTasksProvider,
];

export default serviceProviders;

export { nocoReachToken } from './nocoreach.js';
