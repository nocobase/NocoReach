import { useCallback, useEffect, useRef, useState } from 'react';
import { $t } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import type { Metric } from './data-parts';
import { useSearchParams } from 'react-router';
import { validRange, type Range } from './range-state';

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

/**
 * The period report of a collector platform (`<resource>/report`), listing the first `limit` records in the asked
 * order. Keeps the last report (and the last error) while a newer one loads; `loading` says one is on its way. While a collection runs it polls only the platform's status, and reads the report
 * again once the collection ends, so a long read does not download the full report repeatedly.
 */
export function useCollectorReport<T extends CollectorReport>(
  resource: 'nrXiaohongshu' | 'nrBilibili' | 'nrYouTube',
  projectId: number | undefined,
  range: Range,
  limit: number,
  running: (report: T) => boolean,
  { sort, order }: CollectorSort = { sort: 'published', order: 'desc' },
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const sequenceRef = useRef(0);
  const valid = validRange(range);
  const { range: period, from, to } = range;
  const load = useCallback(async () => {
    if (!projectId || !valid) {
      setLoading(false);
      return;
    }
    const sequence = ++sequenceRef.current;
    setLoading(true);
    try {
      const value = await api.action<T>(resource, 'report', {
        method: 'POST',
        body: { projectId, range: period, from, to, limit, sort, order },
        unwrap: 'data',
      });
      if (sequence !== sequenceRef.current) return;
      setData(value);
      setError(null);
    } catch (e) {
      if (sequence === sequenceRef.current) setError(e);
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, [resource, projectId, valid, period, from, to, limit, sort, order]);
  useEffect(() => {
    void Promise.resolve().then(load);
    // A response for an earlier project or period must not replace this one.
    return () => {
      sequenceRef.current += 1;
    };
  }, [load]);
  const active = Boolean(data && running(data));
  const runningRef = useRef(running);
  useEffect(() => {
    runningRef.current = running;
  });
  useEffect(() => {
    if (!active || !projectId) return;
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
          setData((report) => report && { ...report, ...status });
          if (!runningRef.current({ ...status } as T)) void load();
        })
        .catch(() => undefined);
    }, 2000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [active, projectId, resource, load]);
  return { data, error, loading, reload: load, valid };
}

export function windowSummary(w: ReportWindow | undefined) {
  if (!w) return undefined;
  return w.all
    ? $t('rangePicker.availableRange', { 0: w.start, 1: w.end })
    : $t('common.comparedPreviousDays', { 0: w.start, 1: w.end, 2: w.days });
}
