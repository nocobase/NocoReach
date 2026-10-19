import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient, resolveAppUrl } from '@nocobase/app-client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useScheduleFormatting } from './format.js';
import { Link, useLocation } from 'react-router';
import { Clock, RefreshCw } from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '#components/ui/tooltip';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '#components/ui/empty';
import { Button } from '#components/ui/button';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertTitle, AlertDescription } from '#components/ui/alert';
import { Skeleton } from '#components/ui/skeleton';
import { toast } from '#components/ui/toast';
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

export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const { t } = useTranslation();
  const kind = errorKind(error);
  const location = useLocation();
  return (
    <Alert variant='destructive'>
      <AlertTitle>{t('schedules.errorTitle')}</AlertTitle>
      <AlertDescription>
        {t(`schedules.${kind}`)}
        {kind === 'signedOut' ? (
          <Button
            variant='outline'
            nativeButton={false}
            render={<a href={resolveAppUrl('/login')} />}
          >
            {t('schedules.signIn')}
          </Button>
        ) : null}
        {kind === 'notFound' ? (
          <Button
            variant='outline'
            nativeButton={false}
            render={
              <Link to={{ pathname: '/schedules', search: location.search }} />
            }
          >
            {t('schedules.back')}
          </Button>
        ) : null}
        {kind === 'failed' && retry ? (
          <Button variant='outline' onClick={retry}>
            {t('schedules.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
export function EmptyState({ history = false }: { history?: boolean }) {
  const { t } = useTranslation();
  return (
    <Empty className='min-h-48 border border-dashed'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Clock />
        </EmptyMedia>
        <EmptyTitle>
          {t(history ? 'schedules.noRunsTitle' : 'schedules.emptyTitle')}
        </EmptyTitle>
        <EmptyDescription>
          {t(history ? 'schedules.noRuns' : 'schedules.empty')}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
export function RefreshButton({
  busy,
  refresh,
}: {
  busy: boolean;
  refresh: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='outline'
            size='icon'
            aria-label={t('schedules.refresh')}
            disabled={busy}
            onClick={refresh}
          />
        }
      >
        <RefreshCw className={busy ? 'animate-spin' : undefined} />
      </TooltipTrigger>
      <TooltipContent>{t('schedules.refresh')}</TooltipContent>
    </Tooltip>
  );
}
export function Description({ text }: { text?: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    const measure = () =>
      setOverflow(element.scrollHeight > element.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);
  return (
    <div>
      <p
        ref={textRef}
        className={`whitespace-pre-wrap break-words ${expanded ? '' : 'line-clamp-5'}`}
      >
        {text || t('schedules.noDescription')}
      </p>
      {overflow || expanded ? (
        <Button
          variant='ghost'
          size='sm'
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? 'schedules.collapse' : 'schedules.expand')}
        </Button>
      ) : null}
    </div>
  );
}
export function Loading() {
  const { t } = useTranslation();
  return (
    <div
      role='status'
      aria-label={t('schedules.loading')}
      className='flex flex-col gap-4'
    >
      <Skeleton className='h-24 w-full' />
      <Skeleton className='h-24 w-full' />
    </div>
  );
}
export function StateBadge({ value }: { value: string }) {
  const { t } = useTranslation();
  const known = [
    'enabled',
    'disabled',
    'active',
    'inactive',
    'paused',
    'ready',
    'missing',
    'invalid',
    'pending',
    'running',
    'waiting',
    'succeeded',
    'failed',
    'skipped',
    'cancelled',
    'timed_out',
    'triggered',
  ];
  return (
    <StatusBadge
      tone={
        ['ready', 'succeeded', 'enabled'].includes(value)
          ? 'success'
          : ['failed', 'timed_out', 'missing', 'invalid'].includes(value)
            ? 'warning'
            : 'neutral'
      }
    >
      {t(`schedules.states.${known.includes(value) ? value : 'unknown'}`)}
    </StatusBadge>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className='min-w-0'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-1 break-words text-sm'>{children ?? '—'}</dd>
    </div>
  );
}
export function ScheduleFields({ schedule }: { schedule: Schedule }) {
  const { t } = useTranslation();
  const format = useScheduleFormatting();
  return (
    <div className='flex flex-col gap-4'>
      <dl className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        <Field label={t('schedules.plan')}>
          {format.cron(schedule.cron)}
          <div className='text-xs text-muted-foreground'>{schedule.cron}</div>
        </Field>
        <Field label={t('schedules.timezone')}>{schedule.timezone}</Field>
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
      </dl>
    </div>
  );
}
export function ScheduleToggle({
  schedule,
  changed,
  invalidated,
}: {
  schedule: Schedule;
  changed: (schedule: Schedule) => void;
  invalidated: () => void;
}) {
  const { t } = useTranslation();
  const api = useApiClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const activeRef = useRef(false);
  const pendingRef = useRef(false);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  async function save(action: 'enable' | 'disable') {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api.request<{ data: Schedule }>({
        method: 'POST',
        path: `scheduler/schedules/${encodeURIComponent(schedule.id)}/${action}`,
      });
      if (!activeRef.current) return;
      toast.add({
        type: 'success',
        title: t(
          response.data.enabled
            ? 'schedules.enabledNotice'
            : 'schedules.disabledNotice',
          { name: response.data.title },
        ),
      });
      setConfirm(false);
      changed(response.data);
    } catch (failure) {
      if (activeRef.current) {
        setError(failure);
        if (errorKind(failure) !== 'failed') {
          setConfirm(false);
          invalidated();
        }
        if (action === 'enable' || errorKind(failure) !== 'failed')
          toast.add({
            type: 'error',
            title: t(`schedules.${errorKind(failure)}`),
          });
      }
    } finally {
      pendingRef.current = false;
      if (activeRef.current) setBusy(false);
    }
  }
  return (
    <div className='flex flex-col gap-2'>
      {!confirm && error ? <Failure error={error} /> : null}
      <Button
        variant='outline'
        disabled={
          busy ||
          schedule.lifecycleState !== 'active' ||
          Boolean(error && errorKind(error) !== 'failed')
        }
        onClick={() => {
          if (schedule.enabled) {
            setError(undefined);
            setConfirm(true);
          } else void save('enable');
        }}
      >
        {busy
          ? t('schedules.saving')
          : t(schedule.enabled ? 'schedules.disable' : 'schedules.enable')}
      </Button>
      {schedule.lifecycleState !== 'active' ? (
        <p className='text-xs text-muted-foreground'>
          {t('schedules.inactiveHelp')}
        </p>
      ) : null}
      <AlertDialog
        open={confirm}
        onOpenChange={(open) => {
          if (!pendingRef.current) setConfirm(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('schedules.disableTitle', { name: schedule.title })}
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
              onClick={() => void save('disable')}
            >
              {t(busy ? 'schedules.saving' : 'schedules.disable')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
