import { useTranslation } from '@nocobase/i18n/client';
import { Link, useLocation } from 'react-router';
import { InfoTip } from '#components/reach/info-tip';
import { Button } from '#components/ui/button';
import { TableCell, TableRow } from '#components/ui/table';
import { ScheduleMenu } from './actions.js';
import {
  ANALYSIS_SCHEDULE,
  dailyTime,
  runTotals,
  useProjectNames,
  useScheduleResource,
  type History,
  type Schedule,
} from './data.js';
import { useScheduleFormatting } from './format.js';
import { RunDetail } from './run.js';
import { StateBadge } from './shared.js';

/**
 * One automatic run as a row of Settings › Automatic runs, laid out like the other Settings tables: what it is (its
 * explanation behind ⓘ), when it runs in its own timezone, how the last run went, the next run and whether it is on.
 * Run history opens from the row; changing the time, running now, pausing and the technical details are in "…".
 */
export function ScheduleRow({
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
  const names = useProjectNames();
  const name = format.name(schedule);
  const help =
    schedule.key === ANALYSIS_SCHEDULE
      ? t('schedules.analysisDescription')
      : schedule.description;
  const time = dailyTime(schedule.cron);
  const run = latest.data?.data[0];
  const items = run ? runTotals(run).items : undefined;
  return (
    <TableRow>
      <TableCell className='align-top'>
        <span className='inline-flex items-center gap-1'>
          {name}
          {help ? (
            <InfoTip label={t('schedules.about', { name })}>
              <p>{help}</p>
            </InfoTip>
          ) : null}
        </span>
      </TableCell>
      <TableCell className='align-top'>
        <div>
          {time ? t('schedules.dailyAt', { time }) : format.cron(schedule.cron)}
        </div>
        <div className='text-xs text-muted-foreground'>
          {format.zone(schedule.timezone)}
        </div>
      </TableCell>
      <TableCell className='max-w-72 align-top whitespace-normal'>
        {run ? (
          <>
            <span className='flex flex-wrap items-center gap-2'>
              <span>{format.when(run.startedAt)}</span>
              {run.status === 'succeeded' ? null : (
                <StateBadge value={run.status} />
              )}
            </span>
            <div className='text-xs'>
              {items !== undefined ? (
                <span className='text-muted-foreground'>
                  {t('schedules.items', { count: items })}
                </span>
              ) : null}
              <RunDetail run={run} names={names} brief />
            </div>
          </>
        ) : schedule.lastRunAt ? (
          format.when(schedule.lastRunAt)
        ) : latest.data ? (
          <span className='text-muted-foreground'>
            {t('schedules.notRunYet')}
          </span>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className='align-top'>
        {schedule.enabled ? (
          format.when(schedule.nextRunAt)
        ) : (
          <span className='text-muted-foreground'>
            {t('schedules.pausedNext')}
          </span>
        )}
      </TableCell>
      <TableCell className='align-top'>
        <StateBadge value={schedule.enabled ? 'enabled' : 'disabled'} />
      </TableCell>
      <TableCell className='align-top'>
        <div className='flex items-center justify-end gap-1'>
          <Button
            variant='link'
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
        </div>
      </TableCell>
    </TableRow>
  );
}
