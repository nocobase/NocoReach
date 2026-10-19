/* eslint-disable react-refresh/only-export-components -- provider and its existing companion cache hooks are intentionally colocated */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { TaskDraftProvider } from './task-detail/drafts.js';
import { PageSkeleton as SharedSkeleton } from '#components/reach/states';
import { NocoReachHttpError } from '#lib/nocoreach-api';

// Both in-memory data and saved reports belong to the official cookie session and permission revision.
type Entry = {
  value?: unknown;
  at: number;
  pending?: Promise<unknown>;
  error?: unknown;
  failedAt?: number;
};
type Freshness<T> = {
  staleTime?: number;
  retryDelay?: number;
  expiresAt?: (value: T) => number | undefined;
};
const PREFIX = 'nr-cache:',
  OWNER = 'nr-cache-owner',
  MAX_ENTRY = 1500000;
const kept = (key: string) => key.startsWith('data-view:');
function stored(key: string): { value: unknown; at: number } | undefined {
  if (!kept(key)) return undefined;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    const saved: unknown = raw ? JSON.parse(raw) : undefined;
    if (
      !saved ||
      typeof saved !== 'object' ||
      !('value' in saved) ||
      !('at' in saved) ||
      typeof saved.at !== 'number' ||
      !Number.isFinite(saved.at)
    )
      return undefined;
    return { value: saved.value, at: saved.at };
  } catch {
    return undefined;
  }
}
function store(key: string, value: unknown, at: number) {
  if (!kept(key)) return;
  let raw: string;
  try {
    raw = JSON.stringify({ value, at });
  } catch {
    return;
  }
  if (raw.length > MAX_ENTRY) return;
  for (let tries = 0; tries < 3; tries++) {
    try {
      sessionStorage.setItem(PREFIX + key, raw);
      return;
    } catch {
      const old = Object.keys(sessionStorage)
        .filter((key) => key.startsWith(PREFIX))
        .map((key) => ({ key, at: stored(key.slice(PREFIX.length))?.at || 0 }))
        .sort((a, b) => a.at - b.at)
        .slice(0, 5);
      if (!old.length) return;
      for (const entry of old) sessionStorage.removeItem(entry.key);
    }
  }
}
export function clearStoredCache() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  } catch {
    /* storage is optional */
  }
}
class WorkspaceCache {
  private rows = new Map<string, Entry>();
  private revisions = new Map<string, number>();
  private listeners = new Map<string, Set<() => void>>();
  private active = false;
  constructor(private readonly owner: string) {}
  activate() {
    this.active = true;
    try {
      if (sessionStorage.getItem(OWNER) !== this.owner) {
        clearStoredCache();
        sessionStorage.setItem(OWNER, this.owner);
      }
    } catch {
      /* storage is optional */
    }
  }
  dispose() {
    this.active = false;
    this.rows.clear();
    this.revisions.clear();
    try {
      // A previous provider's cleanup must not erase its successor's stored reports.
      if (sessionStorage.getItem(OWNER) === this.owner) {
        clearStoredCache();
        sessionStorage.removeItem(OWNER);
      }
    } catch {
      /* storage is optional */
    }
  }
  private ownsStorage() {
    try {
      return sessionStorage.getItem(OWNER) === this.owner;
    } catch {
      return false;
    }
  }
  peek<T>(key: string): T | undefined {
    const row = this.rows.get(key);
    if (row?.value !== undefined) return row.value as T;
    const saved = this.ownsStorage() ? stored(key) : undefined;
    if (saved) {
      this.rows.set(key, { value: saved.value, at: saved.at });
      return saved.value as T;
    }
    return undefined;
  }
  replace<T>(key: string, value: T): void {
    if (!this.active) return;
    const at = Date.now();
    // Replacing the entry also fences any earlier pending read from refilling it.
    this.rows.set(key, { value, at });
    if (this.ownsStorage()) store(key, value, at);
  }
  revision(key: string | null): number {
    return key ? (this.revisions.get(key) ?? 0) : 0;
  }
  subscribe(key: string | null, listener: () => void) {
    if (!key) return () => {};
    const listeners = this.listeners.get(key) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(key);
    };
  }
  invalidate(
    matches: (key: string) => boolean,
    { keepValue = false }: { keepValue?: boolean } = {},
  ): void {
    if (!this.active) return;
    const keys = new Set([...this.rows.keys(), ...this.listeners.keys()]);
    if (this.ownsStorage()) {
      try {
        for (const key of Object.keys(sessionStorage)) {
          if (!key.startsWith(PREFIX) || !matches(key.slice(PREFIX.length)))
            continue;
          keys.add(key.slice(PREFIX.length));
          sessionStorage.removeItem(key);
        }
      } catch {
        /* storage is optional */
      }
    }
    for (const key of keys) {
      if (!matches(key)) continue;
      // Replace the entry to fence older reads, including background refreshes.
      // Business mutations may retain the visible snapshot while revalidating;
      // permission/session changes and existing invalidations still clear it.
      const value = keepValue ? this.rows.get(key)?.value : undefined;
      if (value !== undefined) this.rows.set(key, { value, at: 0 });
      else this.rows.delete(key);
      this.revisions.set(key, this.revision(key) + 1);
      this.listeners.get(key)?.forEach((listener) => listener());
    }
  }
  refreshAfter<T>(
    key: string,
    staleTime: number,
    retryDelay = 0,
    expiresAt?: (value: T) => number | undefined,
  ): number {
    const row = this.rows.get(key);
    const expiry =
      row?.value !== undefined
        ? Math.min(row.at + staleTime, expiresAt?.(row.value as T) ?? Infinity)
        : 0;
    return Math.max(
      0,
      expiry - Date.now(),
      (row?.failedAt !== undefined ? row.failedAt + retryDelay : 0) -
        Date.now(),
    );
  }
  async load<T>(
    key: string,
    fetcher: () => Promise<T>,
    force = false,
    { staleTime = 30000, retryDelay = 0, expiresAt }: Freshness<T> = {},
  ): Promise<T> {
    this.peek(key);
    const old = this.rows.get(key);
    if (old?.pending) return old.pending as Promise<T>;
    if (
      !force &&
      old?.failedAt !== undefined &&
      Date.now() - old.failedAt < retryDelay
    )
      throw old.error;
    if (
      !force &&
      old?.value !== undefined &&
      Date.now() - old.at < staleTime &&
      Date.now() < (expiresAt?.(old.value as T) ?? Infinity)
    )
      return old.value as T;
    const entry: Entry = { value: old?.value, at: old?.at || 0 };
    const request = fetcher()
      .then((value) => {
        // A response that outlives logout or permission invalidation cannot refill either cache.
        if (this.active && this.rows.get(key) === entry) {
          entry.value = value;
          entry.at = Date.now();
          if (this.ownsStorage()) store(key, value, entry.at);
        }
        return value;
      })
      .catch((error: unknown) => {
        entry.error = error;
        entry.failedAt = Date.now();
        if (
          error instanceof NocoReachHttpError &&
          [401, 403, 404].includes(error.status) &&
          this.active &&
          this.rows.get(key) === entry
        ) {
          entry.value = undefined;
          entry.at = 0;
          if (this.ownsStorage()) {
            try {
              sessionStorage.removeItem(PREFIX + key);
            } catch {
              /* storage is optional */
            }
          }
        }
        throw error;
      })
      .finally(() => {
        entry.pending = undefined;
      });
    entry.pending = request;
    this.rows.set(key, entry);
    return request;
  }
}
const Context = createContext<WorkspaceCache | null>(null);
export function WorkspaceCacheProvider({ children }: PropsWithChildren) {
  const { session, isPending } = useAuthentication();
  const revision = useAuthorizationRevision();
  if (isPending || !session) return null;
  const owner = JSON.stringify([session.user.id, session.session.id, revision]);
  return (
    <SessionCache key={owner} owner={owner}>
      {children}
    </SessionCache>
  );
}
function SessionCache({
  children,
  owner,
}: PropsWithChildren<{ owner: string }>) {
  const [cache] = useState(() => new WorkspaceCache(owner));
  useEffect(() => {
    cache.activate();
    const refreshInsights = () =>
      cache.invalidate((key) => key.startsWith('insights-overview:'), {
        keepValue: true,
      });
    window.addEventListener('nocoreach:badges', refreshInsights);
    return () => {
      window.removeEventListener('nocoreach:badges', refreshInsights);
      cache.dispose();
    };
  }, [cache]);
  return (
    <Context.Provider value={cache}>
      <TaskDraftProvider>{children}</TaskDraftProvider>
    </Context.Provider>
  );
}
export function useWorkspaceCache() {
  const cache = useContext(Context);
  if (!cache) throw new Error('Workspace cache requires authenticated layout');
  return cache;
}
export function useWorkspaceCacheRevision(key: string | null) {
  const cache = useWorkspaceCache();
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribe(key, listener),
    [cache, key],
  );
  return useSyncExternalStore(
    subscribe,
    () => cache.revision(key),
    () => 0,
  );
}
// Reports may show a previous response while refreshing, but only within the same session and permission revision.
export function useFreshData<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  { staleTime = 0, retryDelay = 0, expiresAt }: Freshness<T> = {},
): {
  data?: T;
  error?: unknown;
  loading: boolean;
  reload: () => void;
  replace: (data: T) => void;
} {
  const cache = useWorkspaceCache();
  const revision = useWorkspaceCacheRevision(key);
  const sequenceRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(attempt);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const [state, setState] = useState<{
    cache: WorkspaceCache;
    key: string | null;
    revision: number;
    data?: T;
    error?: unknown;
    loading: boolean;
  }>(() => ({
    cache,
    key,
    revision,
    data: key ? cache.peek<T>(key) : undefined,
    loading: !!key,
  }));
  useEffect(() => {
    if (!key) return;
    let active = true;
    const requestSequence = ++sequenceRef.current;
    // Synchronize the local snapshot with an explicitly selected external cache/key before its refresh resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect, @eslint-react/set-state-in-effect
    setState({ cache, key, revision, data: cache.peek<T>(key), loading: true });
    const force = attemptRef.current !== attempt;
    attemptRef.current = attempt;
    cache.load(key, fetcher, force, { staleTime, retryDelay, expiresAt }).then(
      (data) => {
        if (active && requestSequence === sequenceRef.current)
          setState({ cache, key, revision, data, loading: false });
      },
      (error: unknown) => {
        if (active && requestSequence === sequenceRef.current)
          setState({
            cache,
            key,
            revision,
            data: cache.peek<T>(key),
            error,
            loading: false,
          });
      },
    );
    return () => {
      active = false;
    };
    // Callers supply inline fetchers; the cache key, rather than function identity, defines the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [cache, key, attempt, staleTime, retryDelay, expiresAt, revision]);
  const replace = useCallback(
    (data: T) => {
      if (!key) return;
      ++sequenceRef.current;
      cache.replace(key, data);
      setState({ cache, key, revision, data, loading: false });
    },
    [cache, key, revision],
  );
  // A null key pauses a report while its date range is edited; keep that
  // snapshot only within the same authenticated cache, as existing callers expect.
  const current =
    state.cache === cache &&
    (!key || (state.key === key && state.revision === revision))
      ? state
      : { data: key ? cache.peek<T>(key) : undefined, loading: !!key };
  return { ...current, loading: !!key && current.loading, reload, replace };
}
export function PageSkeleton({ title }: { title: string }) {
  return <SharedSkeleton title={title} />;
}
