import { useEffect } from 'react';
import { useLocation } from 'react-router';
import type { RouteNavigationItem } from './route-navigation.js';
import {
  cachedRouteModule,
  hasForegroundRouteLoad,
  loadRouteModule,
} from './route-modules.js';

type Connection = { saveData?: boolean; effectiveType?: string };

/** The template loads on navigation only; warm permitted menu code without mounting pages. */
export function scheduleRoutePrefetch(
  items: readonly RouteNavigationItem[],
): () => void {
  const loaders = [
    ...new Set(
      items.flatMap(function collect(item): NonNullable<
        RouteNavigationItem['route']['componentLoader']
      >[] {
        return [
          ...(item.route.componentLoader ? [item.route.componentLoader] : []),
          ...item.children.flatMap(collect),
        ];
      }),
    ),
  ].filter((loader) => !cachedRouteModule(loader));
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let idle: number | undefined;
  const schedule = () => {
    if (stopped || !loaders.length) return;
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
    const loader = loaders.shift();
    if (loader && !cachedRouteModule(loader)) {
      try {
        await loadRouteModule(loader, true);
      } catch {
        /* A later navigation can retry. */
      }
    }
    schedule();
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}

export function useRoutePrefetch(items: readonly RouteNavigationItem[]): void {
  const { pathname } = useLocation();
  useEffect(() => scheduleRoutePrefetch(items), [items, pathname]);
}
