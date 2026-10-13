import type { ReactNode } from 'react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { NocoReachHttpError } from '#lib/nocoreach-api';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';

type RequestState = {
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
  children,
}: {
  title: string;
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
  return (
    <section
      aria-label={title}
      aria-busy={request.loading}
      className='space-y-2'
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='text-sm font-medium'>{title}</h2>
        {status === 401 ? (
          <Button variant='ghost' size='sm' onClick={() => void refresh()}>
            {$t('common.signAgain')}
          </Button>
        ) : (
          !unavailable && (
            <Button
              variant='ghost'
              size='sm'
              disabled={request.loading}
              onClick={request.reload}
            >
              {failed ? $t('common.retry') : $t('strategy.refreshBlock')}
            </Button>
          )
        )}
      </div>
      {failed && (
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
      )}
      {request.loading && (
        <p role='status' className='text-sm text-muted-foreground'>
          {$t('common.loadingLoading')}
        </p>
      )}
      {hasData &&
        (empty ? (
          <p className='text-sm text-muted-foreground'>{emptyText}</p>
        ) : (
          children
        ))}
    </section>
  );
}
