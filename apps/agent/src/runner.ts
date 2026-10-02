// One claimed run: prepare the task's worktree, run Claude Code for the step, then (build steps) check, commit,
// push and open or update the PR. Progress is reported every two seconds; the server's answer says whether to stop.
import { call } from './api';
import type { Config } from './config';
import { HOME } from './config';
import { runClaude, type AgentEvent } from './claude';
import { buildPrompt } from './prompt';
import { prepareWorktree, changedFiles, branchStats, commitAndPush, openPullRequest, withBaseBranch, fileChanges, parseNote, mergePullRequest, closePullRequest } from './repo';
import { contentCheck } from './checks';
import { writeKnowledge, type KnowledgeItem } from './knowledge';
import { writeSkills, type SkillItem } from './skills';
export type Claimed = { id: string; taskId: string; mode: 'plan' | 'build' | 'merge' | 'close'; branch: string; input: any; knowledge?: KnowledgeItem[]; skills?: SkillItem[] };
export async function execute(cfg: Config, run: Claimed, tools: Record<string, string>, log: (s: string) => void) {
  const pending: AgentEvent[] = []; let stop = false, kill: (() => void) | null = null;
  const report = (type: AgentEvent['type'], text: string) => { pending.push({ type, text, at: new Date().toISOString() }); log(`[${type}] ${text.slice(0, 160)}`); };
  const flush = async () => { const events = pending.splice(0, pending.length); try { const r = await call<{ stop: boolean }>(cfg, 'events', { taskId: run.taskId, runId: run.id, events }, tools); if (r.stop && !stop) { stop = true; kill?.(); log('服务器要求停止'); } } catch (e: any) { log(`回传失败：${e.message}`); } };
  const timer = setInterval(() => void flush(), 2000);
  const finish = async (body: object) => { clearInterval(timer); await flush(); await call(cfg, 'finish', { taskId: run.taskId, runId: run.id, ...body }, tools); };
  try {
    if (run.mode === 'close') {
      report('status', `关闭 PR #${run.input.pr.number}（任务已取消）`);
      try { await closePullRequest(run.input.repo, run.input.pr.number); return finish({ ok: true }); }
      catch (e: any) { report('error', e.message); return finish({ ok: false, error: 'close_failed', message: e.message }); }
    }
    if (run.mode === 'merge') {
      const pr = run.input.pr;
      report('status', `合并 PR #${pr.number}（你看过的提交 ${String(pr.headSha).slice(0, 7)}）`);
      try { const merged = await mergePullRequest(run.input.repo, pr.number, pr.headSha); report('status', '已合并'); return finish({ ok: true, merged }); }
      catch (e: any) { report('error', e.message); return finish({ ok: false, error: e.code || 'merge_failed', message: e.message }); }
    }
    const repo = await withBaseBranch(run.input.repo);
    report('status', `准备工作副本：${repo.repo}（基于 ${repo.baseBranch}），分支 ${run.branch}`);
    const work = await prepareWorktree(HOME, repo, run.branch, run.taskId);
    if (stop) return finish({ ok: false, error: 'cancelled' });
    report('status', run.mode === 'plan' ? (run.input?.step === 'analyze' ? '开始分析' : '开始阅读仓库并写方案') : '开始修改');
    const kb = await writeKnowledge(run.knowledge);
    if (kb) report('status', `知识库 ${kb.files.length} 份资料已放到仓库外的临时目录，需要时查阅`);
    let result, sk;
    try {
      sk = await writeSkills(run.skills);
      if (sk) report('status', `Skills：${sk.skills.map(s => s.required ? `${s.name}（这一步要用）` : s.name).join('、')}`);
      const input = { ...run.input, ...(kb ? { knowledge: { dir: kb.dir, files: kb.files, omitted: kb.omitted } } : {}), ...(sk ? { skills: { dir: sk.dir, list: sk.skills, omitted: sk.omitted } } : {}) };
      const claude = runClaude({ cwd: work, prompt: buildPrompt(input), mode: run.mode, addDirs: [kb?.dir, sk?.dir].filter((d): d is string => Boolean(d)), pluginDirs: sk ? [sk.dir] : [], onEvent: e => pending.push(e) });
      kill = claude.kill;
      result = await claude.result;
    } finally { await kb?.cleanup(); await sk?.cleanup(); }
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
    const note = parseNote(result.summary || ''), changes = await fileChanges(work, repo.baseBranch, files);
    const body = `由 NocoReach 任务自动创建。\n\n${note.body}${note.release ? `\n\n发布说明：${note.release}` : ''}\n\n---\n检查：${checks.summary}`;
    const pr = await openPullRequest(repo, run.branch, String(run.input.title || 'NocoReach 任务').slice(0, 120), body);
    report('status', `PR：${pr.url}`);
    const stats = await branchStats(work, repo.baseBranch);
    return finish({ ok: true, content: `${note.body}\n\nPR：${pr.url}`, pr: { ...pr, branch: run.branch, headSha, files: stats, checks, release: note.release, verifyText: note.verifyText, pages: note.pages, changes } });
  } catch (e: any) {
    report('error', String(e?.message || e).slice(0, 400));
    await finish({ ok: false, error: stop ? 'cancelled' : 'agent_failed' }).catch(() => undefined);
  } finally { clearInterval(timer); }
}
