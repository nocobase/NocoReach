import { type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useMatch } from 'react-router';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { agentsRoute } from '@nocobase/app-plugin-agents/client/routes';
import { cn } from 'cn';
import { $t } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { buttonVariants } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';

const runnerAccess =
  agentsRoute.authz === 'skip' ? undefined : agentsRoute.authz;

export default function AgentsPage() {
  return useMatch('/agents') ? <AgentIndex /> : <Outlet />;
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

export function AgentsPageLayout({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { can } = useCan(runnerAccess);
  const { search } = useLocation();
  const tabClass = cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    'text-muted-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground',
  );
  return (
    <PageContainer>
      <PageHeader
        title='Agent'
        description={$t('agentsPage.description')}
        actions={actions}
      />
      <nav
        aria-label={$t('agentsPage.tabs')}
        className='flex flex-wrap gap-1 border-b pb-2'
      >
        {can && (
          <NavLink
            className={tabClass}
            to={{ pathname: '/agents/runner', search }}
          >
            {$t('common.runnerAgent')}
          </NavLink>
        )}
        <NavLink
          className={tabClass}
          to={{ pathname: '/agents/online', search }}
        >
          {$t('common.onlineAgent')}
        </NavLink>
      </nav>
      {children}
    </PageContainer>
  );
}
