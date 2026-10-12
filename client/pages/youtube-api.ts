import { youtubeSystemErrors } from '#lib/youtube-errors';
import { $t } from '#i18n';
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
  transcript: {
    status: 'manual' | 'automatic' | 'missing' | 'failed';
    language: string | null;
    text: string;
    truncated: boolean;
  };
}
export interface YouTubeStatus {
  configured: boolean;
  connected: boolean;
  syncing: boolean;
  runId: string | null;
  revision: string | null;
  terms: string[];
  videoUrls: string[];
  autoSync: boolean;
  fetchedAt: string | null;
  page: number;
  pageSize: number;
  videos: YouTubeVideo[];
  total: number;
  lastSync: { at: string; ok: boolean; errors: string[] } | null;
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
  return knownMessages.has(message) ? $t(message) : message;
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
