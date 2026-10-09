import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

export interface NocoReachConfig {
  /**
   * DNS servers NocoReach resolves public websites with before fetching them (comma-separated, such as
   * `1.1.1.1,8.8.8.8`). Needed where a local proxy answers with reserved addresses (198.18.x.x), which NocoReach's
   * public-address check refuses. Empty: the system resolver.
   */
  readonly publicDns: string;
}

const nocoreach: AppConfigFactory<NocoReachConfig> = defineAppConfig({
  defaults: { publicDns: '' },
  env: {
    NOREACH_PUBLIC_DNS: envString('publicDns', {
      description:
        'DNS servers NocoReach resolves public websites with, comma-separated (for example 1.1.1.1,8.8.8.8); empty uses the system resolver.',
      required: false,
    }),
  },
});

export default nocoreach;
