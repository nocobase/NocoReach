// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createBilibiliPublicHttpHandlers } from '../../collectors/bilibili-public-http.mjs';

const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/bilibili/public-http.json', import.meta.url),
    'utf8',
  ),
);
const BV = fixture.view.data.bvid;
const query = { query: 'NocoBase', limit: 20 };
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });

// These four independent review counterexamples retain their original payloads and assertions.
it.each([
  ['msg', 'login required', 'login_required'],
  ['showMsg', '请登录后重试', 'login_required'],
  ['msg', 'captcha required', 'security_block'],
  ['showMsg', '安全验证', 'security_block'],
])(
  'stops on %s=%s rather than accepting an apparently successful data envelope',
  async (field, message, code) => {
    const fetcher = vi.fn(async () =>
      json({ code: 0, [field]: message, data: fixture.view.data }),
    );
    await expect(
      createBilibiliPublicHttpHandlers({ fetcher }).video({ bvid: BV }),
    ).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each(['msg', 'showMsg'])(
  'a benign or oversized message cannot hide a refusal in %s',
  async (field) => {
    for (const message of ['ok', 'ok '.repeat(500)]) {
      for (const [diagnostic, code] of [
        ['captcha required', 'security_block'],
        ['login required', 'login_required'],
      ]) {
        const fetcher = vi.fn(async () =>
          json({
            code: 0,
            message,
            [field]: diagnostic,
            data: fixture.view.data,
          }),
        );
        await expect(
          createBilibiliPublicHttpHandlers({ fetcher }).video({ bvid: BV }),
        ).rejects.toMatchObject({ code });
        expect(fetcher).toHaveBeenCalledTimes(1);
      }
    }
  },
);
it.each(['msg', 'showMsg'])(
  'anonymous nav does not hide a challenge or login requirement in %s',
  async (field) => {
    for (const [diagnostic, code] of [
      ['安全验证', 'security_block'],
      ['请登录后重试', 'login_required'],
    ]) {
      const fetcher = vi.fn(async () =>
        json({ ...fixture.nav, [field]: diagnostic }),
      );
      await expect(
        createBilibiliPublicHttpHandlers({ fetcher }).search(query),
      ).rejects.toMatchObject({ code });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  },
);
it('preserves the exact saved ordinary anonymous-nav status and permits its one search request', async () => {
  expect(fixture.nav.code).toBe(-101);
  expect(fixture.nav.message).toBe('账号未登录');
  expect(fixture.nav.data.isLogin).toBe(false);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(fixture.nav))
    .mockResolvedValueOnce(json(fixture.search));
  expect(
    await createBilibiliPublicHttpHandlers({ fetcher }).search(query),
  ).toHaveLength(20);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('keeps malformed or nonanonymous nav fail-closed before search', async () => {
  for (const nav of [
    { ...fixture.nav, data: { ...fixture.nav.data, isLogin: true } },
    { ...fixture.nav, data: { isLogin: false } },
  ]) {
    const fetcher = vi.fn(async () => json(nav));
    await expect(
      createBilibiliPublicHttpHandlers({ fetcher }).search(query),
    ).rejects.toBeInstanceOf(Error);
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it('inspects only string envelope diagnostics, never video titles or nested metadata', async () => {
  const view = {
    code: 0,
    message: 0,
    msg: { text: 'captcha required' },
    showMsg: null,
    data: {
      ...fixture.view.data,
      title: 'captcha required / 请登录后重试',
      msg: '安全验证',
      stat: { view: 0 },
    },
  };
  const fetcher = vi.fn(async () => json(view));
  expect(
    await createBilibiliPublicHttpHandlers({ fetcher }).video({ bvid: BV }),
  ).toMatchObject({
    title: view.data.title,
    views: 0,
    likes: null,
    comments: null,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects oversized raw search titles before markup decoding without truncating them into success', async () => {
  for (const title of ['x'.repeat(4097), '<'.repeat(60000)]) {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(fixture.nav))
      .mockResolvedValueOnce(
        json({ code: 0, data: { result: [{ bvid: BV, title, play: 1 }] } }),
      );
    await expect(
      createBilibiliPublicHttpHandlers({ fetcher }).search(query),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
});
it('accepts the bounded raw-title edge and preserves the existing 500-character output limit', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(fixture.nav))
    .mockResolvedValueOnce(
      json({
        code: 0,
        data: { result: [{ bvid: BV, title: '<'.repeat(4096), play: 1 }] },
      }),
    );
  const items = await createBilibiliPublicHttpHandlers({ fetcher }).search(
    query,
  );
  expect(items[0].title).toBe('<'.repeat(500));
  expect(items[0].views).toBe(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not accept an oversized diagnostic whose uninspected tail could contain a refusal', async () => {
  for (const field of ['message', 'msg', 'showMsg']) {
    const fetcher = vi.fn(async () =>
      json({
        code: 0,
        [field]: `${'x'.repeat(1000)}captcha required`,
        data: fixture.view.data,
      }),
    );
    await expect(
      createBilibiliPublicHttpHandlers({ fetcher }).video({ bvid: BV }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
