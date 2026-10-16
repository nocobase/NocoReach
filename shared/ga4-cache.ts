// Historical reports include preliminary days, so they still expire within a day.
export const GA4_HISTORY_CACHE_MS = 6 * 60 * 60 * 1000;
export const GA4_PARTIAL_CACHE_MS = 5 * 60 * 1000;
export const GA4_TODAY_CACHE_MS = 10 * 60 * 1000;
export const GA4_REALTIME_CACHE_MS = 60 * 1000;

export function ga4CacheExpiry(value: {
  cacheExpiresAt?: number;
  connected?: boolean;
  cutoff?: string | null;
}): number | undefined {
  if (value.connected === false || value.cutoff === null) return 0;
  return Number.isFinite(value.cacheExpiresAt)
    ? value.cacheExpiresAt
    : undefined;
}
