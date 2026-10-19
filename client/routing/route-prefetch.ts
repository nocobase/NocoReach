import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import type { RouteNavigationItem } from './route-navigation.js';
import { cachedRouteModule, hasForegroundRouteLoad } from './route-modules.js';
import { loadRouteResources, type RouteResources } from './route-resources.js';

const MAX_PREFETCH_RESOURCES = 24;
const MAX_COMPLETED_RESOURCES = 128;
// Idle speculation stays restricted to the existing high-traffic entries.
const IDLE_ROUTES = new Set([
  'growth-overview',
  'opportunity-library',
  'action-center',
  'result-list',
]);
// Code URLs only, shared across navigation; no user or page data is retained.
const completedResources = new Set<string>();
const RESOURCE_TIMEOUT_MS = 10_000;
type Connection = { saveData?: boolean; effectiveType?: string };
export type RoutePrefetchScheduler = (() => void) & {
  prioritize: (name: string) => void;
};

function existingResources(): Set<string> {
  return new Set(
    Array.from(
      document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
        'link[rel="stylesheet"][href], link[rel="modulepreload"][href], link[rel="preload"][href], script[src]',
      ),
      (element) => ('href' in element ? element.href : element.src),
    ),
  );
}

/** Resource hints warm HTTP cache without evaluating modules or touching Vite's CSS cache. */
export function scheduleRoutePrefetch(
  items: readonly RouteNavigationItem[],
  readResources: (
    signal: AbortSignal,
  ) => Promise<RouteResources> = loadRouteResources,
): RoutePrefetchScheduler {
  const routes = items.flatMap(
    function collect(item): RouteNavigationItem['route'][] {
      return [
        ...(item.route.source === 'application' && item.route.componentLoader
          ? [item.route]
          : []),
        ...item.children.flatMap(collect),
      ];
    },
  );
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  let resources: RouteResources | undefined;
  let reading = false;
  let idleSelected = false;
  let idleFiles: string[] = [];
  let intentFiles: string[] = [];
  let intent: string | undefined;
  let activeIntent: string | undefined;
  let cancelHint: (() => void) | undefined;
  let stopped = false;
  const clearScheduled = () => {
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    idle = undefined;
  };
  const schedule = (delay = 1500) => {
    if (stopped) return;
    clearScheduled();
    timer = setTimeout(() => {
      // An explicit menu intent should not wait for the browser's idle callback.
      if (!intent && !intentFiles.length && window.requestIdleCallback)
        idle = window.requestIdleCallback(() => {
          idle = undefined;
          void next();
        });
      else void next();
    }, delay);
  };
  const missing = (name: string, existing: Set<string>) => {
    const route = routes.find((route) => route.name === name);
    if (!route || cachedRouteModule(route.componentLoader!)) return [];
    return [...new Set(resources?.[name] ?? [])]
      .filter(
        (file) =>
          !completedResources.has(file) &&
          !existing.has(new URL(file, document.baseURI).href),
      )
      .slice(0, MAX_PREFETCH_RESOURCES);
  };
  const next = async () => {
    if (stopped || reading || cancelHint) return;
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
      reading = true;
      const timeout = setTimeout(() => controller.abort(), RESOURCE_TIMEOUT_MS);
      try {
        resources = await readResources(controller.signal);
      } catch {
        return;
      } finally {
        reading = false;
        clearTimeout(timeout);
      }
      if (stopped || controller.signal.aborted) return;
      // Recheck foreground/network policy after metadata I/O.
      schedule(0);
      return;
    }
    const existing = existingResources();
    if (intent) {
      activeIntent = intent;
      intentFiles = missing(intent, existing);
      intent = undefined;
    }
    if (!idleSelected) {
      idleSelected = true;
      // Empty/already-warmed pages do not consume the single idle-page allowance.
      idleFiles =
        routes
          .filter((route) => IDLE_ROUTES.has(route.name))
          .map((route) => missing(route.name, existing))
          .find((files) => files.length) ?? [];
    }
    if (!intentFiles.length) activeIntent = undefined;
    const queue = intentFiles.length ? intentFiles : idleFiles;
    let file: string | undefined;
    while ((file = queue.shift())) {
      if (
        !completedResources.has(file) &&
        !existing.has(new URL(file, document.baseURI).href)
      )
        break;
    }
    if (!file) {
      if (queue === intentFiles && idleFiles.length) schedule(150);
      return;
    }
    const resource = file;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.crossOrigin = 'anonymous';
    link.href = file;
    link.setAttribute('fetchpriority', 'low');
    const cleanup = () => {
      clearTimeout(timeout);
      link.onload = link.onerror = null;
      link.remove();
      cancelHint = undefined;
    };
    const finish = () => {
      cleanup();
      schedule(150);
    };
    const timeout = setTimeout(finish, RESOURCE_TIMEOUT_MS);
    link.onload = () => {
      completedResources.add(resource);
      if (completedResources.size > MAX_COMPLETED_RESOURCES)
        completedResources.delete(completedResources.values().next().value!);
      finish();
    };
    link.onerror = finish;
    cancelHint = () => {
      cleanup();
      queue.unshift(resource);
    };
    document.head.append(link);
  };
  if (routes.length) schedule();
  return Object.assign(
    () => {
      stopped = true;
      controller.abort();
      clearScheduled();
      cancelHint?.();
    },
    {
      prioritize(name: string) {
        if (
          stopped ||
          !routes.some(
            (route) =>
              route.name === name && !cachedRouteModule(route.componentLoader!),
          )
        )
          return;
        if (resources && !resources[name]?.length) return;
        if (
          name === intent ||
          (name === activeIntent && (intentFiles.length || cancelHint))
        )
          return;
        intent = name;
        // A stalled idle hint must not delay the newly targeted page. Actual navigation
        // remains independent of every speculative request, including this one.
        cancelHint?.();
        schedule(0);
      },
    },
  );
}

export function useRoutePrefetch(
  items: readonly RouteNavigationItem[],
): (name: string) => void {
  const { pathname } = useLocation();
  const schedulerRef = useRef<RoutePrefetchScheduler | undefined>(undefined);
  useEffect(() => {
    const current = scheduleRoutePrefetch(items);
    schedulerRef.current = current;
    return () => {
      current();
      schedulerRef.current = undefined;
    };
  }, [items, pathname]);
  return useCallback(
    (name: string) => schedulerRef.current?.prioritize(name),
    [],
  );
}
