import { z } from 'zod';
import {
  parseBrowserCollectors as collectorConfigs,
  type BrowserCollectorConfig as XiaohongshuCollectorConfig,
} from './browser-collector-config.js';
export { collectorConfigs, type XiaohongshuCollectorConfig };
import type { OutboundNetwork } from './outbound-network.js';

export const XHS_ERRORS = [
  'collector_unreachable',
  'collector_unauthorized',
  'tool_missing',
  'browser_unavailable',
  'login_required',
  'security_block',
  'timeout',
  'invalid_response',
  'busy',
  'no_results',
  'cancelled',
] as const;
export type XiaohongshuErrorCode = (typeof XHS_ERRORS)[number];
export const XHS_MESSAGES: Record<XiaohongshuErrorCode, string> = {
  collector_unreachable: '无法连接小红书采集器，请检查采集器是否运行。',
  collector_unauthorized: '小红书采集器认证失败，请管理员核对部署令牌。',
  tool_missing: '采集器尚未安装 OpenCLI，请管理员完成安装。',
  browser_unavailable:
    '采集器无法连接浏览器，请打开已授权的 Chrome 和 OpenCLI 扩展。',
  login_required: '请在采集器的浏览器中自行登录小红书，再重新搜索。',
  security_block:
    '小红书要求安全验证或限制了访问，采集已停止，请在浏览器中处理。',
  timeout: '小红书采集超时，保留上次成功结果，请稍后手动重试。',
  invalid_response: '采集器返回的数据格式不完整，未覆盖上次成功结果。',
  busy: '采集器正在处理其他请求，请稍后再试。',
  no_results:
    '本次未返回可确认的笔记，未验证当前登录状态；这不代表全网没有提及。',
  cancelled: '采集已取消，上次成功结果保留。',
};
export class XiaohongshuError extends Error {
  readonly status: number;
  constructor(readonly code: XiaohongshuErrorCode) {
    super(XHS_MESSAGES[code]);
    this.status = code === 'busy' ? 409 : code === 'timeout' ? 504 : 502;
  }
}
const projectSchema = z.string().regex(/^[1-9]\d{0,15}$/);
export const querySchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .refine(
    (v) =>
      !v.startsWith('-') &&
      ![...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
  );
const timestamp = z.string().datetime({ offset: true });
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const ms = Date.parse(`${v}T00:00:00Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === v;
  });
export interface XiaohongshuNote {
  id: string;
  title: string;
  url: string;
  likes: number | null;
  likesText: string | null;
  publishedAt: null;
  estimatedPublishedAt: string | null;
}
/** Read only fields actually returned by OpenCLI. Its published_at is inferred from the note ID. */
export function normalizeSearchRows(raw: unknown): XiaohongshuNote[] {
  const rows = z
    .array(
      z.object({
        title: z.string().trim().min(1).max(500),
        url: z.string().max(2048),
        likes: z
          .union([z.string().max(40), z.number().nonnegative().safe()])
          .nullish(),
        published_at: z.string().max(20).nullish(),
      }),
    )
    .max(20)
    .safeParse(raw);
  if (!rows.success) throw new XiaohongshuError('invalid_response');
  if (!rows.data.length) throw new XiaohongshuError('no_results');
  const notes: XiaohongshuNote[] = [];
  const seen = new Set<string>();
  for (const row of rows.data) {
    let url: URL;
    try {
      url = new URL(row.url);
    } catch {
      throw new XiaohongshuError('invalid_response');
    }
    const match = url.pathname.match(
      /^\/(?:search_result|explore|note)\/([a-f\d]{24})\/?$/i,
    );
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'www.xiaohongshu.com' ||
      url.port ||
      url.username ||
      url.password ||
      !match
    )
      throw new XiaohongshuError('invalid_response');
    const id = match[1].toLowerCase();
    // Retain only the platform-supplied note-link parameters, never auth/author fields.
    const safe = new URL(`https://www.xiaohongshu.com/explore/${id}`);
    for (const key of ['xsec_token', 'xsec_source']) {
      const v = url.searchParams.get(key);
      if (v && v.length <= 1024) safe.searchParams.set(key, v);
    }
    // OpenCLI substitutes '0' when its DOM selector misses the count. Keep this ambiguous value unknown.
    const rawText = row.likes == null ? null : String(row.likes).trim() || null;
    const text = rawText === '0' ? null : rawText;
    const exact =
      text && /^\d+$/.test(text) && Number.isSafeInteger(Number(text))
        ? Number(text)
        : null;
    const estimate = date.safeParse(row.published_at);
    if (seen.has(id)) continue;
    seen.add(id);
    notes.push({
      id,
      title: row.title,
      url: safe.href,
      likes: exact,
      likesText: text,
      publishedAt: null,
      estimatedPublishedAt: estimate.success ? estimate.data : null,
    });
  }
  return notes;
}
export interface CollectorRequest {
  projectId: string;
  requestId: string;
  signal?: AbortSignal;
}
export interface CollectorHealth {
  toolInstalled: boolean;
  browser: 'unchecked';
  login: 'unchecked';
}
export interface CollectorSearch {
  collectedAt: string;
  notes: XiaohongshuNote[];
}
/** Replace only this boundary when the official Runner is available. No old daemon dependencies. */
export interface XiaohongshuAdapter {
  health(
    config: XiaohongshuCollectorConfig,
    request: CollectorRequest,
  ): Promise<CollectorHealth>;
  search(
    config: XiaohongshuCollectorConfig,
    request: CollectorRequest & { query: string },
  ): Promise<CollectorSearch>;
}
const envelope = z.object({
  protocolVersion: z.literal(1),
  platform: z.literal('xiaohongshu'),
  projectId: projectSchema,
  requestId: z.string().uuid(),
  ok: z.boolean(),
});
export class HttpXiaohongshuAdapter implements XiaohongshuAdapter {
  constructor(
    private readonly network: Pick<OutboundNetwork, 'fetchCollector'>,
  ) {}
  private async call(
    config: XiaohongshuCollectorConfig,
    action: 'health' | 'search',
    input: CollectorRequest & { query?: string },
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${config.url.replace(/\/$/, '')}/${action}`);
    let response: Response;
    try {
      response = await this.network.fetchCollector(input.projectId, url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.any([
          AbortSignal.timeout(action === 'health' ? 10000 : 80000),
          ...(input.signal ? [input.signal] : []),
        ]),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({
          protocolVersion: 1,
          platform: 'xiaohongshu',
          projectId: input.projectId,
          requestId: input.requestId,
          ...(action === 'search' ? { query: input.query, limit: 20 } : {}),
        }),
      });
    } catch (error) {
      if (input.signal?.aborted) throw new XiaohongshuError('cancelled');
      const e = error as { name?: string; code?: string };
      throw new XiaohongshuError(
        e.name === 'TimeoutError' ||
          e.name === 'AbortError' ||
          e.code === 'ETIMEDOUT'
          ? 'timeout'
          : 'collector_unreachable',
      );
    }
    if ([401, 403].includes(response.status))
      throw new XiaohongshuError('collector_unauthorized');
    if (response.status === 429 || response.status === 409)
      throw new XiaohongshuError('busy');
    if (!response.ok) throw new XiaohongshuError('collector_unreachable');
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new XiaohongshuError('invalid_response');
    }
    const parsed = envelope.safeParse(body);
    if (
      !parsed.success ||
      parsed.data.projectId !== input.projectId ||
      parsed.data.requestId !== input.requestId
    )
      throw new XiaohongshuError('invalid_response');
    const value = body as Record<string, unknown>;
    if (!parsed.data.ok) {
      const code = z.enum(XHS_ERRORS).safeParse(value.errorCode);
      throw new XiaohongshuError(code.success ? code.data : 'invalid_response');
    }
    if (value.kind !== action) throw new XiaohongshuError('invalid_response');
    return value;
  }
  async health(
    config: XiaohongshuCollectorConfig,
    input: CollectorRequest,
  ): Promise<CollectorHealth> {
    const result = await this.call(config, 'health', input);
    if (result.toolInstalled !== true)
      throw new XiaohongshuError(
        result.toolInstalled === false ? 'tool_missing' : 'invalid_response',
      );
    return { toolInstalled: true, browser: 'unchecked', login: 'unchecked' };
  }
  async search(
    config: XiaohongshuCollectorConfig,
    input: CollectorRequest & { query: string },
  ): Promise<CollectorSearch> {
    const result = await this.call(config, 'search', input);
    const at = timestamp.safeParse(result.collectedAt);
    if (!at.success || Math.abs(Date.now() - Date.parse(at.data)) > 10 * 60000)
      throw new XiaohongshuError('invalid_response');
    return { collectedAt: at.data, notes: normalizeSearchRows(result.items) };
  }
}
