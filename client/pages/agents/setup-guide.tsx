import { Link, useLocation } from 'react-router';
import { BrainCircuit, Monitor } from 'lucide-react';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  useAgentOptions,
  useRunnerOptions,
} from '@nocobase/app-plugin-agents/client/kit';
import { runtimesRoute } from '@nocobase/app-plugin-agents/client/routes';
import type {
  SettingsAction,
  SettingsItem,
} from '@nocobase/app-plugin-agents/shared/access';
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

const settings = (id: SettingsItem, action: SettingsAction) => ({
  resource: { type: 'settings', id },
  action,
});

// The next step before a task can go to a Runner agent: add a runtime, start one, or enable an agent it reported.
// Nothing shows once an agent is enabled, or while the viewer cannot list agents. The runners list holds every runtime
// only for readers of runners or agents, and the viewer's own otherwise, so an empty list proves no runtime exists
// only for them.
export function RunnerSetupGuide() {
  const runners = useRunnerOptions();
  const agents = useAgentOptions();
  const addRuntime = useCan(routeAccess(runtimesRoute));
  const readRunners = useCan(settings('agents.runners', 'read'));
  const readAgents = useCan(settings('agents.agents', 'read'));
  const enable = useCan(settings('agents.agents', 'manage'));
  const { search } = useLocation();
  if (
    runners.loading ||
    agents.loading ||
    agents.failed ||
    agents.options.length > 0 ||
    addRuntime.isPending ||
    readRunners.isPending ||
    readAgents.isPending ||
    enable.isPending
  )
    return null;
  const addButton = (variant: 'default' | 'outline') =>
    addRuntime.can ? (
      <Button
        variant={variant}
        size={variant === 'outline' ? 'sm' : 'default'}
        nativeButton={false}
        render={<Link to={{ pathname: '/agents/runtimes/connect', search }} />}
      >
        {$t('agentsPage.addRuntime')}
      </Button>
    ) : null;
  if (runners.options.length === 0) {
    if (!readRunners.can && !readAgents.can) {
      const action = addButton('outline');
      return (
        <Alert>
          <Monitor />
          <AlertTitle>{$t('agentsPage.noRunnerAgentTitle')}</AlertTitle>
          <AlertDescription>
            {$t('agentsPage.askAdminOrAddRuntime')}
          </AlertDescription>
          {action && <AlertAction>{action}</AlertAction>}
        </Alert>
      );
    }
    const action = addButton('default');
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
        {action && <EmptyContent>{action}</EmptyContent>}
      </Empty>
    );
  }
  if (runners.online === 0)
    return (
      <Alert>
        <Monitor />
        <AlertTitle>{$t('agentsPage.runtimesOfflineTitle')}</AlertTitle>
        <AlertDescription>
          {$t('agentsPage.runtimesOfflineDescription')}
        </AlertDescription>
        {addRuntime.can && (
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
          enable.can
            ? 'agentsPage.enableRunnerAgent'
            : 'agentsPage.askAdminRunnerAgent',
        )}
      </AlertDescription>
    </Alert>
  );
}

// Online agents answer through a model service, so while none is configured the next step is to add one. Adding takes
// `agents.services` manage on top of the read that opens the models tab.
export function ModelSetupGuide() {
  const read = useCan(settings('agents.services', 'read'));
  const manage = useCan(settings('agents.services', 'manage'));
  const { search } = useLocation();
  if (read.isPending || manage.isPending) return null;
  const canAdd = read.can && manage.can && !read.error && !manage.error;
  return (
    <Alert>
      <BrainCircuit />
      <AlertTitle>{$t('agentsPage.noModelTitle')}</AlertTitle>
      <AlertDescription>
        {$t(
          canAdd
            ? 'agentsPage.noModelDescription'
            : 'agentsPage.askAdminModelService',
        )}
      </AlertDescription>
      {canAdd && (
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            nativeButton={false}
            render={<Link to={{ pathname: '/agents/models', search }} />}
          >
            {$t('agentsPage.addModelService')}
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
