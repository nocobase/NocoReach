import type { useWorkspaceCache } from '../workspace-cache';

type Cache = ReturnType<typeof useWorkspaceCache>;
type Started = { cache: Cache; revision: number; request: Promise<unknown> };

/**
 * Requests a page starts before the component that reads them has mounted, so they do not wait behind another request.
 * Each one is handed over once, to the first read of its key in the same cache and revision, and becomes that read's
 * request; any later read (a reload, a refresh after an analysis) fetches as it always did. A request started before
 * the key was invalidated is never handed over, so it cannot refill the cache.
 */
export class EarlyRequests {
  private started = new Map<string, Started>();

  start(cache: Cache, key: string, run: () => Promise<unknown>): void {
    const request = run();
    // Not every early request is read: the page may fail before its readers mount.
    request.catch(() => undefined);
    this.started.set(key, { cache, revision: cache.revision(key), request });
  }

  take<T>(cache: Cache, key: string, run: () => Promise<T>): Promise<T> {
    const started = this.started.get(key);
    this.started.delete(key);
    return started &&
      started.cache === cache &&
      started.revision === cache.revision(key)
      ? (started.request as Promise<T>)
      : run();
  }
}
