import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AgentsConfig } from '@nocobase/app-plugin-agents/server/tokens';

// Match package.json's nocobase.cli.bin even when the deployment is mounted at /main.
const agents: AppConfigFactory<AgentsConfig> = defineAppConfig({
  defaults: ({ paths }) => ({
    app: { id: 'nocoreach', name: 'NocoReach' },
    cli: { name: 'nocoreach', package: { kind: 'served' } },
    // cli/plugins.ts bundles both products into dist/runners; the compiled app root is dist, including on Studio.
    // An explicit agents.dist.dir in config.yml still overrides this default.
    dist: {
      dir: paths.root(
        import.meta.filename.endsWith('.ts') ? 'dist/runners' : 'runners',
      ),
    },
  }),
});

export default agents;
