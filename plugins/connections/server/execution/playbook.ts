import { randomUUID } from 'node:crypto';
import { fail, text } from './model';
import { validateFlow, type ChecklistItem, type Stage } from './flow';

// 做法 (SPEC §6.0): how one kind of work is done. Plan playbooks are run by the online AI and deliver a document;
// build playbooks are run by the local Agent and deliver a PR. One task has one playbook and therefore one executor.
export type PlaybookKind = 'plan' | 'build';
export type Playbook = { id: string; name: string; kind: PlaybookKind; description: string; instructions: string; planFirst?: boolean; checklist: ChecklistItem[]; next: string[]; system?: boolean; version: number; updatedAt?: string; copiedFrom?: string };
export type PlaybookSnapshot = { id: string; name: string; kind: PlaybookKind; version: number; next: string[] };

const facts: ChecklistItem = { key: 'facts', label: '引用的数据与事实准确', required: true };
const plan = (id: string, name: string, description: string, instructions: string, next: string[]): Playbook => ({ id, name, kind: 'plan', description, instructions, checklist: [facts], next, system: true, version: 1 });
// Page work goes straight to a change you look at; a written plan first is a playbook option (on for technical fixes).
const build = (id: string, name: string, description: string, instructions: string, planFirst = false): Playbook => ({ id, name, kind: 'build', description, instructions, planFirst, checklist: [], next: [], system: true, version: 2 });

export const SYSTEM_PLAYBOOKS: Playbook[] = [
  plan('change-research', '变化原因调研', '数据出现原因不明的变化时，查清可能的原因和下一步。', '围绕依据中的变化写调研报告：先写结论，再列证据（注明数据来源和时间窗口）、可能的原因（标注确定程度）和建议的下一步。资料不足时说明缺什么，不编造数据。', ['optimize-page']),
  plan('competitor-compare', '竞品对比', '对比同一主题下我们和竞品的内容，找出缺口。', '对比我们与依据中提到的竞品或同类产品在该主题上的内容：覆盖了哪些问题、结构、深度、示例和更新时间；指出我们缺什么、哪里更好，最后给出要补充的内容清单。只使用可以核实的公开信息，并附上链接。', ['new-doc']),
  plan('keyword-research', '关键词调研', '整理一个主题的搜索需求，以及应该由哪个页面承接。', '围绕该主题整理搜索需求：现有页面已经获得的查询（来自 Search Console）、社区与 GitHub 里的相关高频问题、建议覆盖的关键词与搜索意图，以及每个关键词应该由哪个页面承接。不编造搜索量，没有数据的写明“未核实”。', ['optimize-page', 'new-doc']),
  plan('community-summary', '社区问题汇总', '把社区里反复出现的问题归类，区分文档能解决和需要产品修复的。', '把依据中的社区主题按问题归类：每类写清用户在问什么、出现次数、典型帖子链接、是否已有文档覆盖，以及文档或产品各应该怎么回应。区分“文档能解决”和“需要产品修复”的问题。', ['new-doc']),
  plan('content-outline', '内容选题与大纲', '确定要写什么、给谁看、放在哪里，并写出完整大纲。', '确定要写的内容：目标读者、要解决的问题、建议标题、放在文档或博客的哪个位置，以及完整大纲（各级标题、每节要点、需要的示例或截图）。说明依据中的数据如何支撑这个选题。', ['new-doc', 'blog-post']),
  build('optimize-page', '优化现有页面', '改进已有页面的标题、描述、结构和内容。', '按任务说明优化对应页面：标题与描述、开头说明、结构、缺少的内容、示例与内部链接。保持原有写法和术语，不改与本任务无关的部分；同一页面的其他语言版本按项目规则处理。'),
  build('new-doc', '新建文档页', '在文档中新建一页并加入导航。', '在文档中新建页面：放到合适的目录并加入导航，按任务说明或大纲写完整内容和示例，链接到相关页面。遵循现有文档的写法、格式与 frontmatter。'),
  build('blog-post', '写博客文章', '按大纲写一篇博客文章。', '按任务说明或大纲写一篇博客文章，放到博客目录，补全 frontmatter（标题、描述、日期、标签），并链接相关文档。'),
  build('release-notes', '写发布说明', '为新版本写发布说明。', '根据依据中的版本发布信息写发布说明：新增、改进、修复和升级注意事项，链接到相关文档，放到项目约定的位置。'),
  build('sync-translations', '同步多语言版本', '把页面改动同步到其他语言版本。', '把指定页面的最新改动同步到其他语言版本：内容保持一致，术语遵循项目记忆；缺失的语言版本按需新建。'),
  build('tech-fix', '技术修复', '修复失效链接、跳转、站点地图、结构化数据等问题。', '修复依据中的技术问题（失效链接、跳转、站点地图、结构化数据等），只改必要的文件，修复后运行检查确认问题已经消失。', true),
];

// The local Agent's first step on a build task: a concrete plan against the real repository, before any change.
export const AGENT_PLAN_INSTRUCTION = '先不要修改文件。读任务说明、依据和仓库，写出具体方案：要改哪些文件和段落、改成什么、为什么。如果任务说明与仓库实际情况不符（页面已改名、内容已存在、位置不合适等），指出来并给出你的改法。';

// The stages a playbook runs through (the shared stage engine in service.ts executes them).
export function stagesFor(p: Playbook): Stage[] {
  if (p.kind === 'plan') return [{ key: 'draft', name: '撰写', kind: 'ai', instruction: p.instructions }, { key: 'accept', name: '审核', kind: 'review', checklist: p.checklist }];
  const work: Stage[] = [{ key: 'build', name: '修改', kind: 'agent', instruction: p.instructions }, { key: 'review', name: '看效果并发布', kind: 'review', checklist: p.checklist }, { key: 'release', name: '上线', kind: 'release' }, { key: 'observe', name: '观察', kind: 'observe' }];
  return p.planFirst ? [{ key: 'plan', name: '出方案', kind: 'agent', instruction: AGENT_PLAN_INSTRUCTION }, { key: 'approve-plan', name: '看方案', kind: 'review', checklist: [] }, ...work] : work;
}
export const executorOf = (kind: PlaybookKind) => kind === 'plan' ? 'online' : 'agent';

// Cleans a submitted playbook; `known` lists playbook ids the next steps may point to.
export function validatePlaybook(v: any, known: string[]): Omit<Playbook, 'id' | 'version'> {
  if (v?.kind !== 'plan' && v?.kind !== 'build') return fail('请选择做法类型');
  if (v.checklist !== undefined && (!Array.isArray(v.checklist) || v.checklist.length > 10)) return fail('检查清单最多 10 项');
  const checklist = (v.checklist || []).map((c: any, j: number) => ({ key: typeof c?.key === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(c.key) ? c.key : `item-${j + 1}`, label: text(c?.label, 120), required: c?.required !== false }));
  if (new Set(checklist.map((c: ChecklistItem) => c.key)).size !== checklist.length) return fail('检查清单的项目重复');
  if (v.next !== undefined && (!Array.isArray(v.next) || v.next.length > 3)) return fail('接着做最多选 3 个');
  const next = [...new Set<string>((v.next || []).filter((x: unknown) => typeof x === 'string'))];
  if (next.some(id => !known.includes(id))) return fail('接着做的做法不存在，请刷新后重新选择');
  const p = { name: text(v.name, 40), kind: v.kind as PlaybookKind, description: typeof v.description === 'string' ? v.description.trim().slice(0, 200) : '', instructions: text(v.instructions, 6000), checklist, next: v.kind === 'plan' ? next : [], ...(v.kind === 'build' ? { planFirst: v.planFirst === true } : {}) };
  validateFlow({ name: p.name, stages: stagesFor({ ...p, id: 'check', version: 1 }) });
  return p;
}

// The playbook a task starts with unless the person picks another, from the signals behind the opportunity.
export function defaultPlaybookId(task: any): string {
  const insight = task?.evidence?.insight;
  const ids = new Set<string>(Array.isArray(insight?.signalIds) ? insight.signalIds : []);
  const actions = (task?.evidence?.context?.signals?.items || []).filter((s: any) => ids.has(s?.key)).map((s: any) => s.action);
  if (actions.includes('optimize')) return 'optimize-page';
  if (actions.includes('create')) return 'content-outline';
  if (actions.includes('distribute')) return 'release-notes';
  return actions.length ? 'change-research' : 'optimize-page';
}

// Custom playbooks of a project, stored as one document so the list changes under one revision.
export class PlaybookStore {
  constructor(private readonly s: { snapshot(key: string, tx?: any): Promise<any>; put(key: string, payload: any, tx: any): Promise<void>; lock<T>(project: string, task: string, fn: (tx: any) => Promise<T>): Promise<T> }) {}
  key(project: string) { return `nr-playbooks:${project}`; }
  async doc(project: string, tx?: any): Promise<{ revision: number; playbooks: Playbook[] }> { return (await this.s.snapshot(this.key(project), tx)) || { revision: 0, playbooks: [] }; }
  async list(project: string, tx?: any) { const d = await this.doc(project, tx); return { revision: d.revision, playbooks: [...SYSTEM_PLAYBOOKS, ...d.playbooks] }; }
  async get(project: string, id: unknown, tx?: any): Promise<Playbook> {
    return (await this.list(project, tx)).playbooks.find(p => p.id === id) || fail('做法不存在，请刷新后重新选择', 404);
  }
  private async write(project: string, revision: unknown, change: (mine: Playbook[], all: Playbook[], at: string) => Playbook | null) {
    return this.s.lock(project, 'playbooks', async tx => {
      const d = await this.doc(project, tx);
      if (revision !== d.revision) return fail('做法已在其他窗口更新，请刷新后再保存', 409);
      const mine = structuredClone(d.playbooks), result = change(mine, [...SYSTEM_PLAYBOOKS, ...mine], new Date().toISOString());
      await this.s.put(this.key(project), { revision: d.revision + 1, playbooks: mine }, tx);
      return { revision: d.revision + 1, playbooks: [...SYSTEM_PLAYBOOKS, ...mine], playbook: result };
    });
  }
  async save(project: string, v: any) {
    return this.write(project, v.revision, (mine, all, at) => {
      if (SYSTEM_PLAYBOOKS.some(p => p.id === v.playbookId)) return fail('内置做法不能修改，请先复制', 409);
      const clean = validatePlaybook(v, all.map(p => p.id).filter(id => id !== v.playbookId));
      const old = mine.find(p => p.id === v.playbookId);
      if (v.playbookId && !old) return fail('做法不存在，请刷新后重试', 404);
      if (old) { Object.assign(old, clean, { version: old.version + 1, updatedAt: at }); return old; }
      if (mine.length >= 50) return fail('最多保存 50 个自定义做法', 409);
      const p: Playbook = { id: `custom-${randomUUID().slice(0, 8)}`, ...clean, version: 1, updatedAt: at };
      mine.push(p); return p;
    });
  }
  async copy(project: string, v: any) {
    return this.write(project, v.revision, (mine, all, at) => {
      const source = all.find(p => p.id === v.playbookId);
      if (!source) return fail('做法不存在，请刷新后重试', 404);
      if (mine.length >= 50) return fail('最多保存 50 个自定义做法', 409);
      const { system, ...rest } = structuredClone(source);
      const p: Playbook = { ...rest, id: `custom-${randomUUID().slice(0, 8)}`, name: `${source.name}（副本）`.slice(0, 40), version: 1, updatedAt: at, copiedFrom: source.id };
      mine.push(p); return p;
    });
  }
  async remove(project: string, v: any) {
    return this.write(project, v.revision, mine => {
      const i = mine.findIndex(p => p.id === v.playbookId);
      if (i < 0) return fail(SYSTEM_PLAYBOOKS.some(p => p.id === v.playbookId) ? '内置做法不能删除' : '做法不存在，请刷新后重试', SYSTEM_PLAYBOOKS.some(p => p.id === v.playbookId) ? 409 : 404);
      mine.splice(i, 1);
      for (const p of mine) p.next = p.next.filter(id => id !== v.playbookId);
      return null;
    });
  }
}
