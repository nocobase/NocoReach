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
