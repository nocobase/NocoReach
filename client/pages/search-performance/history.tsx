import { useEffect, useRef, useState } from 'react';
import { $t } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Button } from '#components/ui/button';
import { InfoTip } from '#components/reach/info-tip';
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
  // One line above the figures (UI review 2026-10-21): whether the range is complete as a tag, the record and save dates
  // in the ⓘ, and only what needs doing (fetching, failed, paused, ask an administrator) as text with its buttons.
  const details = coverage
    ? [
        $t('searchHistory.coverage', {
          0: formatDate(coverage.current.start),
          1: formatDate(coverage.current.end),
          2: coverage.current.recordedDays,
          3: coverage.current.noRecordDays,
          4: coverage.current.missingDays,
        }),
        ...(coverage.current.records.length
          ? [
              $t('searchHistory.recordedRanges', {
                0: coverage.current.records
                  .map((r) =>
                    $t('common.range', {
                      0: formatDate(r.start),
                      1: formatDate(r.end),
                    }),
                  )
                  .join(', '),
              }),
            ]
          : []),
        ...(coverage.current.noRecordDays
          ? [$t('searchHistory.noRecords')]
          : []),
        ...(coverage.previous &&
        coverage.previous.recordedDays < coverage.previous.days
          ? [$t('searchHistory.noComparison')]
          : []),
        ...(coverage.earliest &&
        (w.start < coverage.earliest ||
          (!w.all && w.previousStart < coverage.earliest))
          ? [$t('searchHistory.limit', { 0: formatDate(coverage.earliest) })]
          : []),
        $t('searchHistory.updated', {
          0: formatDateTime(coverage.current.updatedAt),
        }),
      ]
    : [];
  const states = [
    running || busy
      ? $t('searchHistory.running')
      : failed
        ? $t('searchHistory.failed')
        : paused
          ? $t('searchHistory.paused')
          : null,
    durable && !report.history?.scheduleEnabled
      ? $t('searchHistory.scheduleOff')
      : null,
    durable && missing && !admin ? $t('searchHistory.askAdmin') : null,
  ].filter(Boolean);
  return (
    <div
      role='status'
      className='flex flex-wrap items-center gap-2 text-sm'
      data-search-coverage=''
    >
      <Tag tone={report.complete ? 'green' : 'amber'}>
        {$t(
          report.complete ? 'searchHistory.complete' : 'searchHistory.partial',
        )}
      </Tag>
      {details.length ? (
        <InfoTip label={$t('searchHistory.details')}>
          <span className='flex flex-col gap-1'>
            {details.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </span>
        </InfoTip>
      ) : null}
      {states.map((x) => (
        <span key={x}>{x}</span>
      ))}
      {error ? (
        <span role='alert' className='text-destructive'>
          {$t('searchHistory.requestFailed')}
        </span>
      ) : null}
      {admin && durable ? (
        <span className='ml-auto flex flex-wrap gap-2'>
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
        </span>
      ) : null}
    </div>
  );
}
