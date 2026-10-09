import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import NocoReachProvider from './nocoreach.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  NocoReachProvider,
];

export default serviceProviders;

export { nocoReachToken } from './nocoreach.js';
