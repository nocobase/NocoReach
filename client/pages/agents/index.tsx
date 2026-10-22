import { useState } from 'react';
import { Outlet } from 'react-router';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { agentsRoute } from '@nocobase/app-plugin-agents/client/routes';
import { $t } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import type { AgentSettingsContext } from '../../online-agent/edit.js';
import { AgentRoles } from './roles.js';
import { LocalAgents } from './runner.js';
import { routeAccess } from './access.js';

const runnerAccess = routeAccess(agentsRoute);
const LOCAL_AGENTS = 'local-agents';

// One page for the AIs in NocoReach (2026-10-21 user decision, after Studio's Agent page): which work cloud models do
// and which local agents do, with what each uses and whether it works, then the local agents themselves. There are no
// tabs: model services, runtimes and usage are pages of Settings, and the chat agent's settings open as a dialog over
// this page (`chat/new`, `chat/:onlineAgentId`).
export default function AgentsPage() {
  const runner = useCan(runnerAccess);
  const [refresh, setRefresh] = useState(0);
  const changed = () => setRefresh((value) => value + 1);
  const context: AgentSettingsContext = {
    refresh: changed,
    saved: changed,
    back: '/agents',
  };
  return (
    <PageContainer>
      <PageHeader
        title={$t('agentsPage.title')}
        description={$t('agentsPage.description')}
      />
      <AgentRoles
        refresh={refresh}
        localAgentsId={runner.can ? LOCAL_AGENTS : undefined}
      />
      {runner.can && <LocalAgents id={LOCAL_AGENTS} onSaved={changed} />}
      <Outlet context={context} />
    </PageContainer>
  );
}
