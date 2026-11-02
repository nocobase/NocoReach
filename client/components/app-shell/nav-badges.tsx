/* eslint-disable react-refresh/only-export-components -- navigation context and its companion hooks */
import { $t } from '#i18n';
import {
  createContext,
  useContext,
  useEffect,
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
export const refreshNavBadges = () => window.dispatchEvent(new Event(EVENT));
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
export function NavBadgeProvider({ children }: PropsWithChildren) {
  const { me } = useMe();
  if (!me?.role)
    return (
      <Context.Provider
        value={{
          projectId: null,
          status: 'loading',
          counts: null,
          sources: null,
          fresh: false,
        }}
      >
        {children}
      </Context.Provider>
    );
  return <AuthorizedBadges userId={String(me.id)}>{children}</AuthorizedBadges>;
}
function AuthorizedBadges({
  userId,
  children,
}: PropsWithChildren<{ userId: string }>) {
  const { project, error } = useProject();
  return (
    <ProjectBadges
      projectId={project && !error ? String(project.id) : null}
      userId={userId}
      error={!!error}
    >
      {children}
    </ProjectBadges>
  );
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
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    let sequence = 0;
    const controllers = new Set<AbortController>();
    const load = async () => {
      const request = ++sequence;
      const controller = new AbortController();
      controllers.add(controller);
      // Defer publication; the project-tagged snapshot hides old counts without remounting the shell.
      await Promise.resolve();
      if (!active || request !== sequence) return;
      // A refresh keeps ready counts on screen until the new ones arrive, so navigating does not blink the badges, and
      // keeps the menu's sources whatever happened to the counts.
      setSnapshot((previous) =>
        previous.projectId !== projectId
          ? {
              projectId,
              status: 'loading',
              counts: null,
              sources: remembered(userId, projectId),
              fresh: false,
            }
          : previous.status === 'ready'
            ? previous
            : { ...previous, status: 'loading', counts: null },
      );
      void api
        .action<NavSources>('nrHealth', 'connected', {
          method: 'POST',
          body: { projectId },
          unwrap: 'data',
          signal: controller.signal,
        })
        .then((sources) => {
          if (!isSources(sources)) throw new Error('Invalid connected sources');
          if (!active || request !== sequence) return;
          remember(userId, projectId, sources);
          setSnapshot((previous) => ({ ...previous, sources, fresh: true }));
        })
        // Not read: every page shows, as before the menu followed the sources, unless this visit already read them;
        // then a failed refresh keeps that menu.
        .catch(() => {
          if (active && request === sequence)
            setSnapshot((previous) =>
              previous.fresh
                ? previous
                : { ...previous, sources: EVERYTHING, fresh: false },
            );
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
        if (active && request === sequence)
          setSnapshot((previous) => ({
            ...previous,
            status: 'ready',
            counts: value,
          }));
      } catch {
        if (active && request === sequence)
          setSnapshot((previous) => ({
            ...previous,
            status: 'error',
            counts: null,
          }));
      } finally {
        controllers.delete(controller);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    const refresh = () => void load();
    window.addEventListener(EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      ++sequence;
      controllers.forEach((controller) => controller.abort());
      window.clearInterval(timer);
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [projectId, userId, pathname]);
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
