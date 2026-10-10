import { Link } from 'react-router';
import { $t } from '#i18n';
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
        {$t(e.message || '请求没有完成，请稍后重试')}
        {e.status === 401 ? (
          <Link to='/login'>{$t('重新登录')}</Link>
        ) : retry && ![403, 404].includes(e.status ?? 0) ? (
          <Button variant='outline' size='sm' onClick={retry}>
            {$t('重试')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
export function ProxyTestResult({ result }: { result: NetworkTest | null }) {
  return result ? (
    <p role='status' className='text-sm text-muted-foreground'>
      {$t('已收到目标响应')}：{result.target} · HTTP {result.status} ·{' '}
      {result.elapsedMs} ms。{$t('仅验证网络连通性，不代表 API 授权有效。')}
    </p>
  ) : null;
}
