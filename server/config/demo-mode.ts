import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { DemoModeConfig } from '@nocobase/app-plugin-demo-mode/server';

/** Deployment opt-in; administrator UI cannot turn a production instance into a demo. */
const demoMode: AppConfigFactory<DemoModeConfig> = defineAppConfig({
  defaults: { mode: 'off', allowTables: [], data: { models: true } },
});
export default demoMode;
