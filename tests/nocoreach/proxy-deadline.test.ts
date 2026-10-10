// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { fetch as request } from 'undici';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles';
vi.mock('undici', async (original) => ({
  ...(await original<object>()),
  fetch: vi.fn(),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('preserves a paid provider deadline longer than 30 seconds and applies its own default only when absent', async () => {
  vi.useFakeTimers();
  const network = new OutboundNetwork(
    new ProxyProfiles({ all: () => ({}), set: async () => {} }),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  vi.mocked(request).mockImplementation(async (_url, options) => {
    await vi.advanceTimersByTimeAsync(45000);
    expect(options?.signal?.aborted).toBe(false);
    expect(options?.signal).toBe(controller.signal);
    return new Response('{}') as unknown as Awaited<ReturnType<typeof request>>;
  });
  await expect(
    network.send(undefined, 'https://api.dataforseo.com/', {
      signal: controller.signal,
    }),
  ).resolves.toBeInstanceOf(Response);
  clearTimeout(timer);
  vi.mocked(request).mockImplementation(async (_url, options) => {
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    return new Response('{}') as unknown as Awaited<ReturnType<typeof request>>;
  });
  await network.send(undefined, 'https://api.github.com/');
});

function network() {
  const values: Record<string, string> = {};
  return new OutboundNetwork(
    new ProxyProfiles({
      all: () => values,
      set: async (key, value) => {
        values[key] = value!;
      },
    }),
  );
}
function response(body: string, init?: ResponseInit) {
  return new Response(body, init) as unknown as Awaited<
    ReturnType<typeof request>
  >;
}
it.each([false, true])(
  'follows a renamed repository on the same origin with the same dispatcher (proxy=%s)',
  async (proxy) => {
    const n = network();
    const profile = proxy
      ? await n.profiles.save({
          name: 'proxy',
          url: 'http://proxy.example:7890',
        })
      : undefined;
    const signal = new AbortController().signal;
    vi.mocked(request)
      .mockReset()
      .mockResolvedValueOnce(
        response('', {
          status: 301,
          headers: { location: '/repositories/123' },
        }),
      )
      .mockResolvedValueOnce(response('{"id":123}'));
    const result = await n.send(
      profile ? n.profiles.profile(profile.id) : undefined,
      'https://api.github.com/repos/old/name',
      { headers: { Authorization: 'Bearer secret' }, signal },
    );
    expect(await result.json()).toEqual({ id: 123 });
    const calls = vi.mocked(request).mock.calls;
    expect(String(calls[1][0])).toBe('https://api.github.com/repositories/123');
    expect(calls[1][1]?.dispatcher).toBe(calls[0][1]?.dispatcher);
    expect(calls[1][1]?.signal).toBe(signal);
    expect(calls[1][1]?.headers).toMatchObject({
      authorization: 'Bearer secret',
    });
  },
);
it.each([
  'https://other.example/',
  'http://api.github.com/',
  'https://user:password@api.github.com/',
])(
  'rejects unsafe redirect %s before sending a second request',
  async (location) => {
    vi.mocked(request)
      .mockReset()
      .mockResolvedValue(response('', { status: 302, headers: { location } }));
    await expect(
      network().send(undefined, 'https://api.github.com/'),
    ).rejects.toMatchObject({ code: 'NR_REDIRECT_REJECTED' });
    expect(request).toHaveBeenCalledTimes(1);
  },
);
it('bounds redirect loops and respects explicit manual redirects', async () => {
  vi.mocked(request)
    .mockReset()
    .mockImplementation(async () =>
      response('', { status: 301, headers: { location: '/loop' } }),
    );
  await expect(
    network().send(undefined, 'https://api.github.com/'),
  ).rejects.toMatchObject({ code: 'NR_REDIRECT_REJECTED' });
  expect(request).toHaveBeenCalledTimes(6);
  vi.mocked(request).mockClear();
  expect(
    (
      await network().send(undefined, 'https://api.github.com/', {
        redirect: 'manual',
      })
    ).status,
  ).toBe(301);
  expect(request).toHaveBeenCalledTimes(1);
});
it('keeps sanitized diagnostic codes and timeout names without exposing credentials', async () => {
  const { isNetworkError } = await import('../../server/nocoreach/sync-policy');
  for (const error of [
    Object.assign(new Error('https://user:password@proxy.example'), {
      cause: { code: 'ECONNREFUSED' },
    }),
    new DOMException('secret target', 'TimeoutError'),
    new DOMException('secret target', 'AbortError'),
    new Error('secret target'),
  ]) {
    vi.mocked(request).mockReset().mockRejectedValue(error);
    const result = await network()
      .send(undefined, 'https://api.github.com/')
      .catch((e) => e);
    expect(isNetworkError(result)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /password|secret|proxy\.example/,
    );
    expect(result.message).not.toMatch(/password|secret|proxy\.example/);
    if (error.name !== 'Error') expect(result.name).toBe(error.name);
  }
});
it('identifies an oversized response separately from network errors', async () => {
  vi.mocked(request).mockReset().mockResolvedValue(response('12345'));
  await expect(
    network().send(undefined, 'https://api.github.com/', {}, undefined, 4),
  ).rejects.toMatchObject({ code: 'NR_RESPONSE_TOO_LARGE' });
});
