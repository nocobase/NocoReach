// NocoReach's patch of the authorization plugin's client (patches/@nocobase__app-plugin-authorization@1.0.0-beta.36.patch):
// its topics becoming ready, after each connection, read the snapshot again once and invalidate only on a change; the
// connection opening itself reads nothing; a permission event still invalidates at once.
import { apiClientToken, realtimeClientToken } from '@nocobase/app-client';
import authorization, {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';

const allowed = {
  unrestricted: false,
  permissions: [{ resource: { type: 'page', id: 'p' }, actions: ['access'] }],
};

function realtimeFake() {
  const topics = new Map<
    string,
    { onEvent: () => void; onReady?: () => void }
  >();
  const opens = new Set<() => void>();
  return {
    topics,
    watch: (
      topic: string,
      o: { onEvent: () => void; onReady?: () => void },
    ) => {
      topics.set(topic, o);
      return { close: () => topics.delete(topic) };
    },
    onOpen: (listener: () => void) => {
      opens.add(listener);
      return () => opens.delete(listener);
    },
    // The connection opens; its topics become ready a round trip later.
    open: () => {
      for (const listener of opens) listener();
    },
    ready: () => {
      for (const topic of topics.values()) topic.onReady?.();
    },
    connect() {
      this.open();
      this.ready();
    },
  };
}

async function boot(answers: unknown[]) {
  const request = vi.fn(async () => ({ data: answers.shift() ?? allowed }));
  const services = new ServiceContainer();
  const realtime = realtimeFake();
  services.instance(apiClientToken, { request } as never);
  services.instance(realtimeClientToken, realtime as never);
  const app = { container: services };
  const providers = authorization().serviceProviders.map(
    (Provider) =>
      new (
        Provider as never as new (a: unknown) => {
          register(): void;
          boot(): Promise<void>;
          shutdown(): Promise<void>;
        }
      )(app),
  );
  for (const p of providers) p.register();
  for (const p of providers) await p.boot();
  const authz = services.resolve(
    authorizationClientToken,
  ) as AuthorizationClient;
  return { authz, request, realtime, providers };
}

afterEach(() => vi.useRealTimers());

describe('patched authorization client', () => {
  it('reads the first snapshot without waiting for the realtime connection', async () => {
    vi.useFakeTimers();
    const { authz, request } = await boot([allowed]);
    let settled: unknown;
    void authz.snapshot().then((snapshot) => (settled = snapshot));
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(1);
    expect(settled).toEqual(allowed);
  });

  it('reads the snapshot again once when the topics are ready and keeps the revision when it is unchanged', async () => {
    vi.useFakeTimers();
    const { authz, request, realtime } = await boot([allowed, allowed]);
    await authz.snapshot();
    const revision = authz.revision();
    const invalidated = vi.fn();
    authz.onInvalidated(invalidated);
    realtime.connect();
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledTimes(2);
    expect(authz.revision()).toBe(revision);
    expect(invalidated).not.toHaveBeenCalled();
  });

  it('reads nothing when the connection opens, only once its topics are ready a round trip later', async () => {
    vi.useFakeTimers();
    const { authz, request, realtime } = await boot([allowed, allowed]);
    await authz.snapshot();
    realtime.open();
    await vi.advanceTimersByTimeAsync(900);
    expect(request).toHaveBeenCalledTimes(1);
    realtime.ready();
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('invalidates when the snapshot read on opening changed', async () => {
    vi.useFakeTimers();
    const denied = { unrestricted: false, permissions: [] };
    const { authz, realtime } = await boot([allowed, denied]);
    await authz.snapshot();
    const revision = authz.revision();
    realtime.connect();
    await vi.advanceTimersByTimeAsync(100);
    expect(authz.revision()).toBe(revision + 1);
    await expect(authz.snapshot()).resolves.toEqual(denied);
  });

  it('invalidates at once on a permission event', async () => {
    const { authz, request, realtime } = await boot([allowed, allowed]);
    await authz.snapshot();
    const revision = authz.revision();
    for (const topic of realtime.topics.values()) topic.onEvent();
    expect(authz.revision()).toBe(revision + 2);
    await authz.snapshot();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('reads nothing on opening before anything was read, and invalidates when the read fails', async () => {
    vi.useFakeTimers();
    const { authz, request, realtime } = await boot([]);
    realtime.connect();
    await vi.advanceTimersByTimeAsync(100);
    expect(request).not.toHaveBeenCalled();
    await authz.snapshot();
    request.mockRejectedValueOnce(new Error('offline'));
    const revision = authz.revision();
    realtime.connect();
    await vi.advanceTimersByTimeAsync(100);
    expect(authz.revision()).toBe(revision + 1);
  });

  it('lets a hard invalidation during the read win', async () => {
    const { authz, request } = await boot([allowed]);
    await authz.snapshot();
    const slow = Promise.withResolvers<{ data: unknown }>();
    request.mockReturnValueOnce(slow.promise);
    const revalidated = authz.revalidate();
    authz.invalidate();
    const revision = authz.revision();
    slow.resolve({ data: { unrestricted: true, permissions: [] } });
    await revalidated;
    expect(authz.revision()).toBe(revision);
    await expect(authz.snapshot()).resolves.toEqual(allowed);
  });
});
