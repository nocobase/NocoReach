// @ts-nocheck
import { systemMessageText } from '../../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import type { StageKind, Stage } from '../../../shared/playbook-catalog';
export type { StageKind, Stage, ChecklistItem, AgentMode } from '../../../shared/playbook-catalog';
import { languageOf } from './language';
import { fail, text } from './model';
import { memoryForAI } from './memory';
import { taskSignals } from '../../../shared/opportunity-parts.js';

// Flows (SPEC §6.0): Runner stages produce output for human review.
// Review stages are human decisions; publish and observe are fixed system stages at the end of repository flows.
// release: the system merges the reviewed PR (through the local Agent) and checks the live page; publish is the older
// manual confirmation kept for tasks started before.
// An agent stage either only reads and writes a document (analyze) or changes the repository (change). Stages saved before
// modes existed: the one keyed 'plan' reads, every other agent stage changes.
// skills: ids of the Skills an Agent step must use (see server/skills.js); they go to the Agent whether or not the project
// has them turned on.
export type FlowSnapshot = { id: string; name: string; version: number; system?: boolean; edited?: boolean; stages: Stage[] };


const KINDS: StageKind[] = ['agent', 'review', 'publish', 'release', 'observe'];
const KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const producesOutput = (s?: Stage) => s?.kind === 'agent';
export const readsOnly = (s?: Stage) => s?.kind === 'agent' && (s.mode === 'analyze' || (s.mode === undefined && s.key === 'plan'));
export const changesRepo = (s?: Stage) => s?.kind === 'agent' && !readsOnly(s);

// Cleans a submitted flow and enforces the rules no custom flow may change (SPEC §6.0).
export function validateFlow(v: any): { name: string; description: string; stages: Stage[] } {
  const name = text(v?.name, 40);
  const description = typeof v?.description === 'string' ? v.description.trim().slice(0, 200) : '';
  if (!Array.isArray(v?.stages) || v.stages.length < 1 || v.stages.length > 12) return fail(systemMessageText('flow.workflowNeeds112Stages'));
  const used = new Set<string>();
  const stages: Stage[] = v.stages.map((s: any, i: number) => {
    if (!s || !KINDS.includes(s.kind)) return fail(systemMessageText('messages.stageInvalidExecutionMode', { 0: i + 1 }));
    let key = typeof s.key === 'string' && KEY.test(s.key) ? s.key : `stage-${i + 1}`;
    while (used.has(key)) key = `${key}-${i + 1}`;
    used.add(key);
    const stage: Stage = { key, name: text(s.name, 40), kind: s.kind };
    if (s.kind === 'agent' && (s.mode === 'analyze' || s.mode === 'change')) stage.mode = s.mode;
    if (producesOutput(stage)) stage.instruction = text(s.instruction, 4000);
    if (stage.kind === 'agent' && Array.isArray(s.skills) && s.skills.length) stage.skills = s.skills;
    if (stage.kind === 'review') {
      if (s.checklist !== undefined && (!Array.isArray(s.checklist) || s.checklist.length > 10)) return fail(systemMessageText('flow.up10ChecklistItems'));
      stage.checklist = (s.checklist || []).map((c: any, j: number) => ({ key: typeof c?.key === 'string' && KEY.test(c.key) ? c.key : `item-${j + 1}`, label: text(c?.label, 120), required: c?.required !== false }));
      if (new Set(stage.checklist!.map(c => c.key)).size !== stage.checklist!.length) return fail(systemMessageText('flow.duplicateChecklistItems'));
    }
    return stage;
  });
  const at = (k: StageKind) => stages.map((s, i) => s.kind === k ? i : -1).filter(i => i >= 0);
  if (!producesOutput(stages[0])) return fail(systemMessageText('flow.firstStepDoneAgentAnalysis'));
  stages.forEach((s, i) => { if (s.kind === 'review' && !producesOutput(stages[i - 1])) fail(systemMessageText('messages.comeAfterAgentSteps', { 0: s.name })); });
  const lastProducer = Math.max(...stages.map((s, i) => producesOutput(s) ? i : -1));
  if (!stages.slice(lastProducer + 1).some(s => s.kind === 'review')) return fail(systemMessageText('flow.someoneNeedsReviewAfterAgent'));
  const agents = stages.map((s, i) => changesRepo(s) ? i : -1).filter(i => i >= 0), publish = [...at('publish'), ...at('release')], observe = at('observe');
  if (publish.length > 1 || observe.length > 1) return fail(systemMessageText('flow.onePublishOneObserveStage'));
  if (agents.length) {
    if (publish.length !== 1 || observe.length !== 1 || observe[0] !== stages.length - 1 || publish[0] !== stages.length - 2) return fail(systemMessageText('flow.workflowsChangeRepositoryEndTwo'));
    if (stages[publish[0] - 1]?.kind !== 'review') return fail(systemMessageText('flow.someoneNeedsReviewBeforePublishing'));
  } else if (publish.length || observe.length) return fail(systemMessageText('flow.publishObserveWorkflowsWhereAgent'));
  return { name, description, stages };
}

// 记忆 (项目知识) shared with the online AI and the Agent: section titles with their text (see memory.ts).
// What a Runner stage reads: everything is material, the stage instruction says what to produce.
// Messages the person left for the executor (the activity's message box): those left before the task started are
// the start's own instructions (the start card's optional note until 2026-10-24) and stay, the first five of them,
// with the latest five, oldest first and within 6,000 characters (over it, the older of the latest are left out).
const NOTES_BUDGET = 6000;
type Note = { action: 'comment'; comment: string; at?: string };
export function runNotes(history: readonly { action?: unknown; comment?: unknown; at?: string }[]): string[] {
  const comments = history.filter((e): e is Note => e?.action === 'comment' && typeof e.comment === 'string' && Boolean(e.comment));
  const startedAt = history.find(e => e?.action === 'startTask')?.at;
  const before = comments.filter(e => !startedAt || (e.at || '') <= startedAt).slice(0, 5);
  const latest = comments.slice(-5).filter(e => !before.includes(e));
  const kept = new Set<Note>();
  let used = 0;
  for (const e of [...before, ...latest.reverse()]) {
    if (used + e.comment.length > NOTES_BUDGET && kept.size) continue;
    kept.add(e); used += e.comment.length;
  }
  return comments.filter(e => kept.has(e)).map(e => e.comment);
}
export function flowRunInput(project: any, task: any, w: { flow?: FlowSnapshot; playbook?: { name: string }; results: ({ content: string; rejectedAt?: string } | null)[]; note?: string; history?: any[]; pages?: string[] }, index: number, content: unknown, reviews: any[]) {
  const stages = w.flow!.stages, stage = stages[index];
  const insight = task?.evidence?.insight || null, part = task?.evidence?.part || null;
  // One of an opportunity's several tasks reads the changes about its own place, and the opportunity's changes that
  // name no page as background; the brief says which place it changes.
  const signals = taskSignals(insight ? { ...task.evidence, signalKey: undefined } : null, (task?.evidence?.context?.signals?.items || []).filter(Boolean)).slice(0, 20);
  const { work, context, handoff, ...rest } = task?.evidence || {};
  return {
    project: memoryForAI(project),
    // What language the Agent writes its plan, report and notes in (server/language.js). Never an article's own
    // language: that is `article.languages` (article-flow.ts runInput), whatever this says.
    language: languageOf(project),
    task: { title: task?.title || '', brief: task?.brief || '' },
    playbook: w.playbook?.name || w.flow?.name || '',
    note: w.note || '',
    // Messages the person left for the executor, and the document handed over by the task before this one.
    notes: runNotes(w.history || []),
    handoff: task?.evidence?.handoff?.content || null,
    // The task's pages this task changes, when it left the others to other tasks (2026-10-29).
    ...(w.pages?.length ? { pagesToChange: w.pages } : {}),
    evidence: insight ? { insight, signals, ...(part ? { part: { target: part.label, ...(part.url ? { url: part.url } : {}) } } : {}) } : rest,
    content: content || null,
    stage: { name: stage.name, instruction: stage.instruction || '', ...(stage.skills?.length ? { skills: stage.skills } : {}) },
    previousStages: stages.slice(0, index).map((s, i) => ({ stage: s.name, output: w.results[i]?.content || null })).filter(x => x.output),
    rejectedDraft: w.results[index]?.rejectedAt ? w.results[index]!.content : null,
    feedback: reviews.filter(r => r?.kind === 'stage' && r.stageKey === stage.key && r.decision === 'requestChanges').slice(-3).map(r => r.comment),
  };
}
