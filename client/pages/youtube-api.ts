import { youtubeSystemErrors } from '#lib/youtube-errors';
import { $t } from '#i18n';
import { systemMessageKey } from '../../shared/i18n/messages';
import { transportErrorMessage } from '#lib/transport-error';
import { nocobaseClient as api } from '#lib/nocoreach-api';
export interface YouTubeVideo {
  id: string;
  url: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  fetchedAt: string;
  metricFetchedAt?: Record<'views' | 'likes' | 'comments', string | null>;
  transcriptFetchedAt?: string | null;
  transcriptRefreshFailed?: boolean;
}
/** A video the last reads found first, for the drawer's short list. */
export interface YouTubeRecent {
  id: string;
  url: string;
  title: string;
  channel: string;
  publishedAt: string | null;
  firstSeenAt: string;
  views: number | null;
}
export interface YouTubeStatus {
  configured: boolean;
  /** DataForSEO is verified and search terms are saved. */
  connected: boolean;
  /** DataForSEO is connected and verified; YouTube is searched through it. */
  dataforseo: boolean;
  syncing: boolean;
  runId: string | null;
  revision: string | null;
  terms: string[];
  videoUrls: string[];
  autoSync: boolean;
  fetchedAt: string | null;
  total: number;
  recordingSince: string | null;
  recent: YouTubeRecent[];
  pendingDetails: number;
  /** The month's DataForSEO budget is used up: daily reads resume on this day. */
  pausedUntil: string | null;
  /** Search terms missed on three daily reads in a row; a single miss is read again the next day. */
  repeatedMisses: string[];
  spend: { monthUsd: number; budgetUsd: number } | null;
  estimate: {
    monthlyUsd: number;
    searchUsd: number;
    videoUsd: number;
  };
  lastSync: {
    at: string;
    ok: boolean;
    errors: string[];
    code?: string;
    missed?: { term: string; reason: 'timeout' | 'failed' }[];
    found?: number;
    added?: number;
    costUsd?: number;
  } | null;
  nextSyncAt: string | null;
  /** How many followed topics (Project knowledge › Memory) are searched, weekly. */
  topicCount?: number;
}
/** A video found on followed topics, with the topics it came up under. */
export interface YouTubeTopicVideo {
  id: string;
  url: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  topics: string[];
  firstSeenAt: string;
}
export const youtubeRequest = (
  projectId: number,
  action: string,
  values: object = {},
  signal?: AbortSignal,
  confirmationSessionId?: string,
) =>
  api.action<YouTubeStatus>('nrYouTube', action, {
    method: 'POST',
    body: { projectId, ...values },
    unwrap: 'data',
    signal,
    headers: confirmationSessionId
      ? { 'X-NocoReach-Confirmation-Session': confirmationSessionId }
      : undefined,
  });
const knownMessages = new Set<string>(youtubeSystemErrors);
export function youtubeMessage(message: string): string {
  const key = systemMessageKey(message);
  return key && knownMessages.has(key) ? $t(key) : message;
}
export function youtubeErrorMessage(error: Error): string {
  const transportMessage = transportErrorMessage(error);
  if (transportMessage) return transportMessage;
  // The API wrapper may translate error.message when it arrives. Keep the original
  // payload so later locale switches remain reversible and unknown text stays literal.
  const payload = (
    error as Error & { payload?: { error?: { message?: string } } }
  ).payload;
  return youtubeMessage(payload?.error?.message ?? error.message);
}
