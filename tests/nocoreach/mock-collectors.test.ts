import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { download } from '../../server/nocoreach/public-sources.js';
import { parseBrowserCollectors } from '../../server/nocoreach/browser-collector-config.js';
import {
  createMockXiaohongshuAdapter,
  createMockBilibiliAdapter,
  createMockYouTubeProvider,
} from '../../server/nocoreach/mock-collectors.js';
import {
  mockBrowserCollectorConfig,
  mockBrowserCollectors,
  mockCollectorTransport,
  MOCK_MEDIA,
} from '../../app-plugins/nocoreach-mock/server/collectors.js';
import type { MockRunContext } from '../../app-plugins/nocoreach-mock/server/types.js';

vi.mock('node:child_process', () => {
  const spawn = vi.fn(() => {
    throw new Error('A mock must not launch a real process');
  });
  return { spawn, default: { spawn } };
});
vi.mock('../../server/nocoreach/public-sources.js', () => ({
  download: vi.fn(() => {
    throw new Error('A mock must not download real captions');
  }),
}));

const config = mockBrowserCollectorConfig('1');
const request = (projectId = '1', signal?: AbortSignal) => ({
  projectId,
  requestId: 'a525164a-ff02-427f-986f-e2df18f90697',
  signal,
});
const context = (overrides: Partial<MockRunContext> = {}): MockRunContext => ({
  projectId: '1',
  seed: 'nocobloom-v1',
  clock: '2026-10-12T09:00:00.000Z',
  scenario: 'normal',
  revision: 1,
  runId: 'fixture-run-one',
  ...overrides,
});
const signal = () => new AbortController().signal;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function exerciseAll(snapshot: MockRunContext) {
  const config = mockBrowserCollectorConfig(snapshot.projectId);
  const xhs = createMockXiaohongshuAdapter(snapshot);
  const bili = createMockBilibiliAdapter(snapshot);
  const youtube = createMockYouTubeProvider(snapshot);
  const input = request(snapshot.projectId);
  const [notes, videos, youtubeIds] = await Promise.all([
    xhs.search(config, { ...input, query: 'NocoBloom' }),
    bili.search(config, { ...input, query: 'NocoBloom' }),
    youtube.search('NocoBloom', signal()),
  ]);
  return {
    notes,
    videos,
    youtubeIds,
    detail: await bili.video(config, { ...input, bvid: videos.items[0].bvid }),
    youtubeDetail: await youtube.video(youtubeIds[0], signal()),
  };
}

describe('runtime mock collector boundaries', () => {
  it('exports an accepted fictional collector config for present and future projects', () => {
    expect(parseBrowserCollectors(mockBrowserCollectors)).toEqual(
      mockBrowserCollectors,
    );
    expect(mockBrowserCollectors[0].projectIds).toBeUndefined();
    expect(parseBrowserCollectors([config])[0].projectIds).toEqual(['1']);
  });

  it('validates real health envelopes and rejects unknown transport destinations', async () => {
    const expected = {
      toolInstalled: true,
      browser: 'unchecked',
      login: 'unchecked',
    };
    await expect(
      createMockXiaohongshuAdapter(context()).health(config, request()),
    ).resolves.toEqual(expected);
    await expect(
      createMockBilibiliAdapter(context()).health(config, request()),
    ).resolves.toEqual(expected);
    const transport = mockCollectorTransport(context(), 'xiaohongshu');
    await expect(
      transport.fetchCollector('1', 'https://unmatched.example/search', {
        method: 'POST',
        body: JSON.stringify({
          protocolVersion: 1,
          platform: 'xiaohongshu',
          ...request(),
        }),
      }),
    ).rejects.toThrow('Unmatched mock collector request');
  });

  it('exercises the real collector normalizers, including lossy fields and fixed clock', async () => {
    const { notes, videos, detail } = await exerciseAll(context());
    expect(notes.collectedAt).toBe(context().clock);
    expect(notes.notes.map((note) => note.id)).toEqual(
      MOCK_MEDIA.xiaohongshu.slice(0, 3),
    );
    expect(notes.notes[0]).toMatchObject({
      likes: null,
      likesText: '1.2万',
      publishedAt: null,
      estimatedPublishedAt: '2026-10-11',
    });
    expect(notes.notes[1]).toMatchObject({ likes: null, likesText: null });
    expect(notes.notes[2].likes).toBeGreaterThan(0);
    expect(videos.items[0]).toMatchObject({
      completeness: 'search_summary',
      likes: null,
      comments: null,
      publishedAt: '2026-10-11T09:00:00.000Z',
      publishedAtPrecision: 'minute',
    });
    expect(detail.items[0]).toMatchObject({
      bvid: videos.items[0].bvid,
      title: videos.items[0].title,
      views: videos.items[0].views,
      completeness: 'video_metadata',
      publishedAtPrecision: 'minute',
    });
    expect(detail.items[0].likes).toBeGreaterThan(0);
  });

  it('uses explicit YouTube runner/caption injection and real metadata/json3/VTT decoders without I/O', async () => {
    const fetch = vi.fn(() => {
      throw new Error('No real network');
    });
    vi.stubGlobal('fetch', fetch);
    const youtube = createMockYouTubeProvider(context());
    const ids = await youtube.search('NocoBloom', signal());
    const [manual, automatic] = await Promise.all(
      ids.slice(0, 2).map((id) => youtube.video(id, signal())),
    );
    expect(manual).toMatchObject({
      id: ids[0],
      url: `https://www.youtube.com/watch?v=${ids[0]}`,
      provider: 'yt-dlp',
      fetchedAt: context().clock,
      publishedAt: '2026-10-11',
      transcript: { status: 'manual', language: 'zh-Hans', truncated: false },
    });
    expect(manual.transcript.text).toContain('GitHub & Slack');
    expect(manual.transcript.text).not.toMatch(/<b>|&amp;/);
    expect(manual.transcript.text.split('\n')).toHaveLength(3);
    expect(automatic.transcript).toMatchObject({
      status: 'automatic',
      language: 'zh-Hans',
      truncated: false,
    });
    expect(automatic.transcript.text).not.toMatch(/WEBVTT|-->/);
    await exerciseAll(context());
    expect(fetch).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('repeats identical snapshots deterministically and keeps stable IDs for new data', async () => {
    const first = await exerciseAll(context());
    const repeated = await exerciseAll(
      context({ runId: 'another-run', revision: 4 }),
    );
    expect(repeated).toEqual(first);
    const next = await exerciseAll(
      context({ scenario: 'newdata', revision: 5 }),
    );
    expect(next.notes.notes).toHaveLength(4);
    expect(next.videos.items).toHaveLength(4);
    expect(next.youtubeIds).toHaveLength(4);
    expect(next.youtubeIds.slice(0, 3)).toEqual(first.youtubeIds);
    expect(next.videos.items.slice(0, 3).map((item) => item.bvid)).toEqual(
      first.videos.items.map((item) => item.bvid),
    );
    expect(next.detail.items[0].views).toBe(first.detail.items[0].views! + 275);
  });

  it('isolates project fixtures without shared response objects', async () => {
    const first = await exerciseAll(context());
    const other = await exerciseAll(context({ projectId: '2' }));
    expect(other.videos.items[0].views).not.toBe(first.videos.items[0].views);
    first.notes.notes[0].title = 'Mutated by caller';
    expect((await exerciseAll(context())).notes.notes[0].title).not.toBe(
      'Mutated by caller',
    );
    await expect(
      createMockXiaohongshuAdapter(context()).search(config, {
        ...request('2'),
        query: 'NocoBloom',
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(
      createMockBilibiliAdapter(context()).search(
        mockBrowserCollectorConfig('2'),
        { ...request('2'), query: 'NocoBloom' },
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('resolves current project context per operation and freezes it before awaited I/O', async () => {
    const mutable = { ...context() };
    const resolve = vi.fn(() => mutable);
    const adapter = createMockXiaohongshuAdapter(resolve);
    const pending = adapter.search(config, {
      ...request(),
      query: 'NocoBloom',
    });
    mutable.clock = '2030-01-01T00:00:00.000Z';
    mutable.scenario = 'newdata';
    const old = await pending;
    expect(old.collectedAt).toBe('2026-10-12T09:00:00.000Z');
    expect(old.notes).toHaveLength(3);
    const fresh = await adapter.search(config, {
      ...request(),
      query: 'NocoBloom',
    });
    expect(fresh.collectedAt).toBe(mutable.clock);
    expect(fresh.notes).toHaveLength(4);
    expect(resolve).toHaveBeenNthCalledWith(1, '1');
    expect(resolve).toHaveBeenNthCalledWith(2, '1');
  });

  it('uses bounded maximum batches for adapters with no cursor pagination contract', async () => {
    const result = await exerciseAll(context({ scenario: 'pagination' }));
    expect(result.notes.notes).toHaveLength(20);
    expect(result.videos.items).toHaveLength(20);
    expect(result.youtubeIds).toHaveLength(5);
    const bili = createMockBilibiliAdapter(context({ scenario: 'pagination' }));
    const last = result.videos.items.at(-1)!;
    expect(
      (await bili.video(config, { ...request(), bvid: last.bvid })).items[0]
        .title,
    ).toBe(last.title);
  });

  it('preserves empty-search semantics rather than manufacturing confirmed success', async () => {
    const snapshot = context({ scenario: 'empty' });
    await expect(
      createMockXiaohongshuAdapter(snapshot).search(config, {
        ...request(),
        query: 'NocoBloom',
      }),
    ).rejects.toMatchObject({ code: 'no_results' });
    await expect(
      createMockBilibiliAdapter(snapshot).search(config, {
        ...request(),
        query: 'NocoBloom',
      }),
    ).rejects.toMatchObject({ code: 'unconfirmed_empty' });
    await expect(
      createMockYouTubeProvider(snapshot).search('NocoBloom', signal()),
    ).resolves.toEqual([]);
    await expect(
      createMockBilibiliAdapter(snapshot).video(config, {
        ...request(),
        bvid: MOCK_MEDIA.bilibili[0],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it.each([
    ['login-expired', 'login_required', 'login_required', 'access_denied'],
    ['rate-limit', 'busy', 'busy', 'access_denied'],
    ['timeout', 'timeout', 'timeout', 'timeout'],
    ['malformed', 'invalid_response', 'invalid_response', 'invalid_response'],
    [
      'error',
      'collector_unreachable',
      'collector_unreachable',
      'upstream_error',
    ],
  ] as const)(
    'passes %s through production error/envelope handling',
    async (scenario, xhsCode, biliCode, youtubeCode) => {
      const snapshot = context({ scenario });
      await expect(
        createMockXiaohongshuAdapter(snapshot).search(config, {
          ...request(),
          query: 'NocoBloom',
        }),
      ).rejects.toMatchObject({ code: xhsCode });
      await expect(
        createMockBilibiliAdapter(snapshot).search(config, {
          ...request(),
          query: 'NocoBloom',
        }),
      ).rejects.toMatchObject({ code: biliCode });
      await expect(
        createMockYouTubeProvider(snapshot).search('NocoBloom', signal()),
      ).rejects.toMatchObject({ code: youtubeCode });
    },
  );

  it('rejects unmatched details instead of synthesizing arbitrary IDs or falling back', async () => {
    await expect(
      createMockBilibiliAdapter(context()).video(config, {
        ...request(),
        bvid: 'BV1NB411zzzz',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      createMockYouTubeProvider(context()).video('Unknown0001', signal()),
    ).rejects.toMatchObject({ code: 'unavailable' });
    await expect(
      createMockYouTubeProvider(context()).video('bad', signal()),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('really waits for cancellation, cannot switch an in-flight run, and never completes late', async () => {
    let selected = context({ scenario: 'slow-cancel' });
    const controller = new AbortController();
    const completed = vi.fn();
    const operations = [
      createMockXiaohongshuAdapter(() => selected).search(config, {
        ...request('1', controller.signal),
        query: 'NocoBloom',
      }),
      createMockBilibiliAdapter(() => selected).search(config, {
        ...request('1', controller.signal),
        query: 'NocoBloom',
      }),
      createMockYouTubeProvider(() => selected).search(
        'NocoBloom',
        controller.signal,
      ),
      createMockYouTubeProvider(() => selected).video(
        MOCK_MEDIA.youtube[0],
        controller.signal,
      ),
    ].map((pending) => pending.then(completed, (error: unknown) => error));
    selected = context({ scenario: 'newdata', revision: 2 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(completed).not.toHaveBeenCalled();
    controller.abort();
    const failures = await Promise.all(operations);
    for (const failure of failures)
      expect(failure).toMatchObject({ code: 'cancelled' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(completed).not.toHaveBeenCalled();
    expect(
      await createMockYouTubeProvider(() => selected).search(
        'NocoBloom',
        signal(),
      ),
    ).toHaveLength(4);
  });

  it('rejects already cancelled requests immediately', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createMockXiaohongshuAdapter(context()).search(config, {
        ...request('1', controller.signal),
        query: 'NocoBloom',
      }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    await expect(
      createMockBilibiliAdapter(context()).search(config, {
        ...request('1', controller.signal),
        query: 'NocoBloom',
      }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    await expect(
      createMockYouTubeProvider(context()).video(
        MOCK_MEDIA.youtube[0],
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: 'cancelled' });
  });
});
