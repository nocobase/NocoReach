import agents from '@nocobase/app-plugin-agents/cli';
import demoMode from '@nocobase/app-plugin-demo-mode/cli';
import {
  defineCliPlugin,
  defineCliPlugins,
  type AppCliPlugins,
} from '@nocobase/app-cli';
import scheduler from '@nocobase/app-plugin-scheduler/cli';

// Array order is command registration order. A plugin contributes its commands
// by appearing in this list; removing its entry and its import removes them.
const cliPlugins: AppCliPlugins = defineCliPlugins([
  scheduler,
  agents,
  demoMode,
  defineCliPlugin({
    // Application-owned build hooks: an archive deployment cannot use the developer's storage/runners directory.
    packageName: '@nocoreach/build-artifacts',
    buildHooks: {
      afterBuild: [
        {
          label: 'Include NocoReach Scheduler extension',
          command: ['node', 'cli/build-scheduler-patch.mjs'],
        },
      ],
      beforeBuild: [
        {
          label: 'Build NocoReach simulated-data plugin',
          command: [
            'pnpm',
            'exec',
            'tsc',
            '-p',
            'app-plugins/nocoreach-mock/tsconfig.build.json',
          ],
        },
      ],
      afterServerBuild: [
        {
          label: 'Include demo data plugin',
          command: ['node', 'cli/build-demo-mode-plugin.mjs'],
        },
        {
          label: 'Include NocoReach simulated-data plugin package',
          command: ['node', 'cli/build-mock-plugin.mjs'],
        },
        {
          label: 'Pack NocoReach CLI',
          command: [
            'pnpm',
            'nocobase',
            'cli',
            'build',
            '--universal',
            '--skip-build',
            '--out',
            'dist/runners',
          ],
        },
        {
          label: 'Pack compatible Runner',
          command: [
            'pnpm',
            'nocobase',
            'cli',
            'build',
            '--runner',
            '--universal',
            '--skip-build',
            '--out',
            'dist/runners',
          ],
        },
      ],
    },
  }),
]);

export default cliPlugins;
