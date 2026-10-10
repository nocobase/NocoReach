import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AgentsConfig } from '@nocobase/app-plugin-agents/server/tokens';

// Match package.json's nocobase.cli.bin even when the deployment is mounted at /main.
const agents: AppConfigFactory<AgentsConfig> = defineAppConfig({
  defaults: {
    app: { id: 'nocoreach', name: 'NocoReach' },
    cli: { name: 'nocoreach', package: { kind: 'served' } },
  },
});

export default agents;
