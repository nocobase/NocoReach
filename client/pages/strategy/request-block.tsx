import type { ReactNode } from 'react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { NocoReachHttpError } from '#lib/nocoreach-api';
import { $t } from '#i18n';
import { ListSkeleton } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { cn } from '#lib/utils';

export type RequestState = {
  data?: unknown;
  error?: unknown;
  loading: boolean;
  reload: () => void;
};

// Each independent insight read owns its feedback; a failed refresh keeps only
// the data supplied by the session/project-scoped cache.
export function RequestBlock({
  title,
  request,
  empty = false,
  emptyText,
  info,
  compact = false,
  quiet = false,
  placeholder,
  skeletonRows = 3,
  children,
}: {
  title: string;
  /** Shown after the heading, such as an InfoTip explaining the block. */
  info?: ReactNode;
  /**
   * Inline, without a heading or Refresh (the metric tiles and the waiting tasks on Insights, read again on every
   * visit): the title only names the region, and Retry shows only after a failure.
   */
  compact?: boolean;
  /** A side block (Insights' Current situation): its heading in 14px semibold with spacing doing the rest (2026-10-24
   * user-approved design), and Retry only after a failure (the page's own refresh reads it again). */
  quiet?: boolean;
  /**
   * What the first read shows where the content goes, at the loaded content's size so the page does not move (the
   * metric tiles, the waiting tasks). Without it: the shared list skeleton, or a bar in a compact row.
   */
  placeholder?: ReactNode;
  /** Rows of that list skeleton, about as many as the loaded list shows (Current situation: 8). */
  skeletonRows?: number;
  request: RequestState;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  const { refresh } = useAuthentication();
  const status =
    request.error instanceof NocoReachHttpError ? request.error.status : 0;
  const unavailable = [401, 403, 404].includes(status);
  const hasData = request.data !== undefined && !unavailable;
  const failed = request.error !== undefined;
  const alert = failed && (
    <p role='alert' className='nr-error text-sm'>
      {status === 401
        ? $t('common.sessionExpiredSignAgain')
        : status === 403
          ? $t('strategy.blockForbidden')
          : status === 404
            ? $t('strategy.blockUnavailable')
            : hasData
              ? $t('strategy.blockStale')
              : $t('strategy.blockFailed')}
    </p>
  );
  // The first read shows skeletons where the content goes (a bar in a compact row); a refresh keeps the content and
  // says it is loading.
  const loading =
    request.loading &&
    (hasData ? (
      <p role='status' className='text-sm text-muted-foreground'>
        {$t('common.loadingLoading')}
      </p>
    ) : placeholder || compact ? (
      <div
        role='status'
        aria-label={$t('common.loading')}
        className='min-w-0 flex-1'
      >
        {placeholder ?? <Skeleton className='h-4 w-48' />}
      </div>
    ) : (
      <ListSkeleton rows={skeletonRows} />
    ));
  const body =
    hasData &&
    (empty
      ? emptyText && (
          <p className='text-sm text-muted-foreground'>{emptyText}</p>
        )
      : children);
  // Compact blocks sit among other content: known data stays quiet while it refreshes, and one with nothing to say
  // (empty, no empty text, no failure) takes no room.
  if (compact && hasData && empty && !emptyText && !failed) return null;
  if (compact)
    return (
      <section
        aria-label={title}
        aria-busy={request.loading}
        className='flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1'
      >
        {body}
        {!hasData && loading}
        {alert}
        {status === 401 ? (
          <Button variant='ghost' size='xs' onClick={() => void refresh()}>
            {$t('common.signAgain')}
          </Button>
        ) : (
          failed &&
          !unavailable && (
            <Button
              variant='ghost'
              size='xs'
              disabled={request.loading}
              onClick={request.reload}
            >
              {$t('common.retry')}
            </Button>
          )
        )}
      </section>
    );
  return (
    <section
      aria-label={title}
      aria-busy={request.loading}
      className='space-y-2'
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2
          className={cn(
            'flex items-center gap-1',
            quiet
              ? 'text-sm font-semibold text-foreground'
              : 'text-sm font-medium',
          )}
        >
          {title}
          {info}
        </h2>
        {status === 401 ? (
          <Button variant='ghost' size='sm' onClick={() => void refresh()}>
            {$t('common.signAgain')}
          </Button>
        ) : (
          !unavailable &&
          (!quiet || failed) && (
            <Button
              variant='ghost'
              size={quiet ? 'xs' : 'sm'}
              disabled={request.loading}
              onClick={request.reload}
            >
              {failed ? $t('common.retry') : $t('strategy.refreshBlock')}
            </Button>
          )
        )}
      </div>
      {alert}
      {loading}
      {body}
    </section>
  );
}
