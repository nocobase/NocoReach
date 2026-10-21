import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { RouteDrawer } from '#components/route-drawer';
import { Button } from '#components/ui/button';
import { useProjects } from '../reach-data.js';
import {
  errorKind,
  projectOutcomes,
  useScheduleResource,
  type History,
  type Occurrence,
  type Schedule,
} from './data.js';
import { useScheduleFormatting } from './format.js';
import type { SchedulesOutletContext } from './index.js';
import {
  EmptyState,
  Failure,
  Loading,
  RefreshButton,
  StateBadge,
} from './shared.js';

// Settings › Automatic runs › Run history: each firing with its outcome per project, by project name, over the list.
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
  const name = !accessError ? schedule.data?.data.title : undefined;
  return (
    <RouteDrawer
      title={
        name ? t('schedules.historyTitle', { name }) : t('schedules.history')
      }
      description={t('schedules.historyDescription')}
    >
      <div className='flex flex-col gap-4'>
        <div className='flex justify-end'>
          <RefreshButton
            busy={schedule.refreshing || history.refreshing}
            refresh={refresh}
          />
        </div>
        {accessError ? (
          <Failure error={accessError} retry={refresh} />
        ) : (
          <HistoryList
            path={`${path}/occurrences`}
            resource={history}
            onAccessError={(failure) => {
              setPaginationAccessError(failure);
              parent?.reload();
            }}
          />
        )}
      </div>
    </RouteDrawer>
  );
}

function HistoryList({
  path,
  resource,
  onAccessError,
}: {
  path: string;
  resource: ReturnType<typeof useScheduleResource<History>>;
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
  const { projects } = useProjects();
  const names = useMemo(
    () =>
      new Map(
        (projects ?? []).map((project) => [String(project.id), project.name]),
      ),
    [projects],
  );
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
  return (
    <section
      className='flex flex-col gap-3'
      aria-label={t('schedules.history')}
    >
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
  const outcomes = projectOutcomes(run.resultSummary);
  return (
    <li className='flex flex-col gap-1.5 p-3 text-sm'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <time dateTime={run.startedAt} className='font-medium'>
          {format.when(run.startedAt)}
        </time>
        <StateBadge value={run.status} />
      </div>
      {outcomes.length ? (
        <ul className='flex flex-col gap-1'>
          {outcomes.map((item) => (
            <li
              key={item.id}
              className='flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground'
            >
              <span className='text-foreground'>
                {names.get(item.id) ?? t('schedules.project', { id: item.id })}
              </span>
              <StateBadge
                value={
                  item.skipped
                    ? 'skipped'
                    : item.ok === true
                      ? 'succeeded'
                      : item.ok === false
                        ? 'failed'
                        : 'unknown'
                }
              />
              {item.items !== undefined && !item.skipped ? (
                <span>{t('schedules.items', { count: item.items })}</span>
              ) : null}
              {item.error ? (
                <span className='w-full break-words'>{item.error}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : run.reason ? (
        <p className='break-words text-muted-foreground'>{run.reason}</p>
      ) : null}
    </li>
  );
}
