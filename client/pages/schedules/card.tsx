import { useTranslation } from '@nocobase/i18n/client';
import { Link, useLocation } from 'react-router';
import { Button } from '#components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { ScheduleMenu } from './actions.js';
import {
  ANALYSIS_SCHEDULE,
  dailyTime,
  projectOutcomes,
  useScheduleResource,
  type History,
  type Occurrence,
  type Schedule,
} from './data.js';
import { useScheduleFormatting } from './format.js';
import { StateBadge } from './shared.js';

/**
 * One automatic run in plain words: what it does, when it runs in its own timezone, and how the last run went.
 * Scheduler states, the cron expression and counters are behind "Technical details" in the "…" menu.
 */
export function ScheduleCard({
  schedule,
  stamp,
  changed,
  invalidated,
}: {
  schedule: Schedule;
  /** Changes whenever the list is read again, so the last run is read again with it. */
  stamp: number;
  changed: (next?: Schedule) => void;
  invalidated: () => void;
}) {
  const { t } = useTranslation();
  const format = useScheduleFormatting();
  const location = useLocation();
  const path = encodeURIComponent(schedule.id);
  const latest = useScheduleResource<History>(
    `scheduler/schedules/${path}/occurrences?pageSize=1`,
    stamp,
  );
  const analysis = schedule.key === ANALYSIS_SCHEDULE;
  const time = dailyTime(schedule.cron);
  const run = latest.data?.data[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex flex-wrap items-center gap-2'>
          {format.name(schedule)}
          <StateBadge value={schedule.enabled ? 'enabled' : 'disabled'} />
        </CardTitle>
        <CardAction className='flex flex-wrap justify-end gap-2'>
          {analysis && schedule.lifecycleState === 'active' ? (
            <Button
              variant='outline'
              nativeButton={false}
              render={
                <Link
                  to={{ pathname: `${path}/edit`, search: location.search }}
                />
              }
            >
              {t('schedules.editTime')}
            </Button>
          ) : null}
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to={{ pathname: path, search: location.search }} />}
          >
            {t('schedules.history')}
          </Button>
          <ScheduleMenu
            schedule={schedule}
            changed={changed}
            invalidated={invalidated}
          />
        </CardAction>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <p className='flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold'>
          {time ? t('schedules.dailyAt', { time }) : format.cron(schedule.cron)}
          <span className='text-sm font-normal text-muted-foreground'>
            {format.zone(schedule.timezone)}
          </span>
        </p>
        <p className='text-sm text-muted-foreground'>
          {analysis
            ? t('schedules.analysisDescription')
            : schedule.description || t('schedules.noDescription')}
        </p>
        <dl className='flex flex-wrap gap-x-8 gap-y-2 text-sm'>
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            <dt className='text-muted-foreground'>{t('schedules.last')}</dt>
            <dd className='flex min-w-0 flex-wrap items-center gap-2'>
              {run ? (
                <LastRun run={run} />
              ) : schedule.lastRunAt ? (
                format.when(schedule.lastRunAt)
              ) : latest.data ? (
                t('schedules.notRunYet')
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <dt className='text-muted-foreground'>
              {t('schedules.nextLabel')}
            </dt>
            <dd>
              {schedule.enabled
                ? format.when(schedule.nextRunAt)
                : t('schedules.pausedNext')}
            </dd>
          </div>
        </dl>
        {format.timeZone !== schedule.timezone ? (
          <p className='text-xs text-muted-foreground'>
            {t('schedules.shownIn', { zone: format.zone(format.timeZone) })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LastRun({ run }: { run: Occurrence }) {
  const { t } = useTranslation();
  const format = useScheduleFormatting();
  const outcomes = projectOutcomes(run.resultSummary);
  const analyzed = outcomes.filter((item) => item.ok && !item.skipped);
  const summary =
    run.status === 'succeeded'
      ? analyzed.length
        ? t('schedules.analyzed', {
            projects: t('schedules.projectCount', { count: analyzed.length }),
            items: t('schedules.items', {
              count: analyzed.reduce((sum, item) => sum + (item.items ?? 0), 0),
            }),
          })
        : outcomes.some((item) => item.skipped)
          ? t('schedules.allSkipped')
          : ''
      : run.reason || '';
  return (
    <>
      <span>{format.when(run.startedAt)}</span>
      <StateBadge value={run.status} />
      {summary ? (
        <span className='line-clamp-2 min-w-0 break-words text-muted-foreground'>
          {summary}
        </span>
      ) : null}
    </>
  );
}
