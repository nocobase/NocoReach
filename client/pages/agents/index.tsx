import { useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useMatch } from 'react-router';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  agentsRoute,
  modelsRoute,
  runtimesRoute,
  usageRoute,
} from '@nocobase/app-plugin-agents/client/routes';
import { $t } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { Skeleton } from '#components/ui/skeleton';
import { lineTabClass, lineTabListClass } from '#components/reach/line-tabs';
import type { AgentSettingsContext } from '../../online-agent/edit.js';
import { AgentRoles } from './roles.js';
import { routeAccess } from './access.js';

const runnerAccess = routeAccess(agentsRoute);

// One page for the AIs in NocoReach (2026-10-22 user decision): who does the work comes first, then four tabs, model
// services, runtimes, local agents and usage. Model services, runtimes and usage are the Agents plugin's own pages,
// which bring their own frame and heading, so every tab renders its own page below the tab bar. Chat panel › Settings
// opens as a dialog over the page (`chat`).
export default function AgentsPage() {
  const index = useMatch('/agents') !== null;
  const [refresh, setRefresh] = useState(0);
  const changed = () => setRefresh((value) => value + 1);
  const context: AgentSettingsContext = { refresh: changed, back: '/agents' };
  return (
    <>
      <PageContainer className='pb-0'>
        <PageHeader
          title={$t('agentsPage.title')}
          description={$t('agentsPage.description')}
        />
        <AgentRoles refresh={refresh} />
      </PageContainer>
      <AgentsTabs />
      {/* The tab bar names each tab, so a tab's own page heading is read by screen readers only (2026-10-22). */}
      <div className='[&_header_h1]:sr-only'>
        {index ? <AgentIndex /> : <Outlet context={context} />}
      </div>
    </>
  );
}

function useTabs() {
  const runner = useCan(runnerAccess);
  const runtimes = useCan(routeAccess(runtimesRoute));
  const models = useCan(routeAccess(modelsRoute));
  const usage = useCan(routeAccess(usageRoute));
  // A tab whose check is pending or failed stays hidden; its route still checks a URL opened directly.
  return {
    pending: [runner, runtimes, models, usage].some((check) => check.isPending),
    // In the order of the overview and of a first setup: the model service, the runtime, its local agents, then usage.
    tabs: [
      ...(models.can
        ? [{ path: 'models', label: $t('agentsPage.models') }]
        : []),
      ...(runtimes.can
        ? [{ path: 'runtimes', label: $t('agentsPage.runtimes') }]
        : []),
      ...(runner.can
        ? [{ path: 'runner', label: $t('common.runnerAgent') }]
        : []),
      ...(usage.can ? [{ path: 'usage', label: $t('agentsPage.usage') }] : []),
    ],
  };
}

// `/agents` opens the first tab the reader may open.
function AgentIndex() {
  const { pending, tabs } = useTabs();
  const { search } = useLocation();
  if (tabs[0] && !pending)
    return (
      <Navigate replace to={{ pathname: `/agents/${tabs[0].path}`, search }} />
    );
  if (!pending) return null;
  return (
    <div
      role='status'
      aria-label={$t('common.loading')}
      className='px-6 md:px-8'
    >
      <Skeleton className='h-48 w-full' />
    </div>
  );
}

function AgentsTabs() {
  const { tabs } = useTabs();
  const { search } = useLocation();
  // The usage filters (range, grouping, the prices sheet) belong to the usage tab: neither carried into it nor out of it.
  const inUsage = useMatch('/agents/usage/*') !== null;
  if (!tabs.length) return null;
  return (
    <div className='px-6 pt-6 md:px-8'>
      <nav aria-label={$t('agentsPage.tabs')} className={lineTabListClass}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            className={lineTabClass}
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
