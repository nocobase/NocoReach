import { createHash } from 'node:crypto';
import type { MockRunContext } from './types.js';

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
});
// Titles as people write them on each platform, without the product's name in front, so the search term finds
// them by subject as a real search does.
const titles = {
  bilibili: [
    '10 分钟从模板搭一个团队工作台',
    '把 GitHub 和 Slack 工作流串起来，实测一周',
    '每周增长报表怎么做？完整流程演示',
    '新版自动化模板上手体验',
    '给客服团队配权限，一步步演示',
    '自托管部署全流程（Docker 版）',
    '零代码搭一个内部 CRM',
    '内部工具搭建平台横评：五款对比',
  ],
  xiaohongshu: [
    '打工人效率神器｜10 分钟搭好团队工作台',
    'GitHub + Slack 自动同步，周报再也不用手抄',
    '每周增长复盘模板分享，直接套用',
    '新版自动化模板真香，附上手笔记',
    '小团队客服权限这样配，省心很多',
    '自己部署一套协作工具，踩坑记录',
    '零代码搭客户管理表，销售同事都说好用',
    '五款内部工具平台对比，选型前必看',
  ],
} as const;

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
// A longer search (the pagination scenario) continues the series: "（2）" and so on after the first round.
function title(platform: Platform, index: number) {
  const list = titles[platform];
  const round = Math.floor(index / list.length);
  return `${list[index % list.length]}${round ? `（${round + 1}）` : ''}`;
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
    return `BV1${hash.toString('hex').slice(0, 9)}`;
  }
  return (
    MOCK_MEDIA[platform][index] ??
    (platform === 'xiaohongshu'
      ? `64b10b1000000000${(index + 1).toString(16).padStart(8, '0')}`
      : `BV1NB411${(index + 1).toString(36).padStart(4, '0')}`)
  );
}
function indexOf(
  platform: keyof typeof MOCK_MEDIA,
  value: string,
  context: Readonly<MockRunContext>,
) {
  return Array.from({ length: count(context, 20) }, (_, index) => index).find(
    (index) =>
      id(platform, index, context) === value ||
      MOCK_MEDIA[platform][index] === value,
  );
}

function requestedIndex(
  platform: 'bilibili',
  value: string,
  context: MockRunContext,
): number | undefined {
  const known = indexOf(platform, value, context);
  if (known !== undefined) return known;
  const valid = /^BV[0-9A-Za-z]{10}$/.test(value);
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
                title: title(platform, index),
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
        title: title(platform, index),
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
