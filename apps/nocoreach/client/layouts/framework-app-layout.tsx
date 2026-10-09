import {useSyncServerLocale} from '@nocobase/app-plugin-i18n/client';
import {useMemo,type ReactElement} from 'react';
import {Outlet,useLocation} from 'react-router';
import {PageBreadcrumbProvider,useClientApplication} from '@nocobase/app-client';
import {useTranslation} from '@nocobase/i18n/client';
import {Breadcrumbs} from '@/components/breadcrumbs';
import {EMPTY_ARRAY} from '@/lib/constants';
import {RouteTreeProvider} from '../routing/route-context';
import {LayoutHeader} from './components/layout-header';
import {AppSidebar,AppSidebarProvider,AppSidebarToggle} from './components/app-sidebar';
import {NavigationMenu} from './components/navigation-menu';
import {AppBrand} from './components/app-brand';
import {HeaderActions} from './components/header-actions';
import {AppSidebarFooter} from './components/sidebar-footer';
import {useRouteNavigation,selectedNavigationId,navigationPages} from '../routing/route-navigation';
import type {AppLayoutProps} from './app-layout';
// The official shell remains available to native and developer pages outside the NocoReach workspace.
export function FrameworkAppLayout({routes,devRoutes=EMPTY_ARRAY}:AppLayoutProps):ReactElement{
 useSyncServerLocale();const {t}=useTranslation();const {items:menuItems,denied}=useRouteNavigation(routes);
 const selectedKey=selectedNavigationId(routes,useLocation().pathname,denied);
 const settingsNavigation=useRouteNavigation(useClientApplication().runtime.settingsRouteTree);
 const routeTree=useMemo(()=>devRoutes.length?[...routes,...devRoutes]:routes,[routes,devRoutes]);
 const label=t('navigation.label',{defaultValue:'Application navigation'});
 return <RouteTreeProvider routes={routeTree}><PageBreadcrumbProvider><AppSidebarProvider><AppSidebar label={label} footer={<AppSidebarFooter/>}><NavigationMenu items={menuItems} label={label} selectedKey={selectedKey}/></AppSidebar><div className="flex min-w-0 flex-1 flex-col"><LayoutHeader className="sticky top-0 z-40 justify-between"><div className="flex min-w-0 items-center gap-3"><AppSidebarToggle/><div className="md:hidden"><AppBrand/></div><div className="h-5 w-px shrink-0 bg-border"/><Breadcrumbs denied={denied}/></div><HeaderActions showSettings={navigationPages(settingsNavigation.items).length>0}/></LayoutHeader><main className="relative min-w-0 flex-1 overflow-hidden"><div className="h-full overflow-y-auto"><Outlet/></div></main></div></AppSidebarProvider></PageBreadcrumbProvider></RouteTreeProvider>;
}
