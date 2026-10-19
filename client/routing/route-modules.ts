import type {
  AppClientRegisteredRoute,
  AppClientRouteComponentModule,
} from '@nocobase/app-client/plugins';

type Loader = NonNullable<AppClientRegisteredRoute['componentLoader']>;
const modules = new WeakMap<
  Loader,
  {
    promise: Promise<AppClientRouteComponentModule>;
    module?: AppClientRouteComponentModule;
    foreground: boolean;
  }
>();
const backgroundErrors = new WeakSet<object>();
let foregroundLoads = 0;

export const hasForegroundRouteLoad = () => foregroundLoads > 0;
export const cachedRouteModule = (loader: Loader) =>
  modules.get(loader)?.module;
export const isBackgroundRouteError = (error: object) =>
  backgroundErrors.has(error);

/** Share code only, never page instances or user data. Failed speculation remains retryable. */
export function loadRouteModule(
  loader: Loader,
  background = false,
): Promise<AppClientRouteComponentModule> {
  let entry = modules.get(loader);
  if (!entry) {
    entry = {
      foreground: !background,
      promise: Promise.resolve().then(loader),
    };
    const current = entry;
    current.promise = current.promise
      .then((module) => {
        if (!module?.default) throw new Error('Missing route component');
        current.module = module;
        return module;
      })
      .catch((error: unknown) => {
        modules.delete(loader);
        if (error && typeof error === 'object') {
          if (!current.foreground) backgroundErrors.add(error);
          else backgroundErrors.delete(error);
        }
        throw error;
      });
    modules.set(loader, current);
  }
  if (background) return entry.promise;
  entry.foreground = true;
  foregroundLoads++;
  return entry.promise.finally(() => {
    foregroundLoads--;
  });
}
