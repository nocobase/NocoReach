import { initialPageName } from '../../shared/startup-pages.js';
import { loadRouteResources } from './route-resources.js';

let stopInitialResources: (() => void) | undefined;

/** Foreground imports must not wait for an outstanding speculative HTTP request. */
export function stopInitialPageResources(): void {
  stopInitialResources?.();
}

/** Download only the current URL's public code alongside identity preparation.
 * No imports, business reads or permission decisions happen here. */
export function preloadInitialPageResources(base: string): () => void {
  stopInitialPageResources();
  const name = initialPageName(base, window.location.pathname);
  if (!name) return () => undefined;
  const controller = new AbortController();
  const pending = new Set<HTMLLinkElement>();
  const stop = () => {
    controller.abort();
    clearTimeout(timeout);
    window.removeEventListener('pagehide', stop);
    for (const link of pending) link.remove();
    pending.clear();
    if (stopInitialResources === stop) stopInitialResources = undefined;
  };
  const timeout = setTimeout(stop, 10_000);
  stopInitialResources = stop;
  window.addEventListener('pagehide', stop, { once: true });
  void loadRouteResources(controller.signal)
    .then((resources) => {
      if (controller.signal.aborted) return;
      const existing = new Set(
        Array.from(
          document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
            'script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href], link[rel="preload"][href], link[rel="prefetch"][href]',
          ),
          (element) => ('src' in element ? element.src : element.href),
        ),
      );
      for (const resource of [...new Set(resources[name] ?? [])].slice(0, 64)) {
        const url = new URL(resource, document.baseURI);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          existing.has(url.href)
        )
          continue;
        const script = url.pathname.endsWith('.js');
        if (!script && !url.pathname.endsWith('.css')) continue;
        const link = document.createElement('link');
        // Warm only the HTTP cache. A failed or stalled modulepreload poisons
        // the document's module map and can prevent the later import from retrying.
        link.rel = 'prefetch';
        link.setAttribute('fetchpriority', 'low');
        // Match Vite's eventual module/stylesheet requests for cache reuse.
        link.crossOrigin = 'anonymous';
        link.href = url.href;
        link.onload = () => {
          pending.delete(link);
          if (!pending.size) stop();
        };
        link.onerror = () => {
          pending.delete(link);
          link.remove();
          if (!pending.size) stop();
        };
        pending.add(link);
        document.head.append(link);
      }
      if (!pending.size) stop();
    })
    .catch(stop);
  return stop;
}
