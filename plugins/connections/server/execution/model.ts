import { createHash, randomUUID } from 'node:crypto';
import type { FlowSnapshot } from './flow';
export const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
export function text(v: unknown, max = 30000): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max) return fail('请填写完整内容，并检查长度');
  return v.trim();
}
export type Step = { id: string; title: string; owner: 'ai' | 'human' | 'local'; instruction: string; acceptance: string };
export type Plan = { deliverable: string; verification: string; steps: Step[] };
export type Artifact = { id: string; planVersion: number; stepId: string; content: string; version: number; createdAt: string; createdBy: string; runId?: string; legacy?: boolean; manual?: boolean; approvedAt?: string; approvedBy?: string; rejectedAt?: string };
export type Work = {
  schemaVersion: 2; boardState?: BoardState; sortOrder?: number; simple?: boolean; kind?: 'content' | 'research'; contentId?: string; revision: number; stage: string; plan: Plan | null; planVersion: number; approvedPlanVersion?: number;
  step: number; results: (Artifact | null)[]; history: any[]; operations: string[]; receipt: any; verification: any;
  humanOwnerId?: string; humanOwnerName?: string; latestRun?: { id: string; status: string }; legacyStatus?: string;
  // Flow tasks (stage 'flow'): the chosen flow before start, its snapshot after start, the current stage and the person's note to the AI.
  flowId?: string; flow?: FlowSnapshot; stageIndex?: number; note?: string; observeFrom?: string;
};
export type Run = { id: string; projectId: string; taskId: string; planVersion: number; stepId: string; baseArtifactId: string | null; baseRejectedAt?: string; ownerId: string; actor: string; executorId: 'atlas'; executorKind: 'online'; protocolVersion: 1; capabilitySnapshot: ['context.read', 'text.generate']; status: 'queued' | 'running' | 'succeeded' | 'failed'; createdAt: string; startedAt?: string; endedAt?: string; expiresAt?: string; input: string; model: { llmService: string; model: string }; artifactId?: string; error?: string; usage?: { inputTokens?: number; outputTokens?: number }; flowStage?: number; };
export function planInput(v: any): Plan {
  if (!v || !Array.isArray(v.steps) || v.steps.length < 1 || v.steps.length > 6) return fail('执行方案需要 1–6 个步骤');
  return { deliverable: text(v.deliverable, 2000), verification: text(v.verification, 3000), steps: v.steps.map((s: any) => {
    if (!s || !['ai', 'human', 'local'].includes(s.owner)) return fail('请选择有效的执行方式');
    return { id: randomUUID(), title: text(s.title, 200), owner: s.owner, instruction: text(s.instruction, 5000), acceptance: text(s.acceptance, 2000) };
  }) };
}
// Read-only projection: no writes, no invented owner, run, usage or approval.
export function projectWork(task: any): Work {
  const old = task.evidence?.work;
  if (old?.schemaVersion === 2) return structuredClone(old);
  const w: Work = { schemaVersion: 2, revision: old?.revision || 0, stage: old?.stage || (task.status === '已完成' ? 'done' : 'plan'), plan: null, planVersion: old?.plan ? 1 : 0, step: old?.step || 0, results: [], history: structuredClone(old?.history || []), operations: [...(old?.operations || [])], receipt: old?.receipt || null, verification: old?.verification || null, legacyStatus: task.status };
  if (old?.plan) {
    w.plan = { ...structuredClone(old.plan), steps: old.plan.steps.map((s: any, i: number) => ({ ...s, id: `legacy-step-${i}` })) };
    if (w.stage !== 'plan') w.approvedPlanVersion = 1;
  }
  w.results = (old?.results || []).map((r: any, i: number) => r ? ({ ...r, id: `legacy-artifact-${i}`, planVersion: 1, stepId: `legacy-step-${i}`, version: 1, createdAt: r.savedAt || '', createdBy: '', legacy: true }) : null);
  return w;
}
export function digest(value: unknown): string {
  const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function currentStep(w: Work): Step {
  if (w.stage !== 'work' || !w.plan || w.approvedPlanVersion !== w.planVersion || !w.plan.steps[w.step]) return fail('请先确认当前方案', 409);
  return w.plan.steps[w.step];
}
export function assertReview(w: Work, artifactId: unknown): Artifact {
  currentStep(w);
  const result = w.results[w.step];
  if (!result || result.id !== artifactId || result.planVersion !== w.planVersion || result.rejectedAt) return fail('成果版本已改变或已打回，请刷新后审核', 409);
  return result;
}
export function makeArtifact(w: Work, content: unknown, actor: string, now: string, versions: Artifact[], runId?: string): Artifact {
  const step = currentStep(w);
  return { id: randomUUID(), stepId: step.id, planVersion: w.planVersion, version: 1 + Math.max(0, ...versions.filter(a => a.stepId === step.id && a.planVersion === w.planVersion).map(a => a.version)), content: text(content), createdAt: now, createdBy: actor, ...(runId ? { runId } : {}) };
}
export function canApplyRun(w: Work, run: Run): boolean {
  if (run.flowStage !== undefined) return w.stage === 'flow' && w.stageIndex === run.flowStage && w.flow?.stages[run.flowStage]?.key === run.stepId && w.humanOwnerId === run.ownerId && (w.results[run.flowStage]?.id || null) === run.baseArtifactId && w.results[run.flowStage]?.rejectedAt === run.baseRejectedAt;
  return w.stage === 'work' && w.planVersion === run.planVersion && w.approvedPlanVersion === run.planVersion && w.plan?.steps[w.step]?.id === run.stepId && w.humanOwnerId === run.ownerId && (w.results[w.step]?.id || null) === run.baseArtifactId && w.results[w.step]?.rejectedAt === run.baseRejectedAt;
}

export type BoardState = 'todo' | 'doing' | 'review' | 'done';
export function boardState(w: Work): BoardState {
  if (w.boardState) return w.boardState;
  if (w.stage === 'done') return 'done';
  // Flow tasks: stages done by online AI or a local Agent are in progress, stages waiting on a person need confirmation.
  if (w.stage === 'flow') { const kind = w.flow?.stages[w.stageIndex || 0]?.kind; return kind === 'review' || kind === 'publish' ? 'review' : 'doing'; }
  if (w.stage === 'verification') return w.receipt?.note ? 'done' : 'review';
  if (w.stage === 'execution') return 'review';
  if (w.stage === 'work') return w.results[w.step] && !w.results[w.step]?.rejectedAt ? 'review' : 'doing';
  return 'todo';
}
export function contentInput(v: any, domains: string[]) {
  let url: URL;
  try { url = new URL(text(v.url, 2000)); } catch { return fail('请填写完整页面网址'); }
  const hosts = domains.map(d => { try { return new URL(d.includes('://') ? d : 'https://' + d).hostname; } catch { return ''; } });
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !hosts.includes(url.hostname)) return fail('页面必须属于当前项目已配置的网站');
  url.hash = '';
  const repository = typeof v.repository === 'string' ? v.repository.trim() : '';
  if (repository && !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) return fail('仓库请填写 owner/repository');
  if (!Array.isArray(v.paths) || v.paths.length > 20) return fail('请提供最多 20 个相对文件路径');
  const paths = [...new Set<string>(v.paths.map((p: unknown) => text(p, 1000)))];
  if (paths.some(p => p.startsWith('/') || p.includes('\\') || p.split('/').some(x => !x || x === '.' || x === '..') || /[\x00-\x1f:]/.test(p))) return fail('文件路径必须是仓库内的相对路径');
  if (paths.length && !repository) return fail('填写文件路径前请先指定仓库');
  return { id: digest(url.href), url: url.href, title: text(v.title, 300), repository, paths };
}
