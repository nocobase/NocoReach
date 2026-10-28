/**
 * The demo projects' Agent. It works the way a Runner Agent does — reads the task, the page and its data, thinks,
 * writes a draft and submits it — but every step is scripted from the run's own materials and the demo world. No
 * model, real tool, repository or publishing service is used; the runtime plays the steps back over half a minute so
 * the task page shows a run in progress, with its transcript.
 */
export interface DemoAgentInput {
  projectId: string;
  mode?: string;
  input?: string;
}

/** One transcript event and how long the Agent appears to work before it. */
export interface DemoAgentStep {
  readonly pauseMs: number;
  readonly type:
    'status' | 'thinking' | 'text' | 'toolUse' | 'toolResult' | 'usage';
  readonly content?: string;
  readonly tool?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly meta?: Record<string, unknown>;
}

export interface DemoAgentResult {
  content: string;
  steps: readonly DemoAgentStep[];
  usage: { inputTokens: number; outputTokens: number };
}

/** Reads a demo page through the in-process demo world; never the network. */
export type DemoPageReader = (
  projectId: string,
  url: string,
) => Promise<{ title: string; text: string } | 'missing' | null>;

interface RunInput {
  language?: string;
  task?: { title?: string; brief?: string };
  stage?: { name?: string; instruction?: string };
  content?: { url?: string; title?: string } | null;
  evidence?: { insight?: { target?: string } } | null;
  data?: string;
  knowledge?: { title?: string }[];
  feedback?: string[];
}

const clip = (value: unknown, limit: number): string => {
  const text =
    typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};
const tokens = (value: string) => Math.max(1, Math.ceil(value.length / 4));

const COPY = {
  zh: {
    started: '演示 Agent 已领取任务（模拟执行，不调用真实模型或工具）',
    readTask: '先读一下任务说明和这一步的要求，确认要交付的是什么。',
    taskDone: (title: string, stage: string) =>
      `任务「${title}」，当前步骤「${stage}」。`,
    readPage: (url: string) =>
      `目标页面是 ${url}，先看看页面现在写了什么，再对照数据判断问题在哪里。`,
    noPage: '这个任务没有指定页面，我直接根据任务说明和项目资料来做。',
    pageMissing: '页面没有返回内容。',
    pageNew: (url: string) =>
      `${url} 返回 404：页面目前还不存在，这次按新页面来写。`,
    readData: '再看一下这个页面的搜索和访问数据，找到最值得改的地方。',
    noData: '暂无这个页面的数据摘要。',
    readKnowledge:
      '对照项目知识里的写作约定和产品定位，避免写出和定位不符的内容。',
    noKnowledge: '项目知识为空。',
    think: (finding: string) =>
      `${finding ? `数据里最明显的信号是：${finding}。` : ''}结合任务背景，读者在这一步卡住的原因更可能是缺少可以照着做的例子，而不是概念讲得不够。先给出具体场景和验收方法，再补充背景说明。`,
    audit: (line: string) => `另外，${line}，这次一起处理。`,
    feedback: (items: string) =>
      `上一版的审核意见是：${items}。这次重点修正这些问题。`,
    writing: (plan: boolean) =>
      plan ? '开始整理分析结论和建议。' : '开始起草修改稿。',
    written: (chars: number) => `已写入 result.json（${chars} 个字符）`,
    submitted: '结果已提交，等待人工审核。',
    summary: (plan: boolean, title: string) =>
      plan
        ? `已完成「${title}」的分析：给出了现状、问题判断、建议和验收方法，请在任务页审核。`
        : `已完成「${title}」的修改草稿：给出了改写结构、关键段落和验收清单，请在任务页审核。`,
    analysis: '分析结论',
    draft: '修改草稿',
    current: '现状',
    problem: '问题判断',
    suggestion: '建议',
    structure: '改写结构',
    sample: '关键段落示例',
    check: '验收清单',
    evidence: '依据',
    pageLine: (title: string, url: string) =>
      `目标页面：[${title || url}](${url})`,
    noPageLine: '本任务未指定页面。',
    checks: [
      '用非管理员账号按步骤操作一遍，确认结果和文中一致',
      '核对示例数据均为虚构，不含真实客户信息',
      '发布前确认标题和摘要仍然对应读者的具体任务',
    ],
    steps: [
      '开头一句话说明读者能完成什么',
      '先给一个可以照做的完整例子',
      '再解释背后的概念和适用边界',
      '最后给出验收方法和常见问题',
    ],
    sampleText: (title: string) =>
      `> 读完这一节，你可以独立完成「${title}」中描述的配置，并用一个非管理员账号验证结果。下面以一个虚构的五人团队为例，一步步完成设置。`,
    simulated:
      '这是演示 Agent 的模拟产物：没有调用真实 Agent、模型、仓库或发布服务，也没有创建 PR 或验证线上效果。',
  },
  en: {
    started:
      'Demo Agent picked up the task (simulated run; no real model or tool is called)',
    readTask:
      'Let me read the task and what this step asks for, to be sure what to deliver.',
    taskDone: (title: string, stage: string) =>
      `Task “${title}”, current step “${stage}”.`,
    readPage: (url: string) =>
      `The target page is ${url}. I'll read what it says now, then compare it with the data.`,
    noPage:
      'This task names no page, so I will work from the brief and the project knowledge.',
    pageMissing: 'The page returned no content.',
    pageNew: (url: string) =>
      `${url} returned 404: the page does not exist yet, so this draft writes it as a new page.`,
    readData:
      "Now the page's search and visit data, to find what is most worth changing.",
    noData: 'No data summary for this page yet.',
    readKnowledge:
      "Checking the project's writing rules and positioning so the draft stays on message.",
    noKnowledge: 'The project knowledge is empty.',
    think: (finding: string) =>
      `${finding ? `The clearest signal in the data: ${finding}. ` : ''}Given the brief, readers more likely get stuck for lack of an example they can follow than for lack of concepts. Lead with a concrete scenario and how to check it, then the background.`,
    audit: (line: string) =>
      `The site audit also flags this page — ${line}; this draft addresses it too.`,
    feedback: (items: string) =>
      `The last review asked for: ${items}. This version fixes those first.`,
    writing: (plan: boolean) =>
      plan
        ? 'Writing up the findings and recommendations.'
        : 'Drafting the change.',
    written: (chars: number) => `Wrote result.json (${chars} characters)`,
    submitted: 'Result submitted; waiting for human review.',
    summary: (plan: boolean, title: string) =>
      plan
        ? `Finished the analysis for “${title}”: current state, diagnosis, recommendations and how to check them. Please review it on the task page.`
        : `Finished the change draft for “${title}”: new structure, a key passage and an acceptance checklist. Please review it on the task page.`,
    analysis: 'Analysis',
    draft: 'Change draft',
    current: 'Current state',
    problem: 'Diagnosis',
    suggestion: 'Recommendations',
    structure: 'New structure',
    sample: 'Key passage',
    check: 'Acceptance checklist',
    evidence: 'Evidence',
    pageLine: (title: string, url: string) =>
      `Target page: [${title || url}](${url})`,
    noPageLine: 'This task names no page.',
    checks: [
      'Follow the steps with a non-admin account and confirm the result matches the text',
      'Check that every sample record is fictional',
      'Before publishing, confirm the title and summary still match the reader’s task',
    ],
    steps: [
      'Open with one sentence on what the reader can finish',
      'Give one complete example they can follow',
      'Then explain the concepts and where they stop applying',
      'End with how to check the result and common questions',
    ],
    sampleText: (title: string) =>
      `> By the end of this section you can set up what “${title}” describes on your own and check it with a non-admin account. We follow a fictional five-person team step by step.`,
    simulated:
      'This is a simulated artifact from the demo Agent: no real Agent, model, repository or publishing service was called, and no PR or live verification exists.',
  },
};

/** The steps and draft of one demo run, built from its own materials. */
export async function executeDemoAgent(
  run: DemoAgentInput,
  readPage: DemoPageReader,
): Promise<DemoAgentResult> {
  if (!['plan', 'build', 'article'].includes(run.mode || ''))
    throw new Error('Demo Agent supports analysis and draft changes only.');
  const input = JSON.parse(run.input || '{}') as RunInput;
  const c = input.language === 'en-US' ? COPY.en : COPY.zh;
  const plan = run.mode === 'plan';
  const title = clip(input.task?.title, 200) || 'Demo task';
  const stage = clip(input.stage?.name, 80) || (plan ? c.analysis : c.draft);
  // A task handed off from an opportunity names its page there.
  const target = input.evidence?.insight?.target;
  const url =
    input.content?.url ||
    (typeof target === 'string' && /^https?:\/\//u.test(target) ? target : '');
  const dataLines = String(input.data || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  // The summary opens with when its data was read; the findings are the lines after it.
  const facts = dataLines.slice(1);
  const finding = clip(
    facts.find((line) => /\d/u.test(line)),
    160,
  );
  const audit = clip(
    facts.find((line) => /审计|audit/iu.test(line)),
    160,
  );
  const knowledge = (input.knowledge || []).slice(0, 6);
  const feedback = (input.feedback || [])
    .map((item) => clip(item, 160))
    .filter(Boolean);
  const read = url
    ? await readPage(run.projectId, url).catch(() => null)
    : null;
  const page = read && read !== 'missing' ? read : null;
  const thought = [
    c.think(finding),
    audit ? c.audit(audit) : '',
    feedback.length ? c.feedback(feedback.join('; ')) : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const steps: DemoAgentStep[] = [
    { pauseMs: 600, type: 'status', content: c.started },
    { pauseMs: 1500, type: 'thinking', content: c.readTask },
    {
      pauseMs: 1200,
      type: 'toolUse',
      tool: 'Bash',
      input: {
        command: 'nocoreach task data',
        description: 'Read the task material',
      },
    },
    {
      pauseMs: 1800,
      type: 'toolResult',
      tool: 'Bash',
      output: [
        c.taskDone(title, stage),
        clip(input.stage?.instruction, 400),
        clip(input.task?.brief, 600),
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    {
      pauseMs: 1500,
      type: 'thinking',
      content: url ? c.readPage(url) : c.noPage,
    },
  ];
  if (url)
    steps.push(
      {
        pauseMs: 1000,
        type: 'toolUse',
        tool: 'WebFetch',
        input: { url, prompt: 'Summarize the page' },
      },
      {
        pauseMs: 2600,
        type: 'toolResult',
        tool: 'WebFetch',
        output: page
          ? `# ${page.title}\n\n${clip(page.text, 900)}`
          : read === 'missing'
            ? c.pageNew(url)
            : c.pageMissing,
      },
    );
  steps.push(
    { pauseMs: 1400, type: 'thinking', content: c.readData },
    {
      pauseMs: 900,
      type: 'toolUse',
      tool: 'Bash',
      input: {
        command: `nocoreach task data --section metrics${url ? ` --page ${url}` : ''}`,
      },
    },
    {
      pauseMs: 1700,
      type: 'toolResult',
      tool: 'Bash',
      output: dataLines.length ? dataLines.slice(0, 12).join('\n') : c.noData,
    },
    { pauseMs: 1200, type: 'thinking', content: c.readKnowledge },
    {
      pauseMs: 800,
      type: 'toolUse',
      tool: 'Read',
      input: { file_path: 'knowledge.json' },
    },
    {
      pauseMs: 1300,
      type: 'toolResult',
      tool: 'Read',
      output: knowledge.length
        ? knowledge.map((item) => `- ${clip(item.title, 80)}`).join('\n')
        : c.noKnowledge,
    },
    { pauseMs: 2600, type: 'thinking', content: thought },
    { pauseMs: 1200, type: 'text', content: c.writing(plan) },
  );

  const evidence = [
    ...(finding ? [`- ${finding}`] : []),
    ...(audit ? [`- ${audit}`] : []),
    ...(page ? [`- ${clip(page.title, 120)}`] : []),
    ...knowledge.slice(0, 3).map((item) => `- ${clip(item.title, 80)}`),
  ];
  const numbered = c.steps
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');
  const content = [
    `# ${plan ? c.analysis : c.draft}: ${title}`,
    url
      ? c.pageLine(page?.title || input.content?.title || '', url)
      : c.noPageLine,
    ...(plan
      ? [
          `## ${c.current}`,
          page ? clip(page.text, 300) : clip(input.task?.brief, 300),
          `## ${c.problem}`,
          thought,
          `## ${c.suggestion}`,
          numbered,
        ]
      : [`## ${c.structure}`, numbered, `## ${c.sample}`, c.sampleText(title)]),
    `## ${c.check}`,
    c.checks.map((check) => `- [ ] ${check}`).join('\n'),
    ...(evidence.length ? [`## ${c.evidence}`, evidence.join('\n')] : []),
    `---\n\n${c.simulated}`,
  ].join('\n\n');

  const usage = {
    inputTokens: tokens(String(run.input || '')) + tokens(page?.text || ''),
    outputTokens: tokens(content) + tokens(thought),
  };
  steps.push(
    {
      pauseMs: 4200,
      type: 'toolUse',
      tool: 'Write',
      input: { file_path: 'result.json', content: clip(content, 400) },
    },
    {
      pauseMs: 700,
      type: 'toolResult',
      tool: 'Write',
      output: c.written(content.length),
    },
    {
      pauseMs: 900,
      type: 'toolUse',
      tool: 'Bash',
      input: { command: 'nocoreach task result --content-file result.json' },
    },
    { pauseMs: 1500, type: 'toolResult', tool: 'Bash', output: c.submitted },
    { pauseMs: 1000, type: 'text', content: c.summary(plan, title) },
    { pauseMs: 300, type: 'usage', meta: usage },
  );
  return { content, steps, usage };
}

/** Title and readable text of an HTML page, for the demo Agent's page read. */
export function pageText(html: string): { title: string; text: string } {
  const title = (
    /<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1] || ''
  ).trim();
  const body = (/<main[\s\S]*?>([\s\S]*?)<\/main>/iu.exec(html)?.[1] ?? html)
    .replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .replace(/\s+/gu, ' ')
    .trim();
  return { title, text: body };
}
