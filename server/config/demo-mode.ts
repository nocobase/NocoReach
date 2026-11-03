import { defineDemoModeConfig } from '@nocobase/app-plugin-demo-mode/config';
import type { AppConfigFactory } from '@nocobase/app-server/config';

const upstream = defineDemoModeConfig();
const writable = 'nrKeywordRuns';
const environment = upstream.rules!.env!;
const variable = 'NOCOBASE_DEMO_WRITABLE_COLLECTIONS';

/** Keyword reads persist provider results; keep their cache writable alongside deployment exceptions. */
const demoMode: typeof upstream = Object.assign(
  ((runtime) => ({
    ...upstream(runtime),
    allowCollections: [writable],
  })) satisfies AppConfigFactory,
  {
    rules: {
      ...upstream.rules!,
      env: {
        ...environment,
        [variable]: {
          ...environment[variable],
          parse: (value: string) => [
            ...new Set([
              writable,
              ...value
                .split(',')
                .map((name) => name.trim())
                .filter(Boolean),
            ]),
          ],
        },
      },
    },
  },
);
export default demoMode;
