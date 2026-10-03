// Git and GitHub steps the program does itself (the agent never runs git): a cached clone per repository, one
// worktree per task branch, then commit, push and a PR that is always opened on the configured repository.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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
// The working folder of an analysis without a repository: emptied before each run, outside every repository.
export function scratchDir(home: string, taskId: string): string {
  const dir = join(home, 'work', `analysis-${taskId}`);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  return dir;
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
// Before/after text of changed text files, for the change comparison on the task page (at most ten files).
const TEXT = /\.(md|mdx|markdown|astro|html?|json|ya?ml|txt|tsx?|jsx?|vue|svelte|css|scss)$/i, LIMIT = 60000;
export async function fileChanges(work: string, base: string, files: string[]) {
  const out: { path: string; before: string; after: string; truncated?: boolean }[] = [];
  for (const path of files.filter(f => TEXT.test(f)).slice(0, 10)) {
    const before = await git(work, 'show', `origin/${base}:${path}`).catch(() => '');
    let after = ''; try { after = readFileSync(join(work, path), 'utf8'); } catch { /* deleted */ }
    out.push({ path, before: before.slice(0, LIMIT), after: after.slice(0, LIMIT), ...(before.length > LIMIT || after.length > LIMIT ? { truncated: true } : {}) });
  }
  return out;
}
// The note Claude Code ends a change with: release note, a sentence to look for on the live page, and the pages.
export function parseNote(summary: string) {
  const pick = (label: string) => { const m = summary.match(new RegExp(`^\\s*${label}[：:]\\s*(.+)$`, 'm')); return m ? m[1].trim() : ''; };
  const release = pick('发布说明'), verifyText = pick('核对文字').replace(/^[“"「]|[”"」]$/g, ''), pages = pick('页面').split(/[,，、\s]+/).map(s => s.trim()).filter(s => s.startsWith('/') || s.startsWith('https://')).slice(0, 10);
  const body = summary.split('\n').filter(l => !/^\s*(发布说明|核对文字|页面)[：:]/.test(l)).join('\n').trim();
  return { body, release, verifyText, pages };
}
const coded = (code: string, message: string) => Object.assign(new Error(message), { code });
// Merges the PR only if its head is still the commit you reviewed; uses the repository's allowed merge method.
export async function mergePullRequest(cfg: RepoConfig, number: number, headSha: string): Promise<{ sha?: string }> {
  const view = async () => JSON.parse(await sh('gh', ['pr', 'view', String(number), '--repo', cfg.repo, '--json', 'state,headRefOid,mergeCommit']));
  let pr = await view();
  if (pr.state === 'MERGED') return { sha: pr.mergeCommit?.oid };
  if (pr.state !== 'OPEN') throw coded('pr_closed', `PR #${number} 已被关闭，不能合并`);
  if (pr.headRefOid !== headSha) throw coded('head_changed', 'PR 在你看过之后又有新的提交，请回到上一步重新看效果');
  const s = JSON.parse(await sh('gh', ['repo', 'view', cfg.repo, '--json', 'squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed']));
  const method = s.squashMergeAllowed ? '--squash' : s.mergeCommitAllowed ? '--merge' : '--rebase';
  try { await sh('gh', ['pr', 'merge', String(number), '--repo', cfg.repo, method, '--match-head-commit', headSha]); }
  catch (e: any) { throw coded('merge_failed', `GitHub 没有完成合并：${String(e?.stderr || e?.message || '').trim().slice(0, 240)}`); }
  pr = await view();
  if (pr.state !== 'MERGED') throw coded('merge_pending', 'GitHub 还没有完成合并，可能在等检查通过');
  return { sha: pr.mergeCommit?.oid };
}
// Closes a cancelled task's PR and leaves its branch; an already closed or merged PR needs nothing.
export async function closePullRequest(cfg: RepoConfig, number: number) {
  const pr = JSON.parse(await sh('gh', ['pr', 'view', String(number), '--repo', cfg.repo, '--json', 'state']));
  if (pr.state !== 'OPEN') return;
  await sh('gh', ['pr', 'close', String(number), '--repo', cfg.repo, '--comment', 'NocoReach：任务已取消，PR 已关闭，分支保留。']);
}
// 撤回: GitHub's own revert of a merged PR (the Revert button on the PR page), which opens a new branch and PR that undo
// it. A revert PR already open for the same PR (GitHub names its branch revert-<number>-…) is reused.
export async function revertPullRequest(cfg: RepoConfig, number: number, title: string): Promise<{ url: string; number: number }> {
  const pr = JSON.parse(await sh('gh', ['pr', 'view', String(number), '--repo', cfg.repo, '--json', 'id,state']));
  if (pr.state !== 'MERGED') throw coded('not_merged', `PR #${number} 还没有合并，不需要撤回`);
  const open = JSON.parse(await sh('gh', ['pr', 'list', '--repo', cfg.repo, '--state', 'open', '--limit', '100', '--json', 'number,url,headRefName']) || '[]');
  const found = open.find((p: any) => String(p.headRefName || '').startsWith(`revert-${number}-`));
  let out = found ? { url: String(found.url), number: Number(found.number) } : null;
  if (!out) {
    const query = 'mutation($id:ID!,$title:String!,$body:String!){revertPullRequest(input:{pullRequestId:$id,title:$title,body:$body}){revertPullRequest{number url}}}';
    const res = JSON.parse(await sh('gh', ['api', 'graphql', '-f', `query=${query}`, '-f', `id=${pr.id}`, '-f', `title=撤回：${title}`.slice(0, 120), '-f', `body=由 NocoReach 撤回 #${number}。合并这个 PR 后，那次改动就从网站上撤掉了。`]));
    const r = res?.data?.revertPullRequest?.revertPullRequest;
    if (!r) throw coded('revert_failed', `GitHub 没有开出回退 PR：${String(res?.errors?.[0]?.message || '').slice(0, 240)}`);
    out = { url: String(r.url), number: Number(r.number) };
  }
  if (!out.url.startsWith(`https://github.com/${cfg.repo}/pull/`) || !Number.isSafeInteger(out.number)) throw new Error(`PR 地址异常：${out.url}`);
  return out;
}
// A preview link for the PR's commit: a deployment status first, then well-known preview hosts in statuses or comments.
export function pickPreview(text: string) { const m = text.match(/https:\/\/[a-z0-9.-]+\.(vercel\.app|netlify\.app|pages\.dev|onrender\.com|surge\.sh)[^\s)"'<>\]]*/i); return m ? m[0] : ''; }
export async function findPreview(cfg: RepoConfig, number: number, headSha: string) {
  const json = async (args: string[], empty: any) => { try { return JSON.parse(await sh('gh', args) || 'null') ?? empty; } catch { return empty; } };
  for (const d of (await json(['api', `repos/${cfg.repo}/deployments?sha=${headSha}&per_page=10`], [])).slice(0, 10)) {
    const ok = (await json(['api', `repos/${cfg.repo}/deployments/${d.id}/statuses?per_page=5`], [])).find((x: any) => x.state === 'success' && (x.environment_url || x.target_url));
    if (ok) return String(ok.environment_url || ok.target_url);
  }
  const statuses = (await json(['api', `repos/${cfg.repo}/commits/${headSha}/status`], {})).statuses || [];
  const comments = (await json(['pr', 'view', String(number), '--repo', cfg.repo, '--json', 'comments'], {})).comments || [];
  return pickPreview([...statuses.map((x: any) => x.target_url || ''), ...comments.map((c: any) => c.body || '')].join('\n'));
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
