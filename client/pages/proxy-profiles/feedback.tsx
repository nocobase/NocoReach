import { Link } from 'react-router';
import { $t, $legacyText } from '#i18n';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import type { NetworkTest } from './api';
export function ProxyError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  const e = error as { message?: string; status?: number };
  return (
    <Alert variant='destructive'>
      <AlertDescription>
        {$legacyText(e.message) ||
          $t('proxyProfiles.requestNotCompletedTryAgain')}
        {e.status === 401 ? (
          <Link to='/login'>{$t('common.signAgain')}</Link>
        ) : retry && ![403, 404].includes(e.status ?? 0) ? (
          <Button variant='outline' size='sm' onClick={retry}>
            {$t('common.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
export function ProxyTestResult({ result }: { result: NetworkTest | null }) {
  return result ? (
    <p role='status' className='text-sm text-muted-foreground'>
      {$t('proxyProfiles.receivedResponseTarget')}：{result.target} · HTTP{' '}
      {result.status} · {result.elapsedMs} ms。
      {$t('proxyProfiles.checksNetworkConnectivityNotApi')}
    </p>
  ) : null;
}
