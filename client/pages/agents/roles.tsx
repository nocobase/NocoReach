import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useRunnerOptions } from '@nocobase/app-plugin-agents/client/kit';
import {
  modelsRoute,
  runtimesRoute,
} from '@nocobase/app-plugin-agents/client/routes';
import type { ModelRef } from '@nocobase/app-plugin-agents/shared/models';
import type { AgentView } from '@nocobase/app-plugin-agents/shared/agents';
import { Check } from 'lucide-react';
import { $t, $legacyText, getCurrentLocale, useMessageState } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { formatDateTime } from '#lib/format';
import { Tag } from '#components/reach/tag';
import { InfoTip } from '#components/reach/info-tip';
import { InlineError } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
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
    tool?: string | null;
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
type Catalog = {
  services: {
    name: string;
    title?: string;
    models: { value: string; label: string }[];
  }[];
  defaultModel?: ModelRef | null;
};
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
 * (the Model services tab) run the daily analysis and answer in the chat panel; local agents (a coding tool on a
 * computer in the Runtimes tab) carry out tasks. Each row names the model or agent it uses, where a local agent runs
 * and who may use that computer, and a status read from how its latest work ended, not only from whether it is set up.
 * Every row has one Settings button for administrators, a dialog that changes what the row uses; while a row needs
 * attention, the button is the fix instead (2026-10-22 user decision).
 */
export function AgentRoles({ refresh: outer = 0 }: { refresh?: number }) {
  const { project } = useProject();
  const { search } = useLocation();
  const client = useApiClient();
  const onlineApi = useOnlineApi();
  const runners = useRunnerOptions();
  const [inner, setInner] = useState(0);
  const refresh = outer + inner;
  const models = useOnlineResource<Catalog>('models', refresh);
  const online = useOnlineResource<OnlineAgent[]>('definitions', refresh);
  const modelsPage = useCan(routeAccess(modelsRoute));
  const runtimesPage = useCan(routeAccess(runtimesRoute));
  const manageAgents = useCan(settings('agents.agents', 'manage'));
  const { can: canManageChat } = useBusinessAccess('nrOnline.manage');
  const { can: canSetModel } = useBusinessAccess('nrOnlineAI.setModel');
  const [dialog, setDialog] = useState<'analysis' | 'execution' | null>(null);
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
    ? { label: $t('agentRoles.addModel'), to: '/agents/models' }
    : undefined;
  const addRuntime: Action | undefined = runtimesPage.can
    ? { label: $t('agentsPage.addRuntime'), to: '/agents/runtimes/connect' }
    : undefined;
  const viewRuntimes: Action | undefined = runtimesPage.can
    ? { label: $t('agentsPage.viewRuntimes'), to: '/agents/runtimes' }
    : undefined;
  const lastRun = analysis?.analysis?.last;
  // The daily analysis reports the model it runs on; a project on simulated data runs without a model service.
  const analysisModel = analysis?.model || undefined;

  const analysisSettings: Action | undefined =
    canSetModel && services.length
      ? {
          label: $t('agentRoles.settings'),
          run: async () => setDialog('analysis'),
        }
      : undefined;
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
              action: analysisSettings,
            }
          : {
              state: 'ready',
              where: lastRun?.at
                ? $t('agentRoles.lastRun', { 0: formatDateTime(lastRun.at) })
                : $t('agentRoles.notRunYet'),
              action: analysisSettings,
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
  // A coding tool that is not signed in or out of quota fails the same way for every agent that uses it, so only an
  // agent with another tool is worth switching to (2026-10-22 user report: the page offered Claude · Haiku 4.5 while
  // Claude Code was not signed in).
  const failingTool =
    chosen?.health?.state === 'attention' &&
    (chosen.health.group === 'toolLogin' || chosen.health.group === 'quota')
      ? (chosen.health.tool ?? chosen.tool ?? null)
      : null;
  const sameTool = (tool?: string | null) =>
    failingTool !== null && tool === failingTool;
  const onlineOption = options.find(
    (agent) =>
      agent.online && agent.id !== status?.agentId && !sameTool(agent.tool),
  );
  const candidate = discovered.find(
    (agent) =>
      agent.status === 'pending' &&
      agent.canEdit &&
      agent.runners.team + agent.runners.mine > 0 &&
      !sameTool(agent.modelEntries?.[0]?.tool),
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
  // The project default is chosen in this row's Settings dialog.
  const change: Action | undefined =
    canSaveDefault && options.length
      ? {
          label: $t('agentRoles.settings'),
          run: async () => setDialog('execution'),
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
  const refreshAll = () => setInner((value) => value + 1);
  return (
    <section
      aria-labelledby='agent-roles-title'
      className='flex flex-col gap-4'
    >
      <div className='overflow-x-auto rounded-lg border bg-card'>
        <h2
          id='agent-roles-title'
          className='border-b px-4 py-3 text-base font-medium'
        >
          {$t('agentRoles.title')}
        </h2>
        <table
          aria-labelledby='agent-roles-title'
          className='w-full min-w-[640px] table-fixed text-sm'
        >
          <colgroup>
            <col className='w-[28%]' />
            <col className='w-[44%]' />
            <col className='w-[14%]' />
            <col className='w-[14%]' />
          </colgroup>
          <thead>
            <tr className='text-xs text-muted-foreground'>
              <th scope='col' className='px-4 py-2 text-left font-normal'>
                {$t('agentRoles.colWork')}
              </th>
              <th scope='col' className='px-4 py-2 text-left font-normal'>
                {$t('agentRoles.colUses')}
              </th>
              <th scope='col' className='px-4 py-2 text-left font-normal'>
                {$t('agentRoles.colStatus')}
              </th>
              <th scope='col' className='px-4 py-2 text-right font-normal'>
                {$t('agentRoles.colActions')}
              </th>
            </tr>
          </thead>
          <Group
            name={$t('agentRoles.cloud')}
            hint={$t('agentRoles.cloudHint')}
          >
            <RoleRow row={analysisRow} busy={busy} />
            <RoleRow row={chatRow} busy={busy} />
          </Group>
          <Group
            name={$t('agentRoles.local')}
            hint={`${$t('agentRoles.localHint')}${$t('agentRoles.chatFootnote')}`}
          >
            <RoleRow row={executionRow} busy={busy} />
          </Group>
        </table>
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
      {dialog === 'analysis' && (
        <AnalysisModelDialog
          catalog={models.data}
          projectId={projectId}
          onClose={() => setDialog(null)}
          onSaved={refreshAll}
        />
      )}
      {dialog === 'execution' && status && (
        <DefaultAgentDialog
          status={status}
          projectId={projectId}
          onClose={() => setDialog(null)}
          onSaved={refreshAll}
        />
      )}
    </section>
  );
}

function Group({
  name,
  hint,
  children,
}: {
  name: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <tbody>
      <tr>
        <th
          scope='rowgroup'
          colSpan={4}
          className='border-t bg-muted/50 px-4 py-1.5 text-left text-xs font-normal text-muted-foreground'
        >
          <span className='inline-flex items-center gap-1'>
            {name}
            <InfoTip label={$t('common.what', { 0: name })}>
              <p>{hint}</p>
            </InfoTip>
          </span>
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
        <th scope='row' className='px-4 py-3 text-left font-normal'>
          <span className='block'>{row.work}</span>
          <span className='block text-xs text-muted-foreground'>
            {row.does}
          </span>
        </th>
        <td className='px-4 py-3'>
          {row.state === 'loading' ? (
            <Skeleton className='h-4 w-32' />
          ) : (
            <>
              <span className='block truncate'>{row.uses || '—'}</span>
              {row.where && (
                <span className='block truncate text-xs text-muted-foreground'>
                  {row.where}
                </span>
              )}
            </>
          )}
        </td>
        <td className='px-4 py-3'>
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
        <td className='px-4 py-3 text-right'>
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
            colSpan={3}
            className={
              row.state === 'attention'
                ? 'px-4 pb-3 text-nr-ink-amber'
                : 'px-4 pb-3 text-muted-foreground'
            }
          >
            {row.detail}
          </td>
        </tr>
      )}
    </>
  );
}

const refOf = (value: string): ModelRef | null => {
  try {
    const ref = JSON.parse(value) as Partial<ModelRef>;
    return typeof ref.modelService === 'string' && typeof ref.model === 'string'
      ? { modelService: ref.modelService, model: ref.model }
      : null;
  } catch {
    return null;
  }
};

// Daily analysis › Settings: the model it runs on, which is the Agents plugin's system default chat model.
function AnalysisModelDialog({
  catalog,
  projectId,
  onClose,
  onSaved,
}: {
  catalog?: Catalog;
  projectId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const items = (catalog?.services || []).flatMap((service) =>
    service.models.map((model) => ({
      value: JSON.stringify({ modelService: service.name, model: model.value }),
      label: `${service.title || service.name} / ${model.label}`,
    })),
  );
  const current = catalog?.defaultModel
    ? JSON.stringify({
        modelService: catalog.defaultModel.modelService,
        model: catalog.defaultModel.model,
      })
    : '';
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState('');
  async function save() {
    const ref = refOf(value);
    if (!ref || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.action('nrOnlineAI', 'setModel', {
        method: 'POST',
        body: {
          ...ref,
          ...(projectId ? { projectId: String(projectId) } : {}),
        },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('common.operationFailed'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{$t('agentRoles.analysis')}</DialogTitle>
          <DialogDescription>
            {$t('agentRoles.analysisModelHint')}
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-2 text-sm'>
          <span className='text-muted-foreground'>
            {$t('agentRoles.modelLabel')}
          </span>
          <Select
            items={items}
            value={value || null}
            onValueChange={(next) => setValue(String(next ?? ''))}
          >
            <SelectTrigger
              aria-label={$t('agentRoles.modelLabel')}
              className='w-full'
            >
              <SelectValue className='truncate' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className='text-xs text-muted-foreground'>
            {$t('agentRoles.analysisTimeHint')}
          </p>
          {error && <InlineError>{error}</InlineError>}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {$t('common.cancel')}
          </Button>
          <Button
            disabled={busy || !refOf(value) || value === current}
            onClick={() => void save()}
          >
            {busy ? $t('common.saving') : $t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// What each agent in the project default's list can do now, so nobody picks one that would fail.
function optionState(option: Status['options'][number]) {
  const health = option.health;
  if (health?.state === 'attention')
    return health.group === 'toolLogin'
      ? $t('agentRoles.optionToolLogin')
      : health.group === 'quota'
        ? $t('agentRoles.optionQuota')
        : health.group === 'model'
          ? $t('agentRoles.optionModel')
          : $t('agentRoles.optionSetup');
  return option.online
    ? $t('agentRoles.optionOnline')
    : $t('agentRoles.optionOffline');
}

// Tasks › Settings: the project default local agent, which takes every task that names no agent.
function DefaultAgentDialog({
  status,
  projectId,
  onClose,
  onSaved,
}: {
  status: Status;
  projectId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const NONE = '__none__';
  const items = [
    { value: NONE, label: $t('runnerDefault.none') },
    ...status.options.map((option) => ({
      value: option.id,
      label: `${option.name} · ${optionState(option)}`,
    })),
  ];
  const current = status.agentId || NONE;
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState('');
  async function save() {
    if (busy || !projectId) return;
    setBusy(true);
    setError('');
    try {
      await api.action('nrAgent', 'saveDefault', {
        method: 'POST',
        body: {
          projectId: String(projectId),
          revision: status.revision,
          agentId: value === NONE ? null : value,
        },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('runnerDefault.saveFailed'),
      );
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{$t('agentRoles.execution')}</DialogTitle>
          <DialogDescription>
            {$t('agentRoles.defaultAgentHint')}
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-2 text-sm'>
          <span className='text-muted-foreground'>
            {$t('runnerDefault.title')}
          </span>
          <Select
            items={items}
            value={value}
            onValueChange={(next) => setValue(String(next ?? NONE))}
          >
            <SelectTrigger
              aria-label={$t('runnerDefault.title')}
              className='w-full'
            >
              <SelectValue className='truncate' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {error && <InlineError>{error}</InlineError>}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {$t('common.cancel')}
          </Button>
          <Button
            disabled={busy || value === current}
            onClick={() => void save()}
          >
            {busy ? $t('common.saving') : $t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
