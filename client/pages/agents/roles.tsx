import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useRunnerOptions } from '@nocobase/app-plugin-agents/client/kit';
import {
  modelsRoute,
  runtimesRoute,
} from '@nocobase/app-plugin-agents/client/routes';
import type { AgentView } from '@nocobase/app-plugin-agents/shared/agents';
import { Check } from 'lucide-react';
import { $t, $legacyText, getCurrentLocale, useMessageState } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Tag } from '#components/reach/tag';
import { InlineError } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { useBusinessAccess } from '#hooks/use-business-access';
import {
  useOnlineResource,
  type Agent as OnlineAgent,
} from '../../online-agent/api.js';
import { useProject } from '../reach-data.js';
import { routeAccess } from './access.js';

type Status = {
  revision: number;
  agentId: string | null;
  options: { id: string; name: string; online?: boolean }[];
};
type Action =
  { label: string; to: string } | { label: string; run: () => Promise<void> };
type Role = {
  key: 'analysis' | 'chat' | 'execution';
  name: string;
  duty: string;
  limit: string;
  need: string;
  state: 'loading' | 'ready' | 'attention';
  detail?: string;
  action?: Action;
};

const settings = (id: string, action: string) => ({
  resource: { type: 'settings', id },
  action,
});

/**
 * The three AIs in NocoReach as the people running marketing meet them (2026-10-20 user decision): what each one does,
 * what it never does, what it needs, whether it works now and the one action that fixes it, then the shortest setup
 * while something is missing. Daily analysis and the chat agent run on a model service; the execution agent runs on
 * a runtime and is the project default. Enabling a discovered agent and making it the default is one action here.
 */
export function AgentRoles() {
  const { project } = useProject();
  const { search } = useLocation();
  const client = useApiClient();
  const runners = useRunnerOptions();
  const [refresh, setRefresh] = useState(0);
  const models = useOnlineResource<{ services: { name: string }[] }>(
    'models',
    refresh,
  );
  const online = useOnlineResource<OnlineAgent[]>('definitions', refresh);
  const modelsTab = useCan(routeAccess(modelsRoute));
  const runtimesTab = useCan(routeAccess(runtimesRoute));
  const manageAgents = useCan(settings('agents.agents', 'manage'));
  const { can: canSaveDefault } = useBusinessAccess(
    'nrAgent.saveDefault',
    project?.id,
  );
  const [status, setStatus] = useState<Status>();
  const [statusFailed, setStatusFailed] = useState(false);
  const [discovered, setDiscovered] = useState<AgentView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState('');
  const projectId = project?.id;

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    void api
      .action<Status>('nrAgent', 'status', {
        method: 'POST',
        body: { projectId: String(projectId) },
        signal: controller.signal,
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setStatus(value);
          setStatusFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatusFailed(true);
      });
    return () => controller.abort();
  }, [projectId, refresh]);

  // Agents a runtime reported that nobody has enabled yet. Reading them needs the agents grant; without it there is
  // nothing to offer, so a failure leaves the list empty.
  useEffect(() => {
    if (!manageAgents.can) return;
    let alive = true;
    void client
      .request<{ data: AgentView[] }>({ path: 'agents' })
      .then((answer) => {
        if (alive) setDiscovered(answer.data || []);
      })
      .catch(() => {
        if (alive) setDiscovered([]);
      });
    return () => {
      alive = false;
    };
  }, [client, manageAgents.can, refresh]);

  const run = useCallback(
    async (work: () => Promise<void>) => {
      setBusy(true);
      setError('');
      try {
        await work();
      } catch (e) {
        setError(() =>
          e instanceof ApiClientError || e instanceof Error
            ? $legacyText(e.message)
            : $t('common.operationFailed'),
        );
      } finally {
        setBusy(false);
        setRefresh((value) => value + 1);
      }
    },
    [setError],
  );
  const saveDefault = (agentId: string) =>
    api.action('nrAgent', 'saveDefault', {
      method: 'POST',
      body: {
        projectId: String(projectId),
        revision: status!.revision,
        agentId,
      },
    });
  const enableAndDefault = async (agent: AgentView) => {
    const zh = getCurrentLocale().startsWith('zh');
    await client.request({
      path: `agents/${encodeURIComponent(agent.id)}`,
      method: 'PATCH',
      json: {
        expectedRevision: agent.revision,
        enabled: true,
        description:
          agent.description ||
          (zh ? agent.suggestion?.zh : agent.suggestion?.en) ||
          $t('agentRoles.defaultGoodAt'),
      },
    });
    await saveDefault(agent.id);
  };

  const services = models.data?.services || [];
  const modelsLoading = models.data === undefined && !models.error;
  const noModels = !modelsLoading && services.length === 0;
  const addModel: Action | undefined = modelsTab.can
    ? { label: $t('agentRoles.addModel'), to: `/agents/models${search}` }
    : undefined;
  const addRuntime: Action | undefined = runtimesTab.can
    ? {
        label: $t('agentsPage.addRuntime'),
        to: `/agents/runtimes/connect${search}`,
      }
    : undefined;
  const viewRuntimes: Action | undefined = runtimesTab.can
    ? { label: $t('agentsPage.viewRuntimes'), to: `/agents/runtimes${search}` }
    : undefined;

  const analysis: Role = {
    key: 'analysis',
    name: $t('agentRoles.analysis'),
    duty: $t('agentRoles.analysisDuty'),
    limit: $t('agentRoles.analysisLimit'),
    need: $t('agentRoles.analysisNeed'),
    ...(modelsLoading
      ? { state: 'loading' }
      : noModels
        ? {
            state: 'attention',
            detail: $t('agentRoles.noModel'),
            action: addModel,
          }
        : {
            state: 'ready',
            detail: $t('agentRoles.uses', {
              0: services.map((s) => s.name).join('、'),
            }),
          }),
  };

  const enabledChat = (online.data || []).filter((agent) => agent.enabled);
  const readyChat = enabledChat.find((agent) => agent.ready);
  const chat: Role = {
    key: 'chat',
    name: $t('common.onlineAgent'),
    duty: $t('agentRoles.chatDuty'),
    limit: $t('agentRoles.chatLimit'),
    need: $t('agentRoles.chatNeed'),
    ...(modelsLoading || (online.data === undefined && !online.error)
      ? { state: 'loading' }
      : noModels
        ? {
            state: 'attention',
            detail: $t('agentRoles.noModel'),
            action: addModel,
          }
        : readyChat
          ? {
              state: 'ready',
              detail: $t('agentRoles.uses', { 0: readyChat.name }),
            }
          : {
              state: 'attention',
              detail: enabledChat.length
                ? $t('agentRoles.chatModelUnavailable', {
                    0: enabledChat[0].name,
                  })
                : $t('agentRoles.chatNotEnabled'),
              action: {
                label: $t('agentRoles.openChat'),
                to: `/agents/online${search}`,
              },
            }),
  };

  const options = status?.options || [];
  const chosen = options.find((agent) => agent.id === status?.agentId);
  const onlineOption = options.find(
    (agent) => agent.online && agent.id !== status?.agentId,
  );
  const candidate = discovered.find(
    (agent) =>
      agent.status === 'pending' &&
      agent.canEdit &&
      agent.runners.team + agent.runners.mine > 0,
  );
  const fix = (): Action | undefined => {
    if (onlineOption && canSaveDefault)
      return {
        label: chosen
          ? $t('agentRoles.switchTo', { 0: onlineOption.name })
          : $t('agentRoles.setDefault', { 0: onlineOption.name }),
        run: () => run(async () => void (await saveDefault(onlineOption.id))),
      };
    if (candidate && canSaveDefault)
      return {
        label: $t('agentRoles.enableDefault', { 0: candidate.name }),
        run: () => run(() => enableAndDefault(candidate)),
      };
    return undefined;
  };
  const executionState = (): Pick<Role, 'state' | 'detail' | 'action'> => {
    if (runners.loading || (!status && !statusFailed))
      return { state: 'loading' };
    if (statusFailed)
      return { state: 'attention', detail: $t('agentRoles.statusFailed') };
    if (chosen?.online)
      return {
        state: 'ready',
        detail: $t('agentRoles.defaultAgent', { 0: chosen.name }),
      };
    if (runners.options.length === 0)
      return {
        state: 'attention',
        detail: $t('agentRoles.noRuntime'),
        action: addRuntime,
      };
    if (runners.online === 0)
      return {
        state: 'attention',
        detail: chosen
          ? $t('agentRoles.defaultOffline', { 0: chosen.name })
          : $t('agentRoles.runtimesOffline'),
        action: viewRuntimes,
      };
    return {
      state: 'attention',
      detail: chosen
        ? $t('agentRoles.defaultOffline', { 0: chosen.name })
        : onlineOption
          ? $t('agentRoles.noDefault')
          : $t('agentRoles.noEnabled'),
      action: fix() || {
        label: $t('agentRoles.viewAgents'),
        to: `/agents/runner${search}`,
      },
    };
  };
  const execution: Role = {
    key: 'execution',
    name: $t('common.runnerAgent'),
    duty: $t('agentRoles.executionDuty'),
    limit: $t('agentRoles.executionLimit'),
    need: $t('agentRoles.executionNeed'),
    ...executionState(),
  };
  const roles = [analysis, chat, execution];
  const steps = [
    {
      text: $t('agentRoles.step1'),
      done: !modelsLoading && !noModels,
      action: addModel,
    },
    {
      text: $t('agentRoles.step2'),
      done: runners.options.length > 0,
      action: addRuntime,
    },
    {
      text: $t('agentRoles.step3'),
      done: execution.state === 'ready',
      // Until a runtime exists, step 2 carries the only action.
      action:
        execution.state === 'attention' && runners.options.length > 0
          ? execution.action
          : undefined,
    },
  ];
  const settled = roles.every((role) => role.state !== 'loading');
  return (
    <section
      aria-label={$t('agentRoles.title')}
      className='flex flex-col gap-4'
    >
      <div className='grid gap-3 lg:grid-cols-3'>
        {roles.map((role) => (
          <RoleCard key={role.key} role={role} busy={busy} />
        ))}
      </div>
      {error && <InlineError>{error}</InlineError>}
      {settled && steps.some((step) => !step.done) && (
        <div className='rounded-lg border bg-card p-4'>
          <h2 className='text-base font-medium'>{$t('agentRoles.setup')}</h2>
          <ol className='mt-3 flex flex-col gap-3 text-sm'>
            {steps.map((step, index) => (
              <li key={step.text} className='flex items-start gap-3'>
                <span
                  aria-hidden='true'
                  className={
                    step.done
                      ? 'flex size-5 shrink-0 items-center justify-center rounded-full bg-nr-tint-green text-nr-ink-green'
                      : 'flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground'
                  }
                >
                  {step.done ? <Check className='size-3' /> : index + 1}
                </span>
                <span
                  className={
                    step.done ? 'flex-1 text-muted-foreground' : 'flex-1'
                  }
                >
                  {step.text}
                  {step.done && (
                    <span className='sr-only'>
                      {' '}
                      {$t('agentRoles.stepDone')}
                    </span>
                  )}
                </span>
                {!step.done && step.action && (
                  <ActionButton
                    action={step.action}
                    busy={busy}
                    primary={index === steps.findIndex((item) => !item.done)}
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function ActionButton({
  action,
  busy,
  primary = false,
}: {
  action: Action;
  busy: boolean;
  primary?: boolean;
}) {
  if ('to' in action)
    return (
      <Button
        size='sm'
        variant={primary ? 'default' : 'outline'}
        nativeButton={false}
        render={<Link to={action.to} />}
      >
        {action.label}
      </Button>
    );
  return (
    <Button
      size='sm'
      variant={primary ? 'default' : 'outline'}
      disabled={busy}
      onClick={() => void action.run()}
    >
      {action.label}
    </Button>
  );
}

function RoleCard({ role, busy }: { role: Role; busy: boolean }) {
  return (
    <section
      aria-label={role.name}
      className={
        role.state === 'attention'
          ? 'flex flex-col gap-3 rounded-lg border border-nr-ink-amber/40 bg-card p-4'
          : 'flex flex-col gap-3 rounded-lg border bg-card p-4'
      }
    >
      <div className='flex items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold'>{role.name}</h3>
        {role.state === 'loading' ? (
          <Skeleton className='h-5 w-14' />
        ) : (
          <Tag tone={role.state === 'ready' ? 'green' : 'amber'} dot>
            {role.state === 'ready'
              ? $t('agentRoles.ready')
              : $t('agentRoles.attention')}
          </Tag>
        )}
      </div>
      <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm'>
        <dt className='text-muted-foreground'>{$t('agentRoles.duties')}</dt>
        <dd>{role.duty}</dd>
        <dt className='text-muted-foreground'>{$t('agentRoles.limits')}</dt>
        <dd className='text-muted-foreground'>{role.limit}</dd>
        <dt className='text-muted-foreground'>{$t('agentRoles.needs')}</dt>
        <dd className='text-muted-foreground'>{role.need}</dd>
      </dl>
      {role.detail && (
        <p
          className={
            role.state === 'attention'
              ? 'mt-auto text-sm text-nr-ink-amber'
              : 'mt-auto text-sm text-muted-foreground'
          }
        >
          {role.detail}
        </p>
      )}
      {role.state === 'attention' && role.action && (
        <div>
          <ActionButton action={role.action} busy={busy} />
        </div>
      )}
    </section>
  );
}
