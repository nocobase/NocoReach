import { useCallback } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useAuthorizationTranslation as useSharedTranslation,
  type Translate,
} from '#pages/settings/authorization/management';
export type { Translate } from '#pages/settings/authorization/management';
export function useRuleTranslation(): Translate {
  const { t } = useTranslation('@nocobase/app-plugin-authz-restriction-rules');
  const shared = useSharedTranslation();
  return useCallback(
    (key, options) =>
      key.startsWith('restrictionRules.')
        ? t(key, options)
        : shared(key, options),
    [t, shared],
  );
}
export { useRuleTranslation as useAuthorizationTranslation };
