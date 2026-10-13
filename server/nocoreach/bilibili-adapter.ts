import { systemMessageText } from '../../shared/i18n/messages.js';
import { z } from 'zod';
import type { OutboundNetwork } from './outbound-network.js';
import type { BrowserCollectorConfig } from './browser-collector-config.js';

export const BILIBILI_ERRORS = [
  'invalid_input',
  'conflict',
  'busy',
  'not_connected',
  'cancelled',
  'collector_unreachable',
  'collector_unauthorized',
  'tool_missing',
  'browser_unavailable',
  'login_required',
  'security_block',
  'rate_limited',
  'not_found',
  'invalid_response',
  'timeout',
  'unsupported',
  'unconfirmed_empty',
] as const;
export type BilibiliErrorCode = (typeof BILIBILI_ERRORS)[number];
export const BILIBILI_MESSAGES: Record<BilibiliErrorCode, string> = {
  invalid_input: systemMessageText('bilibili.selectAvailableCollectorEnterUp'),
  conflict: systemMessageText(
    'bilibili.bilibiliConfigurationChangedReloadBefore',
  ),
  busy: systemMessageText('common.collectorBusyAnotherRequestTry'),
  not_connected: systemMessageText(
    'bilibili.saveAvailableBilibiliCollectorConfiguration',
  ),
  cancelled: systemMessageText('bilibili.bilibiliCollectionStoppedSavedData'),
  collector_unreachable: systemMessageText(
    'bilibili.cannotReachBilibiliCollectorCheck',
  ),
  collector_unauthorized: systemMessageText(
    'bilibili.bilibiliCollectorAuthenticationFailedAsk',
  ),
  tool_missing: systemMessageText('common.opencliNotInstalledCollectorAsk'),
  browser_unavailable: systemMessageText(
    'bilibili.collectorCannotReachBrowserOpen',
  ),
  login_required: systemMessageText(
    'bilibili.bilibiliRequiresLoginCollectionStopped',
  ),
  security_block: systemMessageText(
    'bilibili.bilibiliRequiresVerificationDeniedAccess',
  ),
  rate_limited: systemMessageText('bilibili.bilibiliRequestsRateLimitedWait'),
  not_found: systemMessageText(
    'bilibili.bilibiliVideoMissingDeletedUnavailable',
  ),
  invalid_response: systemMessageText(
    'bilibili.bilibiliResponseNotVerifiedNot',
  ),
  timeout: systemMessageText('bilibili.bilibiliCollectionTimedOutSaved'),
  unsupported: systemMessageText(
    'bilibili.collectorNotSelectedBilibiliCapability',
  ),
  unconfirmed_empty: systemMessageText(
    'bilibili.noVerifiableResultsReturnedNot',
  ),
};
export class BilibiliError extends Error {
  readonly status: number;
  constructor(readonly code: BilibiliErrorCode) {
    super(BILIBILI_MESSAGES[code]);
    this.status =
      code === 'invalid_input'
        ? 400
        : ['conflict', 'busy', 'not_connected', 'cancelled'].includes(code)
          ? 409
          : code === 'rate_limited'
            ? 429
            : code === 'timeout'
              ? 504
              : 502;
  }
}
export const BILIBILI_BV = /^BV[a-zA-Z0-9]{10}$/;
export const bilibiliTerm = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (s) => ![...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
  );
const inputList = z
  .union([z.string().max(2048), z.array(z.string().max(300)).max(20)])
  .optional();
const inputs = z
  .object({
    projectId: z.unknown().optional(),
    collectorId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
    terms: inputList,
    bvids: inputList,
    revision: z.string().uuid().nullable(),
  })
  .strict();
const list = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value : (value || '').split(/[,，、\n]/))
    .map((s) => s.trim())
    .filter(Boolean);
export function bilibiliBvid(value: string): string {
  if (BILIBILI_BV.test(value)) return value;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/video\/(BV[a-zA-Z0-9]{10})\/?$/);
    if (
      url.protocol === 'https:' &&
      ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(
        url.hostname,
      ) &&
      !url.username &&
      !url.password &&
      !url.port &&
      match
    )
      return match[1];
  } catch {
    /* No network resolution of arbitrary or shortened URLs. */
  }
  throw new BilibiliError('invalid_input');
}
export interface BilibiliConfig {
  collectorId: string;
  terms: string[];
  bvids: string[];
}
export function bilibiliConfig(
  value: unknown,
): BilibiliConfig & { revision: string | null } {
  const result = inputs.safeParse(value);
  if (!result.success) throw new BilibiliError('invalid_input');
  const terms = [
    ...new Map(
      list(result.data.terms).map((s) => [s.toLowerCase(), s]),
    ).values(),
  ];
  const bvids = [...new Set(list(result.data.bvids).map(bilibiliBvid))];
  if (
    terms.length > 3 ||
    bvids.length > 5 ||
    (!terms.length && !bvids.length) ||
    terms.some((s) => !bilibiliTerm.safeParse(s).success)
  )
    throw new BilibiliError('invalid_input');
  return {
    collectorId: result.data.collectorId,
    terms,
    bvids,
    revision: result.data.revision,
  };
}
const metric = z
  .number()
  .int()
  .nonnegative()
  .safe()
  .nullish()
  .transform((v) => v ?? null);
const metadata = z.object({
  bvid: z.string().regex(BILIBILI_BV),
  title: z
    .string()
    .max(500)
    .nullish()
    .transform((v) => v?.trim() || null),
  views: metric,
  likes: metric,
  comments: metric,
  publishedAt: z
    .string()
    .datetime({ offset: true })
    .nullish()
    .transform((v) => v ?? null),
  publishedAtPrecision: z
    .literal('minute')
    .nullish()
    .transform((v) => v ?? null),
  completeness: z.enum(['search_summary', 'video_metadata']),
});
export type BilibiliMetadata = z.infer<typeof metadata>;
export function bilibiliMetadata(
  value: unknown,
  kind: 'search' | 'video',
  expected?: string,
): BilibiliMetadata {
  const parsed = metadata.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.completeness !==
      (kind === 'search' ? 'search_summary' : 'video_metadata') ||
    (expected && parsed.data.bvid !== expected)
  )
    throw new BilibiliError('invalid_response');
  const item = parsed.data;
  if (kind === 'search') {
    // Be conservative even if a misconfigured collector forgets the upstream-lossiness rule.
    item.views = item.views === 0 ? null : item.views;
    item.likes = null;
    item.comments = null;
    item.publishedAt = null;
    item.publishedAtPrecision = null;
  }
  if (!item.publishedAt || !item.publishedAtPrecision) {
    item.publishedAt = null;
    item.publishedAtPrecision = null;
  }
  return item;
}
export interface BilibiliRequest {
  projectId: string;
  requestId: string;
  signal?: AbortSignal;
}
export interface BilibiliBatch {
  collectedAt: string;
  items: BilibiliMetadata[];
}
export type BilibiliHealth =
  | { toolInstalled: true; browser: 'unchecked'; login: 'unchecked' }
  | {
      upstream: 'anonymous-http';
      platformVerified: false;
      browser: 'not_required';
      login: 'not_used';
    };
export interface BilibiliAdapter {
  health(
    config: BrowserCollectorConfig,
    input: BilibiliRequest,
  ): Promise<BilibiliHealth>;
  search(
    config: BrowserCollectorConfig,
    input: BilibiliRequest & { query: string },
  ): Promise<BilibiliBatch>;
  video(
    config: BrowserCollectorConfig,
    input: BilibiliRequest & { bvid: string },
  ): Promise<BilibiliBatch>;
}
export class HttpBilibiliAdapter implements BilibiliAdapter {
  constructor(
    private readonly network: Pick<OutboundNetwork, 'fetchCollector'>,
    private readonly now: () => number = () => Date.now(),
  ) {}
  private async call(
    config: BrowserCollectorConfig,
    kind: 'health' | 'search' | 'video',
    input: BilibiliRequest & { query?: string; bvid?: string },
  ): Promise<Record<string, unknown>> {
    if (
      !config.platforms.includes('bilibili') ||
      (config.projectIds && !config.projectIds.includes(input.projectId))
    )
      throw new BilibiliError('not_connected');
    let response: Response;
    try {
      response = await this.network.fetchCollector(
        input.projectId,
        `${config.url.replace(/\/$/, '')}/${kind}`,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.any([
            AbortSignal.timeout(kind === 'health' ? 10000 : 80000),
            ...(input.signal ? [input.signal] : []),
          ]),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.token}`,
          },
          body: JSON.stringify({
            protocolVersion: 1,
            platform: 'bilibili',
            projectId: input.projectId,
            requestId: input.requestId,
            ...(kind === 'search' ? { query: input.query, limit: 20 } : {}),
            ...(kind === 'video' ? { bvid: input.bvid } : {}),
          }),
        },
      );
    } catch (error) {
      if (input.signal?.aborted) throw new BilibiliError('cancelled');
      const e = error as { name?: string; code?: string };
      throw new BilibiliError(
        ['TimeoutError', 'AbortError'].includes(e.name || '') ||
          e.code === 'ETIMEDOUT'
          ? 'timeout'
          : 'collector_unreachable',
      );
    }
    if (input.signal?.aborted) throw new BilibiliError('cancelled');
    if ([401, 403].includes(response.status))
      throw new BilibiliError('collector_unauthorized');
    if (response.status === 404) throw new BilibiliError('unsupported');
    if ([409, 429].includes(response.status)) throw new BilibiliError('busy');
    if (!response.ok) throw new BilibiliError('collector_unreachable');
    let body: Record<string, unknown>;
    try {
      const raw = await response.text();
      if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('limit');
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new BilibiliError('invalid_response');
    }
    if (
      !body ||
      Array.isArray(body) ||
      body.protocolVersion !== 1 ||
      body.platform !== 'bilibili' ||
      body.projectId !== input.projectId ||
      body.requestId !== input.requestId ||
      typeof body.ok !== 'boolean'
    )
      throw new BilibiliError('invalid_response');
    if (!body.ok) {
      if (body.errorCode === 'no_results')
        throw new BilibiliError('unconfirmed_empty');
      const error = z.enum(BILIBILI_ERRORS).safeParse(body.errorCode);
      throw new BilibiliError(error.success ? error.data : 'invalid_response');
    }
    if (body.kind !== kind) throw new BilibiliError('invalid_response');
    return body;
  }
  async health(config: BrowserCollectorConfig, input: BilibiliRequest) {
    const body = await this.call(config, 'health', input);
    if (body.upstream === 'anonymous-http') {
      if (
        body.platformVerified !== false ||
        body.browser !== 'not_required' ||
        body.login !== 'not_used' ||
        body.toolInstalled !== undefined
      )
        throw new BilibiliError('invalid_response');
      return {
        upstream: 'anonymous-http' as const,
        platformVerified: false as const,
        browser: 'not_required' as const,
        login: 'not_used' as const,
      };
    }
    if (body.upstream !== undefined && body.upstream !== 'opencli')
      throw new BilibiliError('invalid_response');
    if (body.toolInstalled !== true)
      throw new BilibiliError(
        body.toolInstalled === false ? 'tool_missing' : 'invalid_response',
      );
    return {
      toolInstalled: true as const,
      browser: 'unchecked' as const,
      login: 'unchecked' as const,
    };
  }
  private at(body: Record<string, unknown>) {
    const parsed = z
      .string()
      .datetime({ offset: true })
      .safeParse(body.collectedAt);
    if (
      !parsed.success ||
      Math.abs(this.now() - Date.parse(parsed.data)) > 10 * 60000
    )
      throw new BilibiliError('invalid_response');
    return parsed.data;
  }
  async search(
    config: BrowserCollectorConfig,
    input: BilibiliRequest & { query: string },
  ): Promise<BilibiliBatch> {
    if (!bilibiliTerm.safeParse(input.query).success)
      throw new BilibiliError('invalid_input');
    const body = await this.call(config, 'search', input);
    if (!Array.isArray(body.items) || body.items.length > 20)
      throw new BilibiliError('invalid_response');
    if (!body.items.length) throw new BilibiliError('unconfirmed_empty');
    return {
      collectedAt: this.at(body),
      items: body.items.map((item) => bilibiliMetadata(item, 'search')),
    };
  }
  async video(
    config: BrowserCollectorConfig,
    input: BilibiliRequest & { bvid: string },
  ): Promise<BilibiliBatch> {
    if (!BILIBILI_BV.test(input.bvid)) throw new BilibiliError('invalid_input');
    const body = await this.call(config, 'video', input);
    return {
      collectedAt: this.at(body),
      items: [bilibiliMetadata(body.item, 'video', input.bvid)],
    };
  }
}
