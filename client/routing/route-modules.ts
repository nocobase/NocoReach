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
const vitePreloadErrors = new WeakSet<object>();
let unsafePreloadError: Error | undefined;
let foregroundLoads = 0;

/** Vite retains failed dependency URLs in its private seen set until a full reload. */
export const recordVitePreloadError = (error: object) =>
  vitePreloadErrors.add(error);
export const routePreloadNeedsReload = () => unsafePreloadError !== undefined;

export const hasForegroundRouteLoad = () => foregroundLoads > 0;
export const cachedRouteModule = (loader: Loader) =>
  modules.get(loader)?.module;
export const isBackgroundRouteError = (error: object) =>
  backgroundErrors.has(error);

/** Share code only, never page instances or user data. Vite preload failures require a full reload before loading more code. */
export function loadRouteModule(
  loader: Loader,
  background = false,
): Promise<AppClientRouteComponentModule> {
  let entry = modules.get(loader);
  if (unsafePreloadError && !entry?.module) {
    return Promise.reject(unsafePreloadError);
  }
  if (!entry) {
    entry = {
      foreground: !background,
      promise: Promise.resolve().then(loader),
    };
    const current = entry;
    current.promise = current.promise
      .then((module) => {
        // Another route may have failed a shared CSS dependency while this import was pending.
        if (unsafePreloadError) throw unsafePreloadError;
        if (!module?.default) throw new Error('Missing route component');
        current.module = module;
        return module;
      })
      .catch((error: unknown) => {
        modules.delete(loader);
        if (error && typeof error === 'object') {
          if (vitePreloadErrors.has(error)) {
            unsafePreloadError =
              error instanceof Error
                ? error
                : new Error('Vite dependency preload failed', { cause: error });
          }
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
