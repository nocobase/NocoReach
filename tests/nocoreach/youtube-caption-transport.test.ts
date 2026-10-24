// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { promises as dns } from 'node:dns';
import * as https from 'node:https';
import { download } from '../../server/nocoreach/public-sources.js';
import type { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';

vi.mock('node:https', () => ({ get: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
const url = 'https://www.youtube.com/api/timedtext?v=Im69kzhpR3I';
it('cancels while DNS is pending without later opening a request', async () => {
  let resolve!: (addresses: { address: string; family: number }[]) => void;
  vi.spyOn(dns, 'lookup').mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }) as ReturnType<typeof dns.lookup>,
  );
  const selected = vi.fn();
  const controller = new AbortController();
  const result = download(url, 0, {
    network: {
      selected,
      inDemoProject: () => false,
    } as unknown as OutboundNetwork,
    connection: 'youtube',
    signal: controller.signal,
  });
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  resolve([{ address: '142.250.191.46', family: 4 }]);
  await Promise.resolve();
  expect(selected).not.toHaveBeenCalled();
  expect(https.get).not.toHaveBeenCalled();
});
it('keeps one deadline through redirects and forwards cancellation to the selected proxy', async () => {
  vi.spyOn(dns, 'lookup').mockResolvedValue([
    { address: '142.250.191.46', family: 4 },
  ] as never);
  const controller = new AbortController();
  let started!: () => void;
  const second = new Promise<void>((r) => {
    started = r;
  });
  const send = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: '/api/timedtext?redirected=1' },
      }),
    )
    .mockImplementationOnce(
      (_profile, _url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          expect(init.signal).toBe(controller.signal);
          init.signal!.addEventListener(
            'abort',
            () => reject(init.signal!.reason),
            { once: true },
          );
          started();
        }),
    );
  const network = {
    selected: vi.fn(() => ({ url: 'http://proxy.example:8080' })),
    inDemoProject: () => false,
    send,
  } as unknown as OutboundNetwork;
  const result = download(url, 0, {
    network,
    connection: 'youtube',
    signal: controller.signal,
  });
  await second;
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0][2].signal).toBe(controller.signal);
  expect(https.get).not.toHaveBeenCalled();
});
