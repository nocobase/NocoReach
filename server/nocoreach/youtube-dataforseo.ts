import { systemMessageText } from '../../shared/i18n/messages.js';
import { liveTask } from './dataforseo.js';
import { VIDEO_ID, YouTubeError } from './youtube-provider.js';

// YouTube on the shared DataForSEO layer (2026-11-02 decision): the Collector's yt-dlp reads failed on YouTube's bot
// check from 10-29, so videos are found through DataForSEO's YouTube SERP API, like Reddit's Google searches. A daily
// read searches each term once (organic, about $0.002 for up to 20 videos) and reads the details of each newly found
// or tracked video once (video_info, about $0.006, for likes and comments). Results are in YouTube's relevance order:
// YouTube no longer honours its "sort by upload date" parameter (removed from its search filters in January 2026),
// so none is sent. Prices are DataForSEO's list prices on 2026-11-02.
export const SEARCH_USD = 0.002;
export const VIDEO_USD = 0.006;
const PRICE_VERSION = 'official-list-2026-11-02';
// United States, English: the same market as the Reddit search; YouTube ranks mostly by the term itself.
const MARKET = { location_code: 2840, language_code: 'en' } as const;

type Raw = Record<string, unknown>;
const count = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
const text = (v: unknown, max = 300) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
/** The day DataForSEO gives for a video ("2024-10-04 12:30:00 +00:00"); its `publication_date` is relative text. */
const day = (v: unknown) => {
  const m = typeof v === 'string' ? v.match(/^(\d{4}-\d{2}-\d{2})/) : null;
  if (m && new Date(m[1]).toISOString().slice(0, 10) === m[1]) return m[1];
  return null;
};

export interface FoundVideo {
  id: string;
  url: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string | null;
  views: number | null;
  duration: number | null;
}
export interface VideoDetails extends FoundVideo {
  likes: number | null;
  comments: number | null;
}

export function validTerm(value: unknown): string {
  const term = typeof value === 'string' ? value.trim() : '';
  if (
    term.length < 2 ||
    term.length > 80 ||
    [...term].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new YouTubeError('invalid_input');
  return term;
}

function video(item: Raw): FoundVideo | null {
  const id = typeof item.video_id === 'string' ? item.video_id : '';
  if (!VIDEO_ID.test(id)) return null;
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: text(item.title),
    description: text(item.description, 2000),
    channel: text(item.channel_name),
    publishedAt: day(item.timestamp),
    views: count(item.views_count),
    duration: count(item.duration_time_seconds),
  };
}

/** What liveTask (in the untyped dataforseo.ts) reports for one task. */
interface LiveTask {
  valid: boolean;
  page: Raw | null;
  taskId: string | null;
  cost: number | null;
  status: 'completed' | 'failed' | 'unknown';
  reason: string;
  diagnostic: Raw;
}
const live = (raw: unknown) => liveTask(raw) as LiveTask;

const failure = (t: LiveTask) => ({
  status: t.status,
  taskId: t.taskId,
  errorCode: systemMessageText(`redditDiagnostic.${t.reason}`),
  result: { diagnostic: t.diagnostic },
  costUsd: t.cost,
});

export const youtubeSearch = {
  specification(v: { term?: unknown }) {
    const term = validTerm(v.term);
    return {
      kind: 'youtube',
      view: 'serp',
      target: term,
      path: 'serp/youtube/organic/live/advanced',
      request: { keyword: term, ...MARKET, device: 'desktop', block_depth: 20 },
      estimatedUsd: SEARCH_USD,
      reservationUsd: SEARCH_USD * 2,
      priceVersion: PRICE_VERSION,
    };
  },
  /** Videos among the results, in YouTube's order; ads (youtube_video_paid), channels and playlists are left out. */
  result(raw: unknown) {
    const t = live(raw);
    if (!t.valid) return failure(t);
    const page: Raw = t.page ?? {};
    const seen = new Set<string>(),
      videos: FoundVideo[] = [];
    for (const item of (Array.isArray(page.items) ? page.items : []) as Raw[]) {
      if (item?.type !== 'youtube_video') continue;
      const v = video(item);
      if (!v || seen.has(v.id)) continue;
      seen.add(v.id);
      videos.push(v);
    }
    return {
      status: 'completed',
      taskId: t.taskId,
      errorCode: null,
      result: {
        videos: videos.slice(0, 40),
        checkUrl: text(page.check_url, 500) || null,
        diagnostic: t.diagnostic,
      },
      costUsd: t.cost,
    };
  },
  // A daily read searches again; a second click within ten minutes reuses the first (RECENT_MS).
  reuseMs: 20 * 3600000,
  timeoutMs: 60000,
};

export const youtubeVideo = {
  specification(v: { videoId?: unknown }) {
    const id = typeof v.videoId === 'string' ? v.videoId : '';
    if (!VIDEO_ID.test(id)) throw new YouTubeError('invalid_input');
    return {
      kind: 'youtubeVideo',
      view: 'serp',
      target: id,
      path: 'serp/youtube/video_info/live/advanced',
      request: { video_id: id, ...MARKET, device: 'desktop' },
      estimatedUsd: VIDEO_USD,
      reservationUsd: VIDEO_USD * 2,
      priceVersion: PRICE_VERSION,
    };
  },
  result(raw: unknown, spec: { target: string }) {
    const t = live(raw);
    if (!t.valid) return failure(t);
    const items = (t.page?.items ?? []) as Raw[];
    const item = items.find(
      (i) => i?.type === 'youtube_video_info' && i.video_id === spec.target,
    );
    const found = item ? video(item) : null;
    return {
      status: 'completed',
      taskId: t.taskId,
      errorCode: null,
      result: {
        video:
          item && found
            ? {
                ...found,
                likes: count(item.likes_count),
                comments: count(item.comments_count),
              }
            : null,
        diagnostic: t.diagnostic,
      },
      costUsd: t.cost,
    };
  },
  reuseMs: 20 * 3600000,
  timeoutMs: 60000,
};
