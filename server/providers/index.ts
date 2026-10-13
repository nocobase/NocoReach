import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import NocoReachProvider from './nocoreach.js';
import OnlineExecutorProvider from './online-executor.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  NocoReachProvider,
  OnlineExecutorProvider,
];

export default serviceProviders;

export { nocoReachToken } from './nocoreach.js';
