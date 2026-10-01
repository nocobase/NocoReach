// One claimed run: prepare the task's worktree, run Claude Code for the step, then (build steps) check, commit,
// push and open or update the PR. Progress is reported every two seconds; the server's answer says whether to stop.
import { call } from './api';
import type { Config } from './config';
import { HOME } from './config';
import { runClaude, type AgentEvent } from './claude';
import { buildPrompt } from './prompt';
import { prepareWorktree, changedFiles, branchStats, commitAndPush, openPullRequest } from './repo';
import { contentCheck } from './checks';
export type Claimed = { id: string; taskId: string; mode: 'plan' | 'build'; branch: string; input: any };
export async function execute(cfg: Config, run: Claimed, tools: Record<string, string>, log: (s: string) => void) {
  const pending: AgentEvent[] = []; let stop = false, kill: (() => void) | null = null;
  const report = (type: AgentEvent['type'], text: string) => { pending.push({ type, text, at: new Date().toISOString() }); log(`[${type}] ${text.slice(0, 160)}`); };
  const flush = async () => { const events = pending.splice(0, pending.length); try { const r = await call<{ stop: boolean }>(cfg, 'events', { taskId: run.taskId, runId: run.id, events }, tools); if (r.stop && !stop) { stop = true; kill?.(); log('服务器要求停止'); } } catch (e: any) { log(`回传失败：${e.message}`); } };
  const timer = setInterval(() => void flush(), 2000);
  const finish = async (body: object) => { clearInterval(timer); await flush(); await call(cfg, 'finish', { taskId: run.taskId, runId: run.id, ...body }, tools); };
  try {
    const repo = run.input.repo;
    report('status', `准备工作副本：${repo.repo}，分支 ${run.branch}`);
    const work = await prepareWorktree(HOME, repo, run.branch, run.taskId);
    if (stop) return finish({ ok: false, error: 'cancelled' });
    report('status', run.mode === 'plan' ? '开始阅读仓库并写方案' : '开始修改');
    const claude = runClaude({ cwd: work, prompt: buildPrompt(run.input), mode: run.mode, onEvent: e => pending.push(e) });
    kill = claude.kill;
    const result = await claude.result;
    if (stop) return finish({ ok: false, error: 'cancelled' });
    if (!result.ok) { report('error', result.error || 'Claude Code 没有完成'); return finish({ ok: false, error: 'agent_failed' }); }
    if (run.mode === 'plan') return finish({ ok: true, content: result.summary || '（Agent 没有写出方案）' });
    const files = await changedFiles(work);
    if (!files.length) { report('error', '没有任何文件被修改'); return finish({ ok: false, error: 'no_changes' }); }
    const outside = repo.allowedPaths?.length ? files.filter((f: string) => !repo.allowedPaths.some((p: string) => f === p || f.startsWith(p + '/'))) : [];
    if (outside.length) report('status', `超出允许范围的改动：${outside.join('、')}（会在审核时标出）`);
    const checks = repo.contentCheck ? contentCheck(work, files) : { ok: true, summary: '未开启检查' };
    report(checks.ok ? 'status' : 'error', checks.summary);
    if (stop) return finish({ ok: false, error: 'cancelled' });
    report('status', `提交并推送 ${files.length} 个文件`);
    const headSha = await commitAndPush(work, run.branch, `NocoReach: ${String(run.input.title || '任务').slice(0, 72)}`);
    const body = `由 NocoReach 任务自动创建。\n\n${result.summary}\n\n---\n检查：${checks.summary}`;
    const pr = await openPullRequest(repo, run.branch, String(run.input.title || 'NocoReach 任务').slice(0, 120), body);
    report('status', `PR：${pr.url}`);
    const stats = await branchStats(work, repo.baseBranch);
    return finish({ ok: true, content: `${result.summary}\n\nPR：${pr.url}`, pr: { ...pr, branch: run.branch, headSha, files: stats, checks } });
  } catch (e: any) {
    report('error', String(e?.message || e).slice(0, 400));
    await finish({ ok: false, error: stop ? 'cancelled' : 'agent_failed' }).catch(() => undefined);
  } finally { clearInterval(timer); }
}
