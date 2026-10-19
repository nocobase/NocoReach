import { useEffect } from 'react';
import { useLocation } from 'react-router';
import type { RouteNavigationItem } from './route-navigation.js';
import { cachedRouteModule, hasForegroundRouteLoad } from './route-modules.js';
import { loadRouteResources, type RouteResources } from './route-resources.js';

const MAX_PREFETCH_ROUTES = 3;
const MAX_PREFETCH_RESOURCES = 24;
const MAX_COMPLETED_RESOURCES = 128;
// Code URLs only, shared across navigation; no user or page data is retained.
const completedResources = new Set<string>();
const RESOURCE_TIMEOUT_MS = 10_000;
type Connection = { saveData?: boolean; effectiveType?: string };

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
  const files: string[] = [];
  let cancelHint: (() => void) | undefined;
  let stopped = false;
  const schedule = (delay = 1500) => {
    if (stopped) return;
    timer = setTimeout(() => {
      if (window.requestIdleCallback)
        idle = window.requestIdleCallback(() => {
          void next();
        });
      else void next();
    }, delay);
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
      // Count only missing resources against the budget. Walk pages round-robin
      // so a large dependency graph cannot crowd out the other page entries.
      const existing = existingResources();
      const queues = routes
        .filter((route) => !cachedRouteModule(route.componentLoader!))
        .filter((route) => resources![route.name]?.length)
        .slice(0, MAX_PREFETCH_ROUTES)
        .map((route) => [...resources![route.name]]);
      const selected = new Set<string>();
      while (
        queues.some((queue) => queue.length) &&
        files.length < MAX_PREFETCH_RESOURCES
      ) {
        for (const queue of queues) {
          let file: string | undefined;
          while ((file = queue.shift())) {
            if (
              selected.has(file) ||
              completedResources.has(file) ||
              existing.has(new URL(file, document.baseURI).href)
            )
              continue;
            selected.add(file);
            files.push(file);
            break;
          }
          if (files.length === MAX_PREFETCH_RESOURCES) break;
        }
      }
      // Yield again and recheck foreground/network policy, without another idle delay.
      if (files.length) schedule(0);
      return;
    }
    // Navigation may have loaded a queued URL since metadata arrived. Skip it
    // in this turn instead of spending an idle delay for each shared dependency.
    const existing = existingResources();
    let file: string | undefined;
    while ((file = files.shift())) {
      if (
        !completedResources.has(file) &&
        !existing.has(new URL(file, document.baseURI).href)
      )
        break;
    }
    if (!file) return;
    const resource = file;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    // Match Vite's module/style request credentials so the browser can reuse
    // the prefetched response instead of downloading it again on navigation.
    link.crossOrigin = 'anonymous';
    link.href = file;
    link.setAttribute('fetchpriority', 'low');
    const finish = () => {
      clearTimeout(timeout);
      link.onload = link.onerror = null;
      link.remove();
      cancelHint = undefined;
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
