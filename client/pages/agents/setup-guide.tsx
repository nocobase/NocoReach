import { Link, useLocation } from 'react-router';
import { BrainCircuit, Monitor } from 'lucide-react';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  useAgentOptions,
  useRunnerOptions,
} from '@nocobase/app-plugin-agents/client/kit';
import {
  modelsRoute,
  runtimesRoute,
} from '@nocobase/app-plugin-agents/client/routes';
import { $t } from '#i18n';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { routeAccess } from './access.js';

const manageAgents = {
  resource: { type: 'settings', id: 'agents.agents' },
  action: 'manage',
} as const;

// The next step before a task can go to a Runner agent: add a runtime, start one, or enable an agent it reported.
// Nothing shows once an agent is enabled, or while the viewer cannot list agents.
export function RunnerSetupGuide() {
  const runners = useRunnerOptions();
  const agents = useAgentOptions();
  const { can: canAddRuntime } = useCan(routeAccess(runtimesRoute));
  const { can: canEnable } = useCan(manageAgents);
  const { search } = useLocation();
  if (
    runners.loading ||
    agents.loading ||
    agents.failed ||
    agents.options.length > 0
  )
    return null;
  if (runners.options.length === 0)
    return (
      <Empty className='border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Monitor />
          </EmptyMedia>
          <EmptyTitle>{$t('agentsPage.noRuntimeTitle')}</EmptyTitle>
          <EmptyDescription>
            {$t('agentsPage.noRuntimeDescription')}
          </EmptyDescription>
        </EmptyHeader>
        {canAddRuntime && (
          <EmptyContent>
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: '/agents/runtimes/connect', search }} />
              }
            >
              {$t('agentsPage.addRuntime')}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  if (runners.online === 0)
    return (
      <Alert>
        <Monitor />
        <AlertTitle>{$t('agentsPage.runtimesOfflineTitle')}</AlertTitle>
        <AlertDescription>
          {$t('agentsPage.runtimesOfflineDescription')}
        </AlertDescription>
        {canAddRuntime && (
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              nativeButton={false}
              render={<Link to={{ pathname: '/agents/runtimes', search }} />}
            >
              {$t('agentsPage.viewRuntimes')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  return (
    <Alert>
      <Monitor />
      <AlertTitle>{$t('agentsPage.noRunnerAgentTitle')}</AlertTitle>
      <AlertDescription>
        {$t(
          canEnable
            ? 'agentsPage.enableRunnerAgent'
            : 'agentsPage.askAdminRunnerAgent',
        )}
      </AlertDescription>
    </Alert>
  );
}

// Online agents answer through a model service, so without one the next step is to add it.
export function ModelSetupGuide({ compact }: { compact: boolean }) {
  const { can: canAddModel } = useCan(routeAccess(modelsRoute));
  const { search } = useLocation();
  const action = canAddModel ? (
    <Button
      variant={compact ? 'outline' : 'default'}
      size={compact ? 'sm' : 'default'}
      nativeButton={false}
      render={<Link to={{ pathname: '/agents/models', search }} />}
    >
      {$t('agentsPage.addModelService')}
    </Button>
  ) : null;
  const description = $t(
    canAddModel
      ? 'agentsPage.noModelDescription'
      : 'agentsPage.askAdminModelService',
  );
  if (compact)
    return (
      <Alert>
        <BrainCircuit />
        <AlertTitle>{$t('agentsPage.noModelTitle')}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
        {action && <AlertAction>{action}</AlertAction>}
      </Alert>
    );
  return (
    <Empty className='min-h-48 border border-dashed'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <BrainCircuit />
        </EmptyMedia>
        <EmptyTitle>{$t('agentsPage.noModelTitle')}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
