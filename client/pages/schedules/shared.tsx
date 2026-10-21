import { useTranslation } from '@nocobase/i18n/client';
import { resolveAppUrl } from '@nocobase/app-client';
import type { ReactNode } from 'react';
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
import { errorKind } from './data.js';

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
