import { useCallback, useEffect, useRef, useState } from 'react';
import { $t } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import type { Metric } from './data-parts';
import { useSearchParams } from 'react-router';
import { validRange, type Range } from './range-state';
import {
  useWorkspaceCache,
  useWorkspaceCacheRevision,
} from './workspace-cache';

export interface ReportWindow {
  start: string;
  end: string;
  days: number;
  all?: boolean;
}
export interface CollectorReport {
  window: ReportWindow;
  kpis: Metric[];
  /** Records of the period; the report lists only the first `limit` of them in the asked order. */
  matched: number;
  /** Publications per day (week, month for long windows) of the period. */
  trend: CollectorTrend;
  /** Records of the period per origin (search term, video link, channel), most first. */
  groups: CollectorGroup[];
}
export interface CollectorTrend {
  unit: 'day' | 'week' | 'month';
  points: { date: string; published: number }[];
}
export interface CollectorGroup {
  kind: 'term' | 'video' | 'channel';
  name: string;
  count: number;
}
/** The list's order: `published` or a metric key, newest or largest first by default. */
export interface CollectorSort {
  sort: string;
  order: 'asc' | 'desc';
}

/** The list order, kept in the URL beside the period; the default (newest first) leaves it out. */
export function useCollectorSort(
  keys: readonly string[],
): [CollectorSort, (next: CollectorSort) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get('sort');
  const sort = requested && keys.includes(requested) ? requested : 'published';
  const order = params.get('order') === 'asc' ? 'asc' : 'desc';
  const set = (next: CollectorSort) => {
    const p = new URLSearchParams(params);
    if (next.sort === 'published' && next.order === 'desc') {
      p.delete('sort');
      p.delete('order');
    } else {
      p.set('sort', next.sort);
      p.set('order', next.order);
    }
    setParams(p, { replace: true });
  };
  return [{ sort, order }, set];
}

type CachedReport<T> = { report: T; day: string };
const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
const nextDay = ({ day }: CachedReport<unknown>) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + 1).getTime();
};
const freshness = { staleTime: Infinity, expiresAt: nextDay };

/** The cache key prefix of a platform's reports in one project; connection changes invalidate it. */
export const collectorReportKey = (
  resource: 'nrXiaohongshu' | 'nrBilibili' | 'nrYouTube',
  projectId: number,
) => `data-view:collector:${resource}:${projectId}:`;

/**
 * The period report of a collector platform (`<resource>/report`), listing the first `limit` records in the asked
 * order. A report read today is reused from the session's workspace cache when the page opens again; `reload`
 * (an explicit action, a retry or the end of a collection) always reads it again. Keeps the last report (and the
 * last error) while a newer one loads; `loading` says one is on its way. While a collection runs it polls only the
 * platform's status, and reads the report again once the collection ends, so a long read does not download the
 * full report repeatedly.
 */
export function useCollectorReport<T extends CollectorReport>(
  resource: 'nrXiaohongshu' | 'nrBilibili' | 'nrYouTube',
  projectId: number | undefined,
  range: Range,
  limit: number,
  running: (report: T) => boolean,
  { sort, order }: CollectorSort = { sort: 'published', order: 'desc' },
) {
  const cache = useWorkspaceCache();
  const valid = validRange(range);
  const { range: period, from, to } = range;
  const key =
    projectId && valid
      ? collectorReportKey(resource, projectId) +
        JSON.stringify([period, from, to, limit, sort, order])
      : null;
  const revision = useWorkspaceCacheRevision(key);
  const [stored, setStored] = useState<{ owner: string; report: T }>();
  const owner = `${resource}:${projectId}`;
  const cached = key ? cache.peek<CachedReport<T>>(key)?.report : undefined;
  // Show the cached report of this period at once; otherwise keep the last one of this platform while loading.
  const report =
    cached ?? (stored?.owner === owner ? stored.report : undefined);
  // The latest collection state polled while a collection runs, over the listed records.
  const [live, setLive] = useState<{ key: string; status: Partial<T> }>();
  const data =
    report && live && live.key === key ? { ...report, ...live.status } : report;
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const sequenceRef = useRef(0);
  const load = useCallback(
    async (force = true) => {
      if (!key) {
        setLoading(false);
        return;
      }
      const sequence = ++sequenceRef.current;
      if (
        !force &&
        cache.peek(key) !== undefined &&
        cache.refreshAfter(key, Infinity, 0, nextDay) > 0
      ) {
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      try {
        const value = await cache.load<CachedReport<T>>(
          key,
          async () => ({
            report: await api.action<T>(resource, 'report', {
              method: 'POST',
              body: { projectId, range: period, from, to, limit, sort, order },
              unwrap: 'data',
            }),
            day: localDay(),
          }),
          force,
          freshness,
        );
        if (sequence !== sequenceRef.current) return;
        setStored({ owner: `${resource}:${projectId}`, report: value.report });
        setLive(undefined);
        setError(null);
      } catch (e) {
        if (sequence === sequenceRef.current) setError(e);
      } finally {
        if (sequence === sequenceRef.current) setLoading(false);
      }
    },
    [cache, key, resource, projectId, period, from, to, limit, sort, order],
  );
  useEffect(() => {
    void Promise.resolve().then(() => load(false));
    // A response for an earlier project or period must not replace this one.
    return () => {
      sequenceRef.current += 1;
    };
  }, [load, revision]);
  const active = Boolean(data && running(data));
  const runningRef = useRef(running);
  useEffect(() => {
    runningRef.current = running;
  });
  useEffect(() => {
    if (!active || !projectId || !key) return;
    let current = true;
    const timer = setInterval(() => {
      void api
        .action<Partial<T>>(resource, 'status', {
          method: 'POST',
          body: { projectId, summary: true },
          unwrap: 'data',
        })
        .then((status) => {
          if (!current) return;
          // Keep the listed records; take the latest collection state.
          setLive({ key, status });
          if (!runningRef.current({ ...status } as T)) void load();
        })
        .catch(() => undefined);
    }, 2000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [active, projectId, resource, key, load]);
  return { data, error, loading, reload: () => load(), valid };
}

export function windowSummary(w: ReportWindow | undefined) {
  if (!w) return undefined;
  return w.all
    ? $t('rangePicker.availableRange', { 0: w.start, 1: w.end })
    : $t('common.comparedPreviousDays', { 0: w.start, 1: w.end, 2: w.days });
}
