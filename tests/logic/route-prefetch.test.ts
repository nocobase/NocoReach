import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RouteNavigationItem } from '../../client/routing/route-navigation.js';
import type { RoutePrefetchScheduler } from '../../client/routing/route-prefetch.js';

let scheduleRoutePrefetch: typeof import('../../client/routing/route-prefetch.js').scheduleRoutePrefetch;
let loadRouteModule: typeof import('../../client/routing/route-modules.js').loadRouteModule;
const page = (name = 'growth-overview'): RouteNavigationItem => ({
  route: {
    id: name,
    name,
    path: `/${name}`,
    auth: 'required',
    authz: 'skip',
    packageName: 'nocoreach',
    source: 'application',
    componentLoader: vi.fn(async () => ({ default: () => null })),
  },
  children: [],
});
const hints = () =>
  Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"]'),
  );
let stop: RoutePrefetchScheduler | undefined;
beforeEach(async () => {
  vi.resetModules();
  ({ scheduleRoutePrefetch } =
    await import('../../client/routing/route-prefetch.js'));
  ({ loadRouteModule } = await import('../../client/routing/route-modules.js'));
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'connection');
});
async function drain() {
  const seen: string[] = [];
  while (hints().length) {
    seen.push(hints()[0].getAttribute('href')!);
    hints()[0].dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(151);
  }
  return seen;
}
it('warms only one high-traffic page while idle and never executes its loader', async () => {
  const home = page();
  stop = scheduleRoutePrefetch(
    [page('members'), home, page('action-center')],
    async () => ({
      members: ['/members.js'],
      'growth-overview': ['/home.js', '/home.css'],
      'action-center': ['/tasks.js'],
    }),
  );
  await vi.advanceTimersByTimeAsync(1501);
  expect(hints()[0].crossOrigin).toBe('anonymous');
  expect(hints()[0].getAttribute('fetchpriority')).toBe('low');
  expect(await drain()).toEqual(['/home.js', '/home.css']);
  expect(home.route.componentLoader).not.toHaveBeenCalled();
});
it('skips fully warmed pages before selecting the single idle candidate', async () => {
  const read = async () => ({
    'growth-overview': ['/home.js'],
    'action-center': ['/tasks.js'],
  });
  const items = [page(), page('action-center')];
  stop = scheduleRoutePrefetch(items, read);
  await vi.advanceTimersByTimeAsync(1501);
  expect(await drain()).toEqual(['/home.js']);
  stop();
  stop = scheduleRoutePrefetch(items, read);
  await vi.advanceTimersByTimeAsync(1501);
  expect(await drain()).toEqual(['/tasks.js']);
});
it('prioritizes the target immediately over a stalled idle hint, then resumes the idle page', async () => {
  stop = scheduleRoutePrefetch([page(), page('members')], async () => ({
    'growth-overview': ['/home.js', '/shared.js'],
    members: ['/members.js', '/shared.js'],
  }));
  await vi.advanceTimersByTimeAsync(1501);
  const idleHint = hints()[0];
  stop.prioritize('members');
  await vi.advanceTimersByTimeAsync(1);
  expect(idleHint.isConnected).toBe(false);
  expect(await drain()).toEqual(['/members.js', '/shared.js', '/home.js']);
});
it('coalesces repeated intent and lets the latest target replace queued intent work', async () => {
  stop = scheduleRoutePrefetch([page('members'), page('roles')], async () => ({
    members: ['/members.js', '/member-dependency.js'],
    roles: ['/roles.js'],
  }));
  stop.prioritize('members');
  await vi.advanceTimersByTimeAsync(2);
  const first = hints()[0];
  stop.prioritize('members');
  await vi.advanceTimersByTimeAsync(2);
  expect(hints()[0]).toBe(first);
  stop.prioritize('roles');
  await vi.advanceTimersByTimeAsync(2);
  expect(await drain()).toEqual(['/roles.js']);
});
it('uses latest intent during pending metadata and bypasses idle callbacks for intent resources', async () => {
  vi.stubGlobal('requestIdleCallback', vi.fn());
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  let resolve!: (data: Record<string, string[]>) => void;
  const read = vi.fn(
    () =>
      new Promise<Record<string, string[]>>((done) => {
        resolve = done;
      }),
  );
  stop = scheduleRoutePrefetch([page('members'), page('roles')], read);
  stop.prioritize('members');
  await vi.advanceTimersByTimeAsync(1);
  stop.prioritize('roles');
  resolve({ members: ['/members.js'], roles: ['/roles.js', '/roles.css'] });
  await vi.advanceTimersByTimeAsync(2);
  expect(await drain()).toEqual(['/roles.js', '/roles.css']);
  expect(read).toHaveBeenCalledOnce();
});
it('ignores denied, plugin, already loaded, and unlisted pages on intent', async () => {
  const plugin = page('plugin');
  plugin.route = { ...plugin.route, source: 'plugin' };
  const loaded = page('loaded');
  await loadRouteModule(loaded.route.componentLoader!);
  stop = scheduleRoutePrefetch([page('members'), plugin, loaded], async () => ({
    denied: ['/denied.js'],
    plugin: ['/plugin.js'],
    loaded: ['/loaded.js'],
  }));
  for (const name of ['denied', 'plugin', 'loaded', 'members'])
    stop.prioritize(name);
  await vi.advanceTimersByTimeAsync(2000);
  expect(hints()).toHaveLength(0);
});
it.each([
  { saveData: true },
  { effectiveType: '3g' },
  { effectiveType: 'slow-2g' },
])('keeps connection guards for explicit intent: %j', async (connection) => {
  Object.defineProperty(navigator, 'connection', {
    value: connection,
    configurable: true,
  });
  const read = vi.fn(async () => ({ members: ['/members.js'] }));
  stop = scheduleRoutePrefetch([page('members')], read);
  stop.prioritize('members');
  await vi.advanceTimersByTimeAsync(5000);
  expect(read).not.toHaveBeenCalled();
});
it('pauses intent while hidden or while a foreground import runs, and resumes afterward', async () => {
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
  const read = vi.fn(async () => ({ members: ['/members.js'] }));
  stop = scheduleRoutePrefetch([page('members')], read);
  stop.prioritize('members');
  await vi.advanceTimersByTimeAsync(3000);
  visibility.mockReturnValue('visible');
  await vi.advanceTimersByTimeAsync(3000);
  expect(read).not.toHaveBeenCalled();
  resolve({ default: () => null });
  await pending;
  await vi.advanceTimersByTimeAsync(3000);
  expect(hints()).toHaveLength(1);
});
it('aborts pending metadata and rejects late intent after navigation or unmount', async () => {
  let resolve!: (value: Record<string, string[]>) => void;
  let signal!: AbortSignal;
  stop = scheduleRoutePrefetch([page('members')], (value) => {
    signal = value;
    return new Promise((done) => {
      resolve = done;
    });
  });
  stop.prioritize('members');
  await vi.advanceTimersByTimeAsync(1);
  stop();
  expect(signal.aborted).toBe(true);
  stop.prioritize('members');
  resolve({ members: ['/late.js'] });
  await vi.advanceTimersByTimeAsync(5000);
  expect(hints()).toHaveLength(0);
});
it('bounds stalled hints, cleans up, and never emits navigation errors on failures', async () => {
  const viteError = vi.fn();
  window.addEventListener('vite:preloadError', viteError);
  stop = scheduleRoutePrefetch([page()], async () => ({
    'growth-overview': ['/a.js', '/b.js'],
  }));
  await vi.advanceTimersByTimeAsync(1501);
  const first = hints()[0];
  await expect(
    loadRouteModule(async () => ({ default: () => null })),
  ).resolves.toHaveProperty('default');
  await vi.advanceTimersByTimeAsync(10151);
  expect(first.isConnected).toBe(false);
  hints()[0].dispatchEvent(new Event('error'));
  stop();
  await vi.advanceTimersByTimeAsync(20000);
  expect(hints()).toHaveLength(0);
  expect(viteError).not.toHaveBeenCalled();
  window.removeEventListener('vite:preloadError', viteError);
});
it('excludes existing assets and bounds each target to 24 missing resources', async () => {
  const existing = document.createElement('link');
  existing.rel = 'modulepreload';
  existing.href = '/loaded.js';
  document.head.append(existing);
  try {
    stop = scheduleRoutePrefetch([page('members')], async () => ({
      members: [
        '/loaded.js',
        ...Array.from({ length: 30 }, (_, i) => `/needed-${i}.js`),
      ],
    }));
    stop.prioritize('members');
    await vi.advanceTimersByTimeAsync(2);
    const seen = await drain();
    expect(seen).toHaveLength(24);
    expect(seen).not.toContain('/loaded.js');
  } finally {
    existing.remove();
  }
});
it('ignores metadata failures without affecting foreground navigation', async () => {
  stop = scheduleRoutePrefetch([page()], async () => {
    throw new Error('offline');
  });
  await vi.advanceTimersByTimeAsync(20000);
  expect(hints()).toHaveLength(0);
  await expect(
    loadRouteModule(async () => ({ default: () => null })),
  ).resolves.toHaveProperty('default');
});
