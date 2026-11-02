import { systemMessageText } from '../../shared/i18n/messages.js';

export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** Search terms a project follows on YouTube, and videos it tracks by link (its own, for example). */
export const MAX_TERMS = 5;
export const MAX_VIDEOS = 5;
export type YouTubeErrorCode =
  | 'invalid_input'
  | 'upstream_error'
  | 'timeout'
  | 'cancelled'
  | 'config_changed'
  | 'dataforseo_missing'
  | 'budget_exceeded';
const messages: Record<YouTubeErrorCode, string> = {
  invalid_input: systemMessageText('youtube.invalidInput'),
  upstream_error: systemMessageText('youtube.upstreamError'),
  timeout: systemMessageText('youtube.timeout'),
  cancelled: systemMessageText('youtube.cancelled'),
  config_changed: systemMessageText('youtube.configChanged'),
  dataforseo_missing: systemMessageText('youtube.dataforseoMissing'),
  budget_exceeded: systemMessageText('youtube.budgetExceeded'),
};
export class YouTubeError extends Error {
  readonly status: number;
  constructor(readonly code: YouTubeErrorCode) {
    super(messages[code]);
    this.status =
      code === 'invalid_input'
        ? 400
        : ['cancelled', 'config_changed', 'dataforseo_missing'].includes(code)
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
/** Search terms (at least one) and tracked video links, one per line or as lists. */
export function researchInput(values: Record<string, unknown>) {
  const split = (v: unknown) =>
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [])
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean);
  const terms = [...new Set(split(values.terms))];
  if (
    !terms.length ||
    terms.length > MAX_TERMS ||
    terms.some((t) => t.length < 2 || t.length > 80 || controlCharacters(t))
  )
    throw new YouTubeError('invalid_input');
  const videos = [...new Set(split(values.videoUrls).map(videoId))];
  if (videos.length > MAX_VIDEOS) throw new YouTubeError('invalid_input');
  return { terms, videoIds: videos };
}
/** Captions, which only the earlier Collector reader (yt-dlp) saved; DataForSEO reads none. */
export interface Transcript {
  status: 'manual' | 'automatic' | 'missing' | 'failed';
  language: string | null;
  text: string;
  truncated: boolean;
  errorCode?: string;
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
  provider: 'dataforseo' | 'yt-dlp';
  transcript?: Transcript;
}
