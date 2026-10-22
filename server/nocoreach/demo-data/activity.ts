import { createHash, randomUUID } from 'node:crypto';

import type { DemoImportContext } from '@nocobase/app-plugin-demo-mode/server/tokens';

import type {
  OnlineConversation,
  OnlineRun,
} from '../../../shared/online-agent.js';
import {
  stagesFor,
  SYSTEM_PLAYBOOKS,
} from '../../../shared/playbook-catalog.js';
import type { Artifact, Release, Run, RunEvent } from '../execution/model.js';
import { projectWork } from '../execution/model.js';
import { demoContent, type DemoPerson } from './content.js';
import type { DemoHost } from './host.js';
import { t, type L } from './world/script/types.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** In-app notifications the import writes carry this prefix, so clearing removes exactly them. */
export const DEMO_NOTIFICATION = 'nocoreach-demo-';

type ChangeState =
  | 'failed'
  | 'ready'
  | 'merge_failed'
  | 'verifying'
  | 'not_seen'
  | 'simulated'
  | 'live';

/** Page-change tasks in each state the release path has, hand-written like the other demo stories. */
interface ChangeTask {
  key: string;
  path: string;
  owner: DemoPerson;
  state: ChangeState;
  /** Days since the task was created. */
  age: number;
  title: L;
  brief: L;
  /** The visible change: what the page said before and says after. */
  label: L;
  before: L;
  after: L;
  /** The release note the owner wrote. */
  note: L;
  /** Why the Agent or the release failed. */
  error?: L;
  comments: readonly (readonly [DemoPerson, L])[];
}

const CHANGES: ChangeTask[] = [
  {
    key: 'fix-trigger-link',
    path: '/docs/workflow/triggers',
    owner: 'devrel',
    state: 'failed',
    age: 2,
    title: t(
      '修复工作流触发器文档里的失效链接',
      'Fix the broken link in the workflow triggers docs',
    ),
    brief: t(
      '网站审计发现触发器文档链接到已删除的 /docs/workflow/loops-old。找到替代页面并更新链接。',
      'The site audit found the triggers page links to the removed /docs/workflow/loops-old. Find the replacement page and update the link.',
    ),
    label: t('相关链接', 'Related link'),
    before: t('循环节点（旧版）', 'Loop node (old)'),
    after: t('循环与分支节点', 'Loops and branches'),
    note: t('', ''),
    error: t(
      '仓库里没有找到 /docs/workflow/loops-old 的替代页面，Agent 没有做任何修改。请先在任务说明里写明新的目标页面，再交给 Agent。',
      'No replacement for /docs/workflow/loops-old was found in the repository, so the Agent changed nothing. Name the new target page in the brief, then hand it back.',
    ),
    comments: [
      [
        'devrel',
        t(
          '应该是合并到「循环与分支」那一页了，我去确认一下路径。',
          'It was probably merged into the loops and branches page; I will check the path.',
        ),
      ],
    ],
  },
  {
    key: 'home-self-hosting',
    path: '/',
    owner: 'growth',
    state: 'ready',
    age: 3,
    title: t(
      '首页首屏写明「可私有部署」',
      'Say "self-hostable" in the home page hero',
    ),
    brief: t(
      '「私有部署 低代码」「开源低代码」的点击率低于同排名的平均水平，首屏没有回答数据放在哪里的问题。在副标题里写明可以私有部署。',
      'Clicks on "self hosted no code" and "open source low code" trail the usual rate for their position; the hero never says where data lives. Say it can be self-hosted in the subtitle.',
    ),
    label: t('首页副标题', 'Home page subtitle'),
    before: t(
      '先设计数据结构，再拼装页面、权限与工作流。',
      'Design the data first, then assemble pages, permissions and workflows.',
    ),
    after: t(
      '先设计数据结构，再拼装页面、权限与工作流——部署在你自己的服务器上，数据不出内网。',
      'Design the data first, then assemble pages, permissions and workflows — on your own servers, with data that never leaves your network.',
    ),
    note: t(
      '首页副标题补充私有部署说明',
      'Home subtitle now mentions self-hosting',
    ),
    comments: [
      [
        'growth',
        t(
          '副标题别超过两行，手机上看一下。',
          'Keep the subtitle to two lines; check it on a phone.',
        ),
      ],
      [
        'editor',
        t(
          '「数据不出内网」比「安全」更具体，保留。',
          '"Data never leaves your network" is more concrete than "secure"; keep it.',
        ),
      ],
    ],
  },
  {
    key: 'pricing-environments',
    path: '/pricing',
    owner: 'content',
    state: 'merge_failed',
    age: 6,
    title: t(
      '价格页补充开发和测试环境的计费问答',
      'Add the development and test environment question to pricing',
    ),
    brief: t(
      '社区和售前反复问开发、测试环境是否另行计费。在价格页常见问题里加一条，答案以销售确认的口径为准。',
      'The community and pre-sales keep asking whether development and test environments are billed. Add it to the pricing questions, worded as sales confirmed.',
    ),
    label: t('价格页常见问题', 'Pricing questions'),
    before: t(
      '开发、测试环境是否另行计费，以及商业插件能否单独购买，请在采购前与销售确认。',
      'Ask sales before purchase whether development and test environments are billed separately and whether commercial plugins can be bought one by one.',
    ),
    after: t(
      '每份授权包含一套生产环境和两套开发或测试环境；商业插件能否单独购买，请向销售确认。',
      'Each licence covers one production and two development or test environments; ask sales whether commercial plugins can be bought one by one.',
    ),
    note: t('价格页新增环境计费问答', 'Pricing adds the environments question'),
    error: t(
      '合并失败：审核之后 docs/pricing.mdx 又被其他改动修改，分支有冲突。',
      'Merge failed: docs/pricing.mdx changed after review and the branch now conflicts.',
    ),
    comments: [
      [
        'content',
        t(
          '销售确认了「两套开发或测试环境」的说法。',
          'Sales confirmed the "two development or test environments" wording.',
        ),
      ],
      [
        'growth',
        t(
          '价格页昨天刚改过版式，可能冲突了。',
          'The pricing layout changed yesterday; that may conflict.',
        ),
      ],
    ],
  },
  {
    key: 'docker-ports',
    path: '/docs/installation/docker',
    owner: 'devrel',
    state: 'verifying',
    age: 4,
    title: t(
      'Docker 安装文档加入端口冲突的排查步骤',
      'Add port-conflict troubleshooting to the Docker guide',
    ),
    brief: t(
      '论坛和 Discord 本周有三次「13000 端口被占用」的提问。在安装文档的排查部分加入查看和修改端口映射的步骤。',
      "Three forum and Discord questions this week were about port 13000 being taken. Add checking and changing the port mapping to the guide's troubleshooting.",
    ),
    label: t('排查步骤', 'Troubleshooting steps'),
    before: t(
      '依次检查容器状态、端口占用、应用日志和数据库连接。',
      'Check container status, port conflicts, the application log and the database connection in turn.',
    ),
    after: t(
      '依次检查容器状态、端口占用、应用日志和数据库连接。端口被占用时，把 docker-compose.yml 里的 13000:80 改成 8080:80 等空闲端口。',
      'Check container status, port conflicts, the application log and the database connection in turn. If the port is taken, change 13000:80 in docker-compose.yml to a free port such as 8080:80.',
    ),
    note: t(
      'Docker 文档补充端口冲突排查',
      'Docker guide adds port-conflict steps',
    ),
    comments: [
      [
        'devrel',
        t(
          '合并好了，等文档站重新构建。',
          'Merged; waiting for the docs site to rebuild.',
        ),
      ],
    ],
  },
  {
    key: 'api-paging-example',
    path: '/docs/api/pagination',
    owner: 'devrel',
    state: 'not_seen',
    age: 8,
    title: t(
      '分页文档补充完整的翻页示例代码',
      'Add a complete paging example to the pagination docs',
    ),
    brief: t(
      '「API 只返回 20 条」的搜索有点击但停留很短，页面只有一句说明。补一段按 meta.totalPage 循环读取的示例。',
      '"API only returns 20 records" gets clicks but short visits; the page has one sentence. Add an example that loops up to meta.totalPage.',
    ),
    label: t('示例代码', 'Example code'),
    before: t(
      '列表接口默认 pageSize 为 20。',
      'List endpoints default to pageSize 20.',
    ),
    after: t(
      '列表接口默认 pageSize 为 20。读取全部数据时，从第 1 页开始请求，直到 page 等于 meta.totalPage。',
      'List endpoints default to pageSize 20. To read everything, request from page 1 until page equals meta.totalPage.',
    ),
    note: t('分页文档补充翻页示例', 'Pagination docs add a paging example'),
    comments: [
      [
        'devrel',
        t(
          'PR 合并了，但线上页面看起来还是旧的，可能 CDN 缓存没刷新。',
          'The PR merged but the live page still looks old; the CDN cache may not have refreshed.',
        ),
      ],
    ],
  },
  {
    key: 'crm-funnel',
    path: '/solutions/crm',
    owner: 'growth',
    state: 'simulated',
    age: 10,
    title: t(
      'CRM 方案页补充销售漏斗的配置说明',
      'Explain the sales funnel setup on the CRM solution page',
    ),
    brief: t(
      '「自建 CRM」点击上升，但方案页没有说明漏斗怎么配置。补充看板按阶段展示、图表按阶段统计金额的步骤。',
      '"Self hosted CRM" clicks are rising but the page never explains the funnel. Add the kanban-by-stage and amount-by-stage chart steps.',
    ),
    label: t('销售漏斗', 'Sales funnel'),
    before: t(
      '用看板区块按阶段展示商机。',
      'A kanban block shows deals by stage.',
    ),
    after: t(
      '用看板区块按阶段展示商机，再用图表区块按阶段统计金额；阶段字段需要设为单选。',
      'A kanban block shows deals by stage and a chart block sums amounts by stage; make the stage field a single select.',
    ),
    note: t(
      'CRM 方案页补充漏斗配置步骤',
      'CRM page adds the funnel setup steps',
    ),
    comments: [
      [
        'growth',
        t(
          '演示环境里模拟发布了，内容没问题。',
          'Published as a simulation in the demo; the content is fine.',
        ),
      ],
    ],
  },
  {
    key: 'relations-cascade',
    path: '/docs/data-modeling/relations',
    owner: 'content',
    state: 'live',
    age: 9,
    title: t(
      '关系字段文档写清删除时的级联规则',
      'Explain deletion cascades in the relation fields docs',
    ),
    brief: t(
      '「一对多 多对多 关系」排名在第二页，读者常问删除客户时联系人会不会一起删。补充级联、置空和禁止删除三种选择。',
      '"One to many vs many to many" sits on page two, and readers ask whether deleting an account deletes its contacts. Explain cascade, set null and restrict.',
    ),
    label: t('删除规则', 'Deletion rules'),
    before: t(
      '删除客户时可以选择级联或禁止。',
      'Deleting a customer can cascade or be refused.',
    ),
    after: t(
      '删除客户时有三种选择：级联删除联系人、把联系人的客户字段置空，或在还有联系人时禁止删除。',
      'Deleting a customer offers three choices: delete its contacts too, clear their customer field, or refuse while contacts remain.',
    ),
    note: t(
      '关系字段文档补充三种删除规则',
      'Relations docs explain three deletion rules',
    ),
    comments: [
      [
        'content',
        t(
          '线上已经看到新段落，开始观察排名。',
          'The new section is live; watching the ranking now.',
        ),
      ],
    ],
  },
];

const stages = stagesFor(
  SYSTEM_PLAYBOOKS.find((p) => p.id === 'optimize-page')!,
);

interface Built {
  work: ReturnType<typeof projectWork>;
  artifact?: Artifact;
  runs: Run[];
  createdAt: string;
  updatedAt: string;
}

function build(
  context: DemoImportContext,
  people: Partial<Record<DemoPerson, string>>,
  origin: string,
  projectId: string,
  change: ChangeTask,
): Built {
  const lang = context.language === 'en-US' ? 'en' : 'zh';
  const text = (value: L) => value[lang];
  const content = demoContent(context.language);
  const now = context.clock.now.getTime();
  const at = (days: number, hours = 0) =>
    new Date(now - days * DAY + hours * HOUR).toISOString();
  const owner = people[change.owner] ?? context.actorId;
  const work = projectWork({});
  const failed = change.state === 'failed';
  // Where the task is: the Agent's step, the review, the release, or watching the effect.
  const index = failed
    ? 0
    : change.state === 'ready'
      ? 1
      : change.state === 'live'
        ? 3
        : change.state === 'simulated'
          ? 3
          : 2;
  Object.assign(work, {
    kind: 'content',
    // Once live (or simulated), the task is done for its owner and the effect is the system's to watch.
    stage:
      change.state === 'simulated' || change.state === 'live' ? 'done' : 'flow',
    page: { url: origin + change.path, title: text(change.title) },
    note: content.taskNote,
    humanOwnerId: owner,
    humanOwnerName: content.people[change.owner].name,
    playbookId: 'optimize-page',
    flow: {
      id: 'optimize-page',
      name: SYSTEM_PLAYBOOKS.find((p) => p.id === 'optimize-page')!.name,
      version: 3,
      stages: stages.map((s) =>
        s.kind === 'agent' ? { ...s, instruction: text(change.brief) } : s,
      ),
    },
    stageIndex: index,
  });
  work.history = change.comments.map(([person, comment], i) => ({
    at: at(change.age - 1 - i * 0.3, 2),
    actor: people[person] ?? 'demo-editor',
    actorName: content.people[person].name,
    action: 'comment',
    comment: text(comment),
  }));
  const runId = randomUUID();
  const started = change.age - 0.2;
  const transcript: RunEvent[] = [
    { seq: 1, at: at(started), type: 'status', content: 'running' },
    {
      seq: 2,
      at: at(started, 0.01),
      type: 'thinking',
      content: text(change.brief),
    },
    {
      seq: 3,
      at: at(started, 0.02),
      type: 'toolUse',
      tool: 'WebFetch',
      input: { url: origin + change.path },
    },
    {
      seq: 4,
      at: at(started, 0.03),
      type: 'toolResult',
      tool: 'WebFetch',
      output: text(change.before),
    },
    ...(failed
      ? [
          {
            seq: 5,
            at: at(started, 0.05),
            type: 'toolUse',
            tool: 'Bash',
            input: { command: 'grep -rn "loops-old" docs/' },
          },
          {
            seq: 6,
            at: at(started, 0.06),
            type: 'toolResult',
            tool: 'Bash',
            output:
              'docs/workflow/triggers.mdx:41: [循环节点（旧版）](/docs/workflow/loops-old)',
          },
          {
            seq: 7,
            at: at(started, 0.08),
            type: 'text',
            content: text(change.error!),
          },
        ]
      : [
          {
            seq: 5,
            at: at(started, 0.05),
            type: 'toolUse',
            tool: 'Write',
            input: {
              path: `docs${change.path === '/' ? '/index' : change.path}.mdx`,
            },
          },
          {
            seq: 6,
            at: at(started, 0.06),
            type: 'toolResult',
            tool: 'Write',
            output: 'ok',
          },
          {
            seq: 7,
            at: at(started, 0.08),
            type: 'text',
            content: text(change.after),
          },
        ]),
    {
      seq: 8,
      at: at(started, 0.09),
      type: 'usage',
      meta: { inputTokens: 18_400, outputTokens: 2_150 },
    },
  ];
  const run: Run = {
    id: runId,
    projectId,
    taskId: '',
    planVersion: 0,
    stepId: stages[0].key,
    baseArtifactId: null,
    ownerId: owner,
    actor: owner,
    inputVersion: 1,
    capabilitySnapshot: ['repo.read', 'repo.write', 'pr.open'],
    status: failed ? 'failed' : 'succeeded',
    createdAt: at(started, -0.05),
    startedAt: at(started),
    endedAt: at(started, 0.1),
    input: JSON.stringify({ mode: 'build', title: text(change.title) }),
    model: { llmService: 'demo', model: 'demo-agent' },
    flowStage: 0,
    mode: 'build',
    simulated: true,
    demoAgentId: 'nocoreach.runner',
    agentName: 'NocoReach Demo Agent',
    transcript,
    usage: { inputTokens: 18_400, outputTokens: 2_150 },
    ...(failed
      ? { error: 'agent_failed', errorDetail: text(change.error!) }
      : {}),
  };
  work.latestRun = { id: runId, status: run.status };
  work.history.unshift({
    at: at(started, -0.05),
    actor: owner,
    action: 'runQueued',
    runId,
    note: stages[0].name,
  });
  const number = 3100 + CHANGES.indexOf(change) * 7;
  const pr = {
    url: `https://github.com/nocobase/nocobase/pull/${number}`,
    number,
    branch: `nocoreach/task-${change.key}`,
    files: [
      {
        path: `docs${change.path === '/' ? '/index' : change.path}.mdx`,
        additions: 4,
        deletions: 1,
      },
    ],
    checks: {
      ok: true,
      summary:
        lang === 'zh' ? '构建和链接检查通过' : 'Build and link checks passed',
    },
    release: text(change.note),
    verifyText: text(change.after).slice(0, 40),
    pages: [origin + change.path],
    visibleChanges: [
      {
        page: origin + change.path,
        label: text(change.label),
        before: text(change.before),
        after: text(change.after),
      },
    ],
  };
  let artifact: Artifact | undefined;
  if (!failed) {
    artifact = {
      id: `editorial-${change.key}`,
      planVersion: 0,
      stepId: stages[0].key,
      version: 1,
      createdAt: at(started, 0.1),
      createdBy: 'agent',
      runId,
      content: `${content.notice}**${text(change.label)}**\n\n- ${lang === 'zh' ? '修改前' : 'Before'}：${text(change.before)}\n- ${lang === 'zh' ? '修改后' : 'After'}：${text(change.after)}`,
      pr,
      ...(index > 1
        ? { approvedAt: at(change.age - 1.5), approvedBy: owner }
        : {}),
    };
    work.results = [artifact];
  }
  if (index >= 2) {
    const release: Release = {
      state: 'merging',
      note: text(change.note),
      pages: pr.pages,
      verifyText: pr.verifyText,
      pr: {
        number,
        url: pr.url,
        headSha: randomUUID().replaceAll('-', '').slice(0, 40),
      },
    };
    if (change.state === 'merge_failed')
      Object.assign(release, {
        state: 'merge_failed',
        error: text(change.error!),
      });
    if (change.state === 'verifying')
      Object.assign(release, {
        state: 'verifying',
        mergedAt: at(0, -3),
        checks: 2,
        lastCheckAt: at(0, -0.6),
        nextCheckAt: at(0, 0.4),
        deadline: at(-1),
      });
    if (change.state === 'not_seen')
      Object.assign(release, {
        state: 'not_seen',
        mergedAt: at(2),
        checks: 12,
        lastCheckAt: at(0, -2),
      });
    if (change.state === 'simulated')
      Object.assign(release, { state: 'simulated', pr: undefined });
    if (change.state === 'live') {
      Object.assign(release, {
        state: 'live',
        mergedAt: at(3, -2),
        liveAt: at(3),
        checks: 1,
        lastCheckAt: at(3),
      });
      work.observeFrom = context.clock.dateAgo(3);
      work.history.push({ at: at(3), actor: 'system', action: 'live' });
    }
    work.release = release;
    if (change.state === 'simulated')
      work.history.push({
        at: at(change.age - 2),
        actor: owner,
        action: 'simulatedRelease',
        note: text(change.note),
      });
  }
  return {
    work,
    artifact,
    runs: [run],
    createdAt: at(change.age),
    updatedAt: at(Math.max(0, change.age - 2.5)),
  };
}

/** The demo's page-change tasks, each standing in a different place on the way to going live. */
export async function writeChangeTasks(
  host: DemoHost,
  context: DemoImportContext,
  projectId: string,
  domain: string,
  people: Partial<Record<DemoPerson, string>>,
): Promise<void> {
  const content = demoContent(context.language);
  const lang = context.language === 'en-US' ? 'en' : 'zh';
  const repo = host.db.getRepository('nrSnapshots');
  await host.db.sequelize.transaction(async (transaction: unknown) => {
    for (const change of CHANGES) {
      const built = build(
        context,
        people,
        `https://${domain}`,
        projectId,
        change,
      );
      const row = await host.db.getRepository('nrTasks').create({
        values: {
          projectId,
          taskKey: `nocoreach-demo:${projectId}:${change.key}`,
          title: change.title[lang],
          brief: `${content.notice}${change.brief[lang]}`,
          status: {
            failed: '进行中',
            ready: '待确认',
            merge_failed: '待确认',
            verifying: '进行中',
            not_seen: '待确认',
            simulated: '已完成',
            live: '已完成',
          }[change.state],
          evidence: {
            simulated: true,
            demoEdition: 'nocoreach-demo',
            work: built.work,
          },
          createdAt: built.createdAt,
          updatedAt: built.updatedAt,
        },
        transaction,
      });
      const taskId = String(row.id);
      if (built.artifact)
        await repo.create({
          values: {
            key: `nr-task-artifact:${projectId}:${taskId}:${built.artifact.id}`,
            payload: built.artifact,
          },
          transaction,
        });
      for (const run of built.runs)
        await repo.create({
          values: {
            key: `nr-task-run:${projectId}:${taskId}:${run.id}`,
            payload: { ...run, taskId },
          },
          transaction,
        });
    }
  });
}

interface Exchange {
  ask: L;
  answer: L;
  failed?: L;
}
interface Conversation {
  person: DemoPerson | 'admin';
  age: number;
  title: L;
  turns: readonly Exchange[];
}

const CONVERSATIONS: Conversation[] = [
  {
    person: 'admin',
    age: 1,
    title: t(
      '这周自然搜索为什么涨了？',
      'Why did organic search grow this week?',
    ),
    turns: [
      {
        ask: t(
          '这周自然搜索点击为什么涨了？',
          'Why did organic search clicks grow this week?',
        ),
        answer: t(
          '主要来自三处：入门指南改写后点击比之前高出约三成；「自建 CRM」「开源 CRM」排名上升，CRM 方案页点击增加；《在工作流里调用 AI》在 Hacker News 讨论后仍有长尾流量。图表指南是例外：展示增加，但排名下降，点击反而少了。',
          'Three places: the rewritten getting-started guide earns about 30% more clicks; "self hosted CRM" and "open source CRM" moved up, lifting the CRM page; the AI workflows post keeps a tail after its Hacker News thread. The charts guide is the exception: more impressions, a worse position, fewer clicks.',
        ),
      },
      {
        ask: t(
          '图表指南下一步怎么处理？',
          'What should we do with the charts guide?',
        ),
        answer: t(
          '先对比排在它前面的页面：它们都有完整的时间对比示例和截图。建议补一个「本周与上周对比」的完整例子，并补上图片说明，再观察 7 天。',
          'Compare the pages above it: they all show a complete period comparison with screenshots. Add a full this-week-versus-last-week example and image alt text, then watch for seven days.',
        ),
      },
    ],
  },
  {
    person: 'admin',
    age: 4,
    title: t(
      '起草一条多角色权限的社区回复',
      'Draft a community reply on combined roles',
    ),
    turns: [
      {
        ask: t(
          '帮我回复论坛里「两个角色的权限会覆盖吗」这个帖子。',
          'Help me answer the forum thread "Do two roles override each other?"',
        ),
        answer: t(
          '可以这样回复：多个角色的权限取并集，所以「报表查看」角色能看全部客户时，销售也就能看到全部。建议让「报表查看」只开放图表页面，不给客户表的查看权限；需要严格隔离时，让用户切换角色使用。',
          'You could reply: permissions from several roles add up, so if "report viewer" can see every customer, the rep can too. Give "report viewer" only the chart pages without view access to customers; for strict separation, let users switch roles.',
        ),
      },
    ],
  },
  {
    person: 'admin',
    age: 6,
    title: t('Gridline 最近在做什么？', 'What has Gridline been doing lately?'),
    turns: [
      {
        ask: t(
          '竞品 Gridline 最近在做什么？',
          'What has our competitor Gridline been doing lately?',
        ),
        answer: t(
          'Gridline 的自然搜索流量过去一年基本持平，但 AI 回答里的提及份额最高（约 45%），常被推荐为「最接近 Airtable」的选择。它的 CRM 模板页在「小团队客户管理」相关问题里被引用最多。',
          'Gridline\'s organic traffic is roughly flat over the year, but it has the largest share of AI mentions (about 45%) and is often recommended as "closest to Airtable". Its CRM template is cited most in small-team customer management questions.',
        ),
      },
      {
        ask: t(
          '把它的 CRM 模板和我们的对比一下。',
          'Compare its CRM template with ours.',
        ),
        answer: t('', ''),
        failed: t(
          '模型服务响应超时，这一轮没有完成。可以重新发送。',
          'The model service timed out and this turn did not finish. Send it again.',
        ),
      },
    ],
  },
  {
    person: 'growth',
    age: 2,
    title: t(
      '哪些机会值得这周做？',
      'Which opportunities are worth doing this week?',
    ),
    turns: [
      {
        ask: t(
          '机会列表里哪些值得这周做？',
          'Which opportunities are worth doing this week?',
        ),
        answer: t(
          '优先三条：备份教程补恢复演练（有社区事故佐证）、Docker 首次启动排障路线图（本周三次相关提问）、销售只能看本人客户的权限示例（「CRM 数据权限」28 天 2,140 次展示）。AI 热词那条建议继续搁置。',
          'Three first: restore drills for the backup guide (backed by a community incident), a Docker first-start troubleshooting map (three questions this week), and the own-customers permission example (2,140 impressions in 28 days for "CRM data permissions"). Keep the AI buzzword one parked.',
        ),
      },
    ],
  },
];

/** Earlier online Agent conversations for the importer and the growth lead, answered as the demo model would. */
export async function writeConversations(
  host: DemoHost,
  context: DemoImportContext,
  projectId: string,
  people: Partial<Record<DemoPerson, string>>,
  model: { modelService: string; model: string } | null,
): Promise<void> {
  const lang = context.language === 'en-US' ? 'en' : 'zh';
  const now = context.clock.now.getTime();
  const used = model ?? { modelService: 'demo', model: 'demo-chat' };
  const records = host.db.access!.database.connection().repository<{
    id: string;
    kind: string;
    ownerId: string;
    groupId: string;
    status: string;
    revision: number;
    payload: string;
  }>('nrOnlineAgentRecords');
  for (const conversation of CONVERSATIONS) {
    const ownerId =
      conversation.person === 'admin'
        ? context.actorId
        : people[conversation.person];
    if (!ownerId) continue;
    // The same id shapes the chat service gives its records.
    const id = `online-chat-${randomUUID()}`;
    const start = now - conversation.age * DAY;
    const runs: OnlineRun[] = conversation.turns.map((turn, i) => {
      const created = start + i * 6 * 60_000;
      const usage = {
        inputTokens: 3_200 + i * 1_400,
        outputTokens: turn.failed ? 0 : 420 + i * 90,
      };
      const output = turn.failed ? '' : turn.answer[lang];
      const requestId = randomUUID();
      return {
        id: `online-run-${requestId}`,
        agentId: 'online-default',
        agentName: 'Online Agent',
        requestHash: createHash('sha256').update(requestId).digest('hex'),
        ownerId,
        projectId,
        conversationId: id,
        sequence: i + 1,
        model: used,
        instructions: '',
        input: turn.ask[lang],
        status: turn.failed ? 'failed' : 'completed',
        createdAt: new Date(created).toISOString(),
        startedAt: new Date(created + 1_000).toISOString(),
        finishedAt: new Date(
          created + (turn.failed ? 120_000 : 9_000),
        ).toISOString(),
        deadline: null,
        holder: null,
        cancelRequested: false,
        output,
        events: turn.failed
          ? []
          : [
              { type: 'text', text: output },
              { type: 'usage', model: used.model, usage },
            ],
        usage,
        error: turn.failed ? turn.failed[lang] : null,
        revision: 0,
      };
    });
    const last = runs.at(-1)!;
    const record: OnlineConversation = {
      id,
      ownerId,
      projectId,
      agentId: 'online-default',
      model: used,
      title: conversation.title[lang],
      activeRunId: last.id,
      createdAt: new Date(start).toISOString(),
      updatedAt: last.finishedAt ?? last.createdAt,
      revision: 0,
    };
    await records.createOne({
      values: {
        id,
        kind: 'conversation',
        ownerId,
        groupId: '',
        status: '',
        revision: 0,
        payload: JSON.stringify(record),
      },
    });
    for (const run of runs)
      await records.createOne({
        values: {
          id: run.id,
          kind: 'run',
          ownerId,
          groupId: id,
          status: run.status,
          revision: 0,
          payload: JSON.stringify(run),
        },
      });
  }
}

/** Inbox messages a working week leaves: tasks waiting, a failed release, community questions; some already read. */
export async function writeNotifications(
  host: DemoHost,
  context: DemoImportContext,
  projectId: string,
  people: Partial<Record<DemoPerson, string>>,
): Promise<string[]> {
  const lang = context.language === 'en-US' ? 'en' : 'zh';
  const now = context.clock.now.getTime();
  const tasks = await host.db
    .getRepository('nrTasks')
    .find({ filter: { projectId } });
  const task = (key: string) => {
    const row = tasks.find((r) => String(r.get('taskKey')).endsWith(`:${key}`));
    return row
      ? { path: `/actions/${String(row.id)}`, title: String(row.get('title')) }
      : null;
  };
  const items: [
    person: DemoPerson | 'admin',
    hours: number,
    read: boolean,
    title: L,
    path: string,
    taskKey?: string,
  ][] = [
    [
      'admin',
      2,
      false,
      t(
        '{task}：发布失败，需要处理',
        '"{task}" failed to publish and needs you',
      ),
      '',
      'pricing-environments',
    ],
    [
      'admin',
      5,
      false,
      t(
        '{task}：等你看效果并发布',
        '"{task}" waits for you to check and publish',
      ),
      '',
      'home-self-hosting',
    ],
    [
      'admin',
      20,
      false,
      t('{task}：Agent 没有完成', 'The Agent did not finish "{task}"'),
      '',
      'fix-trigger-link',
    ],
    [
      'admin',
      30,
      true,
      t('论坛有 3 个话题还没人回复', '3 forum topics have no reply yet'),
      '/data/community',
    ],
    [
      'admin',
      52,
      true,
      t(
        '每日分析发现 8 个新机会',
        'The daily analysis found 8 new opportunities',
      ),
      '/opportunities',
    ],
    [
      'admin',
      76,
      true,
      t('NocoCRM 的 Google 授权已过期', "NocoCRM's Google sign-in has expired"),
      '/website',
    ],
    [
      'growth',
      3,
      false,
      t(
        '{task}：等你看效果并发布',
        '"{task}" waits for you to check and publish',
      ),
      '',
      'home-self-hosting',
    ],
    [
      'growth',
      48,
      true,
      t('{editor} 评论了：{task}', '{editor} commented on "{task}"'),
      '',
      'home-self-hosting',
    ],
    [
      'content',
      2,
      false,
      t(
        '{task}：发布失败，需要处理',
        '"{task}" failed to publish and needs you',
      ),
      '',
      'pricing-environments',
    ],
    [
      'devrel',
      4,
      false,
      t(
        '{task}：上线后没在网站上看到改动',
        '"{task}" was not seen live after release',
      ),
      '',
      'api-paging-example',
    ],
    [
      'devrel',
      26,
      true,
      t(
        '{task}：已合并，等待网站更新',
        '"{task}" merged, waiting for the site to update',
      ),
      '',
      'docker-ports',
    ],
  ];
  const editor = demoContent(context.language).people.editor.name;
  const repo = host.db
    .access!.database.connection()
    .repository('notificationInAppItems');
  const ids: string[] = [];
  for (const [person, hours, read, title, path, key] of items) {
    const userId = person === 'admin' ? context.actorId : people[person];
    if (!userId) continue;
    const target = key ? task(key) : null;
    const route = target?.path ?? path;
    const at = new Date(now - hours * HOUR).toISOString();
    const id = randomUUID();
    ids.push(id);
    await repo.createOne({
      values: {
        id,
        deliveryId: randomUUID(),
        notificationId: `${DEMO_NOTIFICATION}${randomUUID().slice(0, 18)}`,
        userId: String(userId),
        title: title[lang]
          .replace('{task}', target?.title ?? '')
          .replace('{editor}', editor),
        body: target?.title ?? title[lang],
        actionUrl: null,
        readAt: read ? new Date(now - (hours - 1) * HOUR).toISOString() : null,
        createdAt: at,
        updatedAt: at,
        target: route ? { type: 'route', path: route } : null,
      },
    });
  }
  return ids;
}

/** The business AI's calls over the last month — daily analysis, opportunity judging, summaries — on the demo model. */
export async function writeUsage(
  host: DemoHost,
  context: DemoImportContext,
  model: { modelService: string; model: string } | null,
): Promise<string[]> {
  if (!model) return [];
  const now = context.clock.now.getTime();
  const repo = host.db.access!.database.connection().repository('agModelUsage');
  const ids: string[] = [];
  for (let day = 30; day >= 1; day--) {
    const calls = [
      [6_800, 1_400],
      [4_100, 650],
      ...(day % 7 === 0 ? [[12_400, 2_300]] : []),
      ...(day % 3 === 0 ? [[2_600, 380]] : []),
    ];
    for (const [i, [input, output]] of calls.entries()) {
      const id = randomUUID();
      ids.push(id);
      const factor = context.clock.sample(`usage:${day}:${i}`) * 0.4 + 0.8;
      await repo.createOne({
        values: {
          id,
          purpose: 'text',
          source: 'nocoreach',
          modelService: model.modelService,
          model: model.model,
          inputTokens: Math.round(input * factor),
          outputTokens: Math.round(output * factor),
          units: 0,
          createdAt: new Date(now - day * DAY + (2 + i) * HOUR).toISOString(),
        },
      });
    }
  }
  return ids;
}

/** Tasks in every release state, conversations, inbox messages and model use, after the demo's other records. */
export async function writeActivity(
  host: DemoHost,
  context: DemoImportContext,
  projectId: string,
  domain: string,
  people: Partial<Record<DemoPerson, string>>,
): Promise<void> {
  await writeChangeTasks(host, context, projectId, domain, people);
  const chat = (await host.agents.models.services.defaults()).effectiveChat as
    { modelService: string; model: string } | null | undefined;
  const model = chat
    ? { modelService: chat.modelService, model: chat.model }
    : null;
  await writeConversations(host, context, projectId, people, model);
  // Tracked, so a failed import removes them with its other writes.
  await context.track(
    'notificationInAppItems',
    await writeNotifications(host, context, projectId, people),
  );
  await context.track('agModelUsage', await writeUsage(host, context, model));
}
