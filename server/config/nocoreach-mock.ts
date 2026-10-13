import {
  defineAppConfig,
  envBoolean,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { MockConfig } from '../../app-plugins/nocoreach-mock/server/types.js';

export interface NocoReachMockConfig extends MockConfig {
  readonly initializeData?: boolean;
}

/** All values are deployment-owned. A web request can never turn on simulated upstreams globally. */
const nocoreachMock: AppConfigFactory<NocoReachMockConfig> = defineAppConfig({
  defaults: { enabled: false, environment: '', initializeData: true },
  public: ['enabled', 'environment'],
  env: {
    NOCOREACH_MOCK_INITIALIZE_DATA: envBoolean('initializeData', {
      required: false,
      description:
        'Initialize the persistent NocoBloom demo project in a marked simulated deployment. Disable for empty integration tests.',
    }),
    NOCOREACH_MOCK_ENABLED: envBoolean('enabled', {
      required: false,
      description:
        'Enable fail-closed simulated NocoReach upstreams in a dedicated demo/test deployment only.',
    }),
    NOCOREACH_MOCK_ENVIRONMENT: envString('environment', {
      required: false,
      description:
        'Must explicitly be demo or test before mock mode can be enabled.',
    }),
  },
});
export default nocoreachMock;
