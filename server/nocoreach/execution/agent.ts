// @ts-nocheck
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import { runForViewer } from '@nocobase/app-plugin-agents/server/tokens';
import type { LegacyTransaction } from '../legacy/database.js';
import { systemMessageText } from '../../../shared/i18n/messages.js';
import { fail, text } from './model';
import { TASK_SUBJECT } from './agents-runtime';
import { AGENT_FAILURE_GROUP } from '../../../shared/run-failure.js';
import { repoUrlKey, repoUrlsInput } from '../../../shared/repo-routing.js';
import { randomUUID } from 'node:crypto';

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

// Website source repositories (2026-10-29, shared/repo-routing.ts): each serves some of the site's addresses (`urls`)
// and keeps its latest check (`check`). A project connected before then has one repository (`repo`), read as
// serving every address of the project's website.
export type RepoCheck = {
  at: string;
  /** The repository and its base branch as GitHub answered; unknown when GitHub could not be asked. */
  repo: 'ok' | 'missing' | 'unknown';
  branch: 'ok' | 'missing' | 'unknown';
  /** Whether the project's Agent had a runner online, the computer that pushes. */
  runner: 'online' | 'offline';
  /** GitHub's own words when it could not be asked. */
  detail?: string;
};
export type RepoConfig = { id: string; repo: string; baseBranch: string; allowedPaths: string[]; contentCheck: boolean; urls: string[]; check?: RepoCheck | null };
export type AgentDoc = { revision: number; agentId: string | null; repos: RepoConfig[] };
type LegacyDoc = Omit<AgentDoc, 'repos'> & { repos?: RepoConfig[]; repo?: Omit<RepoConfig, 'id' | 'urls'> | null };
/** The id the one repository of a project connected before 2026-10-29 keeps. */
export const FIRST_REPO_ID = 'website';
const MAX_REPOS = 10;
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9_./-]{1,100}$/;
export function repoInput(v: any): Omit<RepoConfig, 'id' | 'check'> {
  const repo = text(v?.repo, 300).replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  if (!REPO.test(repo)) return fail(systemMessageText('agent.enterGithubRepositoryLinkExample'));
  const baseBranch = typeof v?.baseBranch === 'string' ? v.baseBranch.trim() : '';
  if (!baseBranch || !BRANCH.test(baseBranch)) return fail(systemMessageText('agent.invalidBaseBranchName'));
  if (v?.allowedPaths !== undefined && (!Array.isArray(v.allowedPaths) || v.allowedPaths.length > 20)) return fail(systemMessageText('agent.up20FoldersAllowedChanges'));
  const allowedPaths = [...new Set<string>((v?.allowedPaths || []).map((p: unknown) => text(p, 200).replace(/^\/+|\/+$/g, '')))];
  if (allowedPaths.some(p => p.split('/').some(x => !x || x === '.' || x === '..') || /[\x00-\x1f\\:*?]/.test(p))) return fail(systemMessageText('agent.foldersRelativePathsInsideRepository'));
  const urls = repoUrlsInput(v?.urls);
  if (!urls) return fail(systemMessageText('agent.invalidRepositoryUrls'));
  return { repo, baseBranch, allowedPaths, contentCheck: v?.contentCheck !== false, urls };
}
export function allowedPath(cfg: Pick<RepoConfig, 'allowedPaths'>, file: string) {
  return !cfg.allowedPaths.length || cfg.allowedPaths.some(p => file === p || file.startsWith(p + '/'));
}

interface AgentHost {
  p: { agents: Agents; github?: { gh(path: string, token?: string): Promise<unknown>; token?(project: string): string } };
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
    const d = await this.s.snapshot(this.key(project), tx) as LegacyDoc | null;
    if (!d) return { revision: 0, agentId: null, repos: [] };
    if (Array.isArray(d.repos)) return d as AgentDoc;
    const { repo, ...rest } = d;
    return { ...rest, repos: repo ? [{ id: FIRST_REPO_ID, ...repo, allowedPaths: repo.allowedPaths || [], contentCheck: repo.contentCheck !== false, urls: await this.siteUrls(project, tx) }] : [] };
  }
  /** The addresses of the project's website (Website content), as a repository serves them. */
  async siteUrls(project: string, tx?: LegacyTransaction) {
    const s = await this.s.snapshot(`site-content:${project}`, tx) as { sites?: { origin?: string }[]; origin?: string } | null;
    const origins = Array.isArray(s?.sites) ? s.sites.map(x => x?.origin) : [s?.origin];
    return [...new Set(origins.map(repoUrlKey).filter((u): u is string => Boolean(u)))];
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
    const choices: { id: string; name: string; type: string; tool: string | null; online: boolean; busy: number }[] = options.map(a => ({ id: a.id, name: a.name, type: 'runner', tool: a.modelEntries?.[0]?.tool ?? null, online: Boolean(availability.get(a.id)?.online), busy: availability.get(a.id)?.busy || 0 }));
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
  /** Adds a repository, or edits the one `v.id` names. An address it serves is moved from the repository that had it. */
  async saveRepo(project: string, v: any) {
    const input = repoInput(v), id = typeof v?.id === 'string' && v.id ? v.id : null;
    return this.change(project, v, d => {
      const current = id ? d.repos.find(r => r.id === id) : undefined;
      if (id && !current) return fail(systemMessageText('agent.repositoryRemovedRefresh'), 409);
      if (d.repos.some(r => r.id !== id && r.repo.toLowerCase() === input.repo.toLowerCase())) return fail(systemMessageText('agent.repositoryAlreadyConnected', { 0: input.repo }), 409);
      if (!current && d.repos.length >= MAX_REPOS) return fail(systemMessageText('agent.up10Repositories'), 409);
      for (const r of d.repos) if (r !== current) r.urls = r.urls.filter(u => !input.urls.includes(u));
      // A check holds for the repository and branch it looked at.
      const check = current && current.repo === input.repo && current.baseBranch === input.baseBranch ? current.check ?? null : null;
      if (current) Object.assign(current, input, { check });
      else d.repos.push({ id: randomUUID(), ...input, check: null });
    });
  }
  /** New tasks no longer change it; tasks already started keep it, and their pull requests stay as they are. */
  async removeRepo(project: string, v: { revision: number; id?: unknown }) {
    return this.change(project, v, d => {
      const id = typeof v?.id === 'string' && v.id ? v.id : d.repos.length === 1 ? d.repos[0].id : null;
      if (!d.repos.some(r => r.id === id)) return fail(systemMessageText('agent.repositoryRemovedRefresh'), 409);
      d.repos = d.repos.filter(r => r.id !== id);
    });
  }
  /**
   * Whether the Agent can write to a repository: GitHub is asked whether it and its base branch exist (with the
   * project's GitHub token when there is one, so a private repository is found), and whether the project's Agent has a
   * runner online, the computer that pushes with its own GitHub sign-in. The Agents plugin runs nothing on a runner
   * without a model, so the push itself is shown by the latest pull request the Agent opened there. The result is kept
   * with its time and does not change the settings' revision.
   */
  async checkRepo(project: string, v: { id?: unknown }, actor: string) {
    const target = (await this.doc(project)).repos.find(r => r.id === v?.id);
    if (!target) return fail(systemMessageText('agent.repositoryRemovedRefresh'), 409);
    const check = await this.probe(project, target, actor);
    return this.s.lock(project, 'agent', async tx => {
      const d = await this.doc(project, tx), r = d.repos.find(x => x.id === target.id);
      if (r && r.repo === target.repo && r.baseBranch === target.baseBranch) {
        r.check = check;
        await this.s.put(this.key(project), d, tx);
      }
      return d;
    });
  }
  // Outside any business transaction: GitHub and the Agents plugin are read here.
  private async probe(project: string, r: RepoConfig, actor: string): Promise<RepoCheck> {
    const gh = this.s.p.github, token = gh?.token?.(project) || undefined;
    let detail: string | undefined;
    const ask = async (path: string): Promise<RepoCheck['repo']> => {
      if (!gh) return 'unknown';
      try { await gh.gh(path, token); return 'ok'; }
      catch (first) {
        let e = first as { status?: number; message?: string } | undefined;
        // A token that stopped working must not hide a public repository.
        if (e?.status === 401 && token) { try { await gh.gh(path); return 'ok'; } catch (again) { e = again as typeof e; } }
        if (e?.status === 404) return 'missing';
        detail = String(e?.message || '').slice(0, 300) || undefined;
        return 'unknown';
      }
    };
    const repo = await ask(`/repos/${r.repo}`);
    const branch = repo === 'ok' ? await ask(`/repos/${r.repo}/branches/${encodeURIComponent(r.baseBranch)}`) : 'unknown';
    const s = await this.status(project, undefined, actor);
    const online = s.agentId ? s.online : s.options.some(o => o.online);
    return { at: new Date().toISOString(), repo, branch, runner: online ? 'online' : 'offline', ...(detail ? { detail } : {}) };
  }
}
