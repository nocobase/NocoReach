import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import {
  validateAppJobsConfig,
  type AppJobsConfig,
} from '@nocobase/app-server/jobs';

/**
 * Single-process persistence, declared under `backends` (App Server 5.0.0-beta.2 rejects top-level entries). Without
 * `default`, the built-in local configuration remains selected. Distributed jobs require an explicitly registered
 * backend plugin.
 */
const jobs: AppConfigFactory<AppJobsConfig> = defineAppConfig({
  defaults: ({ paths }) => ({
    backends: {
      memory: {
        adapter: 'memory',
        persistence: { path: paths.storage('jobs') },
      },
    },
  }),
  validate: validateAppJobsConfig,
});

export default jobs;
