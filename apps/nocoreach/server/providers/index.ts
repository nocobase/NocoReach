import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ReachProvider from './reach/index.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [ReachProvider];

export default serviceProviders;
