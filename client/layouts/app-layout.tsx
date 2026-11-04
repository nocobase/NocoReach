import { OnlineChatProvider } from '../online-agent/context.js';
import { ChatProvider } from '@nocobase/app-plugin-agents/client/chat';
import { ChatPanel } from '#extensions/nocobase-agent-chat/chat-panel';
import { ChatHeaderButton } from '#extensions/nocobase-agent-chat/launchers';
import { HeaderDemoModeMenu } from './components/demo-mode-menu.js';
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
import { useNavSources } from '../components/app-shell/nav-badges.js';
import {
  bySources,
  useMenuAdditions,
} from '../components/app-shell/nav-sources.js';
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
  // NocoReach: a data page is in the menu once its source is connected (2026-11-02 user decision); its address still
  // opens it, with the page's own prompt to connect.
  const sources = useNavSources();
  useMenuAdditions(menuItems);
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
                    items={bySources(menuItems, sources)}
                    label={navigationLabel}
                    selectedKey={selectedKey}
                    sections={false}
                    badges={navigationBadges}
                  />
                </AppSidebar>
                <div className='app-brand-surface flex min-w-0 flex-1 flex-col'>
                  <LayoutHeader className='sticky top-0 z-40 gap-1 px-2 xl:gap-2 sm:px-3 md:px-4'>
                    <div className='flex min-w-0 flex-1 items-center gap-1 sm:flex-initial sm:shrink-0 xl:gap-3 md:shrink'>
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
                    {/* NocoReach: one compact phone row keeps the status and every shortcut directly reachable. */}
                    <div className='ml-auto flex shrink-0 items-center gap-1 sm:min-w-0 sm:shrink xl:gap-2'>
                      <HeaderDemoModeMenu />
                      <div className='flex min-w-0 items-center max-sm:[&_[data-project-switcher]]:p-0.5'>
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
