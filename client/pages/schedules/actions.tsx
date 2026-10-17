import { useEffect, useRef, useState } from 'react';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { toast } from '#components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { errorKind, type Schedule } from './data.js';
import { Failure } from './shared.js';
import { TimezoneSelect } from './timezone-select.js';

export function ScheduleActions({
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
  const location = useLocation();
  const navigate = useNavigate();
  const edit = location.pathname.endsWith('/edit');
  const base = `/schedules/${encodeURIComponent(schedule.id)}`;
  const [confirm, setConfirm] = useState(false);
  const [time, setTime] = useState(() => {
    const [minute, hour] = schedule.cron.split(' ');
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  });
  const [busy, setBusy] = useState(false);
  const [timezone, setTimezone] = useState(schedule.timezone);
  const [error, setError] = useState<unknown>();
  const [invalid, setInvalid] = useState(false);
  const pendingRef = useRef(false);
  const aliveRef = useRef(false);
  // Keep an uncertain request's identity even when its confirmation is closed.
  const requestIdRef = useRef<string | undefined>(undefined);
  const timeInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  function resetTiming() {
    const [minute, hour] = schedule.cron.split(' ');
    setTime(`${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`);
    setTimezone(schedule.timezone);
    setInvalid(false);
    setError(undefined);
  }
  function closeEdit() {
    resetTiming();
    void navigate(`${base}${location.search}`, { replace: true });
  }
  async function submit(action: 'timing' | 'trigger') {
    if (pendingRef.current) return;
    if (action === 'timing' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setInvalid(true);
      timeInputRef.current?.focus();
      return;
    }
    pendingRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (action === 'trigger') requestIdRef.current ??= newRequestId();
      const response = await api.request<{ data: Schedule }>({
        method: action === 'timing' ? 'PUT' : 'POST',
        path: `nocoreach/schedules/${encodeURIComponent(schedule.id)}/${action}`,
        json:
          action === 'timing'
            ? { time, timezone }
            : { requestId: requestIdRef.current },
      });
      if (!aliveRef.current) return;
      toast.add({
        type: 'success',
        title: t(
          action === 'timing' ? 'schedules.timeSaved' : 'schedules.triggered',
        ),
      });
      if (action === 'trigger') {
        requestIdRef.current = undefined;
        setConfirm(false);
      }
      changed(action === 'timing' ? response.data : undefined);
      if (action === 'timing') closeEdit();
    } catch (failure) {
      if (!aliveRef.current) return;
      setError(failure);
      if (errorKind(failure) !== 'failed') {
        setConfirm(false);
        if (edit) closeEdit();
        invalidated();
        toast.add({
          type: 'error',
          title: t(`schedules.${errorKind(failure)}`),
        });
      }
    } finally {
      pendingRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  }
  const unavailable =
    busy ||
    schedule.lifecycleState !== 'active' ||
    Boolean(error && errorKind(error) !== 'failed');
  return (
    <>
      <Button
        variant='outline'
        disabled={unavailable}
        onClick={resetTiming}
        render={<Link to={`${base}/edit${location.search}`} />}
      >
        {t('schedules.editTime')}
      </Button>
      <Button
        variant='outline'
        disabled={unavailable || schedule.targetState !== 'ready'}
        onClick={() => {
          setError(undefined);
          setConfirm(true);
        }}
      >
        {t('schedules.runNow')}
      </Button>
      <Dialog
        open={edit}
        onOpenChange={(open) => {
          if (!open && !pendingRef.current) closeEdit();
        }}
      >
        <DialogContent showCloseButton={!busy} initialFocus={timeInputRef}>
          <DialogHeader>
            <DialogTitle>{t('schedules.editTime')}</DialogTitle>
            <DialogDescription>
              {t('schedules.timeHelp', { timezone })}
            </DialogDescription>
          </DialogHeader>
          <form
            className='flex flex-col gap-4'
            onSubmit={(event) => {
              event.preventDefault();
              void submit('timing');
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
            <TimezoneSelect
              value={timezone}
              onChange={setTimezone}
              disabled={busy}
            />
            <p className='text-sm text-muted-foreground'>
              {t('schedules.dstHelp')}
            </p>
            {error ? <Failure error={error} /> : null}
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={closeEdit}
              >
                {t('schedules.cancel')}
              </Button>
              <Button type='submit' disabled={busy}>
                {t(busy ? 'schedules.saving' : 'schedules.saveTime')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirm}
        onOpenChange={(open) => {
          if (!pendingRef.current) setConfirm(open);
        }}
      >
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
            <Button disabled={busy} onClick={() => void submit('trigger')}>
              {t(busy ? 'schedules.submitting' : 'schedules.confirmRun')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
