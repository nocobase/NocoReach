import { useState } from 'react';
import { BotMessageSquare } from 'lucide-react';
import { toast } from '#lib/toast';
import { AgentsPageLayout } from '../pages/agents/index.js';
import { ModelSetupGuide } from '../pages/agents/setup-guide.js';
import { InstructionsPreview } from './instructions-preview.js';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '#components/ui/empty';
import type { OnlineAgentDefinition } from '../../shared/online-agent.js';
import { Link, Outlet, useLocation } from 'react-router';
import { $t } from '#i18n';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '#components/ui/card';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { useBusinessAccess } from '#hooks/use-business-access';
import {
  useOnlineApi,
  useOnlineResource,
  OnlineApiError,
  type Agent,
} from './api.js';
import { OnlineError, OnlineConfirm } from './controls.js';

export default function OnlineAgentSettings() {
  const { search } = useLocation();
  const [revision, setRevision] = useState(0),
    { can: canManage } = useBusinessAccess('nrOnline.manage');
  const data = useOnlineResource<Agent[]>('definitions', revision);
  // Online agents answer through a model service; with none configured, adding one comes first.
  const catalog = useOnlineResource<{ services: unknown[] }>('models');
  const noModels = catalog.data?.services.length === 0;
  const refresh = () => setRevision((value) => value + 1);
  const saved = (agent: OnlineAgentDefinition) =>
    data.update((previous = []) => {
      const prior = previous.find((item) => item.id === agent.id);
      const next = { ...agent, ready: prior?.ready ?? false };
      return prior
        ? previous.map((item) => (item.id === agent.id ? next : item))
        : [...previous, next];
    });
  const create = (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'new', search }} />}
    >
      {$t('onlineAgent.create')}
    </Button>
  );
  return (
    <AgentsPageLayout actions={canManage && !!data.data?.length && create}>
      <p className='text-sm text-muted-foreground'>
        {$t('onlineAgent.settingsDescription')}
      </p>
      <OnlineError error={data?.error} retry={refresh} />
      {data.loading && !data.data && (
        <div role='status' aria-label={$t('common.loading')}>
          <Skeleton className='h-48 w-full' />
        </div>
      )}
      {data.loading && data.data && (
        <p role='status' className='text-sm text-muted-foreground'>
          {$t('common.loading')}
        </p>
      )}
      {noModels && !!data.data?.length && <ModelSetupGuide compact />}
      {data.data?.length === 0 && noModels && (
        <ModelSetupGuide compact={false} />
      )}
      {data.data?.length === 0 && !noModels && (
        <Empty className='min-h-48 border border-dashed'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <BotMessageSquare />
            </EmptyMedia>
            <EmptyTitle>{$t('onlineAgent.noDefinitions')}</EmptyTitle>
            <EmptyDescription>
              {$t(
                canManage
                  ? 'onlineAgent.settingsDescription'
                  : 'onlineAgent.askAdmin',
              )}
            </EmptyDescription>
          </EmptyHeader>
          {canManage && <EmptyContent>{create}</EmptyContent>}
        </Empty>
      )}
      {data?.data?.map((agent) => (
        <AgentCard
          key={`${agent.id}:${agent.revision}`}
          agent={agent}
          refresh={refresh}
          saved={saved}
        />
      ))}
      <Outlet context={{ refresh, saved }} />
    </AgentsPageLayout>
  );
}
function AgentCard({
  agent,
  refresh,
  saved,
}: {
  agent: Agent;
  refresh: () => void;
  saved: (agent: OnlineAgentDefinition) => void;
}) {
  const { search } = useLocation();
  const { can: canManage } = useBusinessAccess('nrOnline.manage'),
    api = useOnlineApi();
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  async function toggle() {
    setBusy(true);
    setError(undefined);
    try {
      const next = await api<OnlineAgentDefinition>(
        `definitions/${agent.id}`,
        {
          name: agent.name,
          instructions: agent.instructions,
          model: agent.model,
          revision: agent.revision,
          enabled: !agent.enabled,
        },
        'PUT',
      );
      setConfirm(false);
      saved(next);
      toast.success(() =>
        $t(
          next.enabled
            ? 'onlineAgent.enabledNamed'
            : 'onlineAgent.disabledNamed',
          { 0: next.name },
        ),
      );
      refresh();
    } catch (failure) {
      setError(failure);
      if (failure instanceof OnlineApiError && failure.status === 404)
        refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className='break-words'>{agent.name}</CardTitle>
        <CardDescription>
          {$t(
            !agent.enabled
              ? 'onlineAgent.disabled'
              : agent.ready
                ? 'onlineAgent.ready'
                : 'onlineAgent.modelRequired',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <p className='text-sm break-words'>
          {agent.model
            ? `${agent.model.modelService} / ${agent.model.model}`
            : $t('onlineAgent.defaultModel')}
        </p>
        {agent.instructions && (
          <InstructionsPreview>{agent.instructions}</InstructionsPreview>
        )}
        <OnlineError error={confirm ? undefined : error} retry={refresh} />
        {error instanceof OnlineApiError && error.status === 409 && (
          <Button variant='outline' onClick={refresh}>
            {$t('onlineAgent.refresh')}
          </Button>
        )}
      </CardContent>
      {canManage && (
        <CardFooter className='justify-end gap-2'>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => (agent.enabled ? setConfirm(true) : void toggle())}
          >
            {$t(
              busy
                ? 'common.working'
                : agent.enabled
                  ? 'onlineAgent.disable'
                  : 'onlineAgent.enable',
            )}
          </Button>
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to={{ pathname: `${agent.id}/edit`, search }} />}
          >
            {$t('common.edit')}
          </Button>
        </CardFooter>
      )}
      <OnlineConfirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title={$t('onlineAgent.disableTitle', { 0: agent.name })}
        description={$t('onlineAgent.disableDescription')}
        action={$t('onlineAgent.disable')}
        busy={busy}
        confirm={() => void toggle()}
        error={error}
      />
    </Card>
  );
}
