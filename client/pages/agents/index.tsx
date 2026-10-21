import { type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useMatch } from 'react-router';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  agentsRoute,
  modelsRoute,
  runtimesRoute,
  usageRoute,
} from '@nocobase/app-plugin-agents/client/routes';
import { $t } from '#i18n';
import {
  PageContainer,
  PageHeader,
  SectionHeading,
} from '#components/reach/page';
import { AgentRoles } from './roles.js';
import { Skeleton } from '#components/ui/skeleton';
import { routeAccess } from './access.js';
import { lineTabClass, lineTabListClass } from '#components/reach/line-tabs';

const runnerAccess = routeAccess(agentsRoute);

// One page for the AIs in NocoReach (2026-10-20 user decision): the page heading and the three roles with what each
// does and needs come first, then the tabs in setup order (models, chat agent, runtimes, execution agent, usage). The
// runtimes, models and usage tabs are the Agents plugin's own pages, which bring their own frame and heading, so every
// tab renders its own page below this tab bar.
export default function AgentsPage() {
  return useMatch('/agents') ? (
    <AgentIndex />
  ) : (
    <>
      <PageContainer className='pb-0'>
        <PageHeader
          title={$t('agentsPage.title')}
          description={$t('agentsPage.description')}
        />
        <AgentRoles />
      </PageContainer>
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
  const tabClass = lineTabClass;
  // A tab whose check is pending or failed stays hidden; its route still checks a URL opened directly.
  // In the order a new installation sets them up: the model service first, then a runtime and its agent.
  const tabs = [
    ...(models.can ? [{ path: 'models', label: $t('agentsPage.models') }] : []),
    { path: 'online', label: $t('common.onlineAgent') },
    ...(runtimes.can
      ? [{ path: 'runtimes', label: $t('agentsPage.runtimes') }]
      : []),
    ...(runner.can
      ? [{ path: 'runner', label: $t('common.runnerAgent') }]
      : []),
    ...(usage.can ? [{ path: 'usage', label: $t('agentsPage.usage') }] : []),
  ];
  return (
    <div className='px-6 pt-4 md:px-8'>
      <nav aria-label={$t('agentsPage.tabs')} className={lineTabListClass}>
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

// A tab of the application's own: its name and one sentence on what it is for, as the plugin's tabs carry theirs.
export function AgentsPageLayout({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <PageContainer>
      <SectionHeading
        title={title}
        description={description}
        actions={actions}
        className='[&_h2]:text-base [&_h2]:font-medium'
      />
      {children}
    </PageContainer>
  );
}
