import type {
  AppClientRegisteredRoute,
  AppClientRouteComponentModule,
} from '@nocobase/app-client/plugins';
import { prepareBusinessLocale } from '../i18n/index.js';
import type { MessageScope } from '../../shared/startup-pages.js';

type Loader = NonNullable<AppClientRegisteredRoute['componentLoader']>;
const modules = new WeakMap<
  Loader,
  {
    promise: Promise<AppClientRouteComponentModule>;
    module?: AppClientRouteComponentModule;
  }
>();
let foregroundLoads = 0;
export const hasForegroundRouteLoad = () => foregroundLoads > 0;
export const cachedRouteModule = (loader: Loader) =>
  modules.get(loader)?.module;

/** Navigation owns imports. Resource hints never enter this cache or delay a loader. */
export function loadRouteModule(
  loader: Loader,
  scope: MessageScope = 'all',
): Promise<AppClientRouteComponentModule> {
  let entry = modules.get(loader);
  if (!entry) {
    // Evaluate pages only after their synchronous copy helpers have the required scope.
    entry = { promise: prepareBusinessLocale(scope).then(loader) };
    const current = entry;
    current.promise = current.promise
      .then((module) => {
        if (!module?.default) throw new Error('Missing route component');
        current.module = module;
        return module;
      })
      .catch((error: unknown) => {
        modules.delete(loader);
        throw error;
      });
    modules.set(loader, current);
  }
  foregroundLoads++;
  return entry.promise.finally(() => {
    foregroundLoads--;
  });
}
