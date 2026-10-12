// Pure canonical types and definitions shared by the server and snapshot display.
export type StageKind =
  'ai' | 'agent' | 'review' | 'publish' | 'release' | 'observe';
export type AgentMode = 'analyze' | 'change';
export type ChecklistItem = { key: string; label: string; required: boolean };
export type Stage = {
  key: string;
  name: string;
  kind: StageKind;
  mode?: AgentMode;
  instruction?: string;
  checklist?: ChecklistItem[];
  skills?: string[];
};
export type PlaybookKind = 'plan' | 'build';
export type StepKind = 'analyze' | 'change' | 'review';
export type Step = {
  key: string;
  name: string;
  kind: StepKind;
  instruction?: string;
  checklist?: ChecklistItem[];
  skills?: string[];
};
export type Category = 'research' | 'create' | 'optimize' | 'technical';
export type Playbook = {
  id: string;
  name: string;
  category: Category;
  description: string;
  steps: Step[];
  kind: PlaybookKind;
  next: string[];
  system?: boolean;
  edited?: boolean;
  version: number;
  updatedAt?: string;
  copiedFrom?: string;
};

const facts: ChecklistItem = {
  key: 'facts',
  label: '引用的数据与事实准确',
  required: true,
};
const analyze = (
  instruction: string,
  name = '分析',
  key = 'analyze',
): Step => ({ key, name, kind: 'analyze', instruction });
const change = (instruction: string, name = '修改', key = 'build'): Step => ({
  key,
  name,
  kind: 'change',
  instruction,
});
const review = (
  name: string,
  checklist: ChecklistItem[] = [],
  key = 'review',
): Step => ({ key, name, kind: 'review', checklist });
const withKind = (p: Omit<Playbook, 'kind'>): Playbook => ({
  ...p,
  kind: p.steps.some((s) => s.kind === 'change') ? 'build' : 'plan',
});
// Built-in playbooks: documents are an analysis the person accepts; page work goes to a change you look at before it
// is published; a written plan first is an extra analysis step (on for technical fixes).
const doc = (
  id: string,
  name: string,
  category: Category,
  description: string,
  instructions: string,
  next: string[],
  step = '分析',
) =>
  withKind({
    id,
    name,
    category,
    description,
    steps: [analyze(instructions, step), review('审核', [facts], 'accept')],
    next,
    system: true,
    version: 3,
  });
const work = (
  id: string,
  name: string,
  category: Category,
  description: string,
  instructions: string,
  planFirst = false,
) =>
  withKind({
    id,
    name,
    category,
    description,
    steps: [
      ...(planFirst
        ? [
            analyze(AGENT_PLAN_INSTRUCTION, '出方案', 'plan'),
            review('看方案', [], 'approve-plan'),
          ]
        : []),
      change(instructions),
      review('看效果并发布'),
    ],
    next: [],
    system: true,
    version: 3,
  });

// The Agent's first step when a playbook asks for a plan: a concrete plan against the real repository, before any change.
export const AGENT_PLAN_INSTRUCTION =
  '先不要修改文件。读任务说明、依据和仓库，写出具体方案：要改哪些文件和段落、改成什么、为什么。如果任务说明与仓库实际情况不符（页面已改名、内容已存在、位置不合适等），指出来并给出你的改法。';

export const SYSTEM_PLAYBOOKS: Playbook[] = [
  doc(
    'change-research',
    '变化原因调研',
    'research',
    '数据出现原因不明的变化时，查清可能的原因和下一步。',
    '围绕依据中的变化写调研报告：先写结论，再列证据（注明数据来源和时间窗口）、可能的原因（标注确定程度）和建议的下一步。可以结合仓库最近的改动和公开信息。资料不足时说明缺什么，不编造数据。',
    ['optimize-page'],
  ),
  doc(
    'competitor-compare',
    '竞品对比',
    'research',
    '对比同一主题下我们和竞品的内容，找出缺口。',
    '对比我们与依据中提到的竞品或同类产品在该主题上的内容：覆盖了哪些问题、结构、深度、示例和更新时间；指出我们缺什么、哪里更好，最后给出要补充的内容清单。只使用可以核实的公开信息，并附上链接。',
    ['new-doc'],
  ),
  doc(
    'keyword-research',
    '关键词调研',
    'research',
    '整理一个主题的搜索需求，以及应该由哪个页面承接。',
    '围绕该主题整理搜索需求：现有页面已经获得的查询（来自 Search Console）、社区与 GitHub 里的相关高频问题、建议覆盖的关键词与搜索意图，以及每个关键词应该由仓库里哪个页面承接。不编造搜索量，没有数据的写明“未核实”。',
    ['optimize-page', 'new-doc'],
  ),
  doc(
    'community-summary',
    '社区问题汇总',
    'research',
    '把社区里反复出现的问题归类，区分文档能解决和需要产品修复的。',
    '把依据中的社区主题按问题归类：每类写清用户在问什么、出现次数、典型帖子链接、仓库里是否已有文档覆盖，以及文档或产品各应该怎么回应。区分“文档能解决”和“需要产品修复”的问题。',
    ['new-doc'],
  ),
  // 起草社区回复 (2026-10-08 user decision): drafts only — the person copies each reply and posts it; NocoReach posts nowhere.
  // The fixed section format lets the task page show one card per post with 复制回复.
  doc(
    'community-reply',
    '起草社区回复',
    'create',
    '给没人回复的社区帖子起草回复，审核后你复制去回复。',
    '给依据里的每个帖子起草一条回复。先打开原帖看完整内容和已有回复，再在仓库文档和知识库里找答案。每个帖子写一节，格式固定：第一行“## 原帖标题”，接着四行“- 链接：原帖网址”“- 在问：一句话概括”“- 引用：用到的文档标题和网址或仓库路径（没有写“无”）”“- 文档缺口：文档里没写清、需要补的内容（没有写“无”）”，然后一行“### 回复”，下面是回复正文。回复用原帖的语言，像社区成员一样友好、直接：先回答问题，再给文档链接；不确定的地方说清楚并建议怎么确认，不编造功能、配置或版本号。全部帖子之后写“## 小结”，列出需要补的文档。只写草稿，不发帖，不修改仓库。',
    ['new-doc', 'optimize-page'],
    '起草回复',
  ),
  doc(
    'content-outline',
    '内容选题与大纲',
    'create',
    '确定要写什么、给谁看、放在哪里，并写出完整大纲。',
    '读现有文档和依据，确定要写的内容：目标读者、要解决的问题、建议标题、放在文档或博客的哪个位置，以及完整大纲（各级标题、每节要点、需要的示例或截图）。说明依据中的数据如何支撑这个选题。',
    ['new-doc', 'blog-post'],
    '写大纲',
  ),
  work(
    'new-doc',
    '新建文档页',
    'create',
    '在文档中新建一页并加入导航。',
    '在文档中新建页面：放到合适的目录并加入导航，按任务说明或大纲写完整内容和示例，链接到相关页面。遵循现有文档的写法、格式与 frontmatter。',
  ),
  work(
    'blog-post',
    '写博客文章',
    'create',
    '按大纲写一篇博客文章。',
    '按任务说明或大纲写一篇博客文章，放到博客目录，补全 frontmatter（标题、描述、日期、标签），并链接相关文档。',
  ),
  work(
    'release-notes',
    '写发布说明',
    'create',
    '为新版本写发布说明。',
    '根据依据中的版本发布信息写发布说明：新增、改进、修复和升级注意事项，链接到相关文档，放到项目约定的位置。',
  ),
  work(
    'optimize-page',
    '优化现有页面',
    'optimize',
    '改进已有页面的标题、描述、结构和内容。',
    '按任务说明优化对应页面：标题与描述、开头说明、结构、缺少的内容、示例与内部链接。保持原有写法和术语，不改与本任务无关的部分；同一页面的其他语言版本按项目规则处理。',
  ),
  work(
    'sync-translations',
    '同步多语言版本',
    'optimize',
    '把页面改动同步到其他语言版本。',
    '把指定页面的最新改动同步到其他语言版本：内容保持一致，术语遵循项目记忆；缺失的语言版本按需新建。',
  ),
  work(
    'tech-fix',
    '技术修复',
    'technical',
    '修复失效链接、跳转、站点地图、结构化数据等问题。',
    '修复依据中的技术问题（失效链接、跳转、站点地图、结构化数据等），只改必要的文件，修复后运行检查确认问题已经消失。',
    true,
  ),
];

// The stages a playbook runs through (the shared stage engine in service.ts executes them): its steps, then 上线 and 观察
// when a step changes the repository.
export function stagesFor(p: Pick<Playbook, 'steps'>): Stage[] {
  const stages: Stage[] = p.steps.map((s) =>
    s.kind === 'review'
      ? {
          key: s.key,
          name: s.name,
          kind: 'review',
          checklist: s.checklist || [],
        }
      : {
          key: s.key,
          name: s.name,
          kind: 'agent',
          mode: s.kind,
          instruction: s.instruction || '',
          ...(s.skills?.length ? { skills: s.skills } : {}),
        },
  );
  return p.steps.some((s) => s.kind === 'change')
    ? [
        ...stages,
        { key: 'release', name: '上线', kind: 'release' },
        { key: 'observe', name: '观察', kind: 'observe' },
      ]
    : stages;
}
