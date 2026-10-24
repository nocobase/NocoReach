// @ts-nocheck
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import { runForViewer } from '@nocobase/app-plugin-agents/server/tokens';
import type { LegacyTransaction } from '../legacy/database.js';
import { systemMessageText } from '../../../shared/i18n/messages.js';
import { fail, text } from './model';
import { TASK_SUBJECT } from './agents-runtime';
import { AGENT_FAILURE_GROUP } from '../../../shared/run-failure.js';

type Attention = 'toolLogin' | 'quota' | 'model' | 'setup' | 'missingTool' | 'toolSignIn';
// Failures that last until someone acts: signs the coding tool in, tops up its quota, picks a model the account has or
// fixes the computer's setup. Any other failure (a lost connection, a slow network, a stuck run) may pass on a retry.
const NEEDS_ATTENTION: Record<string, Attention> = {
  toolAuth: 'toolLogin', toolQuota: 'quota', modelUnavailable: 'model', setupFailed: 'setup', cliUnavailable: 'setup',
  checkoutFailed: 'setup', repoAccessDenied: 'setup', repoAccessUnavailable: 'setup', runnerDiskFull: 'setup',
};
// The same for what the Agent reports itself (shared/run-failure.ts): a tool the step needs is not installed on the
// computer, or not signed in. A quota it reports may be a passing rate limit, so it is left out.
const AGENT_ATTENTION: Record<string, Attention> = Object.fromEntries(Object.entries(AGENT_FAILURE_GROUP).filter(([, group]) => group === 'missingTool' || group === 'toolSignIn'));
const HEALTH_RUNS = 10;

export type RepoConfig = { repo: string; baseBranch: string; allowedPaths: string[]; contentCheck: boolean };
export type AgentDoc = { revision: number; agentId: string | null; repo: RepoConfig | null };
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9_./-]{1,100}$/;
export function repoInput(v: any): RepoConfig {
  const repo = text(v?.repo, 300).replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  if (!REPO.test(repo)) return fail(systemMessageText('agent.enterGithubRepositoryLinkExample'));
  const baseBranch = typeof v?.baseBranch === 'string' ? v.baseBranch.trim() : '';
  if (!baseBranch || !BRANCH.test(baseBranch)) return fail(systemMessageText('agent.invalidBaseBranchName'));
  if (v?.allowedPaths !== undefined && (!Array.isArray(v.allowedPaths) || v.allowedPaths.length > 20)) return fail(systemMessageText('agent.up20FoldersAllowedChanges'));
  const allowedPaths = [...new Set<string>((v?.allowedPaths || []).map((p: unknown) => text(p, 200).replace(/^\/+|\/+$/g, '')))];
  if (allowedPaths.some(p => p.split('/').some(x => !x || x === '.' || x === '..') || /[\x00-\x1f\\:*?]/.test(p))) return fail(systemMessageText('agent.foldersRelativePathsInsideRepository'));
  return { repo, baseBranch, allowedPaths, contentCheck: v?.contentCheck !== false };
}
export function allowedPath(cfg: Pick<RepoConfig, 'allowedPaths'>, file: string) {
  return !cfg.allowedPaths.length || cfg.allowedPaths.some(p => file === p || file.startsWith(p + '/'));
}

interface AgentHost {
  p: { agents: Agents };
  key(kind: string, project: string, task: string, id?: string): string;
  snapshot(key: string, tx?: LegacyTransaction): Promise<unknown>;
  put(key: string, value: unknown, tx: LegacyTransaction): Promise<void>;
  lock<T>(project: string, task: string, callback: (tx: LegacyTransaction) => Promise<T>): Promise<T>;
}
/** Project business settings only. Runner credentials, leases and registrations belong to Agents. */
export class AgentStore {
  constructor(private readonly s: AgentHost) {}
  key(project: string) { return `nr-task-agent:${project}`; }
  async doc(project: string, tx?: LegacyTransaction): Promise<AgentDoc> {
    return (await this.s.snapshot(this.key(project), tx) as AgentDoc | null) || { revision: 0, agentId: null, repo: null };
  }
  async status(project: string, taskAgentId?: string, actor?: string, viewer?: { seesMachines: boolean }) {
    const d = await this.doc(project), agents = this.s.p.agents;
    const conn = agents.tx.read();
    const options = await agents.agents.listActive(conn);
    const agentId = taskAgentId || d.agentId;

    // Call outside business transactions: model and actor eligibility checks open plugin reads.
    const availability = await agents.availability(conn, options, actor);
    const choices = options.map(a => ({ id: a.id, name: a.name, type: 'runner', tool: a.modelEntries?.[0]?.tool ?? null, online: Boolean(availability.get(a.id)?.online), busy: availability.get(a.id)?.busy || 0 }));
    const status = { ...d, agentId, defaultAgentId: d.agentId, options: choices, online: Boolean(choices.find(a => a.id === agentId)?.online) };
    if (!viewer || !actor) return status;
    // The Agent page also asks how each agent's latest tasks ended and where the chosen one runs (2026-10-21 user report:
    // the page said Available while every task failed because the coding tool was not signed in).
    const machines = { userId: actor, seesMachines: viewer.seesMachines };
    const health = await Promise.all(choices.map(a => this.health(a.id, machines)));
    const view = agentId ? (await agents.views(conn, actor, { canEdit: false })).find(v => v.id === agentId) : undefined;
    const runners = view?.runners ? { team: view.runners.team, personal: view.runners.personal, mine: view.runners.mine, names: viewer.seesMachines ? view.runners.names : [] } : null;
    return { ...status, options: choices.map((a, i) => ({ ...a, health: health[i] })), runners };
  }
  /** How the agent's latest task runs ended: a failure that lasts until someone acts is reported with how many in a row. */
  async health(agentId: string, viewer: { userId: string; seesMachines: boolean }) {
    const runs = (await this.s.p.agents.runs.list({ agentId, subjectKind: TASK_SUBJECT, limit: HEALTH_RUNS }))
      .filter(r => r.status === 'completed' || r.status === 'failed');
    const latest = runs[0];
    if (!latest) return { state: 'unknown' };
    const outcomes = await Promise.all(runs.map(r => this.outcome(r)));
    const group = outcomes[0].group;
    if (!group) return { state: 'ok', at: latest.finishedAt, outcome: outcomes[0].failed ? 'failed' : 'completed' };
    let count = 0;
    for (const o of outcomes) {
      if (!o.failed || o.group !== group) break;
      count++;
    }
    const last = runForViewer(latest, viewer).executions?.at(-1);
    return { state: 'attention', group, count, at: latest.finishedAt, runnerName: last && !last.machineHidden ? last.runnerName : null, tool: last?.tool ?? latest.tool ?? null };
  }
  // How a task run ended for the task: a run the Agent itself reported failed (ok=false) completed for the Agents plugin
  // (2026-10-24: the Agent page said the last task completed while the task page said it failed).
  private async outcome(r: { status: string; failureReason?: string | null; subject?: { kind: string; id: string } | null }): Promise<{ failed: boolean; group?: Attention }> {
    if (r.status === 'failed') return { failed: true, group: NEEDS_ATTENTION[r.failureReason || ''] };
    const [project, task, id] = r.subject?.kind === TASK_SUBJECT ? String(r.subject.id).split(':') : [];
    const own = id ? await this.s.snapshot(this.s.key('run', project, task, id)) as { status?: string; error?: string } | null : null;
    return own?.status === 'failed' ? { failed: true, group: AGENT_ATTENTION[own.error || ''] } : { failed: false };
  }
  async taskAgent(agentId: unknown, actor: string, tx: LegacyTransaction) {
    if (typeof agentId !== 'string' || !agentId.trim() || agentId.length > 100) return fail(systemMessageText('projectAi.selectTaskAgent'));
    const agents = this.s.p.agents;
    const agent = await agents.agents.findWorkable(tx.connection, agentId);
    if (!agent || !agents.agents.mayInvoke(agent, actor))
      return fail(systemMessageText('agent.chooseAgentSharedEveryone'), 409);
    return { id: agent.id, name: agent.name, type: 'runner' as const };
  }
  private change(project: string, v: { revision: number }, edit: (d: AgentDoc, tx: LegacyTransaction) => void | Promise<void>) {
    return this.s.lock(project, 'agent', async tx => {
      const d = await this.doc(project, tx);
      if (v.revision !== d.revision) return fail(systemMessageText('agent.settingsUpdatedAnotherWindowRefresh'), 409);
      await edit(d, tx); d.revision++;
      await this.s.put(this.key(project), d, tx);
      return d;
    });
  }
  saveDefault(project: string, v: { revision: number; agentId: unknown }, actor: string) {
    return this.change(project, v, async (d, tx) => {
      d.agentId = v.agentId === null ? null : (await this.taskAgent(v.agentId, actor, tx)).id;
    });
  }
  saveRepo(project: string, v: any) { const repo = repoInput(v); return this.change(project, v, d => { d.repo = repo; }); }
  removeRepo(project: string, v: any) { return this.change(project, v, d => { d.repo = null; }); }
}
