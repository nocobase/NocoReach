import { type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useMatch } from 'react-router';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  agentsRoute,
  modelsRoute,
  runtimesRoute,
} from '@nocobase/app-plugin-agents/client/routes';
import type { AppClientRoutePageDefinition } from '@nocobase/app-client/plugins';
import { cn } from 'cn';
import { $t } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { buttonVariants } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';

// Keep in sync with the authz of the matching child routes in client/nocoreach-routes.ts.
const access = ({ authz }: AppClientRoutePageDefinition) =>
  authz === 'skip' ? undefined : authz;
const runnerAccess = access(agentsRoute);

// Runner agents, online agents, the runtimes runner agents come from and the models online agents call, as one page.
// The runtimes and models tabs are the Agents plugin's own pages, which bring their own frame and heading, so every
// tab renders its own page below this tab bar.
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
  const runtimes = useCan(access(runtimesRoute));
  const models = useCan(access(modelsRoute));
  const { search } = useLocation();
  const tabClass = cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    'text-muted-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground',
  );
  // A tab whose check is pending or failed stays hidden; its route still checks a URL opened directly.
  const tabs = [
    ...(runner.can
      ? [{ path: 'runner', label: $t('common.runnerAgent') }]
      : []),
    { path: 'online', label: $t('common.onlineAgent') },
    ...(runtimes.can
      ? [{ path: 'runtimes', label: $t('agentsPage.runtimes') }]
      : []),
    ...(models.can ? [{ path: 'models', label: $t('agentsPage.models') }] : []),
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
            to={{ pathname: `/agents/${tab.path}`, search }}
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
