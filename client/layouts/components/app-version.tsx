import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { formatTemplateVersion } from '#lib/template-version';

/**
 * NocoReach's version for the account menu, from the adopted template baseline compiled into the build (see
 * `vite.config.ts`); an invalid or missing one reads as unknown in the interface language.
 */
export function AppVersion(): ReactElement {
  const { t } = useTranslation();
  const version =
    formatTemplateVersion(
      typeof __NOCOREACH_TEMPLATE_VERSION__ === 'undefined'
        ? undefined
        : __NOCOREACH_TEMPLATE_VERSION__,
    ) ?? t('shell.templateVersionUnknown', { defaultValue: 'Version unknown' });
  return (
    <p
      className='px-2 py-1.5 text-xs text-muted-foreground'
      data-app-version=''
    >
      NocoReach {version}
    </p>
  );
}
