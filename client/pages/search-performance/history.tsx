import { useEffect, useRef, useState } from 'react';
import { $t, getCurrentLocale } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Button } from '#components/ui/button';
import { useMe } from '../me';
import type { SearchReport } from './index';

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
  const submit = async (mode: 'missing' | 'refresh') => {
    setBusy(true);
    setError(false);
    try {
      const enqueue = (startDate: string, endDate: string) =>
        api.action('nrGoogle', 'syncNow', {
          method: 'POST',
          body: { projectId, scope: 'gscOverview', startDate, endDate, mode },
          unwrap: 'data',
        });
      await enqueue(w.start, w.end);
      if (mode === 'missing' && !w.all && coverage?.previous?.missingDays)
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
    void submit('missing');
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
  return (
    <div
      role='status'
      className='flex flex-col gap-2 rounded-lg border bg-muted/40 p-4 text-sm'
      data-search-coverage=''
    >
      <p className='font-medium'>
        {$t(
          report.complete ? 'searchHistory.complete' : 'searchHistory.partial',
        )}
      </p>
      {coverage ? (
        <>
          <p>
            {$t('searchHistory.coverage', {
              0: coverage.current.start,
              1: coverage.current.end,
              2: coverage.current.recordedDays,
              3: coverage.current.noRecordDays,
              4: coverage.current.missingDays,
            })}
          </p>
          {coverage.current.records.length ? (
            <p className='text-muted-foreground'>
              {$t('searchHistory.recordedRanges', {
                0: coverage.current.records
                  .map((r) => `${r.start} – ${r.end}`)
                  .join(', '),
              })}
            </p>
          ) : null}
          {coverage.current.noRecordDays ? (
            <p>{$t('searchHistory.noRecords')}</p>
          ) : null}
          {coverage.previous &&
          coverage.previous.recordedDays < coverage.previous.days ? (
            <p>{$t('searchHistory.noComparison')}</p>
          ) : null}
          {coverage.earliest &&
          (w.start < coverage.earliest ||
            (!w.all && w.previousStart < coverage.earliest)) ? (
            <p>{$t('searchHistory.limit', { 0: coverage.earliest })}</p>
          ) : null}
          <p className='text-muted-foreground'>
            {$t('searchHistory.updated', {
              0: coverage.current.updatedAt
                ? new Date(coverage.current.updatedAt).toLocaleString(
                    getCurrentLocale(),
                  )
                : '—',
            })}
          </p>
        </>
      ) : null}
      {running || busy ? (
        <p>{$t('searchHistory.running')}</p>
      ) : failed ? (
        <p>{$t('searchHistory.failed')}</p>
      ) : paused ? (
        <p>{$t('searchHistory.paused')}</p>
      ) : null}
      {durable && !report.history?.scheduleEnabled ? (
        <p>{$t('searchHistory.scheduleOff')}</p>
      ) : null}
      {durable && missing && !admin ? (
        <p>{$t('searchHistory.askAdmin')}</p>
      ) : null}
      {error ? (
        <p role='alert' className='text-destructive'>
          {$t('searchHistory.requestFailed')}
        </p>
      ) : null}
      {admin && durable ? (
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={busy || running || paused}
            onClick={() => void submit('refresh')}
          >
            {$t('searchHistory.refresh')}
          </Button>
          {failed ? (
            <Button
              variant='outline'
              size='sm'
              disabled={busy || running}
              onClick={() => void control('retry')}
            >
              {$t('common.retry')}
            </Button>
          ) : null}
          {paused ? (
            <Button
              variant='outline'
              size='sm'
              disabled={busy || running}
              onClick={() => void control('resume')}
            >
              {$t('searchHistory.resume')}
            </Button>
          ) : null}
          {error ? (
            <Button
              variant='outline'
              size='sm'
              disabled={busy}
              onClick={() => void submit('missing')}
            >
              {$t('common.retry')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
