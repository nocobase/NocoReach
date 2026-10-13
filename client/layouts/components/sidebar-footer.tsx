import { MockIndicator } from '../../mock-integrations.js';
import { Trans } from 'react-i18next';
import { useClientApplication } from '@nocobase/app-client';
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
 * The application's sidebar footer: NocoReach's two-line slogan, then the template's name and its version, each
 * on its own line. In icon mode only the shield remains, and a tooltip carries the same text.
 */
export function AppSidebarFooter(): ReactElement {
  const { t } = useTranslation();
  const { isMobile, state } = useSidebar();
  const iconOnly = state === 'collapsed' && !isMobile;
  // Published by the server from the application's package.json.
  const publicConfig = useClientApplication().config.public;
  const templateName = publicConfig.get('app.displayName', 'Default Template');
  const templateVersion = publicConfig.get('app.version', '0.0.0');
  const versionLabel = `v${templateVersion}`;
  const buildFreely = t('shell.buildFreely', {
    defaultValue: 'Find the opportunities in your data.',
  });
  // The tooltip and the icon's accessible name have no link, so the brand's markup is dropped there.
  const reliability = t('shell.reliability', {
    defaultValue: '<brand>NocoReach</brand> gets them done.',
  }).replace(/<\/?brand>/g, '');

  // NocoReach's name, emphasised but not a link (the template linked NocoBase's site here).
  const brandLink = (
    <span className='font-medium text-sidebar-foreground'>NocoReach</span>
  );

  return (
    <SidebarFooter className='shrink-0 border-t border-sidebar-border/70'>
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
                        ? `${buildFreely} ${reliability} ${templateName} ${versionLabel}`
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
                  {templateName} {versionLabel}
                </span>
              </TooltipContent>
            </Tooltip>
          }
        />
        <div className='min-w-0 flex-1 group-data-[collapsible=icon]:hidden'>
          <p className='font-medium text-balance text-sidebar-foreground'>
            {buildFreely}
          </p>
          <p className='text-balance text-muted-foreground'>
            <Trans
              t={t}
              i18nKey='shell.reliability'
              defaults='<brand>NocoReach</brand> gets them done.'
              components={{ brand: brandLink }}
            >
              {brandLink} gets them done.
            </Trans>
          </p>
          {/* Name and version stay on one line each; a long name is cut off, with the whole name as its title. */}
          <p
            className='mt-1 truncate text-muted-foreground'
            title={templateName}
          >
            {templateName}
          </p>
          <p className='truncate text-muted-foreground' title={versionLabel}>
            {versionLabel}
          </p>
        </div>
      </div>
    </SidebarFooter>
  );
}
