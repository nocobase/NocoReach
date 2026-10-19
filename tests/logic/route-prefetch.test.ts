import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadRouteModule } from '../../client/routing/route-modules.js';
import { scheduleRoutePrefetch } from '../../client/routing/route-prefetch.js';
import type { RouteNavigationItem } from '../../client/routing/route-navigation.js';

vi.mock('../../client/routing/route-resources.js', () => ({
  loadRouteResources: vi.fn(),
}));
const loader = vi.fn(async () => ({ default: () => null }));
const page = (name = 'test'): RouteNavigationItem => ({
  route: {
    id: name,
    name,
    path: `/${name}`,
    auth: 'required',
    authz: 'skip',
    packageName: 'nocoreach',
    source: 'application',
    componentLoader: loader,
  },
  children: [],
});
const hints = () =>
  Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"]'),
  );
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, 'connection');
});
it('does not execute loaders, block navigation, or emit Vite errors when resource hints fail', async () => {
  const viteError = vi.fn();
  window.addEventListener('vite:preloadError', viteError);
  stop = scheduleRoutePrefetch([page()], async () => ({
    test: ['/page.js', '/gate.js'],
  }));
  await vi.advanceTimersByTimeAsync(3000);
  expect(hints()).toHaveLength(1);
  expect(hints()[0].getAttribute('fetchpriority')).toBe('low');
  // Leave the background request unresolved, as on a stalled CDN.
  const foreground = vi.fn(async () => ({ default: () => null }));
  await expect(loadRouteModule(foreground)).resolves.toHaveProperty('default');
  expect(foreground).toHaveBeenCalledOnce();
  hints()[0].dispatchEvent(new Event('error'));
  await vi.advanceTimersByTimeAsync(1500);
  hints()[0].dispatchEvent(new Event('error'));
  expect(loader).not.toHaveBeenCalled();
  expect(viteError).not.toHaveBeenCalled();
  window.removeEventListener('vite:preloadError', viteError);
});
it('uses only supplied application menu pages, caps routes, and deduplicates shared assets', async () => {
  const plugin = page('plugin');
  plugin.route = { ...plugin.route, source: 'plugin' };
  stop = scheduleRoutePrefetch(
    [page('a'), plugin, page('b'), page('c'), page('d')],
    async () => ({
      a: ['/shared.js'],
      b: ['/shared.js', '/b.css'],
      c: ['/c.js'],
      d: ['/d.js'],
      denied: ['/denied.js'],
      plugin: ['/plugin.js'],
    }),
  );
  const seen: string[] = [];
  await vi.advanceTimersByTimeAsync(3000);
  while (hints().length) {
    seen.push(hints()[0].getAttribute('href')!);
    hints()[0].dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(1500);
  }
  expect(seen).toEqual(['/shared.js', '/b.css', '/c.js']);
});
it.each([
  { saveData: true },
  { effectiveType: '3g' },
  { effectiveType: 'slow-2g' },
])('pauses on constrained connections: %j', async (connection) => {
  Object.defineProperty(navigator, 'connection', {
    value: connection,
    configurable: true,
  });
  const read = vi.fn(async () => ({ test: ['/test.js'] }));
  stop = scheduleRoutePrefetch([page()], read);
  await vi.advanceTimersByTimeAsync(5000);
  expect(read).not.toHaveBeenCalled();
});
it('pauses in hidden tabs and during foreground imports', async () => {
  const visibility = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('hidden');
  let resolve!: (value: { default: () => null }) => void;
  const pending = loadRouteModule(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const read = vi.fn(async () => ({ test: ['/test.js'] }));
  stop = scheduleRoutePrefetch([page()], read);
  await vi.advanceTimersByTimeAsync(3000);
  visibility.mockReturnValue('visible');
  await vi.advanceTimersByTimeAsync(3000);
  expect(read).not.toHaveBeenCalled();
  resolve({ default: () => null });
  await pending;
  await vi.advanceTimersByTimeAsync(3000);
  expect(hints()).toHaveLength(1);
});
it('cancels metadata and ignores late responses after navigation or unmount', async () => {
  let resolve!: (value: { test: string[] }) => void;
  let signal!: AbortSignal;
  stop = scheduleRoutePrefetch([page()], (value) => {
    signal = value;
    return new Promise((done) => {
      resolve = done;
    });
  });
  await vi.advanceTimersByTimeAsync(1500);
  stop();
  expect(signal.aborted).toBe(true);
  resolve({ test: ['/late.js'] });
  await vi.advanceTimersByTimeAsync(5000);
  expect(hints()).toHaveLength(0);
});
it('bounds stalled resource hints and removes them on cleanup', async () => {
  stop = scheduleRoutePrefetch([page()], async () => ({
    test: ['/a.js', '/b.js'],
  }));
  await vi.advanceTimersByTimeAsync(3000);
  const first = hints()[0];
  await vi.advanceTimersByTimeAsync(11500);
  expect(first.isConnected).toBe(false);
  expect(hints()[0].getAttribute('href')).toBe('/b.js');
  stop();
  await vi.advanceTimersByTimeAsync(20000);
  expect(hints()).toHaveLength(0);
});
it('ignores metadata failures without affecting foreground imports', async () => {
  stop = scheduleRoutePrefetch([page()], async () => {
    throw new Error('offline');
  });
  await vi.advanceTimersByTimeAsync(20000);
  expect(hints()).toHaveLength(0);
  await expect(
    loadRouteModule(async () => ({ default: () => null })),
  ).resolves.toHaveProperty('default');
});
