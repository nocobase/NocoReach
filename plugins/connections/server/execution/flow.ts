import { randomUUID } from 'node:crypto';
import { fail, text } from './model';

// Flows (SPEC §6.0): a task moves through an ordered list of stages. Online AI and local Agent stages produce output,
// review stages are human decisions, publish and observe are fixed system stages at the end of repository flows.
export type StageKind = 'ai' | 'agent' | 'review' | 'publish' | 'observe';
export type ChecklistItem = { key: string; label: string; required: boolean };
export type Stage = { key: string; name: string; kind: StageKind; instruction?: string; checklist?: ChecklistItem[] };
export type Flow = { id: string; name: string; description: string; system?: boolean; version: number; stages: Stage[]; updatedAt?: string; copiedFrom?: string };
export type FlowSnapshot = { id: string; name: string; version: number; stages: Stage[] };

export const SYSTEM_FLOWS: Flow[] = [
  { id: 'site-change', name: '官网修改', system: true, version: 1, description: '在线 AI 写方案，你批准后由本机 Agent 写进仓库并创建 PR，审核后发布并观察效果。', stages: [
    { key: 'plan', name: '写方案', kind: 'ai', instruction: '根据依据和关联页面写修改方案：要改哪些页面和段落、改成什么（直接给出改写后的文字）、为什么这样改、上线后看哪些数据判断效果。只写方案，不声称已经修改。' },
    { key: 'approve-plan', name: '批准方案', kind: 'review', checklist: [{ key: 'scope', label: '修改范围合理，不涉及无关页面', required: true }, { key: 'facts', label: '数据与事实准确', required: true }] },
    { key: 'repo', name: '写进仓库', kind: 'agent', instruction: '按已批准的方案修改仓库中对应的文件，运行登记的检查命令，推送分支并创建 PR；不做方案以外的修改。' },
    { key: 'review', name: '审核', kind: 'review', checklist: [{ key: 'diff', label: '改动与批准的方案一致', required: true }] },
    { key: 'publish', name: '发布', kind: 'publish' },
    { key: 'observe', name: '观察', kind: 'observe' },
  ] },
  { id: 'research', name: '调研报告', system: true, version: 1, description: '在线 AI 根据数据写调研报告，你审核后完成；报告可以提出新的机会。', stages: [
    { key: 'research', name: '调研', kind: 'ai', instruction: '围绕依据中的变化写调研报告：先写结论，再列证据（注明数据来源和时间窗口）、可能的原因（标注确定程度）和建议的下一步。资料不足时说明缺什么，不编造数据。' },
    { key: 'review', name: '审核报告', kind: 'review', checklist: [] },
  ] },
];

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

// The flow a task starts with unless the person picks another: repository work when its signals point to a page
// change or new content, a research report when the opportunity rests only on changes without a clear action.
export function defaultFlowId(task: any): string {
  const insight = task?.evidence?.insight;
  const ids = new Set<string>(Array.isArray(insight?.signalIds) ? insight.signalIds : []);
  const actions = (task?.evidence?.context?.signals?.items || []).filter((s: any) => ids.has(s?.key)).map((s: any) => s.action);
  if (actions.some((a: string) => a === 'optimize' || a === 'create')) return 'site-change';
  return actions.length ? 'research' : 'site-change';
}

// Custom flows of a project, stored as one document so the whole list changes under one revision.
export class FlowStore {
  constructor(private readonly s: { snapshot(key: string, tx?: any): Promise<any>; put(key: string, payload: any, tx: any): Promise<void>; lock<T>(project: string, task: string, fn: (tx: any) => Promise<T>): Promise<T> }) {}
  key(project: string) { return `nr-flows:${project}`; }
  async doc(project: string, tx?: any): Promise<{ revision: number; flows: Flow[] }> { return (await this.s.snapshot(this.key(project), tx)) || { revision: 0, flows: [] }; }
  async list(project: string, tx?: any) { const d = await this.doc(project, tx); return { revision: d.revision, flows: [...SYSTEM_FLOWS, ...d.flows] }; }
  async get(project: string, id: unknown, tx?: any): Promise<Flow> {
    const flow = (await this.list(project, tx)).flows.find(f => f.id === id);
    return flow || fail('流程不存在，请刷新后重新选择', 404);
  }
  private async write(project: string, revision: unknown, change: (flows: Flow[], at: string) => Flow | null) {
    return this.s.lock(project, 'flows', async tx => {
      const d = await this.doc(project, tx);
      if (revision !== d.revision) return fail('流程已在其他窗口更新，请刷新后再保存', 409);
      const flows = structuredClone(d.flows), result = change(flows, new Date().toISOString());
      await this.s.put(this.key(project), { revision: d.revision + 1, flows }, tx);
      return { revision: d.revision + 1, flows: [...SYSTEM_FLOWS, ...flows], flow: result };
    });
  }
  async save(project: string, v: any) {
    const clean = validateFlow(v);
    return this.write(project, v.revision, (flows, at) => {
      if (SYSTEM_FLOWS.some(f => f.id === v.flowId)) return fail('系统流程不能修改，请先复制', 409);
      const old = flows.find(f => f.id === v.flowId);
      if (v.flowId && !old) return fail('流程不存在，请刷新后重试', 404);
      if (old) { Object.assign(old, clean, { version: old.version + 1, updatedAt: at }); return old; }
      if (flows.length >= 30) return fail('最多保存 30 个自定义流程', 409);
      const flow: Flow = { id: `custom-${randomUUID().slice(0, 8)}`, ...clean, version: 1, updatedAt: at };
      flows.push(flow); return flow;
    });
  }
  async copy(project: string, v: any) {
    return this.write(project, v.revision, (flows, at) => {
      const source = [...SYSTEM_FLOWS, ...flows].find(f => f.id === v.flowId);
      if (!source) return fail('流程不存在，请刷新后重试', 404);
      if (flows.length >= 30) return fail('最多保存 30 个自定义流程', 409);
      const flow: Flow = { id: `custom-${randomUUID().slice(0, 8)}`, name: `${source.name}（副本）`.slice(0, 40), description: source.description, stages: structuredClone(source.stages), version: 1, updatedAt: at, copiedFrom: source.id };
      flows.push(flow); return flow;
    });
  }
  async remove(project: string, v: any) {
    return this.write(project, v.revision, flows => {
      const i = flows.findIndex(f => f.id === v.flowId);
      if (i < 0) return fail(SYSTEM_FLOWS.some(f => f.id === v.flowId) ? '系统流程不能删除' : '流程不存在，请刷新后重试', SYSTEM_FLOWS.some(f => f.id === v.flowId) ? 409 : 404);
      flows.splice(i, 1); return null;
    });
  }
}

// Project memory fields shared with the online AI (same list as strategy-service memoryFields).
const MEMORY_FIELDS = ['name', 'description', 'audience', 'market', 'positioning', 'writingStyle', 'terminology', 'competitors', 'keyPages', 'contentLanguage', 'doNotChange'];
// What an online AI stage reads: everything is material, the stage instruction says what to produce.
export function flowRunInput(project: any, task: any, w: { flow?: FlowSnapshot; results: ({ content: string; rejectedAt?: string } | null)[]; note?: string }, index: number, content: unknown, reviews: any[]) {
  const stages = w.flow!.stages, stage = stages[index];
  const insight = task?.evidence?.insight || null;
  const ids = new Set<string>(Array.isArray(insight?.signalIds) ? insight.signalIds : []);
  const signals = (task?.evidence?.context?.signals?.items || []).filter((s: any) => ids.has(s?.key)).slice(0, 20);
  const { work, context, ...rest } = task?.evidence || {};
  return {
    project: Object.fromEntries(MEMORY_FIELDS.map(k => [k, typeof project?.[k] === 'string' ? project[k].slice(0, 4000) : ''])),
    task: { title: task?.title || '', brief: task?.brief || '' },
    note: w.note || '',
    evidence: insight ? { insight, signals } : rest,
    content: content || null,
    stage: { name: stage.name, instruction: stage.instruction || '' },
    previousStages: stages.slice(0, index).map((s, i) => ({ stage: s.name, output: w.results[i]?.content || null })).filter(x => x.output),
    rejectedDraft: w.results[index]?.rejectedAt ? w.results[index]!.content : null,
    feedback: reviews.filter(r => r?.kind === 'stage' && r.stageKey === stage.key && r.decision === 'requestChanges').slice(-3).map(r => r.comment),
  };
}
