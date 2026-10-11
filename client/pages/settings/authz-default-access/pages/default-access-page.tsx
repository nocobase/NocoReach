import type { ReactElement } from 'react';
import { PermissionsPage } from '#pages/settings/authorization/management';
import { useAuthorizationTranslation } from '../i18n.js';
import { DefaultAccessPanel } from './default-access-panel.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
} from '#pages/settings/authorization/management';

export default function DefaultAccessPage(): ReactElement {
  const t = useAuthorizationTranslation();
  const page = useAuthorizationPageData('defaultAccess');
  return (
    <PermissionsPage
      title={t('defaultAccess.page.title')}
      description={t('defaultAccess.page.description')}
      fill
    >
      {page.options ? (
        <DefaultAccessPanel options={page.options} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}
