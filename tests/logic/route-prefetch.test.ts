import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cachedRouteModule,
  loadRouteModule,
} from '../../client/routing/route-modules';
import { scheduleRoutePrefetch } from '../../client/routing/route-prefetch';
import { reloadOnStaleBuild } from '../../client/lib/stale-build';
import type { RouteNavigationItem } from '../../client/routing/route-navigation';

const page = (
  loader: () => Promise<{ default: () => null }>,
): RouteNavigationItem => ({
  route: {
    id: 'test',
    name: 'test',
    path: '/test',
    auth: 'required',
    authz: 'skip',
    packageName: 'test',
    source: 'application',
    componentLoader: loader,
  },
  children: [],
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('route code warming', () => {
  it('shares an in-flight import with navigation and caches the component', async () => {
    const module = { default: () => null };
    const loader = vi.fn(async () => module);
    await Promise.all([loadRouteModule(loader, true), loadRouteModule(loader)]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cachedRouteModule(loader)).toBe(module);
  });
  it('allows navigation to retry failed speculation', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ default: () => null });
    await expect(loadRouteModule(loader, true)).rejects.toThrow('offline');
    await expect(loadRouteModule(loader)).resolves.toHaveProperty('default');
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it('waits, loads serially, and cancels queued work', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    let resolve!: (module: { default: () => null }) => void;
    const first = vi.fn(
      () =>
        new Promise<{ default: () => null }>((done) => {
          resolve = done;
        }),
    );
    const second = vi.fn(async () => ({ default: () => null }));
    const stop = scheduleRoutePrefetch([page(first), page(second)]);
    expect(first).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(first).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(second).not.toHaveBeenCalled();
    stop();
    resolve({ default: () => null });
    await vi.advanceTimersByTimeAsync(5000);
    expect(second).not.toHaveBeenCalled();
  });
  it.each([
    { saveData: true },
    { effectiveType: '3g' },
    { effectiveType: 'slow-2g' },
  ])('skips constrained connections: %j', async (connection) => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    Object.defineProperty(navigator, 'connection', {
      value: connection,
      configurable: true,
    });
    const loader = vi.fn(async () => ({ default: () => null }));
    const stop = scheduleRoutePrefetch([page(loader)]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(loader).not.toHaveBeenCalled();
    stop();
    Reflect.deleteProperty(navigator, 'connection');
  });
  it('limits each idle queue to three uncached pages', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    const loaders = Array.from({ length: 6 }, () =>
      vi.fn(async () => ({ default: () => null })),
    );
    await loadRouteModule(loaders[0]);
    const stop = scheduleRoutePrefetch(loaders.map(page));
    await vi.advanceTimersByTimeAsync(15000);
    expect(loaders.map((loader) => loader.mock.calls.length)).toEqual([
      1, 1, 1, 1, 0, 0,
    ]);
    stop();
  });
  it('waits for foreground route imports', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    let resolve!: (module: { default: () => null }) => void;
    const foreground = loadRouteModule(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const loader = vi.fn(async () => ({ default: () => null }));
    const stop = scheduleRoutePrefetch([page(loader)]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(loader).not.toHaveBeenCalled();
    resolve({ default: () => null });
    await foreground;
    await vi.advanceTimersByTimeAsync(1500);
    expect(loader).toHaveBeenCalledTimes(1);
    stop();
  });
  it('pauses while the tab is hidden', async () => {
    vi.useFakeTimers();
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    const loader = vi.fn(async () => ({ default: () => null }));
    const stop = scheduleRoutePrefetch([page(loader)]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(loader).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    await vi.advanceTimersByTimeAsync(1500);
    expect(loader).toHaveBeenCalledTimes(1);
    stop();
  });
  it('requires a full reload after speculative CSS failure, without rendering an unsafe retry', async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const reload = vi.fn();
    const stop = reloadOnStaleBuild({
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      sessionStorage,
      location: { reload },
    });
    const healthy = { default: () => null };
    const cachedLoader = vi.fn(async () => healthy);
    await loadRouteModule(cachedLoader);
    const error = new Error('Unable to preload CSS for /assets/page.css');
    let seen = false;
    const loader = vi.fn(async () => {
      // Vite marks CSS as seen before fetching: retrying would skip CSS and succeed.
      if (seen) return healthy;
      seen = true;
      const event = Object.assign(new Event('vite:preloadError'), {
        payload: error,
      });
      target.dispatchEvent(event);
      throw error;
    });
    await expect(loadRouteModule(loader, true)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1);
    expect(reload).not.toHaveBeenCalled();
    await expect(loadRouteModule(loader)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1);
    expect(reload).not.toHaveBeenCalled();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cachedRouteModule(loader)).toBeUndefined();
    // Shared styles may also be referenced by another route; do not load it either.
    const otherLoader = vi.fn(async () => healthy);
    await expect(loadRouteModule(otherLoader)).rejects.toBe(error);
    expect(otherLoader).not.toHaveBeenCalled();
    const stopQueue = scheduleRoutePrefetch([page(otherLoader)]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(otherLoader).not.toHaveBeenCalled();
    stopQueue();
    // Pages whose dependencies were already loaded stay usable.
    await expect(loadRouteModule(cachedLoader)).resolves.toBe(healthy);
    expect(cachedRouteModule(cachedLoader)).toBe(healthy);
    stop();
  });
});
