// @ts-nocheck
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import { runForViewer } from '@nocobase/app-plugin-agents/server/tokens';
import type { LegacyTransaction } from '../legacy/database.js';
import { systemMessageText } from '../../../shared/i18n/messages.js';
import { fail, text } from './model';
import { TASK_SUBJECT } from './agents-runtime';

// Failures that last until someone acts: signs the coding tool in, tops up its quota, picks a model the account has or
// fixes the computer's setup. Any other failure (a lost connection, a slow network, a stuck run) may pass on a retry.
const NEEDS_ATTENTION: Record<string, 'toolLogin' | 'quota' | 'model' | 'setup'> = {
  toolAuth: 'toolLogin', toolQuota: 'quota', modelUnavailable: 'model', setupFailed: 'setup', cliUnavailable: 'setup',
  checkoutFailed: 'setup', repoAccessDenied: 'setup', repoAccessUnavailable: 'setup', runnerDiskFull: 'setup',
};
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
    const proxy = this.s.p.demoAgent;
    if (proxy && this.s.p.demoConfiguration?.enabled) {
      let online = false;
      try { online = await proxy.prepare(); } catch { /* Disabled simulations never expose real runners. */ }
      return { ...d, agentId: proxy.id, defaultAgentId: proxy.id, online,
        options: online ? [{ id: proxy.id, name: proxy.title, type: 'demo', online: true, busy: 0 }] : [] };
    }
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
    const group = latest.status === 'failed' ? NEEDS_ATTENTION[latest.failureReason || ''] : undefined;
    if (!group) return { state: 'ok', at: latest.finishedAt, outcome: latest.status };
    let count = 0;
    for (const r of runs) {
      if (r.status !== 'failed' || NEEDS_ATTENTION[r.failureReason || ''] !== group) break;
      count++;
    }
    const last = runForViewer(latest, viewer).executions?.at(-1);
    return { state: 'attention', group, count, at: latest.finishedAt, runnerName: last && !last.machineHidden ? last.runnerName : null, tool: last?.tool ?? latest.tool ?? null };
  }
  async taskAgent(agentId: unknown, actor: string, tx: LegacyTransaction, project?: string) {
    const proxy = this.s.p.demoAgent;
    if (project && proxy && agentId === proxy.id && await proxy.prepare())
      return { id: proxy.id, name: proxy.title, type: 'demo' as const };
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
