import { MockIndicator } from '../../mock-integrations.js';
import { useTranslation } from '@nocobase/i18n/client';
import { ShieldCheck } from 'lucide-react';
import type { ReactElement } from 'react';

import { SidebarFooter, useSidebar } from '#components/ui/sidebar';
// The release this build was made from (`version`, which the release commits bump), never the template baseline in
// `nocobase.defaultTemplateVersion`. Studio's app host publishes no `app.version`, and a host that does may name
// itself, so the footer reads the build alone. Vite inlines this one field.
import { version } from '../../../package.json';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';

/** The product's name, not the package's lowercase `displayName`. */
const productName = 'NocoReach';

/**
 * The application's sidebar footer: NocoReach's two-line slogan, as on the sign-in page, then its name and version
 * ("NocoReach v1.0.0-beta.74"), as NocoCRM and NocoProject show theirs. In icon mode only the shield remains, and a
 * tooltip carries the same text.
 */
export function AppSidebarFooter(): ReactElement {
  const { t } = useTranslation();
  const { isMobile, state } = useSidebar();
  const iconOnly = state === 'collapsed' && !isMobile;
  const versionLabel = `v${version}`;
  const buildFreely = t('shell.buildFreely', {
    defaultValue: 'AI finds growth opportunities.',
  });
  const reliability = t('shell.reliability', {
    defaultValue: 'Agents put them into action.',
  });

  return (
    <SidebarFooter className='shrink-0 border-t border-sidebar-border'>
      {/* The menu button's inset (`p-2`, `gap-2`), so the shield lines up with the menu icons above. */}
      <div className='flex min-w-0 items-start gap-2 p-2 text-xs leading-5'>
        {/* Demo status replaces the brand shield in the same slot, preserving the footer's height. */}
        <MockIndicator
          fallback={
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    aria-label={
                      iconOnly
                        ? `${buildFreely} ${reliability} ${productName} ${versionLabel}`
                        : undefined
                    }
                    className='flex h-5 shrink-0 items-center rounded-sm text-sidebar-foreground/80 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
                    role={iconOnly ? 'img' : undefined}
                    tabIndex={iconOnly ? 0 : undefined}
                  />
                }
              >
                <ShieldCheck aria-hidden className='size-4' />
              </TooltipTrigger>
              <TooltipContent
                className='max-w-56 flex-col items-start gap-0.5'
                hidden={!iconOnly}
                side='right'
              >
                <span className='font-medium'>{buildFreely}</span>
                <span>{reliability}</span>
                <span className='mt-1 opacity-70'>
                  {productName} {versionLabel}
                </span>
              </TooltipContent>
            </Tooltip>
          }
        />
        <div className='min-w-0 flex-1 group-data-[collapsible=icon]:hidden'>
          <p className='font-medium text-balance text-sidebar-foreground'>
            {buildFreely}
          </p>
          <p className='text-balance text-muted-foreground'>{reliability}</p>
          <p
            className='mt-1 truncate text-muted-foreground'
            title={`${productName} ${versionLabel}`}
          >
            {productName} {versionLabel}
          </p>
        </div>
      </div>
    </SidebarFooter>
  );
}
