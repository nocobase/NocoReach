import { useEffect, useRef, useState } from 'react';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '#components/ui/button';
import { toast } from '#components/ui/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '#components/ui/alert-dialog';
import { ANALYSIS_SCHEDULE, errorKind, type Schedule } from './data.js';
import { useScheduleFormatting } from './format.js';
import { Failure, Field, StateBadge } from './shared.js';

/**
 * The card's "…" menu: run now (daily analysis only), pause or turn on, and the technical details the Scheduler
 * plugin reports. Pausing asks first; turning on does not. Each dialog keeps a failed request open with its reason,
 * and a request that lost access or found the task gone closes it and refreshes the list instead.
 */
export function ScheduleMenu({
  schedule,
  changed,
  invalidated,
}: {
  schedule: Schedule;
  changed: (next?: Schedule) => void;
  invalidated: () => void;
}) {
  const { t } = useTranslation();
  const api = useApiClient();
  const format = useScheduleFormatting();
  const [open, setOpen] = useState<'run' | 'disable' | 'details' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const aliveRef = useRef(false);
  const pendingRef = useRef(false);
  // A manual run that may have reached the server keeps its id, so trying again cannot start a second run.
  const requestIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const active = schedule.lifecycleState === 'active';
  const runnable =
    schedule.key === ANALYSIS_SCHEDULE &&
    active &&
    schedule.targetState === 'ready';
  async function request(action: 'enable' | 'disable' | 'trigger') {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (action === 'trigger') {
        requestIdRef.current ??= newRequestId();
        await api.request({
          method: 'POST',
          path: `nocoreach/schedules/${encodeURIComponent(schedule.id)}/trigger`,
          json: { requestId: requestIdRef.current },
        });
        if (!aliveRef.current) return;
        requestIdRef.current = undefined;
        toast.add({ type: 'success', title: t('schedules.triggered') });
        setOpen(null);
        changed();
        return;
      }
      const response = await api.request<{ data: Schedule }>({
        method: 'POST',
        path: `scheduler/schedules/${encodeURIComponent(schedule.id)}/${action}`,
      });
      if (!aliveRef.current) return;
      toast.add({
        type: 'success',
        title: t(
          response.data.enabled
            ? 'schedules.enabledNotice'
            : 'schedules.disabledNotice',
          { name: format.name(response.data) },
        ),
      });
      setOpen(null);
      changed(response.data);
    } catch (failure) {
      if (!aliveRef.current) return;
      const kind = errorKind(failure);
      setError(failure);
      if (kind !== 'failed') {
        setOpen(null);
        invalidated();
      }
      // Turning on has no dialog to hold the reason.
      if (kind !== 'failed' || action === 'enable')
        toast.add({ type: 'error', title: t(`schedules.${kind}`) });
    } finally {
      pendingRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  }
  const show = (dialog: 'run' | 'disable' | 'details') => {
    setError(undefined);
    setOpen(dialog);
  };
  const keep = (next: boolean) => {
    if (!next && !pendingRef.current) setOpen(null);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='outline'
              size='icon'
              aria-label={t('schedules.moreActions')}
              disabled={busy}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='min-w-40'>
          {schedule.key === ANALYSIS_SCHEDULE ? (
            <DropdownMenuItem disabled={!runnable} onClick={() => show('run')}>
              {t('schedules.runNow')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={!active}
            onClick={() =>
              schedule.enabled ? show('disable') : void request('enable')
            }
          >
            {t(schedule.enabled ? 'schedules.disable' : 'schedules.enable')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => show('details')}>
            {t('schedules.details')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={open === 'run'} onOpenChange={keep}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('schedules.runNow')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('schedules.runNowHelp')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <Failure error={error} /> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t('schedules.cancel')}
            </AlertDialogCancel>
            <Button disabled={busy} onClick={() => void request('trigger')}>
              {t(busy ? 'schedules.submitting' : 'schedules.confirmRun')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={open === 'disable'} onOpenChange={keep}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('schedules.disableTitle', { name: format.name(schedule) })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('schedules.disableHelp')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <Failure error={error} /> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t('schedules.cancel')}
            </AlertDialogCancel>
            <Button
              variant='destructive'
              disabled={busy}
              onClick={() => void request('disable')}
            >
              {t(busy ? 'schedules.saving' : 'schedules.disable')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={open === 'details'} onOpenChange={keep}>
        <DialogContent className='sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{t('schedules.details')}</DialogTitle>
            <DialogDescription>{t('schedules.detailsHelp')}</DialogDescription>
          </DialogHeader>
          <TechnicalDetails schedule={schedule} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function TechnicalDetails({ schedule }: { schedule: Schedule }) {
  const { t } = useTranslation();
  const format = useScheduleFormatting();
  return (
    <div className='flex flex-col gap-4'>
      <dl className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        <Field label={t('schedules.plan')}>
          {format.cron(schedule.cron)}
          <div className='font-mono text-xs text-muted-foreground'>
            {schedule.cron}
          </div>
        </Field>
        <Field label={t('schedules.timezone')}>{schedule.timezone}</Field>
        <Field label={t('schedules.scheduleKey')}>
          <span className='font-mono text-xs'>{schedule.key}</span>
        </Field>
        <Field label={t('schedules.scheduling')}>
          <StateBadge value={schedule.scheduleStatus} />
        </Field>
        <Field label={t('schedules.lifecycle')}>
          <StateBadge value={schedule.lifecycleState} />
        </Field>
        <Field label={t('schedules.target')}>
          <StateBadge value={schedule.targetState} />
        </Field>
        <Field label={t('schedules.lastRun')}>
          {format.date(schedule.lastRunAt)}
        </Field>
        <Field label={t('schedules.nextRun')}>
          {format.date(schedule.nextRunAt)}
        </Field>
        <Field label={t('schedules.runCount')}>
          {format.number(schedule.runCount)}
        </Field>
        <Field label={t('schedules.completedCount')}>
          {format.number(schedule.completedCount)}
        </Field>
      </dl>
      {schedule.key === ANALYSIS_SCHEDULE ? (
        <p className='text-sm text-muted-foreground'>
          {t('schedules.dstHelp')}
        </p>
      ) : null}
    </div>
  );
}

// getRandomValues is also available on the LAN HTTP development preview.
function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
