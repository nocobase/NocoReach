import { useEffect, useRef, useState } from 'react';
import { $t, isChinese } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Button } from '#components/ui/button';
import { Tag } from '#components/reach/tag';
import { useMe } from '../me';
import type { SearchReport } from './index';
import { formatDate, formatDateTime } from '#lib/format';

export type CoveragePeriod = {
  start: string;
  end: string;
  days: number;
  recordedDays: number;
  noRecordDays: number;
  missingDays: number;
  records: { start: string; end: string }[];
  noRecords: { start: string; end: string }[];
  missing: { start: string; end: string }[];
  updatedAt: string | null;
};

export function SearchHistory({
  projectId,
  property,
  report,
  reload,
}: {
  projectId: number;
  property?: string;
  report: SearchReport;
  reload: () => void;
}) {
  const { me } = useMe();
  const admin = me?.role === 'admin';
  const askedRef = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const w = report.window!,
    coverage = report.coverage;
  const durable = Boolean(!report.live && coverage);
  const jobs = report.history?.jobs ?? [];
  const running = jobs.some((j) =>
    ['queued', 'running', 'retrying'].includes(j.status),
  );
  const failed = jobs.some((j) => j.status === 'failed');
  const paused = jobs.some((j) => j.status === 'paused');
  const key = JSON.stringify([projectId, property, w.start, w.end]);
  const missing = Boolean(
    coverage &&
    (coverage.current.missingDays || coverage.previous?.missingDays),
  );
  // Fills the range's gaps (and the comparison period's). A complete range is kept fresh by the scheduled sync, which
  // re-reads the last days, so the page no longer offers to re-fetch it.
  const submit = async () => {
    setBusy(true);
    setError(false);
    try {
      const enqueue = (startDate: string, endDate: string) =>
        api.action('nrGoogle', 'syncNow', {
          method: 'POST',
          body: {
            projectId,
            scope: 'gscOverview',
            startDate,
            endDate,
            mode: 'missing',
          },
          unwrap: 'data',
        });
      await enqueue(w.start, w.end);
      if (!w.all && coverage?.previous?.missingDays)
        await enqueue(w.previousStart, w.previousEnd);
      reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!admin || !durable || !missing || askedRef.current.has(key)) return;
    askedRef.current.add(key);
    void submit();
    // Once per selected range. Polling must never enqueue work or bypass a paused/failed job.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [admin, durable, missing, key]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(reload, 5000);
    return () => window.clearInterval(timer);
  }, [running, reload]);
  const control = async (command: 'retry' | 'resume') => {
    setBusy(true);
    setError(false);
    try {
      await api.action('nrGoogle', 'syncControl', {
        method: 'POST',
        body: { projectId, command },
        unwrap: 'data',
      });
      reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  // Nothing shows while the range is complete (2026-10-22 user feedback: the coverage block read as noise). A gap is one
  // line: which days are missing, why, and the one action that fills it. The save time and the notes on how the days
  // are counted are in the page's ⓘ (coverageNotes).
  const currentGaps = coverage?.current.missing ?? [];
  const previousGaps = w.all ? [] : (coverage?.previous?.missing ?? []);
  const gap = !durable
    ? null
    : currentGaps.length
      ? $t('searchHistory.missing', { 0: dateRanges(currentGaps) })
      : previousGaps.length
        ? $t('searchHistory.previousMissing', {
            0: dateRanges(previousGaps),
          })
        : null;
  if (!gap) return null;
  // Days before the earliest date backfill reaches cannot be fetched; the line says so and offers nothing to press.
  const earliest = coverage?.earliest;
  const fillable = [...(currentGaps.length ? currentGaps : previousGaps)].some(
    (r) => !earliest || r.end >= earliest,
  );
  const why = !fillable
    ? $t('searchHistory.beforeEarliest', {
        0: formatDate(earliest, { withYear: true }),
      })
    : running || busy
      ? $t('searchHistory.running')
      : failed
        ? $t('searchHistory.failed')
        : paused
          ? $t('searchHistory.paused')
          : error
            ? $t('searchHistory.requestFailed')
            : !admin
              ? $t('searchHistory.askAdmin')
              : null;
  return (
    <div
      role='status'
      className='flex flex-wrap items-center gap-2 text-sm'
      data-search-coverage=''
    >
      <Tag tone='amber'>{$t('searchHistory.partial')}</Tag>
      <span>{gap}</span>
      {why ? (
        <span
          role={error ? 'alert' : undefined}
          className={error ? 'text-destructive' : 'text-muted-foreground'}
        >
          {why}
        </span>
      ) : null}
      {admin ? (
        <span className='ml-auto flex flex-wrap gap-2'>
          {failed ? (
            <Button
              variant='outline'
              size='sm'
              disabled={busy || running}
              onClick={() => void control('retry')}
            >
              {$t('common.retry')}
            </Button>
          ) : paused ? (
            <Button
              variant='outline'
              size='sm'
              disabled={busy || running}
              onClick={() => void control('resume')}
            >
              {$t('searchHistory.resume')}
            </Button>
          ) : fillable && !running && !busy ? (
            <Button variant='outline' size='sm' onClick={() => void submit()}>
              {$t('searchHistory.fetchMissing')}
            </Button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

// A range across years names both years, so "2025-10-12 to 2026-08-16" never reads as "2025-10-12 to 08-16".
const dateRanges = (list: { start: string; end: string }[]) =>
  list
    .slice(0, 3)
    .map((r) => {
      const withYear = r.start.slice(0, 4) !== r.end.slice(0, 4);
      return r.start === r.end
        ? formatDate(r.start)
        : $t('common.range', {
            0: formatDate(r.start, { withYear }),
            1: formatDate(r.end, { withYear }),
          });
    })
    .join(isChinese() ? '、' : ', ') + (list.length > 3 ? '…' : '');

// How the saved days are counted, for the page's ⓘ: when they were last saved, blank days, why there is no comparison,
// how far back gaps are filled, and whether scheduled sync is off.
export function coverageNotes(report: SearchReport): string[] {
  const w = report.window,
    coverage = report.coverage;
  if (!w || !coverage || report.live) return [];
  return [
    ...(coverage.current.updatedAt
      ? [
          $t('searchHistory.updated', {
            0: formatDateTime(coverage.current.updatedAt),
          }),
        ]
      : []),
    ...(coverage.current.noRecordDays ? [$t('searchHistory.noRecords')] : []),
    ...(coverage.previous &&
    coverage.previous.recordedDays < coverage.previous.days
      ? [$t('searchHistory.noComparison')]
      : []),
    ...(coverage.earliest &&
    (w.start < coverage.earliest ||
      (!w.all && w.previousStart < coverage.earliest))
      ? [$t('searchHistory.limit', { 0: formatDate(coverage.earliest) })]
      : []),
    ...(!report.history?.scheduleEnabled
      ? [$t('searchHistory.scheduleOff')]
      : []),
  ];
}
