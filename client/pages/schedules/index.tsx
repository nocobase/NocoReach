import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useMemo, useState } from 'react';
import { Link, Outlet, useSearchParams } from 'react-router';
import { PageContainer } from '#components/page-container';
// The NocoReach header, as on every other page: actions centred on the title block rather than on its last line.
import { InfoTip } from '#components/reach/info-tip';
import { PageHeader } from '#components/reach/page';
import { Button } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { useScheduleFormatting } from './format.js';
import { ScheduleRow } from './row.js';
import { useScheduleResource, type ScheduleList } from './data.js';
import { RefreshButton, Failure, Loading, EmptyState } from './shared.js';

/** What the time dialog and the run history read from the page they open over. */
export interface SchedulesOutletContext {
  reload: () => void;
}

// Settings › Automatic runs lists the work on the Scheduler plugin: today only the daily analysis, which runs once for
// every project. The per-project data syncs and weekly checks run on NocoReach's own timers and are shown, with their
// frequency, in Data sources › Data health; they are not repeated here.
export default function SchedulesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const [stamp, setStamp] = useState(0);
  const format = useScheduleFormatting();
  const { data, error, refreshing, replace } =
    useScheduleResource<ScheduleList>(
      `scheduler/schedules?page=${page}&pageSize=20`,
      stamp,
    );
  // Reads the list and each row's last run again; stable, so the overlays' context does not change.
  const refresh = useCallback(() => setStamp((current) => current + 1), []);
  const outletContext = useMemo<SchedulesOutletContext>(
    () => ({ reload: refresh }),
    [refresh],
  );
  // Last and next runs are in the browser's timezone; the ⓘ on Last run says so when a schedule keeps another one.
  const otherZone = data?.data.some(
    (schedule) => schedule.timezone !== format.timeZone,
  );
  function go(next: number) {
    setParams((current) => {
      const value = new URLSearchParams(current);
      value.set('page', String(next));
      return value;
    });
  }
  return (
    <>
      <PageContainer className='min-h-0 flex-1 overflow-y-auto'>
        <PageHeader
          title={t('schedules.title')}
          description={t('schedules.description')}
          info={
            <InfoTip label={t('schedules.otherWorkLabel')} side='bottom'>
              <p>
                {t('schedules.otherWork')}{' '}
                <Link
                  to='/connections'
                  className='text-foreground underline underline-offset-4'
                >
                  {t('schedules.otherWorkLink')}
                </Link>
              </p>
            </InfoTip>
          }
          actions={<RefreshButton busy={refreshing} refresh={refresh} />}
        />
        {error ? <Failure error={error} retry={refresh} /> : null}
        {!data && !error ? <Loading /> : null}
        {data?.data.length === 0 ? <EmptyState /> : null}
        {data?.data.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('schedules.columns.name')}</TableHead>
                <TableHead>{t('schedules.columns.time')}</TableHead>
                <TableHead>
                  {otherZone ? (
                    <span className='inline-flex items-center gap-1'>
                      {t('schedules.columns.last')}
                      <InfoTip label={t('schedules.timesLabel')}>
                        <p>
                          {t('schedules.shownIn', {
                            zone: format.zone(format.timeZone),
                          })}
                        </p>
                      </InfoTip>
                    </span>
                  ) : (
                    t('schedules.columns.last')
                  )}
                </TableHead>
                {/* Secondary: left out where the table would otherwise scroll sideways. */}
                <TableHead className='hidden xl:table-cell'>
                  {t('schedules.columns.next')}
                </TableHead>
                <TableHead>{t('schedules.columns.status')}</TableHead>
                <TableHead>
                  <span className='sr-only'>
                    {t('schedules.columns.actions')}
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((schedule) => (
                <ScheduleRow
                  key={schedule.id}
                  schedule={schedule}
                  stamp={stamp}
                  invalidated={refresh}
                  changed={(next) => {
                    if (next)
                      replace({
                        ...data,
                        data: data.data.map((item) =>
                          item.id === next.id ? next : item,
                        ),
                      });
                    refresh();
                  }}
                />
              ))}
            </TableBody>
          </Table>
        ) : null}
        {data && (page > 1 || data.meta.total > data.meta.pageSize) ? (
          <nav
            aria-label={t('schedules.pagination')}
            className='flex flex-wrap items-center justify-end gap-3'
          >
            <span className='text-sm text-muted-foreground'>
              {t('schedules.page', { page, total: data.meta.total })}
            </span>
            <Button
              variant='outline'
              disabled={page <= 1 || refreshing}
              onClick={() => go(page - 1)}
            >
              {t('schedules.previous')}
            </Button>
            <Button
              variant='outline'
              disabled={
                page * data.meta.pageSize >= data.meta.total || refreshing
              }
              onClick={() => go(page + 1)}
            >
              {t('schedules.next')}
            </Button>
          </nav>
        ) : null}
      </PageContainer>
      <Outlet context={outletContext} />
    </>
  );
}
