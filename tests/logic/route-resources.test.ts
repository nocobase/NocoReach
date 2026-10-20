import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  document
    .querySelectorAll('meta[name="nocoreach-route-prefetch"]')
    .forEach((element) => element.remove());
  vi.unstubAllGlobals();
});

async function reader(url?: string) {
  vi.resetModules();
  if (url) {
    const meta = document.createElement('meta');
    meta.name = 'nocoreach-route-prefetch';
    meta.content = url;
    document.head.append(meta);
  }
  return (await import('../../client/routing/route-resources.js'))
    .loadRouteResources;
}

it('does not fetch metadata in development or documents without a manifest', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const read = await reader();
  expect(await read(new AbortController().signal)).toEqual({});
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  '/nested/assets/route-prefetch-build.json',
  'https://cdn.example.com/release/assets/route-prefetch-build.json',
])(
  'resolves resources against %s and reuses successful metadata',
  async (url) => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ page: ['page.js', 'page.css'] })),
    );
    vi.stubGlobal('fetch', fetch);
    const read = await reader(url);
    const signal = new AbortController().signal;
    const data = await read(signal);
    const base = new URL(url, document.baseURI);
    expect(data).toEqual({
      page: [new URL('page.js', base).href, new URL('page.css', base).href],
    });
    expect(await read(signal)).toBe(data);
    expect(fetch).toHaveBeenCalledOnce();
  },
);

it('retries failed metadata and does not retain responses from an aborted scheduler', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockImplementation(
      async () => new Response(JSON.stringify({ page: ['page.js'] })),
    );
  vi.stubGlobal('fetch', fetch);
  const read = await reader('/assets/route-prefetch-retry.json');
  expect(await read(new AbortController().signal)).toEqual({});
  const aborted = new AbortController();
  aborted.abort();
  await read(aborted.signal);
  await read(new AbortController().signal);
  expect(fetch).toHaveBeenCalledTimes(3);
});
