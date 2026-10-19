import {
  isBackgroundRouteError,
  recordVitePreloadError,
} from '../routing/route-modules.js';

// A tab opened before a deployment still holds the previous build's file names. Pages load their files on first visit,
// and the new deployment no longer serves the old ones (404), so the page shows "Unable to load page" until it is
// reloaded. Vite reports such a failed dynamic import as `vite:preloadError`; reload into the new build instead.
//
// One automatic reload per minute at most: if the files are still missing after it, the failure is not a stale tab and
// the page shows its error as before. Without session storage there is no way to tell, so nothing reloads.

const STORAGE_KEY = 'nocoreach:stale-build-reload';
const RELOAD_GAP_MS = 60_000;

type StaleBuildWindow = Pick<
  Window,
  'addEventListener' | 'removeEventListener' | 'sessionStorage'
> & { location: Pick<Location, 'reload'> };

export function reloadOnStaleBuild(
  target: StaleBuildWindow = window,
  now: () => number = Date.now,
): () => void {
  let disposed = false;
  const reload = (event: Event): void => {
    let last: number;
    try {
      last = Number(target.sessionStorage.getItem(STORAGE_KEY) ?? 0);
      if (now() - last < RELOAD_GAP_MS) return;
      target.sessionStorage.setItem(STORAGE_KEY, String(now()));
    } catch {
      return;
    }
    event.preventDefault();
    target.location.reload();
  };
  const onPreloadError = (event: Event & { payload?: object }): void => {
    if (event.payload) {
      recordVitePreloadError(event.payload);
      // Let the import reject first so its loader can classify speculative failures.
      setTimeout(() => {
        if (!disposed && !isBackgroundRouteError(event.payload!)) reload(event);
      }, 0);
    } else reload(event);
  };
  target.addEventListener('vite:preloadError', onPreloadError);
  return () => {
    disposed = true;
    target.removeEventListener('vite:preloadError', onPreloadError);
  };
}
