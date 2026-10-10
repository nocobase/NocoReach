// @ts-nocheck
import { fail, text } from './model';

export type RepoConfig = { repo: string; baseBranch: string; allowedPaths: string[]; contentCheck: boolean };
export type AgentDoc = { revision: number; agentId: string | null; repo: RepoConfig | null };
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9_./-]{1,100}$/;
export function repoInput(v: any): RepoConfig {
  const repo = text(v?.repo, 300).replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  if (!REPO.test(repo)) return fail('请填写 GitHub 仓库链接，例如 https://github.com/owner/repository');
  const baseBranch = typeof v?.baseBranch === 'string' ? v.baseBranch.trim() : '';
  if (!baseBranch || !BRANCH.test(baseBranch)) return fail('基础分支名称无效');
  if (v?.allowedPaths !== undefined && (!Array.isArray(v.allowedPaths) || v.allowedPaths.length > 20)) return fail('允许修改的目录最多 20 个');
  const allowedPaths = [...new Set<string>((v?.allowedPaths || []).map((p: unknown) => text(p, 200).replace(/^\/+|\/+$/g, '')))];
  if (allowedPaths.some(p => p.split('/').some(x => !x || x === '.' || x === '..') || /[\x00-\x1f\\:*?]/.test(p))) return fail('目录必须是仓库内的相对路径');
  return { repo, baseBranch, allowedPaths, contentCheck: v?.contentCheck !== false };
}
export function allowedPath(cfg: Pick<RepoConfig, 'allowedPaths'>, file: string) {
  return !cfg.allowedPaths.length || cfg.allowedPaths.some(p => file === p || file.startsWith(p + '/'));
}

/** Project business settings only. Runner credentials, leases and registrations belong to Agents. */
export class AgentStore {
  constructor(private readonly s: any) {}
  key(project: string) { return `nr-task-agent:${project}`; }
  async doc(project: string, tx?: any): Promise<AgentDoc> {
    return (await this.s.snapshot(this.key(project), tx)) || { revision: 0, agentId: null, repo: null };
  }
  async status(project: string, tx?: any, taskAgentId?: string) {
    const d = await this.doc(project, tx), agents = this.s.p.agents;
    const conn = tx?.connection || agents.tx.read();
    const options = (await agents.agents.listActive(conn)).filter(a => a.type === 'runner' && a.access === 'everyone');
    const agentId = taskAgentId || d.agentId;
    const selected = options.find(a => a.id === agentId);
    const availability = selected ? await agents.availability(conn, [selected]) : new Map();
    return { ...d, agentId, defaultAgentId: d.agentId, options: options.map(a => ({ id: a.id, name: a.name })), online: Boolean(selected && availability.get(selected.id)?.online) };
  }
  async taskAgent(agentId: unknown, actor: string, tx: any) {
    if (typeof agentId !== 'string' || !agentId.trim() || agentId.length > 100) return fail('请选择任务执行 Agent');
    const agents = this.s.p.agents;
    const agent = await agents.agents.findWorkable(tx.connection, agentId);
    if (!agent || agent.type !== 'runner' || agent.access !== 'everyone' || agent.archivedAt || !agents.agents.mayInvoke(agent, actor))
      return fail('请选择团队可调用的 Runner Agent', 409);
    return agent;
  }
  async online(project: string) { return (await this.status(project)).online; }
  private change(project: string, v: any, edit: (d: AgentDoc) => void) {
    return this.s.lock(project, 'agent', async tx => {
      const d = await this.doc(project, tx);
      if (v.revision !== d.revision) return fail('设置已在其他窗口更新，请刷新后再保存', 409);
      edit(d); d.revision++;
      await this.s.put(this.key(project), d, tx);
      return d;
    });
  }
  saveRepo(project: string, v: any) { const repo = repoInput(v); return this.change(project, v, d => { d.repo = repo; }); }
  removeRepo(project: string, v: any) { return this.change(project, v, d => { d.repo = null; }); }
  async select(project: string, v: any, actor: string) {
    const agent = await this.s.p.agents.agents.get(String(v.agentId || ''));
    if (agent.type !== 'runner' || agent.access !== 'everyone' || agent.archivedAt || !this.s.p.agents.agents.mayInvoke(agent, actor))
      return fail('请选择团队可调用的 Runner Agent', 409);
    return this.change(project, v, d => { d.agentId = agent.id; });
  }
}
