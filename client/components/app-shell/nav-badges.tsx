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
import { useMe, type Me } from '#pages/me';

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

// Keep the provider and its children stable while membership and projects initialize.
export function NavBadgeProvider({ children }: PropsWithChildren) {
  const { me } = useMe();
  const { project, error } = useProject();
  const projectId =
    me?.role && project && !error ? String(project.id) : undefined;
  const { pathname } = useLocation();
  const [state, setState] = useState<{
    member?: Me;
    projectId?: string;
    snapshot: Snapshot;
  }>();
  const empty: Snapshot = {
    status: error ? 'error' : 'loading',
    counts: null,
    sources: null,
  };
  const snapshot =
    state?.member === me && state?.projectId === projectId
      ? (state?.snapshot ?? empty)
      : empty;
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const setSnapshot = (update: (previous: Snapshot) => Snapshot) =>
      setState((previous) => ({
        member: me,
        projectId,
        snapshot: update(
          previous && previous.member === me && previous.projectId === projectId
            ? previous.snapshot
            : { status: 'loading', counts: null, sources: null },
        ),
      }));
    let sequence = 0;
    const controllers = new Set<AbortController>();
    const load = async () => {
      const request = ++sequence;
      const controller = new AbortController();
      controllers.add(controller);
      // Defer publication; the render above already hides results from another member or project.
      await Promise.resolve();
      if (!active || request !== sequence) return;
      // A refresh keeps ready counts on screen until the new ones arrive, so navigating does not blink the badges.
      setSnapshot((previous) =>
        previous.status === 'ready'
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
  }, [projectId, pathname, me]);
  return <Context.Provider value={snapshot}>{children}</Context.Provider>;
}
