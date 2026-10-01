// Git and GitHub steps the program does itself (the agent never runs git): a cached clone per repository, one
// worktree per task branch, then commit, push and a PR that is always opened on the configured repository.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
export type RepoConfig = { repo: string; baseBranch: string; allowedPaths: string[]; contentCheck: boolean };
export type FileStat = { path: string; additions: number; deletions: number };
// Git asks the logged-in GitHub CLI for credentials, the same as `gh auth setup-git`.
const AUTH = ['-c', 'credential.helper=', '-c', 'credential.https://github.com.helper=!gh auth git-credential'];
export function sh(cmd: string, args: string[], cwd?: string, input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const c = execFile(cmd, args, { cwd, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => err ? reject(Object.assign(new Error(`${cmd} ${args.filter(a => !a.startsWith('credential')).slice(0, 4).join(' ')}: ${String(stderr || err.message).trim().slice(0, 600)}`), { stderr })) : resolve(String(stdout)));
    if (input !== undefined) { c.stdin?.end(input); }
  });
}
const git = (cwd: string, ...args: string[]) => sh('git', [...AUTH, ...args], cwd);
// An empty base branch means the repository's default branch, read once per run from GitHub.
export async function withBaseBranch(cfg: RepoConfig): Promise<RepoConfig> {
  if (cfg.baseBranch) return cfg;
  const name = (await sh('gh', ['repo', 'view', cfg.repo, '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'])).trim();
  if (!/^[A-Za-z0-9_./-]{1,100}$/.test(name)) throw new Error(`读不到 ${cfg.repo} 的默认分支，请确认这台电脑的 GitHub 登录能访问该仓库`);
  return { ...cfg, baseBranch: name };
}
export async function remoteBranchExists(cache: string, branch: string) { return (await git(cache, 'ls-remote', '--heads', 'origin', branch)).trim().length > 0; }
// Returns the worktree for the task's branch, based on the existing remote branch (follow-up runs, manual commits)
// or on the base branch for a first run.
export async function prepareWorktree(home: string, cfg: RepoConfig, branch: string, taskId: string): Promise<string> {
  const cache = join(home, 'repos', cfg.repo.replace('/', '__')), work = join(home, 'work', `task-${taskId}`);
  mkdirSync(join(home, 'repos'), { recursive: true }); mkdirSync(join(home, 'work'), { recursive: true });
  if (!existsSync(join(cache, '.git'))) await sh('gh', ['repo', 'clone', cfg.repo, cache, '--', '--filter=blob:none', '--no-checkout']);
  await git(cache, 'fetch', '--prune', 'origin', `+refs/heads/${cfg.baseBranch}:refs/remotes/origin/${cfg.baseBranch}`);
  const remote = await remoteBranchExists(cache, branch);
  if (remote) await git(cache, 'fetch', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`);
  if (existsSync(join(work, '.git'))) {
    await git(work, 'reset', '--hard'); await git(work, 'clean', '-fd');
    await git(work, 'checkout', '-B', branch, remote ? `origin/${branch}` : `origin/${cfg.baseBranch}`);
  } else {
    await git(cache, 'worktree', 'prune');
    await git(cache, 'worktree', 'add', '-B', branch, work, remote ? `origin/${branch}` : `origin/${cfg.baseBranch}`);
  }
  return work;
}
export async function changedFiles(work: string): Promise<string[]> {
  await git(work, 'add', '-A');
  return (await git(work, 'diff', '--cached', '--name-only')).split('\n').map(s => s.trim()).filter(Boolean);
}
export async function branchStats(work: string, base: string): Promise<FileStat[]> {
  return (await git(work, 'diff', '--numstat', `origin/${base}...HEAD`)).split('\n').filter(Boolean).map(l => { const [a, d, ...p] = l.split('\t'); return { path: p.join('\t'), additions: Number(a) || 0, deletions: Number(d) || 0 }; });
}
export async function commitAndPush(work: string, branch: string, message: string): Promise<string> {
  const name = (await sh('git', ['config', 'user.name'], work).catch(() => '')).trim(), email = (await sh('git', ['config', 'user.email'], work).catch(() => '')).trim();
  const who = name && email ? [] : ['-c', 'user.name=NocoReach Agent', '-c', 'user.email=agent@nocoreach.local'];
  await sh('git', [...who, 'commit', '-m', message], work);
  await git(work, 'push', '-u', 'origin', `HEAD:refs/heads/${branch}`);
  return (await git(work, 'rev-parse', 'HEAD')).trim();
}
// Reuses the open PR for the branch or opens one; `--repo` pins it to the configured repository (a fork's default
// would be the upstream repository).
export async function openPullRequest(cfg: RepoConfig, branch: string, title: string, body: string): Promise<{ url: string; number: number }> {
  const open = JSON.parse(await sh('gh', ['pr', 'list', '--repo', cfg.repo, '--head', branch, '--state', 'open', '--json', 'number,url']) || '[]');
  if (open[0]) return { url: open[0].url, number: open[0].number };
  const url = (await sh('gh', ['pr', 'create', '--repo', cfg.repo, '--base', cfg.baseBranch, '--head', branch, '--title', title, '--body-file', '-'], undefined, body)).trim().split('\n').pop()!.trim();
  const number = Number(url.split('/').pop());
  if (!url.startsWith(`https://github.com/${cfg.repo}/pull/`) || !Number.isSafeInteger(number)) throw new Error(`PR 地址异常：${url}`);
  return { url, number };
}
