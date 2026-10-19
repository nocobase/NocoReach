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
  const onPreloadError = (event: Event): void => {
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
  target.addEventListener('vite:preloadError', onPreloadError);
  return () => target.removeEventListener('vite:preloadError', onPreloadError);
}
