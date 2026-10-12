import type { ReactElement } from 'react';
import { PermissionsPage } from '#pages/settings/authorization/management';
import { useAuthorizationTranslation } from '../i18n.js';
import { SharingRulesPanel } from './sharing-rules-panel.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
} from '#pages/settings/authorization/management';

export default function SharingRulesPage(): ReactElement {
  const t = useAuthorizationTranslation();
  const page = useAuthorizationPageData('sharingRules');
  return (
    <PermissionsPage
      title={t('sharingRules.page.title')}
      description={t('sharingRules.page.description')}
    >
      {page.options ? (
        <SharingRulesPanel options={page.options} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}
