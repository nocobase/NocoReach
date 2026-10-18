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
}

/**
 * The period report of a collector platform (`<resource>/report`). Keeps the last report while a newer one loads, and
 * reads again every few seconds while a collection is running so its results appear without a reload.
 */
export function useCollectorReport<T extends CollectorReport>(
  resource: 'nrXiaohongshu' | 'nrBilibili' | 'nrYouTube',
  projectId: number | undefined,
  range: Range,
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
        body: { projectId, range: period, from, to },
        unwrap: 'data',
      });
      if (sequence !== sequenceRef.current) return;
      setData(value);
      setError(null);
    } catch (e) {
      if (sequence === sequenceRef.current) setError(e);
    }
  }, [resource, projectId, valid, period, from, to]);
  useEffect(() => {
    void Promise.resolve().then(load);
    // A response for an earlier project or period must not replace this one.
    return () => {
      sequenceRef.current += 1;
    };
  }, [load]);
  const active = Boolean(data && running(data));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [active, load]);
  return { data, error, reload: load, valid };
}

export function windowSummary(w: ReportWindow | undefined) {
  if (!w) return undefined;
  return w.all
    ? $t('rangePicker.availableRange', { 0: w.start, 1: w.end })
    : $t('common.comparedPreviousDays', { 0: w.start, 1: w.end, 2: w.days });
}
