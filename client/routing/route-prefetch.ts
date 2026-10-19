import { useEffect } from 'react';
import { useLocation } from 'react-router';
import type { RouteNavigationItem } from './route-navigation.js';
import { cachedRouteModule, hasForegroundRouteLoad } from './route-modules.js';
import { loadRouteResources, type RouteResources } from './route-resources.js';

const MAX_PREFETCH_ROUTES = 3;
const RESOURCE_TIMEOUT_MS = 10_000;
type Connection = { saveData?: boolean; effectiveType?: string };

/** Resource hints warm HTTP cache without evaluating modules or touching Vite's CSS cache. */
export function scheduleRoutePrefetch(
  items: readonly RouteNavigationItem[],
  readResources: (
    signal: AbortSignal,
  ) => Promise<RouteResources> = loadRouteResources,
): () => void {
  const routes = items.flatMap(
    function collect(item): RouteNavigationItem['route'][] {
      return [
        ...(item.route.source === 'application' &&
        item.route.componentLoader &&
        !cachedRouteModule(item.route.componentLoader)
          ? [item.route]
          : []),
        ...item.children.flatMap(collect),
      ];
    },
  );
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let idle: number | undefined;
  let resources: RouteResources | undefined;
  let files: string[] = [];
  let cancelHint: (() => void) | undefined;
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      if (window.requestIdleCallback)
        idle = window.requestIdleCallback(() => {
          void next();
        });
      else void next();
    }, 1500);
  };
  const next = async () => {
    if (stopped) return;
    const connection = (navigator as Navigator & { connection?: Connection })
      .connection;
    if (
      document.visibilityState === 'hidden' ||
      !navigator.onLine ||
      connection?.saveData ||
      /(^|-)2g$/.test(connection?.effectiveType ?? '') ||
      connection?.effectiveType === '3g' ||
      document.readyState !== 'complete' ||
      hasForegroundRouteLoad()
    ) {
      schedule();
      return;
    }
    if (!resources) {
      const timeout = setTimeout(() => controller.abort(), RESOURCE_TIMEOUT_MS);
      try {
        resources = await readResources(controller.signal);
      } catch {
        return;
      } finally {
        clearTimeout(timeout);
      }
      if (stopped || controller.signal.aborted) return;
      files = [
        ...new Set(
          routes
            .filter((route) => resources![route.name]?.length)
            .slice(0, MAX_PREFETCH_ROUTES)
            .flatMap((route) => resources![route.name]),
        ),
      ];
      // Recheck foreground activity and network policy after metadata arrives.
      if (files.length) schedule();
      return;
    }
    const file = files.shift();
    if (!file) return;
    // Existing foreground styles/modulepreloads need no speculative duplicate.
    if (
      Array.from(
        document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
          'link[href], script[src]',
        ),
      ).some(
        (element) => ('href' in element ? element.href : element.src) === file,
      )
    ) {
      schedule();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = file;
    link.setAttribute('fetchpriority', 'low');
    const finish = () => {
      clearTimeout(timeout);
      link.onload = link.onerror = null;
      link.remove();
      cancelHint = undefined;
      schedule();
    };
    const timeout = setTimeout(finish, RESOURCE_TIMEOUT_MS);
    link.onload = link.onerror = finish;
    cancelHint = () => {
      clearTimeout(timeout);
      link.onload = link.onerror = null;
      link.remove();
    };
    document.head.append(link);
  };
  if (routes.length) schedule();
  return () => {
    stopped = true;
    controller.abort();
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    cancelHint?.();
  };
}

export function useRoutePrefetch(items: readonly RouteNavigationItem[]): void {
  const { pathname } = useLocation();
  useEffect(() => scheduleRoutePrefetch(items), [items, pathname]);
}
