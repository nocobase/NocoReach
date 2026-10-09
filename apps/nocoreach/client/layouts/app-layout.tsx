import { FrameworkAppLayout } from './framework-app-layout';
import { useEffect, type ReactElement } from 'react';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { Outlet, Link, useLocation } from 'react-router';
import { Settings } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import { WorkspaceCacheProvider } from '@/pages/workspace-cache';
import { ProjectGate, ProjectSwitcher } from '@/pages/project-switcher';
import { MemberGate, useMe } from '@/pages/me';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/reach-ui/sidebar';
import { Sidebar } from '@/components/reach-shell/sidebar';
import { NotificationBell } from '@/components/reach-shell/notification-bell';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { DensityToggle, applyDensity } from '@/components/theme/density';
import { UserMenu } from './components/user-menu';
import { reachPages } from '@/reach-routes';
import { $t as translateReach } from '@/i18n';
export interface AppLayoutProps {
  readonly routes: readonly AppClientRegisteredRoute[];
  readonly devRoutes?: readonly AppClientRegisteredRoute[];
}
function ReachHeader() {
  const { isAdmin } = useMe();
  return (
    <header className='sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-background/80 px-4 backdrop-blur-xl'>
      <div className='flex min-w-0 items-center gap-3'>
        <SidebarTrigger className='md:hidden' />
        <ProjectSwitcher />
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <NotificationBell />
        {isAdmin ? (
          <Link
            to='/settings'
            aria-label={translateReach('设置')}
            title={translateReach('设置')}
            className='inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60'
          >
            <Settings className='size-4' />
          </Link>
        ) : null}
        <DensityToggle />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
export function AppLayout(props: AppLayoutProps): ReactElement {
  const path = useLocation().pathname;
  return props.routes.some(
    (r) => r.name === 'growth-overview' || r.name.endsWith(':growth-overview'),
  ) &&
    path !== '/inbox' &&
    !path.startsWith('/dev/') ? (
    <ReachLayout />
  ) : (
    <FrameworkAppLayout {...props} />
  );
}
function ReachLayout(): ReactElement {
  const location = useLocation();
  useEffect(() => {
    applyDensity();
  }, []);
  useEffect(() => {
    document.title = `${reachPages.find((p) => p.path === location.pathname)?.resource?.meta.label || translateReach('洞察')} | NocoReach`;
  }, [location.pathname]);
  return (
    <ThemeProvider>
      <WorkspaceCacheProvider>
        <SidebarProvider open>
          <Sidebar />
          <SidebarInset className='bg-muted/25'>
            <ReachHeader />
            <main className='@container/main relative flex w-full min-w-0 flex-1 flex-col'>
              <ErrorBoundary
                resetKeys={[location.pathname]}
                fallbackRender={({ resetErrorBoundary }) => (
                  <div className='p-8'>
                    <p>{translateReach('页面暂时无法显示。')}</p>
                    <button onClick={resetErrorBoundary}>
                      {translateReach('重试')}
                    </button>
                  </div>
                )}
              >
                <MemberGate>
                  <ProjectGate>
                    <Outlet />
                  </ProjectGate>
                </MemberGate>
              </ErrorBoundary>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </WorkspaceCacheProvider>
    </ThemeProvider>
  );
}
