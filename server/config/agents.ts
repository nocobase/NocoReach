import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AgentsConfig } from '@nocobase/app-plugin-agents/server/tokens';

// Match package.json's nocobase.cli.bin even when the deployment is mounted at /main.
const agents: AppConfigFactory<AgentsConfig> = defineAppConfig({
  defaults: () => ({
    app: { id: 'nocoreach', name: 'NocoReach' },
    cli: { name: 'nocoreach', package: { kind: 'served' } },
    // Studio's root is the release directory; standalone's root is dist. Resolve the bundled files from this module.
    // An explicit agents.dist.dir in config.yml still overrides this default.
    dist: {
      dir: fileURLToPath(
        new URL(
          import.meta.filename.endsWith('.ts')
            ? '../../dist/runners'
            : '../../runners',
          import.meta.url,
        ),
      ),
    },
  }),
});

export default agents;
import { fileURLToPath } from 'node:url';
