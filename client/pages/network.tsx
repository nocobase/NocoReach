import { useQuery } from '@tanstack/react-query';
import { $t } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { Skeleton } from '#components/ui/skeleton';
import { useMe } from './me';
import ProxyProfilesPage from './proxy-profiles/index';
import { NetworkSettingsForm } from './proxy-profiles/network-settings';
import { ProxyError } from './proxy-profiles/feedback';
import {
  proxyKey,
  proxyRequest,
  type ProfileCapabilities,
} from './proxy-profiles/api';

// 设置 › 网络. A live deployment sets its one proxy here; a mock deployment keeps the profile list, where its mock
// profiles are managed.
export default function NetworkPage() {
  const { me } = useMe();
  const admin = me?.role === 'admin';
  const capabilities = useQuery({
    queryKey: [...proxyKey, 'capabilities'],
    queryFn: () => proxyRequest<ProfileCapabilities>('capabilities'),
    enabled: admin,
  });
  if (admin && capabilities.data?.mockEnabled) return <ProxyProfilesPage />;
  return (
    <PageContainer>
      {!me || (admin && capabilities.isPending) ? (
        <Skeleton className='h-24 w-full' />
      ) : !admin ? (
        <>
          <PageHeader title={$t('network.title')} />
          <p>{$t('proxyProfiles.administratorsManageNetworkConnections')}</p>
        </>
      ) : capabilities.error ? (
        <ProxyError
          error={capabilities.error}
          retry={() => void capabilities.refetch()}
        />
      ) : (
        <NetworkSettingsForm />
      )}
    </PageContainer>
  );
}
