import { systemMessageText } from '../../shared/i18n/messages.js';
import { z } from 'zod';
import type { OutboundNetwork } from './outbound-network.js';
import type { ProxyProfile } from './proxy-profiles.js';

export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_TEXT = 30000;
export type YouTubeErrorCode =
  | 'invalid_input'
  | 'dependency_missing'
  | 'access_denied'
  | 'unavailable'
  | 'network_error'
  | 'tool_error'
  | 'upstream_error'
  | 'timeout'
  | 'output_limit'
  | 'invalid_response'
  | 'cancelled'
  | 'config_changed'
  | 'collector_not_configured'
  | 'collector_ambiguous'
  | 'collector_unauthorized'
  | 'collector_unreachable'
  | 'collector_unsupported'
  | 'collector_proxy_migration'
  | 'collector_busy';
const messages: Record<YouTubeErrorCode, string> = {
  collector_not_configured: systemMessageText('youtube.collectorNotConfigured'),
  collector_ambiguous: systemMessageText('youtube.collectorAmbiguous'),
  collector_unauthorized: systemMessageText('youtube.collectorUnauthorized'),
  collector_unreachable: systemMessageText('youtube.collectorUnreachable'),
  collector_unsupported: systemMessageText('youtube.collectorUnsupported'),
  collector_proxy_migration: systemMessageText(
    'youtube.collectorProxyMigration',
  ),
  collector_busy: systemMessageText('youtube.collectorBusy'),

  invalid_input: systemMessageText('youtube.invalidInput'),
  dependency_missing: systemMessageText('youtube.toolMissing'),
  access_denied: systemMessageText('youtube.accessRestricted'),
  unavailable: systemMessageText('youtube.videoUnavailable'),
  network_error: systemMessageText('youtube.networkError'),
  tool_error: systemMessageText('youtube.toolError'),
  upstream_error: systemMessageText('youtube.upstreamError'),
  timeout: systemMessageText('youtube.timeout'),
  output_limit: systemMessageText('youtube.outputLimit'),
  invalid_response: systemMessageText('youtube.invalidResponse'),
  cancelled: systemMessageText('youtube.cancelled'),
  config_changed: systemMessageText('youtube.configChanged'),
};
export class YouTubeError extends Error {
  readonly status: number;
  constructor(readonly code: YouTubeErrorCode) {
    super(messages[code]);
    this.status =
      code === 'invalid_input'
        ? 400
        : ['cancelled', 'config_changed'].includes(code)
          ? 409
          : 502;
  }
}
export function publicError(error: unknown): YouTubeError {
  return error instanceof YouTubeError
    ? error
    : new YouTubeError('upstream_error');
}
export function videoId(input: unknown): string {
  const value = typeof input === 'string' ? input.trim() : '';
  if (VIDEO_ID.test(value)) return value;
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(
        u.hostname,
      )
    )
      throw new Error();
    const id =
      u.hostname === 'youtu.be'
        ? u.pathname.slice(1)
        : u.pathname === '/watch'
          ? u.searchParams.get('v')
          : /^\/(shorts|live)\//.test(u.pathname)
            ? u.pathname.split('/')[2]
            : '';
    if (id && VIDEO_ID.test(id)) return id;
  } catch {
    /* All callers receive the same safe validation error. */
  }
  throw new YouTubeError('invalid_input');
}
const controlCharacters = (value: string) =>
  [...value].some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
export function researchInput(values: Record<string, unknown>) {
  const split = (v: unknown) =>
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [])
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean);
  const terms = [...new Set(split(values.terms))];
  if (
    terms.length > 2 ||
    terms.some((t) => t.length < 2 || t.length > 80 || controlCharacters(t))
  )
    throw new YouTubeError('invalid_input');
  const videos = [...new Set(split(values.videoUrls).map(videoId))];
  if (videos.length > 5 || (!terms.length && !videos.length))
    throw new YouTubeError('invalid_input');
  return { terms, videoIds: videos };
}
export interface RunnerOptions {
  signal: AbortSignal;
  proxy?: ProxyProfile;
}
export type YouTubeRunner = (
  target: string,
  mode: 'search' | 'video',
  options: RunnerOptions,
) => Promise<unknown>;
const nullableCount = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
const text = (v: unknown, max = 300) =>
  typeof v === 'string' ? v.slice(0, max) : '';
const recordSchema = z.record(z.string(), z.unknown());
export interface Transcript {
  status: 'manual' | 'automatic' | 'missing' | 'failed';
  language: string | null;
  text: string;
  truncated: boolean;
  errorCode?: YouTubeErrorCode;
}
export interface Video {
  id: string;
  url: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  duration: number | null;
  fetchedAt: string;
  provider: 'yt-dlp';
  transcript: Transcript;
}
export function captionText(payload: string): {
  text: string;
  truncated: boolean;
} {
  let lines: string[];
  try {
    const body = JSON.parse(payload) as {
      events?: { segs?: { utf8?: string }[] }[];
    };
    if (!Array.isArray(body.events)) throw new Error();
    lines = body.events.map((event) =>
      (event.segs || []).map((seg) => seg.utf8 || '').join(''),
    );
  } catch {
    if (!/^\uFEFF?WEBVTT[\s\r\n]/.test(payload))
      throw new YouTubeError('invalid_response');
    lines = payload
      .split(/\r?\n/)
      .filter(
        (line) =>
          line.trim() &&
          !/^(WEBVTT|Kind:|Language:|NOTE|STYLE|REGION|\d+$)/.test(
            line.trim(),
          ) &&
          !line.includes('-->'),
      );
  }
  const result: string[] = [];
  for (const raw of lines) {
    const line = raw
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    if (!line || line === result.at(-1)) continue;
    // Rolling automatic captions often repeat the previous line before appending words.
    const previous = result.at(-1);
    if (previous && line.startsWith(previous + ' '))
      result[result.length - 1] = line;
    else result.push(line);
  }
  const value = result.join('\n');
  if (!value) throw new YouTubeError('invalid_response');
  return { text: value.slice(0, MAX_TEXT), truncated: value.length > MAX_TEXT };
}
function caption(info: Record<string, unknown>) {
  for (const kind of ['subtitles', 'automatic_captions'] as const) {
    const tracks = info[kind];
    if (!tracks || typeof tracks !== 'object') continue;
    const languages = Object.keys(tracks)
      .filter((key) => key !== 'live_chat')
      .sort((a, b) => {
        const rank = (v: string) => (/^zh/.test(v) ? 0 : /^en/.test(v) ? 1 : 2);
        return rank(a) - rank(b) || a.localeCompare(b);
      });
    for (const language of languages) {
      const choices: unknown = (tracks as Record<string, unknown>)[language];
      if (!Array.isArray(choices)) continue;
      for (const ext of ['json3', 'vtt']) {
        const tracksParsed = z
          .array(z.object({ ext: z.string(), url: z.string() }))
          .safeParse(choices);
        const track = tracksParsed.success
          ? tracksParsed.data.find((value) => value.ext === ext)
          : null;
        if (!track) continue;
        try {
          const url = new URL(track.url);
          if (
            url.protocol === 'https:' &&
            ['www.youtube.com', 'youtube.com'].includes(url.hostname) &&
            url.pathname === '/api/timedtext' &&
            !url.username &&
            !url.password &&
            !url.port
          )
            return {
              url: url.toString(),
              language,
              status:
                kind === 'subtitles'
                  ? ('manual' as const)
                  : ('automatic' as const),
            };
        } catch {
          /* Only fixed YouTube timedtext endpoints may be fetched. */
        }
      }
    }
  }
  return null;
}
/** Pure fixture normalization. Every upstream dependency is explicit; production uses Collector. */
export class YouTubeProvider {
  constructor(
    private network: OutboundNetwork,
    private runner: YouTubeRunner,
    private readCaption: (
      url: string,
      signal: AbortSignal,
    ) => Promise<{ text: string }>,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private options(signal: AbortSignal): RunnerOptions {
    return { signal, proxy: this.network.selected('youtube') };
  }
  async search(term: string, signal: AbortSignal): Promise<string[]> {
    const data = recordSchema.safeParse(
      await this.runner(`ytsearch5:${term}`, 'search', this.options(signal)),
    );
    if (!data.success || !Array.isArray(data.data.entries))
      throw new YouTubeError('invalid_response');
    const entries = z
      .array(z.object({ id: z.string() }))
      .safeParse(data.data.entries);
    if (!entries.success) throw new YouTubeError('invalid_response');
    return [
      ...new Set(
        entries.data.map((entry) => entry.id).filter((id) => VIDEO_ID.test(id)),
      ),
    ].slice(0, 5);
  }
  async video(id: string, signal: AbortSignal): Promise<Video> {
    if (!VIDEO_ID.test(id)) throw new YouTubeError('invalid_input');
    const url = `https://www.youtube.com/watch?v=${id}`;
    const parsed = recordSchema.safeParse(
      await this.runner(url, 'video', this.options(signal)),
    );
    if (
      !parsed.success ||
      parsed.data.id !== id ||
      typeof parsed.data.title !== 'string'
    )
      throw new YouTubeError('invalid_response');
    const info = parsed.data,
      selected = caption(info);
    let transcript: Transcript = {
      status: 'missing',
      language: null,
      text: '',
      truncated: false,
    };
    if (selected) {
      try {
        if (signal.aborted) throw new YouTubeError('cancelled');
        const response = await this.readCaption(
          selected.url,
          AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        );
        if (signal.aborted) throw new YouTubeError('cancelled');
        transcript = {
          status: selected.status,
          language: selected.language,
          ...captionText(response.text),
        };
      } catch (error) {
        if (signal.aborted) throw new YouTubeError('cancelled');
        if (
          error instanceof Error &&
          /来源访问受限|来源返回 (401|403|407|429)/.test(error.message)
        )
          throw new YouTubeError('access_denied');
        transcript = {
          status: 'failed',
          language: selected.language,
          text: '',
          truncated: false,
          errorCode: publicError(error).code,
        };
      }
    }
    const date =
      typeof info.upload_date === 'string' && /^\d{8}$/.test(info.upload_date)
        ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}`
        : null;
    return {
      id,
      url,
      title: text(info.title),
      description: text(info.description, 2000),
      channel: text(info.channel),
      publishedAt: date && Number.isFinite(Date.parse(date)) ? date : null,
      views: nullableCount(info.view_count),
      likes: nullableCount(info.like_count),
      comments: nullableCount(info.comment_count),
      duration: nullableCount(info.duration),
      provider: 'yt-dlp',
      fetchedAt: this.now().toISOString(),
      transcript,
    };
  }
}
