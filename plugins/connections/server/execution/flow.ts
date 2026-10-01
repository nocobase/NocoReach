import { fail, text } from './model';

// Flows (SPEC §6.0): a task moves through an ordered list of stages. Online AI and local Agent stages produce output,
// review stages are human decisions, publish and observe are fixed system stages at the end of repository flows.
export type StageKind = 'ai' | 'agent' | 'review' | 'publish' | 'observe';
export type ChecklistItem = { key: string; label: string; required: boolean };
export type Stage = { key: string; name: string; kind: StageKind; instruction?: string; checklist?: ChecklistItem[] };
export type FlowSnapshot = { id: string; name: string; version: number; stages: Stage[] };


const KINDS: StageKind[] = ['ai', 'agent', 'review', 'publish', 'observe'];
const KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const producesOutput = (s?: Stage) => s?.kind === 'ai' || s?.kind === 'agent';
export const waitsForHuman = (s?: Stage) => s?.kind === 'review' || s?.kind === 'publish';

// Cleans a submitted flow and enforces the rules no custom flow may change (SPEC §6.0).
export function validateFlow(v: any): { name: string; description: string; stages: Stage[] } {
  const name = text(v?.name, 40);
  const description = typeof v?.description === 'string' ? v.description.trim().slice(0, 200) : '';
  if (!Array.isArray(v?.stages) || v.stages.length < 1 || v.stages.length > 12) return fail('流程需要 1–12 个阶段');
  const used = new Set<string>();
  const stages: Stage[] = v.stages.map((s: any, i: number) => {
    if (!s || !KINDS.includes(s.kind)) return fail(`第 ${i + 1} 个阶段的执行方式无效`);
    let key = typeof s.key === 'string' && KEY.test(s.key) ? s.key : `stage-${i + 1}`;
    while (used.has(key)) key = `${key}-${i + 1}`;
    used.add(key);
    const stage: Stage = { key, name: text(s.name, 40), kind: s.kind };
    if (producesOutput(stage)) stage.instruction = text(s.instruction, 4000);
    if (stage.kind === 'review') {
      if (s.checklist !== undefined && (!Array.isArray(s.checklist) || s.checklist.length > 10)) return fail('检查清单最多 10 项');
      stage.checklist = (s.checklist || []).map((c: any, j: number) => ({ key: typeof c?.key === 'string' && KEY.test(c.key) ? c.key : `item-${j + 1}`, label: text(c?.label, 120), required: c?.required !== false }));
      if (new Set(stage.checklist!.map(c => c.key)).size !== stage.checklist!.length) return fail('检查清单的项目重复');
    }
    return stage;
  });
  const at = (k: StageKind) => stages.map((s, i) => s.kind === k ? i : -1).filter(i => i >= 0);
  if (!producesOutput(stages[0])) return fail('第一个阶段需要由在线 AI 或本机 Agent 产出内容');
  stages.forEach((s, i) => { if (s.kind === 'review' && !producesOutput(stages[i - 1])) fail(`“${s.name}”要放在在线 AI 或本机 Agent 阶段之后`); });
  const lastProducer = Math.max(...stages.map((s, i) => producesOutput(s) ? i : -1));
  if (!stages.slice(lastProducer + 1).some(s => s.kind === 'review')) return fail('最后一个产出内容的阶段之后需要有人审核');
  const agents = at('agent'), publish = at('publish'), observe = at('observe');
  if (publish.length > 1 || observe.length > 1) return fail('发布和观察各只能有一个');
  if (agents.length) {
    if (publish.length !== 1 || observe.length !== 1 || observe[0] !== stages.length - 1 || publish[0] !== stages.length - 2) return fail('修改仓库的流程必须以“发布”“观察”两个系统阶段结束');
    if (stages[publish[0] - 1]?.kind !== 'review') return fail('发布前需要有人审核');
  } else if (publish.length || observe.length) return fail('发布和观察只用于包含本机 Agent 修改仓库的流程');
  return { name, description, stages };
}

// Project memory fields shared with the online AI (same list as strategy-service memoryFields).
const MEMORY_FIELDS = ['name', 'description', 'audience', 'market', 'positioning', 'writingStyle', 'terminology', 'competitors', 'keyPages', 'contentLanguage', 'doNotChange'];
// What an online AI stage reads: everything is material, the stage instruction says what to produce.
export function flowRunInput(project: any, task: any, w: { flow?: FlowSnapshot; playbook?: { name: string }; results: ({ content: string; rejectedAt?: string } | null)[]; note?: string; history?: any[] }, index: number, content: unknown, reviews: any[]) {
  const stages = w.flow!.stages, stage = stages[index];
  const insight = task?.evidence?.insight || null;
  const ids = new Set<string>(Array.isArray(insight?.signalIds) ? insight.signalIds : []);
  const signals = (task?.evidence?.context?.signals?.items || []).filter((s: any) => ids.has(s?.key)).slice(0, 20);
  const { work, context, handoff, ...rest } = task?.evidence || {};
  return {
    project: Object.fromEntries(MEMORY_FIELDS.map(k => [k, typeof project?.[k] === 'string' ? project[k].slice(0, 4000) : ''])),
    task: { title: task?.title || '', brief: task?.brief || '' },
    playbook: w.playbook?.name || w.flow?.name || '',
    note: w.note || '',
    // Messages the person left for the executor, and the document handed over by the task before this one.
    notes: (w.history || []).filter(e => e?.action === 'comment' && e.comment).slice(-5).map(e => e.comment),
    handoff: task?.evidence?.handoff?.content || null,
    evidence: insight ? { insight, signals } : rest,
    content: content || null,
    stage: { name: stage.name, instruction: stage.instruction || '' },
    previousStages: stages.slice(0, index).map((s, i) => ({ stage: s.name, output: w.results[i]?.content || null })).filter(x => x.output),
    rejectedDraft: w.results[index]?.rejectedAt ? w.results[index]!.content : null,
    feedback: reviews.filter(r => r?.kind === 'stage' && r.stageKey === stage.key && r.decision === 'requestChanges').slice(-3).map(r => r.comment),
  };
}
