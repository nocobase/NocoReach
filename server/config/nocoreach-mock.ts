import {
  defineAppConfig,
  envBoolean,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { MockConfig } from '../../app-plugins/nocoreach-mock/server/types.js';

/** Both values are deployment-owned. A web request can never turn on simulated upstreams globally. */
const nocoreachMock: AppConfigFactory<MockConfig> = defineAppConfig({
  defaults: { enabled: false, environment: '' },
  public: ['enabled', 'environment'],
  env: {
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
