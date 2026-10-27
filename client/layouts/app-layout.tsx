import { OnlineChatProvider } from '../online-agent/context.js';
import { ChatProvider } from '@nocobase/app-plugin-agents/client/chat';
import { ChatPanel } from '#extensions/nocobase-agent-chat/chat-panel';
import { ChatHeaderButton } from '#extensions/nocobase-agent-chat/launchers';
import { DemoModeMenu } from '@nocobase/app-plugin-demo-mode/client/menu';
import { useSyncServerLocale } from '@nocobase/app-plugin-i18n/client';
import { useRef, type ReactElement } from 'react';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { Outlet, useLocation } from 'react-router';

import { BreadcrumbParentLink, Breadcrumbs } from '#components/breadcrumbs';

import { RouteTreeProvider } from '../routing/route-context.js';

import { PageBreadcrumbProvider } from '@nocobase/app-client';
import { PageTabProvider } from '#hooks/use-page-tab';
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

export interface AppLayoutProps {
  readonly routes: readonly AppClientRegisteredRoute[];
}

export function AppLayout({ routes }: AppLayoutProps): ReactElement {
  // The browser decides what it renders; this tells the server the same language so its messages match.
  useSyncServerLocale();

  const { t } = useTranslation();
  const { items: menuItems, denied } = useRouteNavigation(routes);
  const selectedKey = selectedNavigationId(
    routes,
    useLocation().pathname,
    denied,
  );
  const navigationBadges = usePendingNavigationBadges();
  // The element pages scroll in: the trail of a top-level page waits for the page's heading to leave it.
  const contentRef = useRef<HTMLDivElement>(null);
  const navigationLabel = t('navigation.label', {
    defaultValue: 'Application navigation',
  });

  return (
    // The shell owns the business route tree used by its pages and navigation.
    <RouteTreeProvider routes={routes}>
      <ChatProvider>
        <OnlineChatProvider>
          <PageBreadcrumbProvider>
            {/* NocoReach: the selected tab a top-level page names after itself in the header (Breadcrumbs). */}
            <PageTabProvider>
              <AppSidebarProvider>
                <AppSidebar
                  label={navigationLabel}
                  footer={<AppSidebarFooter />}
                >
                  {/* NocoReach keeps its top-level groups collapsible rather than the template's always-open sections,
                and shows its pending counts through the template's entry badges. */}
                  <NavigationMenu
                    items={menuItems}
                    label={navigationLabel}
                    selectedKey={selectedKey}
                    sections={false}
                    badges={navigationBadges}
                  />
                </AppSidebar>
                <div className='app-brand-surface flex min-w-0 flex-1 flex-col'>
                  <LayoutHeader className='sticky top-0 z-40 h-auto min-h-16 flex-wrap justify-between gap-1 py-2 sm:h-16 sm:flex-nowrap sm:gap-2 sm:py-0'>
                    <div className='flex min-w-0 shrink-0 items-center gap-1 sm:shrink sm:gap-3'>
                      <AppSidebarToggle />
                      {/* NocoReach: below md the header has no room for the trail, so a page below another one puts its
                    way back where the compact brand would be; its page has no BackButton of its own (L6). */}
                      <BreadcrumbParentLink
                        className='max-w-40 md:hidden'
                        denied={denied}
                        fallback={<AppBrand compact />}
                      />
                      {/* The current page's trail, from md up: the route tree's, or the one the page declares
                    (`usePageBreadcrumb`). NocoReach: on a top-level page it is the page's own title, so it waits until
                    the page's heading has scrolled away instead of repeating it (see Breadcrumbs). */}
                      <Breadcrumbs denied={denied} scroller={contentRef} />
                    </div>
                    <div className='contents sm:ml-auto sm:flex sm:min-w-0 sm:items-center sm:gap-2'>
                      {/* Demo Mode precedes the project switcher and gets its own phone row. */}
                      <div className='order-first flex w-full justify-end empty:hidden sm:order-none sm:w-auto'>
                        <DemoModeMenu />
                      </div>
                      {/* Compact project marks keep all header actions reachable on phones. */}
                      <div className='ml-auto flex min-w-0 items-center gap-1 sm:ml-0 sm:gap-2'>
                        <ProjectSwitcher />
                      </div>
                    </div>
                    <ChatHeaderButton />
                    <HeaderActions />
                  </LayoutHeader>
                  <div className='relative flex min-h-0 flex-1'>
                    <main className='relative min-w-0 flex-1 overflow-hidden'>
                      {/* main only positions; the page scrolls in here, so a child page layer laid over main is neither
            moved by the page's scrolling nor stretched by its height. */}
                      <div ref={contentRef} className='h-full overflow-y-auto'>
                        <Outlet />
                      </div>
                    </main>
                    <ChatPanel />
                  </div>
                </div>
              </AppSidebarProvider>
            </PageTabProvider>
          </PageBreadcrumbProvider>
        </OnlineChatProvider>
      </ChatProvider>
    </RouteTreeProvider>
  );
}
