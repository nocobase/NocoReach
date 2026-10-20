import { OnlineChatProvider } from '../online-agent/context.js';
import { ChatProvider } from '@nocobase/app-plugin-agents/client/chat';
import { ChatPanel } from '#extensions/nocobase-agent-chat/chat-panel';
import { ChatHeaderButton } from '#extensions/nocobase-agent-chat/launchers';
import { useSyncServerLocale } from '@nocobase/app-plugin-i18n/client';
import { type ReactElement } from 'react';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { Outlet, useLocation } from 'react-router';

import { Breadcrumbs } from '#components/breadcrumbs';

import { RouteTreeProvider } from '../routing/route-context.js';

import { PageBreadcrumbProvider } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { LayoutHeader } from './components/layout-header.js';
import {
  AppSidebar,
  AppSidebarProvider,
  AppSidebarToggle,
} from './components/app-sidebar.js';
import { NavigationMenu } from './components/navigation-menu.js';
import { usePendingNavigationBadges } from '../components/app-shell/pending-navigation-badges.js';
import { AppBrand } from './components/app-brand.js';
import { HeaderActions } from './components/header-actions.js';
import { AppSidebarFooter } from './components/sidebar-footer.js';
import { ProjectSwitcher } from '../pages/project-switcher.js';
import {
  useRouteNavigation,
  selectedNavigationId,
} from '../routing/route-navigation.js';

import { useRoutePrefetch } from '../routing/route-prefetch.js';

export interface AppLayoutProps {
  readonly routes: readonly AppClientRegisteredRoute[];
}

export function AppLayout({ routes }: AppLayoutProps): ReactElement {
  // The browser decides what it renders; this tells the server the same language so its messages match.
  useSyncServerLocale();

  const { t } = useTranslation();
  const { items: menuItems, denied } = useRouteNavigation(routes);
  const prefetchRoute = useRoutePrefetch(menuItems);
  const selectedKey = selectedNavigationId(
    routes,
    useLocation().pathname,
    denied,
  );
  const navigationBadges = usePendingNavigationBadges();
  const navigationLabel = t('navigation.label', {
    defaultValue: 'Application navigation',
  });

  return (
    // The shell owns the business route tree used by its pages and navigation.
    <RouteTreeProvider routes={routes}>
      <ChatProvider>
        <OnlineChatProvider>
          <PageBreadcrumbProvider>
            <AppSidebarProvider>
              <AppSidebar label={navigationLabel} footer={<AppSidebarFooter />}>
                {/* NocoReach keeps its top-level groups collapsible rather than the template's always-open sections,
                and shows its pending counts through the template's entry badges. */}
                <NavigationMenu
                  items={menuItems}
                  label={navigationLabel}
                  selectedKey={selectedKey}
                  sections={false}
                  badges={navigationBadges}
                  onPrefetchIntent={prefetchRoute}
                />
              </AppSidebar>
              <div className='app-brand-surface flex min-w-0 flex-1 flex-col'>
                <LayoutHeader className='sticky top-0 z-40 justify-between gap-1 sm:gap-2'>
                  <div className='flex min-w-0 shrink-0 items-center gap-1 sm:shrink sm:gap-3'>
                    <AppSidebarToggle />
                    <div className='md:hidden'>
                      <AppBrand compact />
                    </div>
                    <div className='hidden h-5 w-px shrink-0 bg-border sm:block' />
                    {/* The current page's trail: the route tree's, or the one the page declares (`usePageBreadcrumb`). */}
                    <Breadcrumbs className='hidden sm:block' denied={denied} />
                  </div>
                  {/* NocoReach: which project every page works on (classic portal header). The shell has no slot for an
                  application control, so it sits here, before the template's own actions. */}
                  {/* Compact brand/project marks keep all header actions reachable on phones. */}
                  <div className='ml-auto flex min-w-0 items-center gap-1 sm:gap-2'>
                    <ProjectSwitcher />
                    <ChatHeaderButton />
                  </div>
                  <HeaderActions />
                </LayoutHeader>
                <div className='relative flex min-h-0 flex-1'>
                  <main className='relative min-w-0 flex-1 overflow-hidden'>
                    {/* main only positions; the page scrolls in here, so a child page layer laid over main is neither
            moved by the page's scrolling nor stretched by its height. */}
                    <div className='h-full overflow-y-auto'>
                      <Outlet />
                    </div>
                  </main>
                  <ChatPanel />
                </div>
              </div>
            </AppSidebarProvider>
          </PageBreadcrumbProvider>
        </OnlineChatProvider>
      </ChatProvider>
    </RouteTreeProvider>
  );
}
