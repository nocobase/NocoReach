import { useQuery } from '@tanstack/react-query';
import { $t } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { Skeleton } from '#components/ui/skeleton';
import { useBusinessAccess } from '#hooks/use-business-access';
import ProxyProfilesPage from './proxy-profiles/index';
import { NetworkSettingsForm } from './proxy-profiles/network-settings';
import { ProxyError } from './proxy-profiles/feedback';
import {
  proxyKey,
  proxyRequest,
  type ProfileCapabilities,
} from './proxy-profiles/api';

// Settings › Network. A live deployment sets its one proxy here; a mock deployment keeps the profile list, where its mock
// profiles are managed.
export default function NetworkPage() {
  const access = useBusinessAccess('nrProxyProfiles.capabilities');
  const capabilities = useQuery({
    queryKey: [...proxyKey, 'capabilities'],
    queryFn: () => proxyRequest<ProfileCapabilities>('capabilities'),
    enabled: access.can,
  });
  if (access.can && capabilities.data?.mockEnabled)
    return <ProxyProfilesPage />;
  return (
    <PageContainer>
      {access.isPending || (access.can && capabilities.isPending) ? (
        <Skeleton className='h-24 w-full' />
      ) : access.error ? (
        <ProxyError error={access.error} retry={access.retry} />
      ) : !access.can ? (
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
