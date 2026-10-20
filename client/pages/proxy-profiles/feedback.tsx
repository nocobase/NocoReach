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
  const profileErrors: Record<string, string> = {
    NR_MOCK_PROFILE_REQUIRED: 'networkProfiles.profileRequired',
    NR_MOCK_PROFILE_UNAVAILABLE: 'networkProfiles.unavailable',
    NR_PROFILE_KIND_IMMUTABLE: 'networkProfiles.kindImmutable',
    NR_COLLECTOR_PROXY_UNSUPPORTED: 'networkProfiles.mediaNetwork',
  };
  const messageKey = e.message ? profileErrors[e.message] : undefined;
  return (
    <Alert variant='destructive'>
      <AlertDescription>
        {messageKey
          ? $t(messageKey)
          : $legacyText(e.message) ||
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
  if (result?.simulated)
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        {$t('networkProfiles.mockValidation')}
      </p>
    );
  if (result && !result.reachable)
    return (
      <p role='status' className='text-sm text-destructive'>
        {$t('network.unreachable')}：{result.target} ·{' '}
        {$t(`network.reasons.${result.reason ?? 'other'}`)}
      </p>
    );
  return result ? (
    <p role='status' className='text-sm text-muted-foreground'>
      {$t('proxyProfiles.receivedResponseTarget')}：{result.target} · HTTP{' '}
      {result.status} · {result.elapsedMs} ms。
      {$t('proxyProfiles.checksNetworkConnectivityNotApi')}
    </p>
  ) : null;
}
