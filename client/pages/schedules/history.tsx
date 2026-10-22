import { useTranslation } from '@nocobase/i18n/client';
import type { ReactNode } from 'react';
import { useApiClient } from '@nocobase/app-client';
import { useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { RouteDrawer } from '#components/route-drawer';
import { Button } from '#components/ui/button';
import {
  errorKind,
  runTotals,
  useProjectNames,
  useScheduleResource,
  type History,
  type Occurrence,
  type Schedule,
} from './data.js';
import { useScheduleFormatting } from './format.js';
import type { SchedulesOutletContext } from './index.js';
import { RunDetail } from './run.js';
import {
  EmptyState,
  Failure,
  Loading,
  RefreshButton,
  StateBadge,
} from './shared.js';

// Settings › Automatic runs › Run history: one line on how the recent runs went, then each firing with its
// suggestions. A run that went well carries no status; failed, skipped and running ones say so.
export default function ScheduleHistoryDrawer() {
  const { t } = useTranslation();
  const { scheduleId = '' } = useParams();
  const parent = useOutletContext<SchedulesOutletContext | undefined>();
  const path = `scheduler/schedules/${encodeURIComponent(scheduleId)}`;
  const schedule = useScheduleResource<{ data: Schedule }>(path);
  const history = useScheduleResource<History>(
    `${path}/occurrences?pageSize=20`,
  );
  const [paginationAccessError, setPaginationAccessError] = useState<unknown>();
  // Lost access or a removed task replaces the whole drawer; a plain failure keeps what was read.
  const accessError =
    paginationAccessError ||
    (schedule.error && errorKind(schedule.error) !== 'failed'
      ? schedule.error
      : undefined) ||
    (history.error && errorKind(history.error) !== 'failed'
      ? history.error
      : undefined);
  function refresh() {
    setPaginationAccessError(undefined);
    schedule.reload();
    history.reload();
  }
  const format = useScheduleFormatting();
  const name =
    !accessError && schedule.data ? format.name(schedule.data.data) : undefined;
  return (
    <RouteDrawer
      title={
        name ? t('schedules.historyTitle', { name }) : t('schedules.history')
      }
    >
      {accessError ? (
        <div className='flex flex-col gap-4'>
          <Toolbar
            refresh={
              <RefreshButton
                busy={schedule.refreshing || history.refreshing}
                refresh={refresh}
              />
            }
          />
          <Failure error={accessError} retry={refresh} />
        </div>
      ) : (
        <HistoryList
          path={`${path}/occurrences`}
          resource={history}
          refresh={
            <RefreshButton
              busy={schedule.refreshing || history.refreshing}
              refresh={refresh}
            />
          }
          onAccessError={(failure) => {
            setPaginationAccessError(failure);
            parent?.reload();
          }}
        />
      )}
    </RouteDrawer>
  );
}

function Toolbar({
  summary,
  refresh,
}: {
  summary?: string;
  refresh: ReactNode;
}) {
  return (
    <div className='flex items-center justify-between gap-3'>
      <p className='text-sm text-muted-foreground'>{summary}</p>
      {refresh}
    </div>
  );
}

function HistoryList({
  path,
  resource,
  refresh,
  onAccessError,
}: {
  path: string;
  resource: ReturnType<typeof useScheduleResource<History>>;
  refresh: ReactNode;
  onAccessError: (error: unknown) => void;
}) {
  const { t } = useTranslation();
  const api = useApiClient();
  const { data, error, reload, refreshing } = resource;
  const [extra, setExtra] = useState<History>();
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState<unknown>();
  const controllerRef = useRef<AbortController | null>(null);
  const [base, setBase] = useState(data);
  if (base !== data) {
    setBase(data);
    setExtra(undefined);
    setBusy(false);
    setMoreError(undefined);
  }
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [data],
  );
  const names = useProjectNames();
  const token = extra ? extra.meta.nextPageToken : data?.meta.nextPageToken;
  async function more() {
    if (!token || refreshing || controllerRef.current) return;
    const request = new AbortController();
    controllerRef.current = request;
    setBusy(true);
    setMoreError(undefined);
    try {
      const next = await api.request<History>({
        path: `${path}?pageSize=20&pageToken=${encodeURIComponent(token)}`,
        signal: request.signal,
      });
      if (!request.signal.aborted)
        setExtra((current) => ({
          data: [...(current?.data || []), ...next.data],
          meta: next.meta,
        }));
    } catch (failure) {
      if (!request.signal.aborted) {
        setMoreError(failure);
        if (errorKind(failure) !== 'failed') onAccessError(failure);
      }
    } finally {
      if (!request.signal.aborted) {
        setBusy(false);
        controllerRef.current = null;
      }
    }
  }
  const records = [...(data?.data || []), ...(extra?.data || [])].filter(
    (record, index, all) =>
      all.findIndex((other) => other.id === record.id) === index,
  );
  // A single run speaks for itself in its row.
  const problems = records.filter((record) => runTotals(record).problem).length;
  const summary =
    records.length > 1
      ? problems
        ? t('schedules.summaryProblems', {
            count: problems,
            total: records.length,
          })
        : t('schedules.summaryClean', { count: records.length })
      : undefined;
  return (
    <section
      className='flex flex-col gap-3'
      aria-label={t('schedules.history')}
    >
      <Toolbar summary={summary} refresh={refresh} />
      {error ? <Failure error={error} retry={reload} /> : null}
      {!data && !error ? <Loading /> : null}
      {data && !records.length ? <EmptyState history /> : null}
      {records.length ? (
        <ol className='flex flex-col divide-y rounded-lg border'>
          {records.map((record) => (
            <RunRow key={record.id} run={record} names={names} />
          ))}
        </ol>
      ) : null}
      {moreError ? (
        <Failure error={moreError} retry={() => void more()} />
      ) : null}
      {token ? (
        <Button
          variant='outline'
          disabled={busy || refreshing}
          onClick={() => void more()}
        >
          {t(busy ? 'schedules.loading' : 'schedules.more')}
        </Button>
      ) : null}
    </section>
  );
}

function RunRow({
  run,
  names,
}: {
  run: Occurrence;
  names: Map<string, string>;
}) {
  const { t } = useTranslation();
  const format = useScheduleFormatting();
  const { items } = runTotals(run);
  return (
    <li className='flex items-start justify-between gap-4 px-3 py-2.5 text-sm'>
      <div className='flex min-w-0 flex-col gap-0.5'>
        <span className='flex flex-wrap items-center gap-2'>
          <time dateTime={run.startedAt}>{format.when(run.startedAt)}</time>
          {run.status === 'succeeded' ? null : (
            <StateBadge value={run.status} />
          )}
        </span>
        <RunDetail run={run} names={names} />
      </div>
      {items !== undefined ? (
        <span className='shrink-0 tabular-nums'>
          {t('schedules.items', { count: items })}
        </span>
      ) : null}
    </li>
  );
}
