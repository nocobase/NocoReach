// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { HttpYouTubeProvider } from '../../server/nocoreach/youtube-collector.js';
import type { BrowserCollectorConfig } from '../../server/nocoreach/browser-collector-config.js';
import type { CollectorResolver } from '../../server/nocoreach/collector-connections.js';
import {
  systemMessageKey,
  systemMessageText,
} from '../../shared/i18n/messages.js';
import { youtubeSystemErrors } from '../../shared/youtube-errors.js';
import type { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';

const ID = 'Im69kzhpR3I';
const clock = '2026-10-15T05:00:00.000Z';
const request = { projectId: '1', requestId: randomUUID() };
const config: BrowserCollectorConfig = {
  id: 'youtube',
  name: 'YouTube Collector',
  platforms: ['youtube'],
  url: 'https://collector.example/youtube',
  token: 'private-token-'.repeat(4),
  projectIds: ['1'],
};
const signal = () => new AbortController().signal;
const video = () => ({
  id: ID,
  url: `https://www.youtube.com/watch?v=${ID}`,
  title: 'Public video',
  description: '',
  channel: 'Public channel',
  publishedAt: '2026-10-14',
  views: 0,
  likes: null,
  comments: null,
  duration: 30,
  fetchedAt: clock,
  provider: 'yt-dlp',
  transcript: { status: 'missing', language: null, text: '', truncated: false },
});
const envelope = (kind: string, data: object = {}) => ({
  protocolVersion: 1,
  platform: 'youtube',
  ...request,
  ok: true,
  kind,
  collectedAt: clock,
  ...data,
});
function fixture(
  collectors: BrowserCollectorConfig[] = [config],
  profile?: object,
) {
  const fetchCollector = vi
    .fn()
    .mockImplementation(
      async (_id, url) =>
        new Response(
          JSON.stringify(
            url.endsWith('/search')
              ? envelope('search', { items: [{ id: ID }, { id: ID }] })
              : envelope('video', { item: video() }),
          ),
        ),
    );
  const resolve = vi.fn(() => profile);
  const allowed = vi.fn<CollectorResolver['allowed']>(() => collectors);
  const network = {
    fetchCollector,
    profiles: { resolve },
  } as unknown as OutboundNetwork;
  return {
    fetchCollector,
    resolve,
    allowed,
    provider: new HttpYouTubeProvider(network, { allowed }, () =>
      Date.parse(clock),
    ),
  };
}

describe('YouTube Collector protocol v1', () => {
  it('recognizes current and historical owned errors for API and snapshot localization', () => {
    for (const key of youtubeSystemErrors) {
      expect(systemMessageKey(systemMessageText(key))).toBe(key);
      expect(systemMessageText(systemMessageText(key), {}, 'en-US')).toBe(
        systemMessageText(key, {}, 'en-US'),
      );
    }
    expect(
      systemMessageKey(
        '服务器尚未安装 yt-dlp，请管理员按 YouTube 接入文档安装后重试',
      ),
    ).toBe('youtube.toolMissing');
    expect(
      systemMessageKey('unknown upstream detail: private query'),
    ).toBeUndefined();
  });

  it('uses resolved Collector endpoints with authentication and exact request metadata', async () => {
    const f = fixture();
    expect(await f.provider.search('NocoBase', signal(), request)).toEqual([
      ID,
    ]);
    expect(await f.provider.video(ID, signal(), request)).toEqual(video());
    for (const [project, url, init] of f.fetchCollector.mock.calls) {
      expect(project).toBe('1');
      expect(url).toMatch(
        /^https:\/\/collector.example\/youtube\/(search|video)$/,
      );
      expect(init).toMatchObject({
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${config.token}` },
      });
      expect(JSON.parse(init.body)).toEqual({
        protocolVersion: 1,
        platform: 'youtube',
        ...request,
        ...(url.endsWith('/search')
          ? { query: 'NocoBase', limit: 5 }
          : { videoId: ID }),
      });
    }
    expect(f.resolve).toHaveBeenCalledWith('1', 'youtube');
    expect(f.allowed).toHaveBeenCalledWith('1', 'youtube');
  });
  it.each([
    { collectors: [], profile: undefined, code: 'collector_not_configured' },
    {
      collectors: [config, { ...config, id: 'second' }],
      profile: undefined,
      code: 'collector_ambiguous',
    },
    {
      collectors: [config],
      profile: { url: 'http://proxy.invalid', password: 'secret' },
      code: 'collector_proxy_migration',
    },
  ])(
    'fails closed for missing, ambiguous or legacy proxy configuration',
    async ({ collectors, profile, code }) => {
      const f = fixture(collectors, profile);
      await expect(
        f.provider.video(ID, signal(), request),
      ).rejects.toMatchObject({ code });
      expect(f.fetchCollector).not.toHaveBeenCalled();
    },
  );
  it('reports unreadable credentials without making a Collector request', async () => {
    const f = fixture();
    f.allowed.mockImplementationOnce(() => {
      throw Object.assign(new Error('collectorConnection.unreadable'), {
        status: 503,
      });
    });
    await expect(f.provider.video(ID, signal(), request)).rejects.toMatchObject(
      {
        code: 'collector_unreadable',
        status: 503,
        message: systemMessageText('collectorConnection.unreadable'),
      },
    );
    expect(f.fetchCollector).not.toHaveBeenCalled();
  });
  it.each([
    { protocolVersion: 2 },
    { platform: 'bilibili' },
    { projectId: '2' },
    { requestId: randomUUID() },
    { kind: 'search' },
    { ok: 'true' },
    { collectedAt: '2020-01-01T00:00:00Z' },
  ])('rejects mismatched, stale or malformed envelopes: %j', async (change) => {
    const f = fixture();
    f.fetchCollector.mockResolvedValue(
      new Response(
        JSON.stringify({ ...envelope('video', { item: video() }), ...change }),
      ),
    );
    await expect(f.provider.video(ID, signal(), request)).rejects.toMatchObject(
      { code: 'invalid_response' },
    );
  });
  it.each([
    { id: 'WrongId0001' },
    { url: 'https://evil.invalid' },
    { views: -1 },
    { views: Number.MAX_SAFE_INTEGER + 1 },
    { title: 'x'.repeat(301) },
    { description: 'x'.repeat(2001) },
    { provider: 'local' },
    { fetchedAt: '2020-01-01T00:00:00Z' },
    { publishedAt: '2026-02-31' },
    {
      transcript: {
        status: 'manual',
        language: 'en',
        text: '',
        truncated: false,
      },
    },
    {
      transcript: {
        status: 'missing',
        language: null,
        text: 'invented',
        truncated: false,
      },
    },
    {
      subtitles: {
        en: [{ url: 'https://www.youtube.com/api/timedtext?signature=secret' }],
      },
    },
  ])(
    'rejects invalid metadata and raw signed caption URLs: %j',
    async (change) => {
      const f = fixture();
      f.fetchCollector.mockResolvedValue(
        new Response(
          JSON.stringify(
            envelope('video', { item: { ...video(), ...change } }),
          ),
        ),
      );
      await expect(
        f.provider.video(ID, signal(), request),
      ).rejects.toMatchObject({ code: 'invalid_response' });
    },
  );
  it('normalizes Collector caption not_found without discarding valid metadata', async () => {
    const f = fixture();
    f.fetchCollector.mockResolvedValue(
      new Response(
        JSON.stringify(
          envelope('video', {
            item: {
              ...video(),
              transcript: {
                status: 'failed',
                language: 'en',
                text: '',
                truncated: false,
                errorCode: 'not_found',
              },
            },
          }),
        ),
      ),
    );
    expect(
      (await f.provider.video(ID, signal(), request)).transcript.errorCode,
    ).toBe('unavailable');
  });
  it('preserves transcript failure and zero/null metrics for existing storage semantics', async () => {
    const f = fixture();
    const item = {
      ...video(),
      transcript: {
        status: 'failed',
        language: 'en',
        text: '',
        truncated: false,
        errorCode: 'network_error',
      },
    };
    f.fetchCollector.mockResolvedValue(
      new Response(JSON.stringify(envelope('video', { item }))),
    );
    expect(await f.provider.video(ID, signal(), request)).toEqual(item);
  });
  it('accepts confirmed empty search but rejects overflow and invalid IDs', async () => {
    const f = fixture();
    f.fetchCollector.mockResolvedValueOnce(
      new Response(JSON.stringify(envelope('search', { items: [] }))),
    );
    expect(await f.provider.search('NocoBase', signal(), request)).toEqual([]);
    for (const items of [
      [{ id: 'bad' }],
      Array.from({ length: 6 }, () => ({ id: ID })),
    ]) {
      f.fetchCollector.mockResolvedValueOnce(
        new Response(JSON.stringify(envelope('search', { items }))),
      );
      await expect(
        f.provider.search('NocoBase', signal(), request),
      ).rejects.toMatchObject({ code: 'invalid_response' });
    }
  });
  it.each([
    ['tool_missing', 'dependency_missing'],
    ['security_block', 'access_denied'],
    ['not_found', 'unavailable'],
    ['network_error', 'network_error'],
    ['unsupported', 'collector_unsupported'],
    ['busy', 'collector_busy'],
    ['__proto__', 'invalid_response'],
    ['untrusted', 'invalid_response'],
  ])(
    'maps structured error %s without leaking diagnostics',
    async (errorCode, code) => {
      const f = fixture();
      f.fetchCollector.mockResolvedValue(
        new Response(
          JSON.stringify(
            envelope('video', {
              ok: false,
              errorCode,
              stderr: 'private-token secret signed URL',
            }),
          ),
        ),
      );
      await expect(
        f.provider.video(ID, signal(), request),
      ).rejects.toMatchObject({
        code,
        message: expect.not.stringMatching(/private-token|secret|signed URL/),
      });
    },
  );
  it.each([
    [401, 'collector_unauthorized'],
    [403, 'collector_unauthorized'],
    [404, 'collector_unsupported'],
    [429, 'collector_busy'],
    [503, 'collector_unreachable'],
  ])('classifies HTTP %s safely', async (status, code) => {
    const f = fixture();
    f.fetchCollector.mockResolvedValue(
      new Response('private diagnostic', { status: Number(status) }),
    );
    await expect(f.provider.video(ID, signal(), request)).rejects.toMatchObject(
      { code },
    );
  });
  it('aborts in-flight requests and refuses late data from a transport ignoring cancellation', async () => {
    const f = fixture();
    const controller = new AbortController();
    let resolve!: (value: Response) => void;
    f.fetchCollector.mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    const pending = f.provider.video(ID, controller.signal, request);
    const forwarded = f.fetchCollector.mock.calls[0][2].signal;
    controller.abort();
    expect(forwarded.aborted).toBe(true);
    resolve(new Response(JSON.stringify(envelope('video', { item: video() }))));
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });
  it('classifies the production transport response cap as permanent output_limit', async () => {
    const f = fixture();
    f.fetchCollector.mockRejectedValue(
      Object.assign(new Error('private diagnostic'), {
        code: 'NR_RESPONSE_TOO_LARGE',
      }),
    );
    await expect(f.provider.video(ID, signal(), request)).rejects.toMatchObject(
      { code: 'output_limit' },
    );
  });
  it('bounds streamed response bodies and stops a stalled body on cancellation', async () => {
    const f = fixture();
    f.fetchCollector.mockResolvedValueOnce(
      new Response('x'.repeat(1024 * 1024 + 1)),
    );
    await expect(f.provider.video(ID, signal(), request)).rejects.toMatchObject(
      { code: 'output_limit' },
    );
    const cancel = vi.fn();
    f.fetchCollector.mockResolvedValueOnce(
      new Response(new ReadableStream({ cancel })),
    );
    const controller = new AbortController();
    const pending = f.provider.video(ID, controller.signal, request);
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(cancel).toHaveBeenCalled();
  });
  it('rejects inputs and pre-aborted calls before network access', async () => {
    const f = fixture();
    for (const term of ['x', 'x'.repeat(81), 'bad\nterm'])
      await expect(
        f.provider.search(term, signal(), request),
      ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      f.provider.video('--exec', signal(), request),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      f.provider.video(ID, signal(), { ...request, projectId: '0' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      f.provider.video(ID, AbortSignal.abort(), request),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(f.fetchCollector).not.toHaveBeenCalled();
  });
  it('has no production subprocess or caption-download fallback', () => {
    for (const path of [
      'server/nocoreach/youtube-provider.ts',
      'server/nocoreach/youtube-collector.ts',
    ]) {
      const source = readFileSync(
        new URL('../../' + path, import.meta.url),
        'utf8',
      );
      expect(source).not.toMatch(/node:child_process|runYtDlp|download\(/);
    }
    expect(
      readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8'),
    ).not.toMatch(/requirements-youtube|python3|pip install/);
  });
});
