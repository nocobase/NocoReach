import { useTranslation } from '@nocobase/i18n/client';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '#components/ui/card';
import { useScheduleResource, type ScheduleList } from './data.js';
import {
  RefreshButton,
  Description,
  Failure,
  Loading,
  EmptyState,
  StateBadge,
  ScheduleFields,
  ScheduleToggle,
} from './shared.js';

export default function SchedulesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const rawPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const { data, error, reload, refreshing, replace } =
    useScheduleResource<ScheduleList>(
      `scheduler/schedules?page=${page}&pageSize=20`,
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
      <PageContainer>
        <PageHeader
          title={t('schedules.title')}
          description={t('schedules.description')}
          actions={<RefreshButton busy={refreshing} refresh={reload} />}
        />
        {error ? <Failure error={error} retry={reload} /> : null}
        {!data && !error ? <Loading /> : null}
        {data?.data.length === 0 ? <EmptyState /> : null}
        {data?.data.map((schedule) => (
          <Card key={schedule.id}>
            <CardHeader>
              <CardTitle>
                <Link
                  className='hover:underline'
                  to={{
                    pathname: encodeURIComponent(schedule.id),
                    search: location.search,
                  }}
                >
                  {schedule.title}
                </Link>
              </CardTitle>
              <CardDescription>
                <Description text={schedule.description} />
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              <div>
                <StateBadge value={schedule.enabled ? 'enabled' : 'disabled'} />
              </div>
              <ScheduleFields schedule={schedule} />
            </CardContent>
            <CardFooter className='flex-wrap justify-between gap-3'>
              <Button
                variant='ghost'
                nativeButton={false}
                render={
                  <Link
                    to={{
                      pathname: encodeURIComponent(schedule.id),
                      search: location.search,
                    }}
                  />
                }
              >
                {t('schedules.history')}
              </Button>
              <ScheduleToggle
                schedule={schedule}
                invalidated={reload}
                changed={(next) => {
                  replace({
                    ...data,
                    data: data.data.map((item) =>
                      item.id === next.id ? next : item,
                    ),
                  });
                  reload();
                }}
              />
            </CardFooter>
          </Card>
        ))}
        {data ? (
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
      <Outlet context={{ reload }} />
    </>
  );
}
