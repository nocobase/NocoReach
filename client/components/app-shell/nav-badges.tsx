/* eslint-disable react-refresh/only-export-components -- navigation context and its companion hooks */
import { $t } from '#i18n';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useLocation } from 'react-router';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { useProject } from '#pages/reach-data';
import { useMe } from '#pages/me';

export type Counts = { insights: number; opportunities: number; tasks: number };
export type BadgeStatus = 'loading' | 'ready' | 'error';
export type NavSources = Record<string, boolean>;
type Snapshot = {
  status: BadgeStatus;
  counts: Counts | null;
  /** Which sources are connected (`nrHealth:connected`): null until known, `{ '*': true }` when they could not be read. */
  sources: NavSources | null;
  /** The sources were read in this visit, not remembered from the last one. */
  fresh: boolean;
};
const Context = createContext<Snapshot & { projectId: string | null }>({
  projectId: null,
  status: 'loading',
  counts: null,
  sources: null,
  fresh: false,
});
const EVERYTHING: NavSources = { '*': true };
// The last list each user saw for a project, so a reload draws the same menu at once instead of adding pages to it.
const storageKey = (userId: string, projectId: string) =>
  `nocoreach:nav-sources:${userId}:${projectId}`;
function remembered(
  userId: string,
  projectId: string | null,
): NavSources | null {
  if (!projectId) return null;
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(storageKey(userId, projectId)) ?? 'null',
    );
    return isSources(value) ? value : null;
  } catch {
    return null;
  }
}
function remember(userId: string, projectId: string, sources: NavSources) {
  try {
    window.localStorage.setItem(
      storageKey(userId, projectId),
      JSON.stringify(sources),
    );
  } catch {
    // Storage full or disabled: the next visit reads the list again.
  }
}
const isSources = (value: unknown): value is NavSources =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value as object).every((v) => typeof v === 'boolean');
const EVENT = 'nocoreach:badges';
const SOURCES_EVENT = 'nocoreach:nav-sources';
/** After a write that changes the counts or the connected sources: reads both again at once. */
export const refreshNavBadges = () => window.dispatchEvent(new Event(EVENT));
/**
 * After a write outside the connection forms that changes what `nrHealth:connected` checks (saved, tracked or followed
 * keywords): reads the sources again at once, without the counts.
 */
export const refreshNavSources = () =>
  window.dispatchEvent(new Event(SOURCES_EVENT));
// Both are read again every minute; a focus reads the sources only when the last read settled longer ago than that.
const EVERY_MINUTE = 60_000;
// Counts read more recently than this are not read again on navigation or focus.
const COUNTS_FRESH = 15_000;
/**
 * One endpoint's reads for the mounted project. `now` follows a write: it starts a read at once and fences off any read
 * in flight, which began before the write, so that answer is never published whether it arrives first or last. `soon`
 * is an ordinary trigger (navigation, focus, the interval): it joins a read in flight and skips one that settled less
 * than `fresh` ms ago, whatever its outcome. A read in flight for a minute is presumed lost, so `soon` starts another.
 * `read` publishes only while `current()` holds; `stop` (unmount, project or user change) ends that for every read.
 */
function reads(read: (current: () => boolean) => Promise<void>) {
  let sequence = 0,
    loading = false,
    startedAt = 0,
    settledAt = -Infinity;
  const now = () => {
    const request = ++sequence;
    loading = true;
    startedAt = Date.now();
    void read(() => request === sequence)
      .catch(() => undefined)
      .finally(() => {
        if (request !== sequence) return;
        loading = false;
        settledAt = Date.now();
      });
  };
  return {
    now,
    soon(fresh: number) {
      const at = Date.now();
      if (loading ? at - startedAt < EVERY_MINUTE : at - settledAt < fresh)
        return;
      now();
    },
    stop() {
      ++sequence;
    },
  };
}
export const badgeLabels: Record<keyof Counts, (n: number) => string> = {
  insights: (n) => $t('navBadges.insightsNeed', { 0: n }),
  opportunities: (n) => $t('navBadges.pendingOpportunities', { 0: n }),
  tasks: (n) => $t('navBadges.tasksNeed', { 0: n }),
};
export function useNavBadge(key?: unknown): {
  count: number | null;
  label: string;
  status: BadgeStatus;
} {
  const snapshot = useContext(Context);
  const k =
    key === 'insights' || key === 'opportunities' || key === 'tasks'
      ? key
      : null;
  const count = k && snapshot.status === 'ready' ? snapshot.counts![k] : null;
  return {
    count,
    label: k && count ? badgeLabels[k](count) : '',
    status: snapshot.status,
  };
}
export function useNavSources(): NavSources | null {
  return useContext(Context).sources;
}
export function useNavSourcesState(): {
  projectId: string | null;
  sources: NavSources | null;
  fresh: boolean;
} {
  const { projectId, sources, fresh } = useContext(Context);
  return { projectId, sources, fresh };
}

// Mounted inside MeProvider: its session/authorization key discards all badge state on identity changes.
// The shell below stays in one place in the tree whether or not the member is known yet: wrapping it in another
// component once `nrMembers:me` answered remounted every page and sent all their reads again (2026-11-05).
export function NavBadgeProvider({ children }: PropsWithChildren) {
  const { me } = useMe();
  const userId = me?.role ? String(me.id) : null;
  const [project, setProject] = useState<CurrentProject>(NO_PROJECT);
  return (
    <>
      {userId ? <ProjectOfMember onChange={setProject} /> : null}
      <ProjectBadges
        projectId={userId ? project.projectId : null}
        userId={userId ?? ''}
        error={userId ? project.error : false}
      >
        {children}
      </ProjectBadges>
    </>
  );
}
type CurrentProject = { projectId: string | null; error: boolean };
const NO_PROJECT: CurrentProject = { projectId: null, error: false };
// The project chosen in the header, read only for a member.
function ProjectOfMember({
  onChange,
}: {
  onChange: (project: CurrentProject) => void;
}) {
  const { project, error } = useProject();
  const projectId = project && !error ? String(project.id) : null,
    failed = !!error;
  useEffect(() => {
    onChange({ projectId, error: failed });
  }, [onChange, projectId, failed]);
  return null;
}
function ProjectBadges({
  projectId,
  userId,
  error,
  children,
}: PropsWithChildren<{
  projectId: string | null;
  userId: string;
  error: boolean;
}>) {
  const { pathname } = useLocation();
  const [snapshot, setSnapshot] = useState<
    Snapshot & { projectId: string | null }
  >(() => ({
    projectId,
    status: 'loading',
    counts: null,
    sources: remembered(userId, projectId),
    fresh: false,
  }));
  // Set by the effect below for the mounted project; a route change calls it.
  const navigatedRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    // This project's snapshot: another project's is replaced first, so neither read can publish into it.
    const own = (
      previous: Snapshot & { projectId: string | null },
    ): Snapshot & { projectId: string | null } =>
      previous.projectId === projectId
        ? previous
        : {
            projectId,
            status: 'loading',
            counts: null,
            sources: remembered(userId, projectId),
            fresh: false,
          };
    const counts = reads(async (current) => {
      // Defer publication; the project-tagged snapshot hides old counts without remounting the shell.
      await Promise.resolve();
      if (!current()) return;
      // A refresh keeps ready counts on screen until the new ones arrive, so it does not blink the badges.
      setSnapshot((previous) => {
        const base = own(previous);
        return base.status === 'ready'
          ? base
          : { ...base, status: 'loading', counts: null };
      });
      try {
        const value = await api.action<Counts>('nrStrategy', 'badges', {
          method: 'POST',
          body: { projectId },
          unwrap: 'data',
          signal: controller.signal,
        });
        if (
          !value ||
          !(['insights', 'opportunities', 'tasks'] as const).every(
            (key) => Number.isSafeInteger(value[key]) && value[key] >= 0,
          )
        )
          throw new Error('Invalid navigation counts');
        if (current())
          setSnapshot((previous) => ({
            ...previous,
            status: 'ready',
            counts: value,
          }));
      } catch {
        if (current())
          setSnapshot((previous) => ({
            ...previous,
            status: 'error',
            counts: null,
          }));
      }
    });
    // The menu's sources are kept whatever happens to the counts.
    const sources = reads(async (current) => {
      try {
        const value = await api.action<NavSources>('nrHealth', 'connected', {
          method: 'POST',
          body: { projectId },
          unwrap: 'data',
          signal: controller.signal,
        });
        if (!isSources(value)) throw new Error('Invalid connected sources');
        if (!current()) return;
        remember(userId, projectId, value);
        setSnapshot((previous) => ({
          ...own(previous),
          sources: value,
          fresh: true,
        }));
      } catch {
        // Not read: every page shows, as before the menu followed the sources, unless this visit already read them;
        // then a failed refresh keeps that menu.
        if (current())
          setSnapshot((previous) => {
            const base = own(previous);
            return base.fresh
              ? base
              : { ...base, sources: EVERYTHING, fresh: false };
          });
      }
    });
    // Mount, project or user change, and refreshNavBadges() after a write: both at once.
    const refresh = () => {
      counts.now();
      sources.now();
    };
    const refreshSources = () => sources.now();
    // The sources change only through writes, which send the events above, and through another tab, user, the CLI or
    // the API, which the minute's read catches; navigation never reads them. Focus does after a minute, since a hidden
    // tab's interval is throttled. The counts also change with the server's own work (runs, analysis), so navigation
    // and focus read them once they are 15 s old.
    const tick = () => {
      counts.soon(0);
      sources.soon(0);
    };
    const focused = () => {
      counts.soon(COUNTS_FRESH);
      sources.soon(EVERY_MINUTE);
    };
    navigatedRef.current = () => counts.soon(COUNTS_FRESH);
    refresh();
    const timer = window.setInterval(tick, EVERY_MINUTE);
    window.addEventListener(EVENT, refresh);
    window.addEventListener(SOURCES_EVENT, refreshSources);
    window.addEventListener('focus', focused);
    return () => {
      navigatedRef.current = null;
      counts.stop();
      sources.stop();
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener(SOURCES_EVENT, refreshSources);
      window.removeEventListener('focus', focused);
    };
  }, [projectId, userId]);
  // After the effect above, so on mount its reads are already in flight and this joins them.
  useEffect(() => {
    navigatedRef.current?.();
  }, [pathname]);
  const current: Snapshot & { projectId: string | null } =
    projectId && snapshot.projectId === projectId
      ? snapshot
      : {
          projectId,
          status: error ? 'error' : 'loading',
          counts: null,
          // A project that cannot be read leaves the sources unknown too: every page shows.
          sources: error ? EVERYTHING : remembered(userId, projectId),
          fresh: false,
        };
  return <Context.Provider value={current}>{children}</Context.Provider>;
}
