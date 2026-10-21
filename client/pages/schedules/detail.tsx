import { ScheduleActions } from './actions.js';
import { useScheduleFormatting } from './format.js';
import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient, usePageBreadcrumb } from '@nocobase/app-client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useOutletContext } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#components/ui/card';
import { Button } from '#components/ui/button';
import {
  useScheduleResource,
  errorKind,
  type History,
  type Schedule,
} from './data.js';
import {
  RefreshButton,
  Description,
  Failure,
  Loading,
  EmptyState,
  StateBadge,
  ScheduleFields,
  ScheduleToggle,
  Field,
} from './shared.js';

export default function ScheduleDetailPage() {
  const { scheduleId = '' } = useParams();
  const location = useLocation();
  return (
    <RouteChildPage>
      <Detail key={`${scheduleId}:${location.pathname}`} id={scheduleId} />
    </RouteChildPage>
  );
}
function Detail({ id }: { id: string }) {
  const { t } = useTranslation();
  const format = useScheduleFormatting();
  const location = useLocation();
  const parent = useOutletContext<{ reload: () => void } | undefined>();
  // Navigation groups stay out of the trail: the sidebar already shows them, and they lead nowhere.
  usePageBreadcrumb([
    { label: t('schedules.title'), to: `/schedules${location.search}` },
    { label: t('schedules.history') },
  ]);
  const path = `scheduler/schedules/${encodeURIComponent(id)}`;
  const { data, error, reload, refreshing, replace } = useScheduleResource<{
    data: Schedule;
  }>(path);
  const history = useScheduleResource<History>(
    `${path}/occurrences?pageSize=20`,
  );
  const [paginationAccessError, setPaginationAccessError] = useState<unknown>();
  const historyAccessError =
    paginationAccessError ||
    (history.error && errorKind(history.error) !== 'failed'
      ? history.error
      : undefined);
  function refresh() {
    reload();
    history.reload();
  }
  return (
    <PageContainer>
      <PageHeader
        title={
          (!historyAccessError && data?.data.title) || t('schedules.history')
        }
        description={t('schedules.historyDescription')}
        actions={
          <RefreshButton
            busy={refreshing || history.refreshing}
            refresh={refresh}
          />
        }
      />
      {error || historyAccessError ? (
        <Failure error={error || historyAccessError} retry={refresh} />
      ) : null}
      {!data && !error ? <Loading /> : null}
      {data && !historyAccessError ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('schedules.configuration')}</CardTitle>
              <CardDescription>
                <Description text={data.data.description} />
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <StateBadge
                  value={data.data.enabled ? 'enabled' : 'disabled'}
                />
                <div className='flex flex-wrap gap-2'>
                  <ScheduleToggle
                    schedule={data.data}
                    invalidated={() => {
                      parent?.reload();
                      refresh();
                    }}
                    changed={(next) => {
                      replace({ data: next });
                      parent?.reload();
                      refresh();
                    }}
                  />
                  {data.data.key === 'nocoreach.daily-analysis' &&
                  data.data.lifecycleState === 'active' ? (
                    <ScheduleActions
                      schedule={data.data}
                      changed={(next) => {
                        if (next) replace({ data: next });
                        parent?.reload();
                        refresh();
                      }}
                      invalidated={() => {
                        parent?.reload();
                        refresh();
                      }}
                    />
                  ) : null}
                </div>
              </div>
              <ScheduleFields schedule={data.data} />
              <dl className='grid gap-4 sm:grid-cols-2'>
                <Field label={t('schedules.runCount')}>
                  {format.number(data.data.runCount)}
                </Field>
                <Field label={t('schedules.completedCount')}>
                  {format.number(data.data.completedCount)}
                </Field>
              </dl>
            </CardContent>
          </Card>
          <HistoryList
            path={`${path}/occurrences`}
            resource={history}
            onAccessError={(failure) => {
              setPaginationAccessError(failure);
              parent?.reload();
            }}
          />
        </>
      ) : null}
    </PageContainer>
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
  const format = useScheduleFormatting();
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
  const denied = moreError && errorKind(moreError) !== 'failed';
  return (
    <section
      className='flex flex-col gap-4'
      aria-label={t('schedules.history')}
    >
      <h2 className='text-base font-medium'>{t('schedules.history')}</h2>
      {error ? <Failure error={error} retry={reload} /> : null}
      {!data && !error ? <Loading /> : null}
      {data && !records.length ? <EmptyState history /> : null}
      {!denied &&
        records.map((record) => (
          <Card key={record.id}>
            <CardHeader>
              <CardTitle>
                <StateBadge value={record.status} />
              </CardTitle>
              <CardDescription>{format.date(record.startedAt)}</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-3'>
              <dl className='grid gap-4 sm:grid-cols-2'>
                <Field label={t('schedules.started')}>
                  {format.date(record.startedAt)}
                </Field>
                <Field label={t('schedules.finished')}>
                  {format.date(record.finishedAt)}
                </Field>
              </dl>
              {record.reason ? (
                <details className='text-sm'>
                  <summary className='cursor-pointer'>
                    {t('schedules.reason')}
                  </summary>
                  <p className='mt-2 whitespace-pre-wrap break-words'>
                    {record.reason}
                  </p>
                </details>
              ) : null}
              <ProjectResults value={record.resultSummary?.projects} />
            </CardContent>
          </Card>
        ))}
      {moreError ? (
        <Failure error={moreError} retry={() => void more()} />
      ) : null}
      {token && !denied ? (
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
function ProjectResults({ value }: { value: unknown }) {
  const { t } = useTranslation();
  const format = useScheduleFormatting();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return (
    <ul className='flex flex-col gap-2 text-sm'>
      {Object.entries(value).map(([id, item]) => {
        if (!item || typeof item !== 'object') return null;
        const result = item as {
          ok?: unknown;
          items?: unknown;
          error?: unknown;
          skipped?: unknown;
        };
        return (
          <li key={id} className='flex flex-wrap items-center gap-2'>
            <span>{t('schedules.project', { id })}</span>
            <StateBadge
              value={
                typeof result.skipped === 'string'
                  ? 'skipped'
                  : result.ok === true
                    ? 'succeeded'
                    : result.ok === false
                      ? 'failed'
                      : 'unknown'
              }
            />
            {typeof result.items === 'number' ? (
              <span>
                {t('schedules.items', { count: format.number(result.items) })}
              </span>
            ) : null}
            {typeof result.error === 'string' ? (
              <details className='w-full'>
                <summary className='cursor-pointer'>
                  {t('schedules.reason')}
                </summary>
                <p className='whitespace-pre-wrap break-words'>
                  {result.error}
                </p>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
