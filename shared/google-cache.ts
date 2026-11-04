// Upstream historical reports change slowly; synced views and job progress do not.
export const GOOGLE_HISTORY_CACHE_MS = 6 * 60 * 60 * 1000;
export const GOOGLE_PARTIAL_CACHE_MS = 5 * 60 * 1000;
export const GOOGLE_LOCAL_CACHE_MS = 60 * 1000;
export const GOOGLE_PROGRESS_CACHE_MS = 30 * 1000;
// How long a saved report is kept. A report over final days never changes, so it stays fresh that long; any other report
// past its own lifetime is still answered at once while a new one is read.
export const GOOGLE_SAVED_REPORT_MS = 90 * 24 * 60 * 60 * 1000;
// A saved copy answered while a new report is read counts as fresh for the browser only this long.
export const GOOGLE_SAVED_COPY_RETRY_MS = 30 * 1000;
// The oldest saved copy shown while a new report is read. An older one is not shown: the page waits for the new report,
// as numbers weeks old that change a few seconds later read worse than a short wait. Projects nobody opens are still
// read ahead often enough to keep Traffic's default view within it.
export const GOOGLE_SAVED_COPY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// How often a page reads again while the server is reading a new report, and how many times before it stops asking:
// 240 seconds, past the slowest report (Traffic's two GA4 rounds, each up to 30 seconds and asked again three times
// after a 429, waiting 100 seconds in all). Each read only answers from memory.
export const GOOGLE_REFRESH_POLL_MS = 5 * 1000;
export const GOOGLE_REFRESH_POLLS = 48;

// The view a page asks a breakdown or a row for: its range, or a custom range's own dates. Only a request naming one
// may be answered from another window's copy, and only from the same view's.
export function reportView(range: {
  range?: string;
  from?: string;
  to?: string;
}): string {
  return range.range === 'custom'
    ? `custom:${range.from ?? ''}:${range.to ?? ''}`
    : String(range.range ?? '28');
}

// Set on a report answered from its saved copy: `refreshing` while a new one is being read; a copy without it could not
// be replaced for now, which the page says, with the `reason` when one was written for people.
export type SavedCopy = {
  refreshing: boolean;
  savedAt: number;
  reason?: string;
};

export function savedCopyAt(
  ...reports: (Partial<SavedCopy> | null | undefined)[]
): number | undefined {
  const stuck = reports
    .filter((report) => report?.savedAt && !report.refreshing)
    .map((report) => report!.savedAt!);
  return stuck.length ? Math.min(...stuck) : undefined;
}

// What `SavedReportNote` says of the reports on a page: a copy that could not be replaced comes first, with when it was
// saved and why; otherwise a copy still being replaced, with when it was saved.
export function savedCopyNote(
  ...reports: (Partial<SavedCopy> | null | undefined)[]
): { at?: number; reason?: string; refreshing?: boolean } {
  const stuck = savedCopyAt(...reports);
  if (stuck !== undefined)
    return {
      at: stuck,
      reason: reports.find(
        (report) => report?.savedAt && !report.refreshing && report.reason,
      )?.reason,
    };
  const replacing = reports
    .filter((report) => report?.savedAt && report.refreshing)
    .map((report) => report!.savedAt!);
  return replacing.length
    ? { at: Math.min(...replacing), refreshing: true }
    : {};
}

export function googleCacheExpiry(value: {
  cacheExpiresAt?: number;
  connected?: boolean;
  cutoff?: string | null;
}): number | undefined {
  if (value.connected === false || value.cutoff === null) return 0;
  return Number.isFinite(value.cacheExpiresAt)
    ? value.cacheExpiresAt
    : undefined;
}

export const googleHistoryFreshness = {
  staleTime: GOOGLE_HISTORY_CACHE_MS,
  retryDelay: GOOGLE_PARTIAL_CACHE_MS,
  expiresAt: googleCacheExpiry,
};
export const googleLocalFreshness = {
  staleTime: GOOGLE_LOCAL_CACHE_MS,
  retryDelay: GOOGLE_PROGRESS_CACHE_MS,
};

export function isGoogleReportKey(
  key: string,
  projectId: string | number,
): boolean {
  const detailsPrefix = 'data-view:search-details:';
  if (key.startsWith(detailsPrefix)) {
    try {
      const scope: unknown = JSON.parse(key.slice(detailsPrefix.length));
      return (
        Array.isArray(scope) &&
        (typeof scope[0] === 'string' || typeof scope[0] === 'number') &&
        String(scope[0]) === String(projectId)
      );
    } catch {
      return false;
    }
  }
  return [
    'data-view:website',
    'data-view:website-row',
    'today',
    'live',
    'data-view:search',
    'data-view:search:v4',
    'data-view:search-breakdown',
    'data-view:search-row',
    'data-view:search-index',
    'data-view:search-index-page',
    'data-view:search-sitemaps',
    'data-view:overview',
    'data-view:site-list',
    'data-view:content-page',
    'site-list',
    'content-page',
  ].some(
    (prefix) =>
      key === `${prefix}:${projectId}` ||
      key.startsWith(`${prefix}:${projectId}:`),
  );
}
