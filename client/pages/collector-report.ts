import { useCallback, useEffect, useRef, useState } from 'react';
import { $t } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import type { Metric } from './data-parts';
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
  /** Records of the period; the report lists only the newest `limit` of them. */
  matched: number;
}

/**
 * The period report of a collector platform (`<resource>/report`), listing the newest `limit` records. Keeps the last
 * report while a newer one loads. While a collection runs it polls only the platform's status, and reads the report
 * again once the collection ends, so a long read does not download the full report repeatedly.
 */
export function useCollectorReport<T extends CollectorReport>(
  resource: 'nrXiaohongshu' | 'nrBilibili' | 'nrYouTube',
  projectId: number | undefined,
  range: Range,
  limit: number,
  running: (report: T) => boolean,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const sequenceRef = useRef(0);
  const valid = validRange(range);
  const { range: period, from, to } = range;
  const load = useCallback(async () => {
    if (!projectId || !valid) return;
    const sequence = ++sequenceRef.current;
    try {
      const value = await api.action<T>(resource, 'report', {
        method: 'POST',
        body: { projectId, range: period, from, to, limit },
        unwrap: 'data',
      });
      if (sequence !== sequenceRef.current) return;
      setData(value);
      setError(null);
    } catch (e) {
      if (sequence === sequenceRef.current) setError(e);
    }
  }, [resource, projectId, valid, period, from, to, limit]);
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
  return { data, error, reload: load, valid };
}

export function windowSummary(w: ReportWindow | undefined) {
  if (!w) return undefined;
  return w.all
    ? $t('rangePicker.availableRange', { 0: w.start, 1: w.end })
    : $t('common.comparedPreviousDays', { 0: w.start, 1: w.end, 2: w.days });
}
