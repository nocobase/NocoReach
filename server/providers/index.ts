import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import NocoReachProvider from './nocoreach.js';
import ManualTasksProvider from './manual-tasks.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  NocoReachProvider,
  ManualTasksProvider,
];

export default serviceProviders;

export { nocoReachToken } from './nocoreach.js';
