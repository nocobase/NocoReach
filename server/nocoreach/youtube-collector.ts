import { z } from 'zod';
import type { BrowserCollectorConfig } from './browser-collector-config.js';
import {
  isCollectorConnectionError,
  type CollectorResolver,
} from './collector-connections.js';
import type { OutboundNetwork } from './outbound-network.js';
import {
  VIDEO_ID,
  YouTubeError,
  type Video,
  type YouTubeErrorCode,
} from './youtube-provider.js';

export interface YouTubeRequest {
  projectId: string;
  requestId: string;
}

const metric = z.number().int().nonnegative().safe().nullable();
const timestamp = z.string().datetime({ offset: true });
const transcript = z
  .object({
    status: z.enum(['manual', 'automatic', 'missing', 'failed']),
    language: z.string().min(1).max(100).nullable(),
    text: z.string().max(30000),
    truncated: z.boolean(),
    errorCode: z
      .enum([
        'invalid_input',
        'dependency_missing',
        'access_denied',
        'unavailable',
        'network_error',
        'tool_error',
        'upstream_error',
        'timeout',
        'output_limit',
        'invalid_response',
        'cancelled',
        'not_found',
        'tool_missing',
        'security_block',
        'rate_limited',
        'login_required',
      ])
      .transform((code) => errorCodes[code])
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (['manual', 'automatic'].includes(value.status) &&
        (!value.text.trim() || !value.language || value.errorCode)) ||
      (['missing', 'failed'].includes(value.status) &&
        (value.text !== '' || value.truncated)) ||
      (value.status === 'missing' &&
        (value.language !== null || value.errorCode)) ||
      (value.status === 'failed' && !value.errorCode)
    ) {
      ctx.addIssue({ code: 'custom', message: 'Invalid transcript state' });
    }
  });
const videoSchema = z
  .object({
    id: z.string().regex(VIDEO_ID),
    url: z.string(),
    title: z.string().max(300),
    description: z.string().max(2000),
    channel: z.string().max(300),
    publishedAt: z.string().date().nullable(),
    views: metric,
    likes: metric,
    comments: metric,
    duration: metric,
    fetchedAt: timestamp,
    provider: z.literal('yt-dlp'),
    transcript,
  })
  .strict();

const errorCodes: Record<string, YouTubeErrorCode> = {
  invalid_input: 'invalid_input',
  tool_missing: 'dependency_missing',
  dependency_missing: 'dependency_missing',
  login_required: 'access_denied',
  security_block: 'access_denied',
  rate_limited: 'access_denied',
  access_denied: 'access_denied',
  not_found: 'unavailable',
  unavailable: 'unavailable',
  network_error: 'network_error',
  tool_error: 'tool_error',
  upstream_error: 'upstream_error',
  timeout: 'timeout',
  output_limit: 'output_limit',
  invalid_response: 'invalid_response',
  cancelled: 'cancelled',
  busy: 'collector_busy',
  unsupported: 'collector_unsupported',
};

const abortError = (signal: AbortSignal) =>
  new YouTubeError(
    (signal.reason as { name?: unknown } | undefined)?.name === 'TimeoutError'
      ? 'timeout'
      : 'cancelled',
  );

/** All platform I/O belongs to Collector. No local process or caption-download fallback. */
export class HttpYouTubeProvider {
  constructor(
    private readonly network: Pick<
      OutboundNetwork,
      'fetchCollector' | 'profiles'
    >,
    private readonly collectors: CollectorResolver,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private at(value: unknown): string {
    const result = timestamp.safeParse(value);
    if (
      !result.success ||
      Math.abs(this.now() - Date.parse(result.data)) > 10 * 60000
    )
      throw new YouTubeError('invalid_response');
    return result.data;
  }

  private async call(
    kind: 'search' | 'video',
    input: YouTubeRequest,
    signal: AbortSignal,
    data: Record<string, unknown>,
  ) {
    if (
      !/^[1-9]\d{0,15}$/.test(input.projectId) ||
      !z.string().uuid().safeParse(input.requestId).success
    )
      throw new YouTubeError('invalid_input');
    if (signal.aborted) throw abortError(signal);
    let available: BrowserCollectorConfig[];
    try {
      available = this.collectors.allowed(input.projectId, 'youtube');
    } catch (error) {
      if (isCollectorConnectionError(error, 'unreadable'))
        throw new YouTubeError('collector_unreadable');
      throw error;
    }
    if (!available.length) throw new YouTubeError('collector_not_configured');
    if (available.length !== 1) throw new YouTubeError('collector_ambiguous');
    // A deployment upgrade must not silently turn a project's selected/default proxy into direct egress.
    if (this.network.profiles.resolve(input.projectId, 'youtube'))
      throw new YouTubeError('collector_proxy_migration');
    const config = available[0];
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(70000)]);
    let body: Record<string, unknown>;
    try {
      const response = await this.network.fetchCollector(
        input.projectId,
        `${config.url.replace(/\/$/, '')}/${kind}`,
        {
          method: 'POST',
          redirect: 'error',
          signal: deadline,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.token}`,
          },
          body: JSON.stringify({
            protocolVersion: 1,
            platform: 'youtube',
            ...input,
            ...data,
          }),
        },
      );
      if (deadline.aborted) {
        await response.body?.cancel();
        throw abortError(deadline);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new YouTubeError(
          [401, 403].includes(response.status)
            ? 'collector_unauthorized'
            : response.status === 404
              ? 'collector_unsupported'
              : [409, 429].includes(response.status)
                ? 'collector_busy'
                : 'collector_unreachable',
        );
      }
      // fetchCollector already bounds production responses; enforce it here too for injected transports.
      const reader = (
        response.body as ReadableStream<Uint8Array> | null
      )?.getReader();
      if (!reader) throw new YouTubeError('invalid_response');
      const chunks: Uint8Array[] = [];
      let size = 0;
      const abort = () => void reader.cancel().catch(() => undefined);
      deadline.addEventListener('abort', abort, { once: true });
      try {
        for (;;) {
          if (deadline.aborted) throw abortError(deadline);
          const chunk = await reader.read();
          if (deadline.aborted) throw abortError(deadline);
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 20 * 1024 * 1024) throw new YouTubeError('output_limit');
          chunks.push(chunk.value);
        }
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
            string,
            unknown
          >;
        } catch {
          throw new YouTubeError('invalid_response');
        }
      } finally {
        deadline.removeEventListener('abort', abort);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    } catch (error) {
      if (deadline.aborted) throw abortError(deadline);
      if (error instanceof YouTubeError) throw error;
      const code = (error as { code?: string; name?: string })?.code;
      throw new YouTubeError(
        code === 'NR_RESPONSE_TOO_LARGE'
          ? 'output_limit'
          : code === 'ETIMEDOUT'
            ? 'timeout'
            : 'collector_unreachable',
      );
    }
    if (signal.aborted) throw abortError(signal);
    if (
      !body ||
      Array.isArray(body) ||
      body.protocolVersion !== 1 ||
      body.platform !== 'youtube' ||
      body.projectId !== input.projectId ||
      body.requestId !== input.requestId ||
      typeof body.ok !== 'boolean'
    )
      throw new YouTubeError('invalid_response');
    if (!body.ok)
      throw new YouTubeError(
        typeof body.errorCode === 'string' &&
          Object.hasOwn(errorCodes, body.errorCode)
          ? errorCodes[body.errorCode]
          : 'invalid_response',
      );
    if (body.kind !== kind) throw new YouTubeError('invalid_response');
    this.at(body.collectedAt);
    return body;
  }

  async search(
    term: string,
    signal: AbortSignal,
    input: YouTubeRequest,
  ): Promise<string[]> {
    if (
      term.length < 2 ||
      term.length > 80 ||
      [...term].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
      throw new YouTubeError('invalid_input');
    const body = await this.call('search', input, signal, {
      query: term,
      limit: 5,
    });
    const items = z
      .array(z.object({ id: z.string().regex(VIDEO_ID) }).strict())
      .max(5)
      .safeParse(body.items);
    if (!items.success) throw new YouTubeError('invalid_response');
    return [...new Set(items.data.map((item) => item.id))];
  }

  async video(
    id: string,
    signal: AbortSignal,
    input: YouTubeRequest,
  ): Promise<Video> {
    if (!VIDEO_ID.test(id)) throw new YouTubeError('invalid_input');
    const body = await this.call('video', input, signal, { videoId: id });
    const parsed = videoSchema.safeParse(body.item);
    if (
      !parsed.success ||
      parsed.data.id !== id ||
      parsed.data.url !== `https://www.youtube.com/watch?v=${id}`
    )
      throw new YouTubeError('invalid_response');
    this.at(parsed.data.fetchedAt);
    if (
      parsed.data.transcript.errorCode === 'access_denied' ||
      parsed.data.transcript.errorCode === 'cancelled'
    )
      throw new YouTubeError(parsed.data.transcript.errorCode);
    return parsed.data;
  }
}
