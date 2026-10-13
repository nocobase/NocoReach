/* eslint-disable react-refresh/only-export-components -- provider and its existing companion cache hooks are intentionally colocated */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { PageSkeleton as SharedSkeleton } from '#components/reach/states';

// Both in-memory data and saved reports belong to the official cookie session and permission revision.
type Entry = { value?: unknown; at: number; pending?: Promise<unknown> };
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
  private active = false;
  private google = new Map<
    string,
    { projectId: string; listeners: Set<() => void> }
  >();
  subscribeGoogle(key: string, projectId: string, listener: () => void) {
    const scope = this.google.get(key) ?? {
      projectId,
      listeners: new Set<() => void>(),
    };
    this.google.set(key, scope);
    scope.listeners.add(listener);
    return () => {
      scope.listeners.delete(listener);
      // StrictMode immediately resubscribes; detach only genuinely abandoned requests.
      const entry = this.rows.get(key);
      if (entry?.pending)
        queueMicrotask(() => {
          if (!scope.listeners.size && this.rows.get(key) === entry)
            this.rows.delete(key);
        });
    };
  }
  private invalidateGoogleKeys(keys: string[]) {
    for (const key of keys) {
      this.rows.delete(key);
      try {
        if (this.ownsStorage()) sessionStorage.removeItem(PREFIX + key);
      } catch {
        /* storage is optional */
      }
    }
    for (const key of keys)
      for (const listener of this.google.get(key)?.listeners ?? []) listener();
  }
  invalidateGoogleReports(projectId: string) {
    const keys = new Set(
      [...this.google]
        .filter(([, scope]) => scope.projectId === String(projectId))
        .map(([key]) => key),
    );
    // Include snapshots restored from an earlier mount of this session.
    try {
      if (this.ownsStorage())
        for (const storedKey of Object.keys(sessionStorage)) {
          const key = storedKey.slice(PREFIX.length);
          if (
            storedKey.startsWith(PREFIX) &&
            ['search', 'search-countries', 'website', 'overview'].some(
              (report) => key.startsWith(`data-view:${report}:${projectId}:`),
            )
          )
            keys.add(key);
        }
    } catch {
      /* storage is optional */
    }
    this.invalidateGoogleKeys([...keys]);
  }
  revalidateVisibleGoogleReports() {
    this.invalidateGoogleKeys(
      [...this.google]
        .filter(([, scope]) => scope.listeners.size)
        .map(([key]) => key),
    );
  }
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
    // React StrictMode reactivates the same provider immediately; keep its valid pending read.
    queueMicrotask(() => {
      if (this.active) return;
      this.rows.clear();
      this.google.clear();
    });
    try {
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
  async load<T>(
    key: string,
    fetcher: () => Promise<T>,
    force = false,
  ): Promise<T> {
    const old = this.rows.get(key);
    if (old?.pending) return old.pending as Promise<T>;
    if (!force && old?.value !== undefined && Date.now() - old.at < 30000)
      return old.value as T;
    const entry: Entry = { value: old?.value, at: old?.at || 0 };
    const request = fetcher()
      .then((value) => {
        // Abandoned Google reads and responses that outlive the session cannot refill either cache.
        const scope = this.google.get(key);
        if (
          this.active &&
          this.rows.get(key) === entry &&
          (!scope || scope.listeners.size > 0)
        ) {
          entry.value = value;
          entry.at = Date.now();
          if (this.ownsStorage()) store(key, value, entry.at);
        }
        return value;
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
    let hidden = document.visibilityState === 'hidden';
    const onVisibility = () => {
      const nextHidden = document.visibilityState === 'hidden';
      if (hidden && !nextHidden) cache.revalidateVisibleGoogleReports();
      hidden = nextHidden;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      cache.dispose();
    };
  }, [cache]);
  return <Context.Provider value={cache}>{children}</Context.Provider>;
}
export function useWorkspaceCache() {
  const cache = useContext(Context);
  if (!cache) throw new Error('Workspace cache requires authenticated layout');
  return cache;
}
// Callers can use loading to require a fresh response before interpreting a connection state.
export function useFreshData<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  googleProjectId?: string | number,
): { data?: T; error?: unknown; loading: boolean } {
  const cache = useWorkspaceCache();
  const projectId =
    googleProjectId === undefined ? undefined : String(googleProjectId);
  const [state, setState] = useState<{
    cache: WorkspaceCache;
    key: string | null;
    data?: T;
    error?: unknown;
    loading: boolean;
  }>(() => ({
    cache,
    key,
    loading: Boolean(key),
    data: key ? cache.peek<T>(key) : undefined,
  }));
  useEffect(() => {
    if (!key) return;
    let active = true;
    let requestId = 0;
    const refresh = () => {
      const id = ++requestId;
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setState({
        cache,
        key,
        loading: true,
        data: cache.peek<T>(key),
      });
      cache.load(key, fetcher, true).then(
        (data) => {
          if (active && id === requestId)
            setState({ cache, key, data, loading: false });
        },
        (error: unknown) => {
          if (active && id === requestId)
            setState((state) => ({ ...state, error, loading: false }));
        },
      );
    };
    const unsubscribe =
      projectId === undefined
        ? undefined
        : cache.subscribeGoogle(key, projectId, refresh);
    refresh();
    return () => {
      active = false;
      unsubscribe?.();
    };
    // Callers supply inline fetchers; the cache key, rather than function identity, defines the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [cache, key, projectId]);
  if (!key) return { loading: false };
  return state.cache === cache && state.key === key
    ? state
    : {
        loading: true,
        data: cache.peek<T>(key),
      };
}
export function PageSkeleton({ title }: { title: string }) {
  return <SharedSkeleton title={title} />;
}
