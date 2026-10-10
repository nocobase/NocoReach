import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { BrandWordmark, ReachMark } from '#components/app-shell/brand';

export interface AppBrandProps {
  readonly compact?: boolean;
}

// NocoReach's own mark and name instead of the template's NocoBase logo images (public/assets/logo*.png): the mark is
// the drawing the classic portal used (components/app-shell/brand.tsx), and the name follows the theme's text colour.
export function AppBrand(inputProps: AppBrandProps): ReactElement {
  const { t } = useTranslation();
  const { compact = false } = inputProps;

  return (
    <Link
      aria-label={t('navigation.brandHome', { defaultValue: 'NocoReach home' })}
      className='flex min-w-0 items-center text-foreground'
      to='/'
    >
      {compact ? (
        <ReachMark className='size-9 shrink-0' />
      ) : (
        <BrandWordmark className='min-w-0' />
      )}
    </Link>
  );
}
