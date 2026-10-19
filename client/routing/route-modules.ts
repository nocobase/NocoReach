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
// Vite marks shared CSS as seen before it settles. Never start a second uncached
// route until the first has settled, including foreground navigation.
let pendingImport: Promise<unknown> = Promise.resolve();

function errorChain(error: unknown): object[] {
  const chain: object[] = [];
  const seen = new Set<object>();
  while (error && typeof error === 'object' && !seen.has(error)) {
    seen.add(error);
    chain.push(error);
    error = 'cause' in error ? error.cause : undefined;
  }
  return chain;
}

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
    let started = false;
    entry = {
      foreground: !background,
      promise: pendingImport.then(() => {
        if (unsafePreloadError) throw unsafePreloadError;
        started = true;
        return loader();
      }),
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
        if (!started) throw error;
        // Registered NocoBase loaders wrap the Vite payload in Error.cause.
        const chain = errorChain(error);
        const preloadError = chain.find((cause) =>
          vitePreloadErrors.has(cause),
        );
        if (preloadError) {
          unsafePreloadError =
            preloadError instanceof Error
              ? preloadError
              : new Error('Vite dependency preload failed', {
                  cause: preloadError,
                });
        }
        for (const cause of chain) {
          if (!current.foreground) backgroundErrors.add(cause);
          else backgroundErrors.delete(cause);
        }
        throw error;
      });
    // Consume the queue rejection; individual callers still receive the error.
    pendingImport = current.promise.catch(() => undefined);
    modules.set(loader, current);
  }
  if (background) return entry.promise;
  entry.foreground = true;
  foregroundLoads++;
  return entry.promise.finally(() => {
    foregroundLoads--;
  });
}
