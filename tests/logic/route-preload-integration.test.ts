import {
  defineAppRoutes,
  resolveAppClientContributions,
} from '@nocobase/app-client/plugins';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

it.each([false, true])(
  'handles registered loader failures with a queued foreground route: %s',
  async (queueForeground) => {
    const { loadRouteModule, routePreloadNeedsReload, cachedRouteModule } =
      await import('../../client/routing/route-modules.js');
    const { reloadOnStaleBuild } =
      await import('../../client/lib/stale-build.js');
    const target = new EventTarget();
    const reload = vi.fn();
    const stop = reloadOnStaleBuild({
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      sessionStorage: {
        getItem: () => null,
        setItem: () => {},
      } as unknown as Storage,
      location: { reload },
    });
    const healthy = { default: () => null };
    const cached = async () => healthy;
    await loadRouteModule(cached);
    let rejectCss!: (error: Error) => void;
    const css = new Promise<void>((_, reject) => {
      rejectCss = reject;
    });
    const error = new Error('Unable to preload shared CSS');
    const { routes } = resolveAppClientContributions([
      {
        packageName: 'test',
        source: 'application',
        routes: defineAppRoutes([
          {
            name: 'test',
            path: '/test',
            auth: 'required',
            authz: 'skip',
            componentLoader: async () => {
              await css;
              return healthy;
            },
          },
        ]),
      },
    ]);
    const pending = loadRouteModule(routes[0].componentLoader!, true).catch(
      (failure: unknown) => failure,
    );
    await vi.advanceTimersByTimeAsync(0);
    const next = vi.fn(async () => healthy);
    const foreground = queueForeground
      ? loadRouteModule(next).catch((failure: unknown) => failure)
      : undefined;
    await vi.advanceTimersByTimeAsync(0);
    expect(next).not.toHaveBeenCalled();
    target.dispatchEvent(
      Object.assign(new Event('vite:preloadError', { cancelable: true }), {
        payload: error,
      }),
    );
    rejectCss(error);
    expect(await pending).toHaveProperty('cause', error);
    if (queueForeground) expect(await foreground).toBe(error);
    await vi.runAllTimersAsync();
    expect(reload).not.toHaveBeenCalled();
    expect(routePreloadNeedsReload()).toBe(true);
    expect(next).not.toHaveBeenCalled();
    expect(cachedRouteModule(next)).toBeUndefined();
    await expect(loadRouteModule(cached)).resolves.toBe(healthy);
    stop();
  },
);

it('waits for shared styles before starting the next route, then allows navigation', async () => {
  const { loadRouteModule, cachedRouteModule } =
    await import('../../client/routing/route-modules.js');
  let finishCss!: () => void;
  const css = new Promise<void>((resolve) => {
    finishCss = resolve;
  });
  const healthy = { default: () => null };
  const background = loadRouteModule(async () => {
    await css;
    return healthy;
  }, true);
  const next = vi.fn(async () => healthy);
  const foreground = loadRouteModule(next);
  await vi.advanceTimersByTimeAsync(0);
  expect(next).not.toHaveBeenCalled();
  expect(cachedRouteModule(next)).toBeUndefined();
  finishCss();
  await background;
  await expect(foreground).resolves.toBe(healthy);
  expect(next).toHaveBeenCalledTimes(1);
});
