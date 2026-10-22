import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import { formatDateTime } from '#lib/format';
import { Tag } from '#components/reach/tag';
import { InlineError } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { useBusinessAccess } from '#hooks/use-business-access';
import {
  useOnlineApi,
  useOnlineResource,
  type Agent as OnlineAgent,
} from '../../online-agent/api.js';
import type { OnlineAgentDefinition } from '../../../shared/online-agent.js';
import { useProject } from '../reach-data.js';
import { routeAccess } from './access.js';

/** How the agent's latest tasks ended (`nrAgent.status` for the Agent page). */
export type AgentHealth =
  | { state: 'unknown' }
  | { state: 'ok'; at: string | null; outcome: 'completed' | 'failed' }
  | {
      state: 'attention';
      group: 'toolLogin' | 'quota' | 'model' | 'setup';
      count: number;
      at: string | null;
      runnerName: string | null;
      tool: string | null;
    };
type Status = {
  revision: number;
  agentId: string | null;
  options: {
    id: string;
    name: string;
    online?: boolean;
    health?: AgentHealth;
  }[];
  runners?: {
    team: number;
    personal: number;
    mine: number;
    names: string[];
  } | null;
};
type AnalysisStatus = {
  model: string | null;
  analysis?: { last: { at?: string; ok?: boolean } | null };
};
type Action =
  { label: string; to: string } | { label: string; run: () => Promise<void> };
type Row = {
  key: 'analysis' | 'chat' | 'execution';
  work: string;
  does: string;
  uses?: string;
  where?: string;
  state: 'loading' | 'ready' | 'attention';
  detail?: string;
  action?: Action;
};

const settings = (id: string, action: string) => ({
  resource: { type: 'settings', id },
  action,
});
const TOOL_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
  pi: 'Pi',
};

// Why the agent's latest tasks failed and what to do, naming the computer and the tool when the run says which.
function healthText(health: Extract<AgentHealth, { state: 'attention' }>) {
  const tool = health.tool ? TOOL_NAMES[health.tool] || health.tool : '';
  const machine = health.runnerName || '';
  const anyTool = tool || $t('agentRoles.codingTool');
  const [why, next] =
    health.group === 'toolLogin'
      ? [
          machine && tool
            ? $t('agentRoles.toolLoginOn', { 0: machine, 1: tool })
            : $t('agentRoles.toolLogin', {
                0: tool || machine || $t('agentRoles.codingTool'),
              }),
          $t('agentRoles.toolLoginNext', { 0: anyTool }),
        ]
      : health.group === 'quota'
        ? [$t('agentRoles.quota', { 0: anyTool }), $t('agentRoles.quotaNext')]
        : health.group === 'model'
          ? [$t('agentRoles.model', { 0: anyTool }), $t('agentRoles.modelNext')]
          : [
              machine
                ? $t('agentRoles.setupOn', { 0: machine })
                : $t('agentRoles.setup'),
              $t('agentRoles.setupNext'),
            ];
  const failed =
    health.count > 1
      ? $t('agentRoles.failedMany', { 0: health.count, 1: why })
      : $t('agentRoles.failedOnce', { 0: why });
  return `${failed}${next}`;
}

/**
 * Who does which work in NocoReach, as the people running marketing meet it (2026-10-21 user decision): cloud models
 * (the model services in Settings › Model services) run the daily analysis and answer in the chat panel; local agents
 * (a coding tool on a computer in Settings › Runtimes) carry out tasks. Each row names the model or agent it uses, where
 * a local agent runs and who may use that computer, and a status read from how its latest work ended, not only from
 * whether it is set up, with the one action that fixes it.
 */
export function AgentRoles({
  refresh: outer = 0,
  localAgentsId,
}: {
  refresh?: number;
  localAgentsId?: string;
}) {
  const { project } = useProject();
  const { search } = useLocation();
  const client = useApiClient();
  const onlineApi = useOnlineApi();
  const runners = useRunnerOptions();
  const [inner, setInner] = useState(0);
  const refresh = outer + inner;
  const models = useOnlineResource<{ services: { name: string }[] }>(
    'models',
    refresh,
  );
  const online = useOnlineResource<OnlineAgent[]>('definitions', refresh);
  const modelsPage = useCan(routeAccess(modelsRoute));
  const runtimesPage = useCan(routeAccess(runtimesRoute));
  const manageAgents = useCan(settings('agents.agents', 'manage'));
  const { can: canManageChat } = useBusinessAccess('nrOnline.manage');
  const { can: canSaveDefault } = useBusinessAccess(
    'nrAgent.saveDefault',
    project?.id,
  );
  const [status, setStatus] = useState<Status>();
  const [statusFailed, setStatusFailed] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisStatus | null>();
  const [discovered, setDiscovered] = useState<AgentView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState('');
  const projectId = project?.id;

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    const body = { projectId: String(projectId) };
    void api
      .action<Status>('nrAgent', 'status', {
        method: 'POST',
        body,
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
    // The daily analysis's model and its last run; without it the row falls back to whether a model service exists.
    void api
      .action<AnalysisStatus>('nrOnlineAI', 'status', {
        method: 'POST',
        body,
        signal: controller.signal,
      })
      .then((value) => {
        if (!controller.signal.aborted) setAnalysis(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAnalysis(null);
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
        setInner((value) => value + 1);
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
  const turnOn = (agent: OnlineAgentDefinition) =>
    run(async () => {
      await onlineApi(
        `definitions/${agent.id}`,
        {
          name: agent.name,
          instructions: agent.instructions,
          model: agent.model,
          revision: agent.revision,
          enabled: true,
        },
        'PUT',
      );
    });

  const services = models.data?.services || [];
  const modelsLoading = models.data === undefined && !models.error;
  const noModels = !modelsLoading && services.length === 0;
  const addModel: Action | undefined = modelsPage.can
    ? { label: $t('agentRoles.addModel'), to: '/models' }
    : undefined;
  const addRuntime: Action | undefined = runtimesPage.can
    ? { label: $t('agentsPage.addRuntime'), to: '/runtimes/connect' }
    : undefined;
  const viewRuntimes: Action | undefined = runtimesPage.can
    ? { label: $t('agentsPage.viewRuntimes'), to: '/runtimes' }
    : undefined;
  const lastRun = analysis?.analysis?.last;
  // The daily analysis reports the model it runs on; a project on simulated data runs without a model service.
  const analysisModel = analysis?.model || undefined;

  const analysisRow: Row = {
    key: 'analysis',
    work: $t('agentRoles.analysis'),
    does: $t('agentRoles.analysisWork'),
    uses: analysisModel,
    ...(modelsLoading || analysis === undefined
      ? { state: 'loading' }
      : (analysis ? !analysisModel : noModels)
        ? {
            state: 'attention',
            detail: $t('agentRoles.noModel'),
            action: addModel,
          }
        : lastRun && lastRun.ok === false
          ? {
              state: 'attention',
              detail: $t('agentRoles.analysisFailed', {
                0: formatDateTime(lastRun.at),
              }),
            }
          : {
              state: 'ready',
              where: lastRun?.at
                ? $t('agentRoles.lastRun', { 0: formatDateTime(lastRun.at) })
                : $t('agentRoles.notRunYet'),
            }),
  };

  const definitions = online.data || [];
  const chatAgent =
    definitions.find((agent) => agent.enabled && agent.ready) ||
    definitions.find((agent) => agent.enabled) ||
    definitions[0];
  const chatSettings: Action | undefined =
    canManageChat && chatAgent
      ? {
          label: $t('agentRoles.settings'),
          to: `/agents/chat/${encodeURIComponent(chatAgent.id)}${search}`,
        }
      : undefined;
  const chatRow: Row = {
    key: 'chat',
    work: $t('agentRoles.chat'),
    does: $t('agentRoles.chatWork'),
    uses: noModels ? undefined : chatAgent?.model?.model || analysisModel,
    ...(modelsLoading || (online.data === undefined && !online.error)
      ? { state: 'loading' }
      : noModels
        ? {
            state: 'attention',
            detail: $t('agentRoles.noModel'),
            action: addModel,
          }
        : !chatAgent
          ? {
              state: 'attention',
              detail: $t('agentRoles.chatMissing'),
              action: canManageChat
                ? {
                    label: $t('agentRoles.addChat'),
                    to: `/agents/chat/new${search}`,
                  }
                : undefined,
            }
          : !chatAgent.enabled
            ? {
                state: 'attention',
                detail: $t('agentRoles.chatDisabled', { 0: chatAgent.name }),
                action: canManageChat
                  ? {
                      label: $t('agentRoles.turnOn'),
                      run: () => turnOn(chatAgent),
                    }
                  : undefined,
              }
            : !chatAgent.ready
              ? {
                  state: 'attention',
                  detail: $t('agentRoles.chatModelUnavailable', {
                    0: chatAgent.name,
                  }),
                  action: chatSettings,
                }
              : { state: 'ready', action: chatSettings }),
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
  // The project default is chosen in the Local agents section below the card.
  const change: Action | undefined = localAgentsId
    ? {
        label: $t('agentRoles.change'),
        run: async () =>
          document
            .getElementById(localAgentsId)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      }
    : undefined;
  // Where the chosen agent can run now: the computer by name for those who may see machines, else how many.
  const where = (() => {
    const r = status?.runners;
    if (!r) return undefined;
    if (r.names.length === 1)
      return $t(r.team ? 'agentRoles.whereTeam' : 'agentRoles.whereOwner', {
        0: r.names[0],
      });
    const counts = [
      r.team ? $t('agentRoles.countTeam', { 0: r.team }) : '',
      r.personal ? $t('agentRoles.countOwner', { 0: r.personal }) : '',
    ].filter(Boolean);
    return counts.length ? counts.join(' · ') : undefined;
  })();
  const executionState = (): Pick<
    Row,
    'state' | 'detail' | 'action' | 'where'
  > => {
    if (runners.loading || (!status && !statusFailed))
      return { state: 'loading' };
    if (statusFailed)
      return { state: 'attention', detail: $t('agentRoles.statusFailed') };
    const health = chosen?.health;
    if (health?.state === 'attention')
      return {
        state: 'attention',
        where,
        detail: healthText(health),
        action: fix() || change,
      };
    if (chosen?.online)
      return {
        state: 'ready',
        where:
          [
            where,
            health?.state === 'ok' && health.outcome === 'completed'
              ? $t('agentRoles.lastTask', { 0: formatDateTime(health.at) })
              : health?.state === 'unknown'
                ? $t('agentRoles.noTaskYet')
                : '',
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
        detail:
          health?.state === 'ok' && health.outcome === 'failed'
            ? $t('agentRoles.lastTaskFailed')
            : undefined,
        action: change,
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
      action: fix() || change,
    };
  };
  const executionRow: Row = {
    key: 'execution',
    work: $t('agentRoles.execution'),
    does: $t('agentRoles.executionWork'),
    uses: chosen?.name,
    ...executionState(),
  };

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
      done: executionRow.state === 'ready',
      // Until a runtime exists, step 2 carries the only action.
      action:
        executionRow.state === 'attention' && runners.options.length > 0
          ? executionRow.action
          : undefined,
    },
  ];
  const settled = [analysisRow, chatRow, executionRow].every(
    (row) => row.state !== 'loading',
  );
  return (
    <section
      aria-label={$t('agentRoles.title')}
      className='flex flex-col gap-4'
    >
      <div className='overflow-x-auto rounded-lg border bg-card'>
        <table className='w-full min-w-[640px] text-sm'>
          <caption className='px-4 pt-4 text-left text-base font-medium'>
            {$t('agentRoles.title')}
          </caption>
          <thead className='sr-only'>
            <tr>
              <th scope='col'>{$t('agentRoles.colWork')}</th>
              <th scope='col'>{$t('agentRoles.colDoes')}</th>
              <th scope='col'>{$t('agentRoles.colUses')}</th>
              <th scope='col'>{$t('agentRoles.colStatus')}</th>
              <th scope='col'>{$t('agentRoles.colActions')}</th>
            </tr>
          </thead>
          <Group
            name={$t('agentRoles.cloud')}
            hint={$t('agentRoles.cloudHint')}
            link={
              modelsPage.can
                ? { to: '/models', label: $t('agentRoles.modelsLink') }
                : undefined
            }
          >
            <RoleRow row={analysisRow} busy={busy} />
            <RoleRow row={chatRow} busy={busy} />
          </Group>
          <Group
            name={$t('agentRoles.local')}
            hint={$t('agentRoles.localHint')}
            link={
              runtimesPage.can
                ? { to: '/runtimes', label: $t('agentRoles.runtimesLink') }
                : undefined
            }
          >
            <RoleRow row={executionRow} busy={busy} />
          </Group>
        </table>
        <p className='border-t px-4 py-3 text-xs text-muted-foreground'>
          {$t('agentRoles.chatFootnote')}
        </p>
      </div>
      {error && <InlineError>{error}</InlineError>}
      {settled && steps.some((step) => !step.done) && (
        <div className='rounded-lg border bg-card p-4'>
          <h2 className='text-base font-medium'>
            {$t('agentRoles.quickSetup')}
          </h2>
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

function Group({
  name,
  hint,
  link,
  children,
}: {
  name: string;
  hint: string;
  link?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <tbody>
      <tr>
        <th
          scope='rowgroup'
          colSpan={5}
          className='px-4 pt-4 pb-2 text-left font-normal'
        >
          <span className='font-medium'>{name}</span>
          <span className='ml-2 text-muted-foreground'>{hint}</span>
          {link && (
            <Link className='nr-link ml-2' to={link.to}>
              {link.label}
            </Link>
          )}
        </th>
      </tr>
      {children}
    </tbody>
  );
}

function RoleRow({ row, busy }: { row: Row; busy: boolean }) {
  return (
    <>
      <tr className='border-t'>
        <th scope='row' className='w-28 px-4 py-3 text-left font-normal'>
          {row.work}
        </th>
        <td className='px-2 py-3 text-muted-foreground'>{row.does}</td>
        <td className='px-2 py-3'>
          {row.state === 'loading' ? (
            <Skeleton className='h-4 w-32' />
          ) : (
            <>
              <span className='block'>{row.uses || '—'}</span>
              {row.where && (
                <span className='block text-xs text-muted-foreground'>
                  {row.where}
                </span>
              )}
            </>
          )}
        </td>
        <td className='w-24 px-2 py-3'>
          {row.state === 'loading' ? (
            <Skeleton className='h-5 w-14' />
          ) : (
            <Tag tone={row.state === 'ready' ? 'green' : 'amber'} dot>
              {row.state === 'ready'
                ? $t('agentRoles.ready')
                : $t('agentRoles.attention')}
            </Tag>
          )}
        </td>
        <td className='w-40 px-4 py-3 text-right'>
          {row.state !== 'loading' && row.action && (
            <ActionButton
              action={row.action}
              busy={busy}
              primary={row.state === 'attention'}
            />
          )}
        </td>
      </tr>
      {row.detail && (
        <tr>
          <td />
          <td
            colSpan={4}
            className={
              row.state === 'attention'
                ? 'px-2 pb-3 text-nr-ink-amber'
                : 'px-2 pb-3 text-muted-foreground'
            }
          >
            {row.detail}
          </td>
        </tr>
      )}
    </>
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
