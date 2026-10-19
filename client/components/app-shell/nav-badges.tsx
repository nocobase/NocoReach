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
  sources: NavSources | null;
};
const Context = createContext<Snapshot>({
  status: 'loading',
  counts: null,
  sources: null,
});
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

// Mounted inside MeProvider: its session/authorization key discards all badge state on identity changes.
export function NavBadgeProvider({ children }: PropsWithChildren) {
  const { me } = useMe();
  if (!me?.role)
    return (
      <Context.Provider
        value={{ status: 'loading', counts: null, sources: null }}
      >
        {children}
      </Context.Provider>
    );
  return <AuthorizedBadges>{children}</AuthorizedBadges>;
}
function AuthorizedBadges({ children }: PropsWithChildren) {
  const { project, error } = useProject();
  return (
    <ProjectBadges
      projectId={project && !error ? String(project.id) : null}
      error={!!error}
    >
      {children}
    </ProjectBadges>
  );
}
function ProjectBadges({
  projectId,
  error,
  children,
}: PropsWithChildren<{ projectId: string | null; error: boolean }>) {
  const { pathname } = useLocation();
  const [snapshot, setSnapshot] = useState<
    Snapshot & { projectId: string | null }
  >({
    projectId,
    status: 'loading',
    counts: null,
    sources: null,
  });
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
      // A refresh keeps ready counts on screen until the new ones arrive, so navigating does not blink the badges.
      setSnapshot((previous) =>
        previous.projectId === projectId && previous.status === 'ready'
          ? previous
          : { projectId, status: 'loading', counts: null, sources: null },
      );
      void api
        .action<NavSources>('nrHealth', 'connected', {
          method: 'POST',
          body: { projectId },
          unwrap: 'data',
          signal: controller.signal,
        })
        .then((sources) => {
          if (active && request === sequence)
            setSnapshot((previous) => ({ ...previous, sources }));
        })
        .catch(() => {
          if (active && request === sequence)
            setSnapshot((previous) => ({
              ...previous,
              sources: { '*': true },
            }));
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
  }, [projectId, pathname]);
  const current: Snapshot =
    projectId && snapshot.projectId === projectId
      ? snapshot
      : { status: error ? 'error' : 'loading', counts: null, sources: null };
  return <Context.Provider value={current}>{children}</Context.Provider>;
}
