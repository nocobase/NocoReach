// @ts-nocheck
import type { TaskResultSource } from '../../../shared/task-result.js';
import { systemMessageText } from '../../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { createHash, randomUUID } from 'node:crypto';
import type { FlowSnapshot } from './flow';
import type { PlaybookSnapshot } from './playbook';
export const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
export function text(v: unknown, max = 30000): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max) return fail(systemMessageText('taskWork.fillFullContentCheckLength'));
  return v.trim();
}
export type Step = { id: string; title: string; owner: 'human' | 'local'; instruction: string; acceptance: string };
export type Plan = { deliverable: string; verification: string; steps: Step[] };
export type Artifact = { report?:{kind:string;sources:TaskResultSource[];asOf:string;uncertainties:string[]}; id: string; planVersion: number; stepId: string; content: string; version: number; createdAt: string; createdBy: string; runId?: string; legacy?: boolean; manual?: boolean; approvedAt?: string; approvedBy?: string; rejectedAt?: string; pr?: PullRequestInfo; article?: any };
// What the local Agent program reports for a build step: the PR it opened or updated, the files and the checks.
// release/verifyText/pages come from the Agent's change note; changes hold before/after text of changed text files.
export type FileChange = { path: string; before: string; after: string; truncated?: boolean };
// What a visitor or a search result shows before and after, in plain words, for an owner who does not read code.
export type VisibleChange = { page: string; label: string; before: string; after: string };
export type PullRequestInfo = { url: string; number: number; branch: string; headSha?: string; files: { path: string; additions: number; deletions: number }[]; checks?: { ok: boolean; summary: string }; outOfScope?: string[]; release?: string; verifyText?: string; pages?: string[]; changes?: FileChange[]; visibleChanges?: VisibleChange[]; previewUrl?: string };
// Release (SPEC §6.0): after you publish, the local Agent merges the reviewed commit and the system checks the live pages.
// Article releases (article-flow.ts) publish to a target instead of merging: publishing, then exporting when the target
// exports to a repository, then verifying; publish_failed, publish_conflict and export_late wait for a person.
export type Release = { state: 'simulated' | 'merging' | 'merge_failed' | 'verifying' | 'not_seen' | 'live' | 'publishing' | 'publish_failed' | 'publish_conflict' | 'exporting' | 'export_late'; article?: any; pr?: { number: number; url: string; headSha: string }; note: string; pages: string[]; verifyText?: string; error?: string; mergedAt?: string; mergeSha?: string; checks?: number; lastCheckAt?: string; nextCheckAt?: string; deadline?: string; liveAt?: string; reason?: string };
export type Work = {
  schemaVersion: 2; boardState?: BoardState; sortOrder?: number; simple?: boolean; kind?: 'content' | 'research'; contentId?: string; revision: number; stage: string; plan: Plan | null; planVersion: number; approvedPlanVersion?: number;
  step: number; results: (Artifact | null)[]; history: any[]; operations: string[]; receipt: any; verification: any;
  agentId?: string; agentName?: string;
  humanOwnerId?: string; humanOwnerName?: string; collaborators?: { id: string; name: string }[]; page?: { url: string; title: string }; latestRun?: { id: string; status: string }; legacyStatus?: string;
  // Flow tasks (stage 'flow'): the chosen flow before start, its snapshot after start, the current stage and the person's note to the AI.
  flowId?: string; flow?: FlowSnapshot; stageIndex?: number; note?: string; observeFrom?: string; release?: Release; cancelledAt?: string; cancelledBy?: string; archivedAt?: string; archivedBy?: string; snooze?: import('../../../shared/task-pending.js').TaskSnooze | null; prClose?: { number: number; state: 'closing' | 'closed' | 'failed'; error?: string }; revert?: { of: number; state: 'opening' | 'opened' | 'failed'; number?: number; url?: string; at?: string; error?: string }; observation?: { results: import('./effect').EffectResult[] };
  // The website repository the task changes, kept at its start (2026-10-29, shared/repo-routing.ts); null when it
  // changes none. Tasks started before then have none kept.
  repo?: import('../../../shared/repo-routing.js').TaskRepo | null;
  // The playbook chosen before start, its snapshot after start, and the tasks linked by a hand-over.
  playbookId?: string; playbook?: PlaybookSnapshot; prevTaskId?: string; nextTaskId?: string;
  // Article delivery: the article linked before start, and the choice frozen at start (article-flow.ts).
  article?: { targetId: string; articleId: string | null; slug: string; title: string; sourceKey: string | null; linkedAt: string; locales?: string[] };
  // `locales`: the languages chosen at start, primary first (2026-10-24); the Agent writes the primary, and once a person
  // approves it, `translateFrom` holds that approved version while the Agent translates it into the others. A
  // translation playbook (2026-10-25) sets `translateFrom` at start from the article as published (`published`).
  delivery?: { kind: 'article'; targetId: string; articleId: string | null; sourceKey: string | null; also?: { targetId: string; articleId: string | null; sourceKey: string | null }[]; locales?: string[]; translateFrom?: { artifactId: string | null; at: string; by: string; draft: any; text: { title: string; description: string; body: string }; fields: string[]; published?: boolean } };
};
/** A transcript event of a demo run, as the demo Agent plays it back (`demo-data/demo-agent.ts`). */
export type RunEvent = { seq: number; at: string; type: string; content?: string; tool?: string; input?: unknown; output?: unknown; meta?: Record<string, unknown> };
// A failed run keeps the official reason (`failureReason`), and `partialAt` says the content the Agent got before it
// stopped was kept under the `partial` key (TaskService.finish).
export type Run = { demoAgentId?: string; simulated?: boolean; transcript?: RunEvent[]; errorDetail?: string; agentId?: string; agentName?: string; id: string; projectId: string; taskId: string; planVersion: number; stepId: string; baseArtifactId: string | null; baseRejectedAt?: string; ownerId: string; actor: string; inputVersion: 1; capabilitySnapshot: string[]; runtimeRunId?: string; pluginRunId?: string; pluginSettled?: boolean; cancelRequested?: boolean; mode?: 'plan' | 'build' | 'article' | 'merge' | 'close' | 'revert'; branch?: string; status: 'queued' | 'running' | 'succeeded' | 'failed'; createdAt: string; startedAt?: string; endedAt?: string; input: string; model: { llmService: string; model: string }; artifactId?: string; error?: string; usage?: { inputTokens?: number; outputTokens?: number }; flowStage?: number; restartedAt?: string; autoRetry?: { of: string; restartedAt: string }; failureReason?: string; partialAt?: string; };
export function planInput(v: any): Plan {
  if (!v || !Array.isArray(v.steps) || v.steps.length < 1 || v.steps.length > 6) return fail(systemMessageText('taskWork.planNeeds16Steps'));
  return { deliverable: text(v.deliverable, 2000), verification: text(v.verification, 3000), steps: v.steps.map((s: any) => {
    if (!s || !['human', 'local'].includes(s.owner)) return fail(systemMessageText('taskExecution.pickValidExecutionMode'));
    return { id: randomUUID(), title: text(s.title, 200), owner: s.owner, instruction: text(s.instruction, 5000), acceptance: text(s.acceptance, 2000) };
  }) };
}
// Read-only projection: no writes, no invented owner, run, usage or approval.
export function projectWork(task: any): Work {
  const old = task.evidence?.work;
  if (old?.schemaVersion === 2) return structuredClone(old);
  const w: Work = { schemaVersion: 2, revision: old?.revision || 0, stage: old?.stage || (task.status === '已完成' ? 'done' : 'plan'), plan: null, planVersion: old?.plan ? 1 : 0, step: old?.step || 0, results: [], history: structuredClone(old?.history || []), operations: [...(old?.operations || [])], receipt: old?.receipt || null, verification: old?.verification || null, legacyStatus: task.status };
  // A new task belongs to whoever created it (2026-10-08); older tasks keep no owner until someone takes them.
  const by = task.evidence?.createdBy;
  if (!old && by?.id) { w.humanOwnerId = String(by.id); w.humanOwnerName = String(by.name || by.id); }
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
  if (w.stage !== 'work' || !w.plan || w.approvedPlanVersion !== w.planVersion || !w.plan.steps[w.step]) return fail(systemMessageText('taskExecution.confirmCurrentPlanFirst'), 409);
  return w.plan.steps[w.step];
}
export function assertReview(w: Work, artifactId: unknown): Artifact {
  currentStep(w);
  const result = w.results[w.step];
  if (!result || result.id !== artifactId || result.planVersion !== w.planVersion || result.rejectedAt) return fail(systemMessageText('taskExecution.deliverableVersionChangedSentBack'), 409);
  return result;
}
export function makeArtifact(w: Work, content: unknown, actor: string, now: string, versions: Artifact[], runId?: string): Artifact {
  const step = currentStep(w);
  return { id: randomUUID(), stepId: step.id, planVersion: w.planVersion, version: 1 + Math.max(0, ...versions.filter(a => a.stepId === step.id && a.planVersion === w.planVersion).map(a => a.version)), content: text(content), createdAt: now, createdBy: actor, ...(runId ? { runId } : {}) };
}
export function canApplyRun(w: Work, run: Run): boolean {
  if (w.cancelledAt || run.cancelRequested) return false;
  if (run.flowStage !== undefined) return w.stage === 'flow' && w.stageIndex === run.flowStage && w.flow?.stages[run.flowStage]?.key === run.stepId && w.humanOwnerId === run.ownerId && (w.results[run.flowStage]?.id || null) === run.baseArtifactId && w.results[run.flowStage]?.rejectedAt === run.baseRejectedAt;
  return w.stage === 'work' && w.planVersion === run.planVersion && w.approvedPlanVersion === run.planVersion && w.plan?.steps[w.step]?.id === run.stepId && w.humanOwnerId === run.ownerId && (w.results[w.step]?.id || null) === run.baseArtifactId && w.results[w.step]?.rejectedAt === run.baseRejectedAt;
}

export type BoardState = 'todo' | 'doing' | 'review' | 'done';
export function boardState(w: Work): BoardState {
  if (w.cancelledAt) return 'done';
  if (w.boardState) return w.boardState;
  if (w.stage === 'done') return 'done';
  // Flow tasks: stages done by a Runner agent are in progress, stages waiting on a person need confirmation.
  // The automatic release waits for you only when the merge failed or the change was not seen online.
  // Once live, watching the effect is the system's job: the task counts as done for you.
  if (w.stage === 'flow') { const kind = w.flow?.stages[w.stageIndex || 0]?.kind; if (kind === 'observe') return 'done'; return kind === 'review' || kind === 'publish' || (kind === 'release' && ['merge_failed', 'not_seen', 'publish_failed', 'publish_conflict', 'export_late'].includes(w.release?.state || '')) ? 'review' : 'doing'; }
  if (w.stage === 'verification') return w.receipt?.note ? 'done' : 'review';
  if (w.stage === 'execution') return 'review';
  if (w.stage === 'work') return w.results[w.step] && !w.results[w.step]?.rejectedAt ? 'review' : 'doing';
  return 'todo';
}
/**
 * Where a task stands for people, closed apart (2026-10-23 user feedback: a cancelled task read "Completed · Closed"):
 * a cancelled task, or one archived before it finished (including the old-workflow archive), is closed; one archived
 * after finishing stays done. `boardState` keeps cancelled tasks in the board's done column; labels use this.
 */
export type TaskStanding = BoardState | 'closed' | 'snoozed';
export function taskStanding(w: Work): TaskStanding {
  if (w.cancelledAt) return 'closed';
  const state = boardState(w);
  if (w.archivedAt && state !== 'done') return 'closed';
  // Snoozed until a day (snooze.ts): what it waits for is not due yet.
  return w.snooze && state !== 'done' ? 'snoozed' : state;
}
export function contentInput(v: any, domains: string[]) {
  let url: URL;
  try { url = new URL(text(v.url, 2000)); } catch { return fail(systemMessageText('taskExecution.enterFullPageUrl')); }
  const hosts = domains.map(d => { try { return new URL(d.includes('://') ? d : 'https://' + d).hostname; } catch { return ''; } });
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !hosts.includes(url.hostname)) return fail(systemMessageText('taskExecution.pageBelongWebsiteConfiguredProject'));
  url.hash = '';
  const repository = typeof v.repository === 'string' ? v.repository.trim() : '';
  if (repository && !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) return fail(systemMessageText('taskExecution.enterRepositoryOwnerRepository'));
  if (!Array.isArray(v.paths) || v.paths.length > 20) return fail(systemMessageText('taskExecution.provideUp20RelativeFile'));
  const paths = [...new Set<string>(v.paths.map((p: unknown) => text(p, 1000)))];
  if (paths.some(p => p.startsWith('/') || p.includes('\\') || p.split('/').some(x => !x || x === '.' || x === '..') || /[\x00-\x1f:]/.test(p))) return fail(systemMessageText('taskExecution.filePathsRelativePathsInside'));
  if (paths.length && !repository) return fail(systemMessageText('taskExecution.specifyRepositoryBeforeEnteringFile'));
  return { id: digest(url.href), url: url.href, title: text(v.title, 300), repository, paths };
}
