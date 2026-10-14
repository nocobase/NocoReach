import { createHash } from 'node:crypto';
import type { MockRunContext } from './types.js';
import { fixtureProduct, projectText } from './fixtures.js';

type Platform = 'xiaohongshu' | 'bilibili';
type CollectorKind = 'health' | 'search' | 'video';
export interface MockBrowserCollectorConfig {
  id: string;
  name: string;
  url: string;
  token: string;
  platforms: Platform[];
  projectIds?: string[];
}
export interface MockCollectorTransport {
  fetchCollector(
    projectId: string,
    input: string | URL,
    init: RequestInit,
  ): Promise<Response>;
}
export type MockYouTubeRunner = (
  target: string,
  mode: 'search' | 'video',
  options: { signal: AbortSignal },
) => Promise<unknown>;
export interface MockYouTubeDependencies {
  runner: MockYouTubeRunner;
  readCaption(input: string, signal: AbortSignal): Promise<{ text: string }>;
}
export type MockMediaErrorCode =
  | 'cancelled'
  | 'timeout'
  | 'access_denied'
  | 'upstream_error'
  | 'invalid_response'
  | 'invalid_input'
  | 'unavailable';
export class MockMediaError extends Error {
  constructor(readonly code: MockMediaErrorCode) {
    super(`Mock media ${code}`);
  }
}
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Fictional public identities stay stable across runs, retries and scenario changes. */
export const MOCK_MEDIA = Object.freeze({
  xiaohongshu: Object.freeze([
    '64b10b100000000000000001',
    '64b10b100000000000000002',
    '64b10b100000000000000003',
    '64b10b100000000000000004',
  ]),
  bilibili: Object.freeze([
    'BV1NB411c7m1',
    'BV1NB411c7m2',
    'BV1NB411c7m3',
    'BV1NB411c7m4',
  ]),
  youtube: Object.freeze([
    'NocoBloom01',
    'NocoBloom02',
    'NocoBloom03',
    'NocoBloom04',
  ]),
});
const titles = [
  'NocoBloom: 从模板搭建团队工作台',
  'NocoBloom: 串联 GitHub 与 Slack 工作流',
  'NocoBloom: 做一张每周增长报表',
  'NocoBloom: 新版自动化模板体验',
];
const descriptions = [
  '用 NocoBloom 的模板整理客户资料，建立团队协作工作台。',
  '将 GitHub issue 变成团队任务，在 Slack 中协作跟进。',
  '连接产品数据，建立每周增长报表并分享给团队。',
  '新版模板让新成员更快完成上手流程，保留清晰的人工审核步骤。',
];

export function mockBrowserCollectorConfig(
  projectId?: string,
): MockBrowserCollectorConfig {
  return {
    id: 'nocoreach-mock',
    name: 'NocoReach 模拟采集器',
    url: 'https://collector.nocobloom.example',
    platforms: ['xiaohongshu', 'bilibili'],
    token: 'nocobloom-fictional-collector-token-only',
    ...(projectId ? { projectIds: [projectId] } : {}),
  };
}

export const mockBrowserCollectors: MockBrowserCollectorConfig[] = [
  mockBrowserCollectorConfig(),
];

export function freezeMockCollectorContext(
  context: MockRunContext,
): Readonly<MockRunContext> {
  if (
    !/^[1-9]\d{0,15}$/.test(String(context.projectId)) ||
    !Number.isFinite(Date.parse(context.clock))
  )
    throw new Error('Invalid mock collector context');
  return Object.freeze({
    ...context,
    ...(context.project
      ? { project: Object.freeze({ ...context.project }) }
      : {}),
  });
}
function scenario(context: Readonly<MockRunContext>) {
  const value = String(context.scenario).replace(/[-_]/g, '');
  return value === 'ratelimit' ? '429' : value;
}
function count(context: Readonly<MockRunContext>, maximum: number) {
  return scenario(context) === 'pagination'
    ? maximum
    : scenario(context) === 'newdata'
      ? 4
      : 3;
}
function metric(context: Readonly<MockRunContext>, index: number) {
  const hash = createHash('sha256')
    .update(`${context.projectId}:${context.seed}:media:${index}`)
    .digest();
  return (
    1000 + hash.readUInt16BE(0) + (scenario(context) === 'newdata' ? 275 : 0)
  );
}
function published(context: Readonly<MockRunContext>, index: number) {
  const at = new Date(Date.parse(context.clock) - (index + 1) * 86400000);
  at.setUTCSeconds(0, 0);
  return at.toISOString();
}
function title(index: number, context: MockRunContext) {
  return projectText(
    context,
    titles[index] ?? `NocoBloom: 团队工作流示例 ${index + 1}`,
  );
}
function id(
  platform: keyof typeof MOCK_MEDIA,
  index: number,
  context: MockRunContext,
) {
  if (context.project) {
    const hash = createHash('sha256')
      .update(`${context.projectId}:${context.seed}:${platform}:${index}`)
      .digest();
    if (platform === 'xiaohongshu') return hash.toString('hex').slice(0, 24);
    if (platform === 'bilibili')
      return `BV1${hash.toString('hex').slice(0, 9)}`;
    return hash.toString('base64url').slice(0, 11);
  }
  return (
    MOCK_MEDIA[platform][index] ??
    (platform === 'xiaohongshu'
      ? `64b10b1000000000${(index + 1).toString(16).padStart(8, '0')}`
      : platform === 'bilibili'
        ? `BV1NB411${(index + 1).toString(36).padStart(4, '0')}`
        : `NocoBloom${String(index + 1).padStart(2, '0')}`)
  );
}
function indexOf(
  platform: keyof typeof MOCK_MEDIA,
  value: string,
  context: Readonly<MockRunContext>,
) {
  return Array.from(
    { length: count(context, platform === 'youtube' ? 5 : 20) },
    (_, index) => index,
  ).find(
    (index) =>
      id(platform, index, context) === value ||
      MOCK_MEDIA[platform][index] === value,
  );
}

function requestedIndex(
  platform: 'bilibili' | 'youtube',
  value: string,
  context: MockRunContext,
): number | undefined {
  const known = indexOf(platform, value, context);
  if (known !== undefined) return known;
  const valid =
    platform === 'youtube'
      ? VIDEO_ID.test(value)
      : /^BV[0-9A-Za-z]{10}$/.test(value);
  return context.project && valid
    ? createHash('sha256').update(value).digest().readUInt16BE(0) % 20
    : undefined;
}

/** No timer or delayed success: cancellation is the only settlement of this scenario. */
function untilAborted(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const abort = () => {
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Mock operation cancelled', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    if (!signal) {
      reject(new Error('Slow mock operation requires an AbortSignal'));
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', 'x-nocoreach-mock': 'true' },
  });

/** Feed real collector envelope/schema validators, rather than return normalized business records. */
export function mockCollectorTransport(
  snapshot: MockRunContext,
  platform: Platform,
): MockCollectorTransport {
  const context = freezeMockCollectorContext(snapshot);
  return {
    async fetchCollector(projectId, input, init = {}) {
      init.signal?.throwIfAborted();
      if (typeof init.body !== 'string')
        throw new Error('Unmatched mock collector request body');
      const request = JSON.parse(init.body) as Record<string, unknown>;
      const url = new URL(String(input));
      const kind = url.pathname.slice(1) as CollectorKind;
      if (
        url.origin !== 'https://collector.nocobloom.example' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        String(projectId) !== String(context.projectId) ||
        request.projectId !== String(context.projectId) ||
        request.platform !== platform ||
        request.protocolVersion !== 1 ||
        init.method !== 'POST' ||
        ![
          'health',
          'search',
          ...(platform === 'bilibili' ? ['video'] : []),
        ].includes(kind)
      )
        throw new Error('Unmatched mock collector request');
      const envelope = {
        protocolVersion: 1,
        platform,
        projectId: String(context.projectId),
        requestId: request.requestId,
        ok: true,
        kind,
      };
      const mode = scenario(context);
      if (mode === 'slowcancel') return untilAborted(init.signal ?? undefined);
      if (mode === 'timeout')
        throw new DOMException('Mock collector timeout', 'TimeoutError');
      if (mode === '429') return json({ error: 'mock rate limit' }, 429);
      if (mode === 'error')
        return json({ error: 'mock upstream unavailable' }, 503);
      if (mode === 'malformed')
        return json({ ...envelope, protocolVersion: 999 });
      if (mode === 'loginexpired')
        return json({ ...envelope, ok: false, errorCode: 'login_required' });
      if (!['normal', 'newdata', 'empty', 'pagination'].includes(mode))
        throw new Error('Unknown mock collector scenario');
      if (kind === 'health') return json({ ...envelope, toolInstalled: true });
      const collectedAt = new Date(context.clock).toISOString();
      if (platform === 'xiaohongshu') {
        const items =
          mode === 'empty'
            ? []
            : Array.from({ length: count(context, 20) }, (_, index) => ({
                title: title(index, context),
                url: `https://www.xiaohongshu.com/explore/${id(platform, index, context)}?xsec_source=pc_search`,
                // Preserve upstream lossy count formats and let the real normalizer decide certainty.
                likes:
                  index === 0
                    ? '1.2万'
                    : index === 1
                      ? '0'
                      : String(Math.floor(metric(context, index) / 50)),
                published_at: published(context, index).slice(0, 10),
              }));
        return json({ ...envelope, collectedAt, items });
      }
      const metadata = (
        index: number,
        completeness: 'search_summary' | 'video_metadata',
      ) => ({
        bvid: id(platform, index, context),
        title: title(index, context),
        views: metric(context, index),
        likes: Math.floor(metric(context, index) / 50),
        comments: Math.floor(metric(context, index) / 300),
        publishedAt: published(context, index),
        publishedAtPrecision: 'minute',
        completeness,
      });
      if (kind === 'search')
        return json({
          ...envelope,
          collectedAt,
          items:
            mode === 'empty'
              ? []
              : Array.from({ length: count(context, 20) }, (_, index) =>
                  metadata(index, 'search_summary'),
                ),
        });
      const index = requestedIndex('bilibili', String(request.bvid), context);
      if (mode === 'empty' || index === undefined)
        return json({ ...envelope, ok: false, errorCode: 'not_found' });
      return json({
        ...envelope,
        collectedAt,
        item: {
          ...metadata(index, 'video_metadata'),
          bvid: String(request.bvid),
        },
      });
    },
  };
}

export function mockYouTubeDependencies(
  snapshot: MockRunContext,
): MockYouTubeDependencies {
  const context = freezeMockCollectorContext(snapshot);
  const runner: MockYouTubeRunner = async (target, mode, { signal }) => {
    if (signal.aborted) throw new MockMediaError('cancelled');
    const selectedScenario = scenario(context);
    if (selectedScenario === 'slowcancel') {
      await untilAborted(signal).catch(() => {
        throw new MockMediaError('cancelled');
      });
    }
    if (selectedScenario === 'timeout') throw new MockMediaError('timeout');
    if (['loginexpired', '429'].includes(selectedScenario))
      throw new MockMediaError('access_denied');
    if (selectedScenario === 'error')
      throw new MockMediaError('upstream_error');
    if (selectedScenario === 'malformed')
      return { entries: 'invalid mock entries', id: null, title: 17 };
    if (
      !['normal', 'newdata', 'empty', 'pagination'].includes(selectedScenario)
    )
      throw new MockMediaError('invalid_response');
    if (mode === 'search') {
      if (!/^ytsearch5:.{2,80}$/u.test(target))
        throw new MockMediaError('invalid_input');
      return {
        _type: 'playlist',
        entries:
          selectedScenario === 'empty'
            ? []
            : Array.from({ length: count(context, 5) }, (_, index) => ({
                id: id('youtube', index, context),
                title: title(index, context),
              })),
      };
    }
    const match = target.match(
      /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/,
    );
    if (!match) throw new MockMediaError('invalid_input');
    const videoId = match[1];
    const index = requestedIndex('youtube', videoId, context);
    if (selectedScenario === 'empty' || index === undefined)
      throw new MockMediaError('unavailable');
    const manual = index % 2 === 0;
    return {
      id: videoId,
      title: title(index, context),
      description: `${projectText(context, descriptions[index] ?? descriptions[0])}\n合成测试项目：${fixtureProduct(context).origin}/`,
      channel: `${fixtureProduct(context).name} Studio（虚构演示频道）`,
      channel_id: context.project
        ? `UC${createHash('sha256').update(`${context.projectId}:${context.seed}:channel`).digest('base64url').slice(0, 22)}`
        : 'UCNocoBloomFictionalDemo01',
      upload_date: published(context, index).slice(0, 10).replace(/-/g, ''),
      duration: 180 + index * 45,
      view_count: metric(context, index),
      like_count: Math.floor(metric(context, index) / 50),
      comment_count: Math.floor(metric(context, index) / 300),
      [manual ? 'subtitles' : 'automatic_captions']: {
        'zh-Hans': [
          {
            ext: manual ? 'json3' : 'vtt',
            url: `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=${manual ? 'json3' : 'vtt'}`,
          },
        ],
      },
    };
  };
  const readCaption = async (input: string, signal: AbortSignal) => {
    if (signal.aborted) throw new MockMediaError('cancelled');
    const url = new URL(input);
    const videoId = url.searchParams.get('v') ?? '';
    const index = requestedIndex('youtube', videoId, context);
    if (
      url.origin !== 'https://www.youtube.com' ||
      url.pathname !== '/api/timedtext' ||
      !VIDEO_ID.test(videoId) ||
      index === undefined
    )
      throw new MockMediaError('invalid_response');
    const lines = [
      `<b>${title(index, context).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</b>`,
      projectText(context, descriptions[index] ?? descriptions[0]),
      'GitHub &amp; Slack 与每周报表共享同一份团队数据。',
    ];
    return {
      text:
        url.searchParams.get('fmt') === 'json3'
          ? JSON.stringify({
              events: [...lines, lines.at(-1)].map((line) => ({
                segs: [{ utf8: line }],
              })),
            })
          : `WEBVTT\n\n${lines.map((line, position) => `${position + 1}\n00:00:0${position}.000 --> 00:00:0${position + 1}.000\n${line}\n`).join('\n')}`,
    };
  };
  return { runner, readCaption };
}
