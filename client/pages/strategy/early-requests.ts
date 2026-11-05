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
  /**
   * Keys a read asked for before they were started: Insights mounts on the state it last showed, and a child's effects
   * run before its parent's, so its first read can come first. Starting such a key again would send it twice.
   */
  private read = new Map<string, { cache: Cache; revision: number }>();

  start(cache: Cache, key: string, run: () => Promise<unknown>): void {
    const read = this.read.get(key);
    this.read.delete(key);
    if (read && read.cache === cache && read.revision === cache.revision(key))
      return;
    const request = run();
    // Not every early request is read: the page may fail before its readers mount.
    request.catch(() => undefined);
    this.started.set(key, { cache, revision: cache.revision(key), request });
  }

  take<T>(cache: Cache, key: string, run: () => Promise<T>): Promise<T> {
    const started = this.started.get(key);
    this.started.delete(key);
    if (
      started &&
      started.cache === cache &&
      started.revision === cache.revision(key)
    )
      return started.request as Promise<T>;
    if (!started) this.read.set(key, { cache, revision: cache.revision(key) });
    return run();
  }
}
