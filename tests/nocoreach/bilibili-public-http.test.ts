// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createBilibiliPublicHttpHandlers,
  createBilibiliUpstreamHandlers,
} from '../../collectors/bilibili-public-http.mjs';
import { HttpBilibiliAdapter } from '../../server/nocoreach/bilibili-adapter';

const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/bilibili/public-http.json', import.meta.url),
    'utf8',
  ),
);
const BV = fixture.view.data.bvid;
const now = () => 1770000000000;
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
const query = { query: 'NocoBase', limit: 20 };
afterEach(() => vi.useRealTimers());

it('keeps OpenCLI as the default, selects anonymous HTTP explicitly, and rejects unknown modes', async () => {
  const run = vi.fn(async () => '1.8.8');
  const fetcher = vi.fn();
  await createBilibiliUpstreamHandlers({ run, fetcher }).health();
  expect(run).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    await createBilibiliUpstreamHandlers({
      upstream: 'anonymous-http',
      run,
      fetcher,
    }).health(),
  ).toEqual({
    upstream: 'anonymous-http',
    platformVerified: false,
    browser: 'not_required',
    login: 'not_used',
  });
  expect(run).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
  expect(() =>
    createBilibiliUpstreamHandlers({ upstream: 'automatic' }),
  ).toThrow();
});
it('maps the saved real public search and detail responses through the existing protocol', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(fixture.nav))
    .mockResolvedValueOnce(json(fixture.search))
    .mockResolvedValueOnce(json(fixture.view));
  const handlers = createBilibiliPublicHttpHandlers({ fetcher, now });
  const items = await handlers.search(query);
  expect(items).toHaveLength(20);
  expect(items[0]).toMatchObject({
    bvid: fixture.search.data.result[0].bvid,
    likes: null,
    comments: null,
    publishedAt: null,
    publishedAtPrecision: null,
    completeness: 'search_summary',
  });
  expect(items[0].title).not.toMatch(/<em/);
  expect(await handlers.video({ bvid: BV })).toEqual({
    bvid: BV,
    title: fixture.view.data.title,
    views: 2283,
    likes: 12,
    comments: 4,
    publishedAt: '2026-03-19T10:10:00.000Z',
    publishedAtPrecision: 'minute',
    completeness: 'video_metadata',
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
  const urls = fetcher.mock.calls.map(([url]) => new URL(url));
  expect(urls.map((u) => `${u.origin}${u.pathname}`)).toEqual([
    'https://api.bilibili.com/x/web-interface/nav',
    'https://api.bilibili.com/x/web-interface/wbi/search/type',
    'https://api.bilibili.com/x/web-interface/view',
  ]);
  expect(Object.fromEntries(urls[1].searchParams)).toMatchObject({
    page: '1',
    page_size: '20',
    keyword: 'NocoBase',
    search_type: 'video',
  });
  for (const [, options] of fetcher.mock.calls) {
    expect(options).toMatchObject({
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NocoReach-Public-Research/1.0',
      },
    });
    expect(Object.keys(options.headers)).toEqual(['Accept', 'User-Agent']);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  }
});
it('signs the standard public WBI request format deterministically without browser identity', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(fixture.nav))
    .mockResolvedValueOnce(json(fixture.search));
  await createBilibiliPublicHttpHandlers({ fetcher, now }).search({
    query: "a b!'()*中文",
    limit: 20,
  });
  const url = new URL(fetcher.mock.calls[1][0]);
  expect(url.searchParams.get('keyword')).toBe('a b中文');
  expect(url.searchParams.get('wts')).toBe('1770000000');
  // Known mixin derived from the saved public nav keys, independently computed.
  const unsigned = url.search.slice(1).split('&w_rid=')[0];
  expect(unsigned).toBe(
    'duration=0&keyword=a%20b%E4%B8%AD%E6%96%87&order=totalrank&page=1&page_size=20&search_type=video&tids=0&wts=1770000000',
  );
  expect(url.searchParams.get('w_rid')).toBe(
    createHash('md5')
      .update(unsigned + 'ea1db124af3c7062474693fa704f4ff8')
      .digest('hex'),
  );
  expect(url.searchParams.has('buvid3')).toBe(false);
});
it.each([
  [403, 'security_block'],
  [412, 'security_block'],
  [429, 'rate_limited'],
  [401, 'login_required'],
  [404, 'not_found'],
  [302, 'invalid_response'],
])(
  'stops on HTTP %s without retries, alternate endpoints or OpenCLI',
  async (status, code) => {
    const fetcher = vi.fn(
      async () => new Response('', { status: Number(status) }),
    );
    const run = vi.fn();
    const handlers = createBilibiliUpstreamHandlers({
      upstream: 'anonymous-http',
      fetcher,
      run,
    });
    await expect(handlers.search(query)).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  },
);
it.each([
  [-101, 'login_required'],
  [-111, 'login_required'],
  [-352, 'security_block'],
  [-412, 'security_block'],
  [-509, 'rate_limited'],
  [-799, 'rate_limited'],
  [-404, 'not_found'],
  [-500, 'invalid_response'],
])(
  'rejects API code %s in real data actions and never falls back',
  async (code, expected) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(fixture.nav))
      .mockResolvedValueOnce(
        json({
          code,
          message: 'upstream diagnostic',
          data: fixture.search.data,
        }),
      );
    await expect(
      createBilibiliPublicHttpHandlers({ fetcher }).search(query),
    ).rejects.toMatchObject({ code: expected });
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);
it('does not accept login-required metadata as the anonymous-nav exception', async () => {
  for (const body of [
    fixture.nav,
    { code: 0, message: 'login required', data: fixture.view.data },
  ]) {
    const fetcher = vi.fn(async () => json(body));
    await expect(
      createBilibiliPublicHttpHandlers({ fetcher }).video({ bvid: BV }),
    ).rejects.toMatchObject({ code: 'login_required' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it('requires anonymous nav and valid public key material before making a search request', async () => {
  for (const data of [
    {},
    { isLogin: true, wbi_img: fixture.nav.data.wbi_img },
    {
      isLogin: false,
      wbi_img: { img_url: 'https://evil.test/x', sub_url: 'file:///secret' },
    },
  ]) {
    const fetcher = vi.fn(async () => json({ code: -101, data }));
    await expect(
      createBilibiliPublicHttpHandlers({ fetcher }).search(query),
    ).rejects.toBeInstanceOf(Error);
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it('recognizes JSON and HTML challenges, including a challenge in an otherwise successful envelope', async () => {
  for (const response of [
    json({ code: 0, message: 'captcha required', data: fixture.view.data }),
    json({
      code: 0,
      data: { ...fixture.view.data, v_voucher: 'public-challenge' },
    }),
    new Response('<html>安全验证 challenge</html>', {
      headers: { 'Content-Type': 'text/html' },
    }),
  ]) {
    const fetcher = vi.fn(async () => response);
    await expect(
      createBilibiliPublicHttpHandlers({ fetcher }).video({ bvid: BV }),
    ).rejects.toMatchObject({ code: 'security_block' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it('rejects malformed envelopes, mismatched video identities, invalid JSON and more than 20 results', async () => {
  for (const value of [
    [],
    {},
    { code: '0', data: fixture.view.data },
    { code: 0, data: [] },
    { code: 0, data: { ...fixture.view.data, bvid: 'BV0000000000' } },
    { code: 0, data: { ...fixture.view.data, stat: [] } },
  ]) {
    await expect(
      createBilibiliPublicHttpHandlers({
        fetcher: async () => json(value),
      }).video({ bvid: BV }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  }
  await expect(
    createBilibiliPublicHttpHandlers({
      fetcher: async () =>
        new Response('{broken', {
          headers: { 'Content-Type': 'application/json' },
        }),
    }).video({ bvid: BV }),
  ).rejects.toMatchObject({ code: 'invalid_response' });
  for (const result of [
    null,
    [{}],
    Array(21).fill(fixture.search.data.result[0]),
  ]) {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(fixture.nav))
      .mockResolvedValueOnce(json({ code: 0, data: { result } }));
    await expect(
      createBilibiliPublicHttpHandlers({ fetcher }).search(query),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  }
});
it('keeps zero and unknown metrics distinct under existing detail and search rules; decodes titles as text', async () => {
  const view = {
    code: 0,
    data: {
      bvid: BV,
      title: null,
      stat: { view: 0, like: null, reply: 'invalid' },
      pubdate: 'invalid',
    },
  };
  expect(
    await createBilibiliPublicHttpHandlers({
      fetcher: async () => json(view),
    }).video({ bvid: BV }),
  ).toMatchObject({
    views: 0,
    likes: null,
    comments: null,
    title: null,
    publishedAt: null,
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(fixture.nav))
    .mockResolvedValueOnce(
      json({
        code: 0,
        data: {
          result: [
            {
              bvid: BV,
              title:
                '<em class="keyword">A</em> &amp; &#x4e2d; &#25991; &lt;B&gt;',
              play: 0,
            },
          ],
        },
      }),
    );
  expect(
    (await createBilibiliPublicHttpHandlers({ fetcher }).search(query))[0],
  ).toMatchObject({
    title: 'A & 中 文 <B>',
    views: null,
    likes: null,
    comments: null,
  });
});
it('rejects invalid inputs before any platform call', async () => {
  const fetcher = vi.fn();
  const handlers = createBilibiliPublicHttpHandlers({ fetcher });
  for (const input of [
    { query: '', limit: 20 },
    { query: 'a'.repeat(81), limit: 20 },
    { query: 'a\nb', limit: 20 },
    { query: 'good', limit: 21 },
    { query: "!'()*", limit: 20 },
  ])
    await expect(handlers.search(input)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  for (const bvid of ['https://evil.test/', '../secret', `${BV}&page=2`])
    await expect(handlers.video({ bvid })).rejects.toMatchObject({
      code: 'invalid_response',
    });
  expect(fetcher).not.toHaveBeenCalled();
});
it('enforces the response size cap both from headers and while streaming', async () => {
  const cancel = vi.fn();
  const oversized = () =>
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(20 * 1024 * 1024));
        c.enqueue(new Uint8Array(1));
      },
      cancel,
    });
  for (const response of [
    new Response('{}', {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(20 * 1024 * 1024 + 1),
      },
    }),
    new Response(oversized(), {
      headers: { 'Content-Type': 'application/json' },
    }),
  ]) {
    const fetcher = vi.fn(async () => response);
    await expect(
      createBilibiliPublicHttpHandlers({ fetcher }).video({ bvid: BV }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetcher.mock.calls).toHaveLength(1);
  }
  expect(cancel).toHaveBeenCalledTimes(1);
});
it('honors cancellation before calls, between nav and search, and during a slow body', async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn();
  const handlers = createBilibiliPublicHttpHandlers({ fetcher });
  await expect(handlers.health(controller.signal)).rejects.toMatchObject({
    code: 'cancelled',
  });
  await expect(
    handlers.video({ bvid: BV }, controller.signal),
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(fetcher).not.toHaveBeenCalled();
  const between = new AbortController();
  const betweenFetch = vi.fn(async () => {
    between.abort();
    return json(fixture.nav);
  });
  await expect(
    createBilibiliPublicHttpHandlers({ fetcher: betweenFetch }).search(
      query,
      between.signal,
    ),
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(betweenFetch).toHaveBeenCalledTimes(1);
  const during = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const streaming = vi.fn(
    async (_url: string, options: RequestInit) =>
      new Response(
        new ReadableStream({
          start(c) {
            options.signal!.addEventListener(
              'abort',
              () => c.error(new DOMException('aborted', 'AbortError')),
              { once: true },
            );
            started();
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  );
  const pending = createBilibiliPublicHttpHandlers({
    fetcher: streaming,
  }).video({ bvid: BV }, during.signal);
  await Promise.all([
    expect(pending).rejects.toMatchObject({ code: 'cancelled' }),
    (async () => {
      await ready;
      during.abort();
    })(),
  ]);
  expect(streaming).toHaveBeenCalledTimes(1);
});
it('times out the complete operation and aborts its pending request without retry', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(
    async (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        options.signal!.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        ),
      ),
  );
  const pending = createBilibiliPublicHttpHandlers({ fetcher }).search(query);
  await Promise.all([
    expect(pending).rejects.toMatchObject({ code: 'timeout' }),
    vi.advanceTimersByTimeAsync(20000),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('adapter preserves correlated envelopes and honest anonymous readiness, rejecting forged health', async () => {
  const config = {
    id: 'test',
    name: 'Test',
    url: 'http://127.0.0.1:18061',
    token: 'synthetic-only-private-collector-token',
    platforms: ['bilibili' as const],
    projectIds: ['1'],
  };
  const input = {
    projectId: '1',
    requestId: 'f4d54272-9008-47d9-b5b5-d2f18d94b4e7',
  };
  const health = {
    protocolVersion: 1,
    platform: 'bilibili',
    ...input,
    ok: true,
    kind: 'health',
    upstream: 'anonymous-http',
    platformVerified: false,
    browser: 'not_required',
    login: 'not_used',
  };
  const fetchCollector = vi.fn(async () => json(health));
  expect(
    await new HttpBilibiliAdapter({ fetchCollector }).health(config, input),
  ).toEqual({
    upstream: 'anonymous-http',
    platformVerified: false,
    browser: 'not_required',
    login: 'not_used',
  });
  for (const changed of [
    { platformVerified: true },
    { toolInstalled: true },
    { upstream: 'automatic' },
    { browser: 'unchecked' },
    { login: 'unchecked' },
    { projectId: '2' },
    { requestId: 'another' },
  ]) {
    const adapter = new HttpBilibiliAdapter({
      fetchCollector: async () => json({ ...health, ...changed }),
    });
    await expect(adapter.health(config, input)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  }
});
it('keeps empty search responses unconfirmed and does not request another page', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(fixture.nav))
    .mockResolvedValueOnce(json({ code: 0, data: { result: [] } }));
  await expect(
    createBilibiliPublicHttpHandlers({ fetcher }).search(query),
  ).rejects.toMatchObject({ code: 'no_results' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not fall back to HTTP when OpenCLI is denied', async () => {
  const run = vi.fn(async () => {
    throw Object.assign(new Error('denied'), { stderr: 'HTTP 412' });
  });
  const fetcher = vi.fn();
  await expect(
    createBilibiliUpstreamHandlers({ run, fetcher }).search(query),
  ).rejects.toMatchObject({ code: 'security_block' });
  expect(run).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
});
