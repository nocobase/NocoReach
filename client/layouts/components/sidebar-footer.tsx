import { MockIndicator } from '../../mock-integrations.js';
import { useTranslation } from '@nocobase/i18n/client';
import { ShieldCheck } from 'lucide-react';
import type { ReactElement } from 'react';

import { SidebarFooter, useSidebar } from '#components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';

/**
 * The application's sidebar footer: NocoReach's two-line slogan, as on the sign-in page. In icon mode only the shield
 * remains, and a tooltip carries the same text. The version is in the account menu (2026-10-22: the template's name
 * meant nothing to people using NocoReach).
 */
export function AppSidebarFooter(): ReactElement {
  const { t } = useTranslation();
  const { isMobile, state } = useSidebar();
  const iconOnly = state === 'collapsed' && !isMobile;
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
                      iconOnly ? `${buildFreely} ${reliability}` : undefined
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
              </TooltipContent>
            </Tooltip>
          }
        />
        <div className='min-w-0 flex-1 group-data-[collapsible=icon]:hidden'>
          <p className='font-medium text-balance text-sidebar-foreground'>
            {buildFreely}
          </p>
          <p className='text-balance text-muted-foreground'>{reliability}</p>
        </div>
      </div>
    </SidebarFooter>
  );
}
