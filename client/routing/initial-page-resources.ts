import { initialPageName } from '../../shared/startup-pages.js';
import { loadRouteResources } from './route-resources.js';

/** Download only the current URL's public code alongside identity preparation.
 * No imports, business reads or permission decisions happen here. */
export function preloadInitialPageResources(base: string): () => void {
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
  };
  const timeout = setTimeout(stop, 10_000);
  window.addEventListener('pagehide', stop, { once: true });
  void loadRouteResources(controller.signal)
    .then((resources) => {
      if (controller.signal.aborted) return;
      const existing = new Set(
        Array.from(
          document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
            'script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href], link[rel="preload"][href]',
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
        link.rel = script ? 'modulepreload' : 'preload';
        link.setAttribute('fetchpriority', 'low');
        // Match Vite's eventual module/stylesheet requests so the preload is reused.
        link.crossOrigin = '';
        if (!script) link.setAttribute('as', 'style');
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
