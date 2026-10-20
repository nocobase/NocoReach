import { type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useMatch } from 'react-router';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  agentsRoute,
  modelsRoute,
  runtimesRoute,
  usageRoute,
} from '@nocobase/app-plugin-agents/client/routes';
import { cn } from 'cn';
import { $t } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { buttonVariants } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { routeAccess } from './access.js';

const runnerAccess = routeAccess(agentsRoute);

// Runner agents beside the runtimes they come from, online agents beside the models they call, then what agents
// used, as one page. The runtimes, models and usage tabs are the Agents plugin's own pages, which bring their own
// frame and heading, so every tab renders its own page below this tab bar.
export default function AgentsPage() {
  return useMatch('/agents') ? (
    <AgentIndex />
  ) : (
    <>
      <AgentsTabs />
      <Outlet />
    </>
  );
}

function AgentIndex() {
  const { can, isPending } = useCan(runnerAccess);
  const { search } = useLocation();
  if (!isPending) {
    return (
      <Navigate replace to={{ pathname: can ? 'runner' : 'online', search }} />
    );
  }
  return (
    <div role='status' aria-label={$t('common.loading')}>
      <Skeleton className='h-48 w-full' />
    </div>
  );
}

function AgentsTabs() {
  const runner = useCan(runnerAccess);
  const runtimes = useCan(routeAccess(runtimesRoute));
  const models = useCan(routeAccess(modelsRoute));
  const usage = useCan(routeAccess(usageRoute));
  const { search } = useLocation();
  // The usage filters (range, grouping, the prices sheet) belong to the usage tab: neither carried into it nor out of it.
  const inUsage = useMatch('/agents/usage/*') !== null;
  const tabClass = cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    'text-muted-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground',
  );
  // A tab whose check is pending or failed stays hidden; its route still checks a URL opened directly.
  const tabs = [
    ...(runner.can
      ? [{ path: 'runner', label: $t('common.runnerAgent') }]
      : []),
    ...(runtimes.can
      ? [{ path: 'runtimes', label: $t('agentsPage.runtimes') }]
      : []),
    { path: 'online', label: $t('common.onlineAgent') },
    ...(models.can ? [{ path: 'models', label: $t('agentsPage.models') }] : []),
    ...(usage.can ? [{ path: 'usage', label: $t('agentsPage.usage') }] : []),
  ];
  return (
    <div className='px-6 pt-6 md:px-8 md:pt-8'>
      <nav
        aria-label={$t('agentsPage.tabs')}
        className='flex flex-wrap gap-1 border-b pb-2'
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            className={tabClass}
            to={{
              pathname: `/agents/${tab.path}`,
              search: inUsage || tab.path === 'usage' ? '' : search,
            }}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function AgentsPageLayout({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <PageContainer>
      <PageHeader
        title={$t('agentsPage.title')}
        description={$t('agentsPage.description')}
        actions={actions}
      />
      {children}
    </PageContainer>
  );
}
