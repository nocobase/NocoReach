import { useEffect, useRef, useState } from 'react';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useOutletContext, useParams } from 'react-router';
import { Info } from 'lucide-react';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { toast } from '#components/ui/toast';
import {
  ANALYSIS_SCHEDULE,
  dailyTime,
  errorKind,
  useScheduleResource,
  type Schedule,
} from './data.js';
import type { SchedulesOutletContext } from './index.js';
import { useScheduleFormatting } from './format.js';
import { Failure, Loading } from './shared.js';
import { TimezoneSelect } from './timezone-select.js';

const FORM_ID = 'schedule-time-form';

// Settings › Automatic runs › Change time: the daily analysis time and its timezone, over the list. The schedule is
// read fresh, so the form starts from what the server has now rather than from an older list.
export default function ScheduleEditDialog() {
  const { t } = useTranslation();
  const format = useScheduleFormatting();
  const { scheduleId = '' } = useParams();
  const parent = useOutletContext<SchedulesOutletContext | undefined>();
  const { data, error, reload } = useScheduleResource<{ data: Schedule }>(
    `scheduler/schedules/${encodeURIComponent(scheduleId)}`,
  );
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const schedule = data?.data;
  const editable =
    schedule?.key === ANALYSIS_SCHEDULE && schedule.lifecycleState === 'active';
  return (
    <RouteDialog
      title={
        schedule
          ? t('schedules.editTitle', { name: format.name(schedule) })
          : t('schedules.editTime')
      }
      description={t('schedules.editHelp')}
      className='sm:max-w-md'
      beforeClose={() => !busyRef.current}
      footer={
        <EditFooter busy={busy} canSave={Boolean(schedule && editable)} />
      }
    >
      {error ? <Failure error={error} retry={reload} /> : null}
      {!schedule && !error ? <Loading /> : null}
      {schedule && !editable ? (
        <p className='text-sm text-muted-foreground'>
          {t('schedules.inactiveHelp')}
        </p>
      ) : null}
      {schedule && editable ? (
        <EditForm
          key={schedule.id}
          schedule={schedule}
          busy={busy}
          onBusy={(next) => {
            busyRef.current = next;
            setBusy(next);
          }}
          saved={() => parent?.reload()}
          invalidated={() => parent?.reload()}
        />
      ) : null}
    </RouteDialog>
  );
}

function EditFooter({ busy, canSave }: { busy: boolean; canSave: boolean }) {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={busy}
        onClick={() => void close()}
      >
        {t('schedules.cancel')}
      </Button>
      {canSave ? (
        <Button type='submit' form={FORM_ID} disabled={busy}>
          {t(busy ? 'schedules.saving' : 'schedules.saveTime')}
        </Button>
      ) : null}
    </>
  );
}

function EditForm({
  schedule,
  busy,
  onBusy,
  saved,
  invalidated,
}: {
  schedule: Schedule;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  saved: () => void;
  invalidated: () => void;
}) {
  const { t } = useTranslation();
  const api = useApiClient();
  const { close } = useRouteOverlay();
  const [time, setTime] = useState(() => dailyTime(schedule.cron) ?? '09:00');
  const [timezone, setTimezone] = useState(schedule.timezone);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<unknown>();
  const timeInputRef = useRef<HTMLInputElement>(null);
  const aliveRef = useRef(false);
  useEffect(() => {
    aliveRef.current = true;
    timeInputRef.current?.focus();
    return () => {
      aliveRef.current = false;
    };
  }, []);
  async function submit() {
    if (busy) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setInvalid(true);
      timeInputRef.current?.focus();
      return;
    }
    onBusy(true);
    setError(undefined);
    try {
      await api.request<{ data: Schedule }>({
        method: 'PUT',
        path: `nocoreach/schedules/${encodeURIComponent(schedule.id)}/timing`,
        json: { time, timezone },
      });
      if (!aliveRef.current) return;
      toast.add({ type: 'success', title: t('schedules.timeSaved') });
      saved();
      onBusy(false);
      await close();
    } catch (failure) {
      if (!aliveRef.current) return;
      onBusy(false);
      setError(failure);
      if (errorKind(failure) !== 'failed') {
        toast.add({
          type: 'error',
          title: t(`schedules.${errorKind(failure)}`),
        });
        invalidated();
        await close();
      }
    }
  }
  return (
    <form
      id={FORM_ID}
      className='flex flex-col gap-4'
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className='flex flex-col gap-2'>
        <Label htmlFor='schedule-time'>{t('schedules.dailyTime')}</Label>
        <Input
          ref={timeInputRef}
          id='schedule-time'
          type='time'
          aria-required='true'
          value={time}
          disabled={busy}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'schedule-time-error' : undefined}
          onChange={(event) => {
            setTime(event.target.value);
            setInvalid(false);
          }}
        />
        {invalid ? (
          <p
            id='schedule-time-error'
            role='alert'
            className='text-sm text-destructive'
          >
            {t('schedules.invalidTime')}
          </p>
        ) : null}
      </div>
      <TimezoneSelect value={timezone} onChange={setTimezone} disabled={busy} />
      <p className='flex gap-2 text-sm text-muted-foreground'>
        <Info aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
        {t('schedules.dataReadyHint', { time: dataReadyAt(timezone) })}
      </p>
      {error ? <Failure error={error} /> : null}
    </form>
  );
}

/**
 * Most sources sync once per UTC day (server/nocoreach/sync-policy.ts), so their new data lands soon after midnight
 * UTC; this is that moment in the chosen timezone.
 */
function dataReadyAt(timeZone: string): string {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }).format(midnight);
  } catch {
    return '00:00';
  }
}
