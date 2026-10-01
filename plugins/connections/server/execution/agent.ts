import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { fail, text } from './model';

// Local Agent connection (SPEC §10): computers that run the NocoReach Agent program, and the repository it works on.
// A computer authenticates with a key shown once when it is connected; only the key's hash is stored.
export type Computer = { id: string; name: string; keyHash: string; createdAt: string; lastSeenAt?: string; version?: string; tools?: Record<string, string>; revokedAt?: string };
export type RepoConfig = { repo: string; baseBranch: string; allowedPaths: string[]; contentCheck: boolean };
export type AgentDoc = { revision: number; computers: Computer[]; repo: RepoConfig | null };
export const ONLINE_MS = 60_000;
const hash = (key: string) => createHash('sha256').update(key).digest('hex');
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9_./-]{1,100}$/;

// Cleans repository settings; an empty path list means the whole repository may change.
export function repoInput(v: any): RepoConfig {
  const repo = text(v?.repo, 201);
  if (!REPO.test(repo)) return fail('仓库请填写 owner/repository');
  const baseBranch = typeof v?.baseBranch === 'string' && v.baseBranch.trim() ? v.baseBranch.trim() : 'main';
  if (!BRANCH.test(baseBranch)) return fail('基础分支名称无效');
  if (v?.allowedPaths !== undefined && (!Array.isArray(v.allowedPaths) || v.allowedPaths.length > 20)) return fail('允许修改的目录最多 20 个');
  const allowedPaths = [...new Set<string>((v?.allowedPaths || []).map((p: unknown) => text(p, 200).replace(/^\/+|\/+$/g, '')))];
  if (allowedPaths.some(p => p.split('/').some(x => !x || x === '.' || x === '..') || /[\x00-\x1f\\:*?]/.test(p))) return fail('目录必须是仓库内的相对路径');
  return { repo, baseBranch, allowedPaths, contentCheck: v?.contentCheck !== false };
}

// Whether a changed file is inside the allowed directories (empty list: anywhere in the repository).
export function allowedPath(cfg: Pick<RepoConfig, 'allowedPaths'>, file: string) {
  return !cfg.allowedPaths.length || cfg.allowedPaths.some(p => file === p || file.startsWith(p + '/'));
}

export class AgentStore {
  constructor(private readonly s: { snapshot(key: string, tx?: any): Promise<any>; put(key: string, payload: any, tx: any): Promise<void>; lock<T>(project: string, task: string, fn: (tx: any) => Promise<T>): Promise<T> }) {}
  key(project: string) { return `nr-agent:${project}`; }
  async doc(project: string, tx?: any): Promise<AgentDoc> { return (await this.s.snapshot(this.key(project), tx)) || { revision: 0, computers: [], repo: null }; }
  // Settings changes move the revision; a heartbeat (last seen, tool versions) does not, so it never conflicts with an edit.
  private change<T>(project: string, fn: (d: AgentDoc, at: string) => T, revision?: unknown, bump = true) {
    return this.s.lock(project, 'agent', async tx => {
      const d = await this.doc(project, tx);
      if (revision !== undefined && revision !== d.revision) return fail('设置已在其他窗口更新，请刷新后再保存', 409);
      const out = fn(d, new Date().toISOString()); if (bump) d.revision++;
      await this.s.put(this.key(project), d, tx);
      return out;
    });
  }
  // What the Agent page shows; key hashes never leave the server.
  async status(project: string) {
    const d = await this.doc(project), now = Date.now();
    return { revision: d.revision, repo: d.repo, computers: d.computers.filter(c => !c.revokedAt).map(({ keyHash, ...c }) => ({ ...c, online: Boolean(c.lastSeenAt && now - Date.parse(c.lastSeenAt) < ONLINE_MS) })) };
  }
  async online(project: string) { return (await this.status(project)).computers.some(c => c.online); }
  connect(project: string, v: any) {
    const name = typeof v?.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 60) : '我的电脑';
    return this.change(project, (d, at) => {
      if (d.computers.filter(c => !c.revokedAt).length >= 10) return fail('最多连接 10 台电脑', 409);
      const key = `nra_${randomBytes(24).toString('base64url')}`, computer: Computer = { id: randomUUID(), name, keyHash: hash(key), createdAt: at };
      d.computers.push(computer);
      return { key, computerId: computer.id };
    });
  }
  revoke(project: string, v: any) {
    return this.change(project, (d, at) => {
      const c = d.computers.find(x => x.id === v?.computerId && !x.revokedAt);
      if (!c) return fail('电脑不存在或已断开', 404);
      c.revokedAt = at; return { ok: true };
    });
  }
  saveRepo(project: string, v: any) { const repo = repoInput(v); return this.change(project, d => { d.repo = repo; return { repo }; }, v?.revision); }
  // Daemon requests: the key identifies the computer; every call also records that it is alive.
  authenticate(project: string, key: unknown, info?: { version?: unknown; tools?: unknown; name?: unknown }) {
    if (typeof key !== 'string' || !key.startsWith('nra_')) return fail('电脑密钥无效', 401);
    return this.change(project, (d, at) => {
      const c = d.computers.find(x => x.keyHash === hash(key) && !x.revokedAt);
      if (!c) return fail('电脑密钥无效或已断开', 401);
      c.lastSeenAt = at;
      if (typeof info?.version === 'string') c.version = info.version.slice(0, 40);
      if (info?.tools && typeof info.tools === 'object') c.tools = Object.fromEntries(Object.entries(info.tools as Record<string, unknown>).filter(([, v]) => typeof v === 'string').slice(0, 5).map(([k, v]) => [k.slice(0, 20), String(v).slice(0, 60)]));
      return { computer: { id: c.id, name: c.name }, repo: d.repo };
    }, undefined, false);
  }
}
