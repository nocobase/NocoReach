// Historical reports include preliminary days, so they still expire within a day.
export const GA4_HISTORY_CACHE_MS = 6 * 60 * 60 * 1000;
export const GA4_PARTIAL_CACHE_MS = 5 * 60 * 1000;
export const GA4_TODAY_CACHE_MS = 10 * 60 * 1000;
export const GA4_REALTIME_CACHE_MS = 60 * 1000;
// Realtime is seven GA4 requests a read, so the figure on Traffic's Today card is read this often, and every
// GA4_REALTIME_CACHE_MS only while its details are open.
export const GA4_REALTIME_IDLE_MS = 30 * 60 * 1000;

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
