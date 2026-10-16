import { useEffect, useRef, useState } from 'react';
import {
  useWorkspaceCache,
  useWorkspaceCacheRevision,
} from '../workspace-cache';

// Navigation and visibility changes reuse the session cache. Failed reads also
// wait one interval before retrying, so switching tabs cannot hammer a quota error.
export function usePolled<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  every: number,
  expiresAt?: (value: T) => number | undefined,
): { data?: T; error?: unknown } {
  const cache = useWorkspaceCache();
  const revision = useWorkspaceCacheRevision(key);
  const [state, setState] = useState<{
    cache: typeof cache;
    key: string | null;
    revision: number;
    data?: T;
    error?: unknown;
  }>(() => ({
    cache,
    key,
    revision,
    data: key ? cache.peek<T>(key) : undefined,
  }));
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    let running = false;
    let timer: number | undefined;
    const run = async () => {
      if (running || document.visibilityState !== 'visible') return;
      window.clearTimeout(timer);
      running = true;
      try {
        const data = await cache.load(key, () => fetcherRef.current(), false, {
          staleTime: every,
          retryDelay: every,
          expiresAt,
        });
        if (alive) setState({ cache, key, revision, data });
      } catch (error) {
        if (alive)
          setState({ cache, key, revision, data: cache.peek<T>(key), error });
      } finally {
        running = false;
        if (alive && document.visibilityState === 'visible')
          timer = window.setTimeout(
            onVisible,
            cache.refreshAfter(key, every, every, expiresAt) || every,
          );
      }
    };
    const onVisible = () => void run();
    void run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [cache, key, every, expiresAt, revision]);
  return state.cache === cache &&
    state.key === key &&
    state.revision === revision
    ? state
    : { data: key ? cache.peek<T>(key) : undefined };
}
