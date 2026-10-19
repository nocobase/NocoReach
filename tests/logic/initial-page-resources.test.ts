import { afterEach, expect, it, vi } from 'vitest';
import { initialPageName } from '../../shared/startup-pages.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.head
    .querySelectorAll('link,meta[name="nocoreach-route-prefetch"]')
    .forEach((node) => node.remove());
  history.replaceState(null, '', '/');
});

async function setup(
  pathname = '/nested/home',
  data: Record<string, string[]> = {
    'growth-overview': ['insights.js', 'insights.css'],
    'action-center': ['tasks.js'],
  },
) {
  vi.resetModules();
  history.replaceState(null, '', pathname);
  const meta = document.createElement('meta');
  meta.name = 'nocoreach-route-prefetch';
  meta.content = '/nested/assets/route-prefetch-test.json';
  document.head.append(meta);
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _options?: RequestInit) =>
      new Response(JSON.stringify(data)),
  );
  vi.stubGlobal('fetch', fetch);
  const { preloadInitialPageResources } =
    await import('../../client/routing/initial-page-resources.js');
  return { fetch, preload: () => preloadInitialPageResources('/nested') };
}

it('recognizes only exact application entry URLs, including nested mounts and the landing redirect', () => {
  expect(initialPageName('/nested/', '/nested/')).toBe('growth-overview');
  expect(initialPageName('/nested', '/nested/actions/')).toBe('action-center');
  expect(initialPageName('', '/opportunities')).toBe('opportunity-library');
  expect(initialPageName('/nested', '/nested/actions/123')).toBeUndefined();
  expect(initialPageName('/nested', '/nested/login')).toBeUndefined();
  expect(initialPageName('/nested', '/nested-other/home')).toBeUndefined();
});

it('preloads only the requested page, without importing code, applying styles or fetching business data', async () => {
  const { fetch, preload } = await setup();
  const stop = preload();
  await vi.waitFor(() =>
    expect(document.querySelectorAll('link')).toHaveLength(2),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('link[fetchpriority="low"]')).toHaveLength(
    2,
  );
  expect(fetch.mock.calls[0][0]).toBe(
    '/nested/assets/route-prefetch-test.json',
  );
  expect(
    document.querySelector('link[rel="modulepreload"]')?.getAttribute('href'),
  ).toContain('/nested/assets/insights.js');
  expect(
    document.querySelector('link[rel="preload"][as="style"]'),
  ).not.toBeNull();
  expect(
    document.querySelector(
      'link[rel="stylesheet"],script[src*="insights"],link[href*="tasks"]',
    ),
  ).toBeNull();
  stop();
  expect(document.querySelectorAll('link')).toHaveLength(0);
});

it('keeps completed hints, removes failures, deduplicates resources and ignores non-assets', async () => {
  const { preload } = await setup('/nested/home', {
    'growth-overview': [
      'insights.js',
      'insights.js',
      'insights.css',
      '/api/private',
      'javascript:alert(1)',
    ],
  });
  const stop = preload();
  await vi.waitFor(() =>
    expect(document.querySelectorAll('link')).toHaveLength(2),
  );
  const script = document.querySelector<HTMLLinkElement>(
    'link[rel="modulepreload"]',
  )!;
  script.dispatchEvent(new Event('load'));
  const style = document.querySelector<HTMLLinkElement>('link[as="style"]')!;
  style.dispatchEvent(new Event('error'));
  stop();
  expect(document.querySelectorAll('link')).toHaveLength(1);
  expect(script.isConnected).toBe(true);
  expect(style.isConnected).toBe(false);
});

it('does not fetch on other routes, and aborts metadata or stalled hints when leaving the document', async () => {
  const other = await setup('/nested/login');
  other.preload();
  expect(other.fetch).not.toHaveBeenCalled();
  const current = await setup();
  current.preload();
  window.dispatchEvent(new Event('pagehide'));
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelectorAll('link')).toHaveLength(0);
});
