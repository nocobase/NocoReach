import { Link } from 'react-router';
import { AlertCircleIcon } from 'lucide-react';
import { $t } from '#i18n';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { denied, httpStatus } from './format.js';

// A failed read of the results, by kind (S4): a signed-out session offers to sign in again, missing access or a
// removed project says what to do instead, and only a passing failure offers Retry. The server's own text is never
// shown (I3).
export function ResultsLoadError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  const status = httpStatus(error);
  const message =
    status === 401
      ? $t('common.sessionExpiredSignAgain')
      : status === 403
        ? $t('results.noAccess')
        : status === 404
          ? $t('results.projectGone')
          : $t('states.requestNotCompleteTryAgain');
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className='flex flex-wrap items-center gap-3'>
        {message}
        {status === 401 ? (
          <Button
            variant='outline'
            size='sm'
            nativeButton={false}
            render={<Link to='/login' />}
          >
            {$t('common.signAgain')}
          </Button>
        ) : status === 400 || denied(error) ? null : (
          <Button variant='outline' size='sm' onClick={onRetry}>
            {$t('common.retry')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
