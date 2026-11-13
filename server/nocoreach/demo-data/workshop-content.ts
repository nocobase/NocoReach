import type {
  AiQuestion,
  L,
  Page,
  PerLanguage,
  Query,
} from './world/script/types.js';
import { t } from './world/script/types.js';

// Content workshop demo (2026-11-13): Acme's blog, so that both recommendation columns have articles with their own
// figures (new or rising in the last 30 days; steady search clicks over the past year), and the posts the team adapted
// from them. Reddit and Hacker News posts are written in English in both languages, as those places read English.

const page = (
  path: string,
  title: L,
  description: L,
  sections: readonly (readonly [L, L])[],
  weight: number,
  published: number,
  changes?: Page['changes'],
): Page => ({
  path,
  title,
  description,
  sections,
  weight,
  published,
  updated: published,
  ...(changes ? { changes } : {}),
  links: ['/features/kanban', '/docs/getting-started'],
});

/** Articles new in the last month, or rising, and older ones that keep their search clicks. */
export const WORKSHOP_PAGES: readonly Page[] = [
  page(
    '/blog/client-requests-board',
    t(
      '用看板接住客户需求：从共享收件箱到一张看板',
      'From a shared inbox to one board: handling client requests',
    ),
    t(
      '四人交付团队把客户需求从共享收件箱搬到看板：每列一个阶段，每张卡一位负责人。一个下午搭好，下面是第一周出过的问题和最后留下的做法。',
      'A four-person delivery team moved client requests from a shared inbox to a board: one column per stage, one owner per card. Set up in an afternoon; here is what broke in the first week and what stayed.',
    ),
    [
      [
        t('为什么共享收件箱不够用', 'Why a shared inbox stopped working'),
        t(
          '每个人都能看到所有邮件，但没有一封邮件有负责人。客户追问时，团队要翻三天的往来才能确认谁在跟进。',
          'Everyone could see every email, yet no email had an owner. When a client followed up, the team searched three days of replies to find out who was on it.',
        ),
      ],
      [
        t('看板怎么分列', 'How the columns are set up'),
        t(
          '新需求、确认范围、进行中、等客户、已交付五列。每张卡写明客户、截止日期和负责人，进“等客户”时注明在等什么。',
          'Five columns: New, Scoping, In progress, Waiting on client, Delivered. Each card names the client, the due date and its owner; a card moved to Waiting on client says what it waits for.',
        ),
      ],
      [
        t('第一周出过的问题', 'What broke in the first week'),
        t(
          '一封邮件被拆成三张卡，也有卡在“等客户”停了九天没人发现。后来加了两条规则：一个需求一张卡；等待超过三天，提醒负责人。',
          'One email became three cards, and a card sat in Waiting on client for nine days unnoticed. Two rules fixed it: one request, one card; a card waiting more than three days reminds its owner.',
        ),
      ],
      [
        t('一个月后', 'One month later'),
        t(
          '同样四个人，第一次回复客户的时间从一天半缩短到半天。数字来自这个虚构团队的演示数据，不代表真实客户结果。',
          "With the same four people, the first reply to a client went from a day and a half to half a day. The figures come from this fictional team's demo data, not real customer results.",
        ),
      ],
    ],
    1.3,
    16,
    [
      { kind: 'launch', at: 16, ramp: 3 },
      // Shared in the community forum: clicks have about tripled since.
      { kind: 'step', at: 9, to: 3.2, over: 2 },
    ],
  ),
  page(
    '/blog/choose-pm-tool',
    t(
      '项目管理工具怎么选：电子表格、Acme 和 Nimbus 对比',
      'Choosing a project management tool: spreadsheets, Acme and Nimbus compared',
    ),
    t(
      '先看团队规模和协作方式，再看功能。电子表格适合什么时候，Acme 和 Nimbus 各适合什么团队，迁移前要准备什么。',
      'Start from team size and how you work, then features: when a spreadsheet is enough, which teams Acme and Nimbus suit, and what to prepare before moving.',
    ),
    [
      [
        t('先看团队规模和协作方式', 'Start from team size and how you work'),
        t(
          '人数、要不要跨团队排期、客户是否需要看进度，比功能清单更能决定该用什么。',
          'Headcount, whether schedules cross teams and whether clients need to see progress decide more than any feature list.',
        ),
      ],
      [
        t('电子表格适合什么时候', 'When a spreadsheet is enough'),
        t(
          '五人以内、任务不多、很少跨团队排期时，电子表格完全够用。同一任务改出多个版本、延期后下游最后才知道时，再考虑换工具。',
          'For five people or fewer, a modest task list and little cross-team scheduling, a spreadsheet is fine. Consider a tool once tasks fork into versions and slips reach people downstream last.',
        ),
      ],
      [
        t('Acme 和 Nimbus 的差别', 'Where Acme and Nimbus differ'),
        t(
          '两者都有看板和时间线。Acme 侧重客户协作：客户访客、交付验收和项目周报；Nimbus 侧重内部研发流程。竞品与对比均为虚构样例。',
          'Both have boards and timelines. Acme leans toward client work: client guests, delivery sign-off and weekly reports; Nimbus toward internal engineering workflows. The competitor and the comparison are fictional.',
        ),
      ],
      [
        t('迁移前要准备什么', 'What to prepare before moving'),
        t(
          '保留原表行号，先试导 20 行，核对负责人、状态和日期。同名任务不能直接当成重复。',
          'Keep source row numbers, rehearse an import with 20 rows, and check owners, status and dates. Tasks with the same title are not duplicates.',
        ),
      ],
    ],
    2.4,
    19,
    [{ kind: 'launch', at: 19, ramp: 3 }],
  ),
  page(
    '/blog/ai-meeting-notes',
    t('用 AI 把会议纪要整理成任务', 'Turning meeting notes into tasks with AI'),
    t(
      'AI 从会议纪要里找出待办、负责人和截止日期，生成任务草稿；人确认后才写进项目，没有负责人的条目留给会议主持人分配。',
      'AI picks out action items, owners and due dates from meeting notes and drafts tasks; nothing reaches the project until a person confirms, and items without an owner go back to the meeting host.',
    ),
    [
      [
        t('先找出待办', 'Find the action items first'),
        t(
          'AI 只提取明确的待办：谁、做什么、什么时候。讨论和结论留在纪要里，不变成任务。',
          'AI only extracts clear action items: who, what and by when. Discussion and conclusions stay in the notes.',
        ),
      ],
      [
        t('人确认后再写入', 'A person confirms before anything is written'),
        t(
          '任务草稿先给会议主持人确认，负责人不明确的条目由主持人分配。',
          'The meeting host confirms the drafts and assigns items whose owner is unclear.',
        ),
      ],
    ],
    0.8,
    7,
    [{ kind: 'launch', at: 7, ramp: 2 }],
  ),
  page(
    '/blog/shared-designer',
    t(
      '一个设计师同时排三个项目：跨项目资源怎么排期',
      'One designer, three projects: scheduling shared people across projects',
    ),
    t(
      '同一位设计师同时参与网站、活动和产品发布时，按周看负荷，先排有硬性截止日期的交付，冲突提前一周提出来。',
      'When one designer works on a website, an event and a launch at once, look at load by week, schedule fixed deadlines first and raise conflicts a week ahead.',
    ),
    [
      [
        t('按周看负荷', 'Look at load by week'),
        t(
          '把三个项目里分给同一个人的任务放到一张周视图里，超过 40 小时的周标出来。',
          "Put one person's tasks from all three projects in one weekly view and mark weeks over 40 hours.",
        ),
      ],
      [
        t('先排有硬性截止日期的交付', 'Fixed deadlines first'),
        t(
          '活动日期和发布日期不能动，先排；网站改版这类可以分批交付的往后放。',
          'Event and launch dates cannot move, so they go first; work that can ship in parts, like a site refresh, follows.',
        ),
      ],
    ],
    1,
    240,
    // A planning season: more people search for it this month.
    [{ kind: 'step', at: 11, to: 1.75, over: 2 }],
  ),
  page(
    '/blog/acme-2-4-1',
    t(
      'Acme 2.4.1：导入任务前先预览',
      'Acme 2.4.1: preview task imports before they run',
    ),
    t(
      '导入前先列出将要新建、更新和跳过的任务数量；失败的行保留原表行号和原因；同名任务按负责人和日期区分。',
      'Imports now list how many tasks will be created, updated and skipped before writing; failed rows keep their row number and reason; tasks sharing a title are told apart by owner and date.',
    ),
    [
      [
        t('导入前先看预览', 'Preview before you import'),
        t(
          '上传表格后，Acme 先列出将要新建、更新和跳过的任务数量，确认后才写入。',
          'After you upload a sheet, Acme lists how many tasks will be created, updated and skipped. Nothing is written until you confirm.',
        ),
      ],
      [
        t('失败行保留原始行号', 'Failed rows keep their row numbers'),
        t(
          '日期格式不对或负责人匹配不上的行会单独列出，并标出它在原表里的行号和原因，改完只重试这些行。',
          'Rows with an unreadable date or an owner that matches no member are listed with their row number in the sheet and the reason. Fix them and retry only those rows.',
        ),
      ],
      [
        t('同名任务不再当成重复', 'The same title is not a duplicate'),
        t(
          '每周例会这类同名任务按负责人和日期区分，不会被合并。',
          'Tasks that share a name, such as a weekly meeting, are told apart by owner and date and never merged.',
        ),
      ],
      [
        t('怎么开始用', 'Getting started'),
        t(
          '2.4.1 对所有方案开放。导入入口在项目设置 › 导入，已有的导入记录不受影响。',
          'Version 2.4.1 is on every plan. Import is under Project settings › Import; earlier imports are not affected.',
        ),
      ],
    ],
    0.6,
    15,
    [{ kind: 'launch', at: 15, ramp: 2 }],
  ),
  page(
    '/blog/gantt-vs-kanban',
    t(
      '甘特图和看板有什么区别',
      'Gantt charts vs. Kanban boards: what is the difference',
    ),
    t(
      '甘特图看时间和依赖，看板看每项工作走到哪一步。交付日期固定、依赖多的项目先用甘特图，持续流入的需求用看板。',
      'A Gantt chart shows time and dependencies; a board shows where each piece of work stands. Use a Gantt chart for fixed dates and many dependencies, a board for a steady flow of requests.',
    ),
    [
      [
        t('两者各看什么', 'What each one shows'),
        t(
          '甘特图回答“什么时候做完、谁在等谁”，看板回答“现在卡在哪一步”。',
          'A Gantt chart answers when work finishes and who waits on whom; a board answers where work is stuck now.',
        ),
      ],
      [
        t('什么时候用哪一个', 'When to use which'),
        t(
          '活动、发布这类日期固定的项目用甘特图；客户需求、支持请求这类持续流入的工作用看板。很多团队两者同时用。',
          'Use a Gantt chart for fixed-date projects such as events and launches, and a board for work that keeps arriving, such as client requests. Many teams use both.',
        ),
      ],
    ],
    2.2,
    520,
  ),
  page(
    '/blog/client-portal',
    t('给客户开一个只读项目门户', 'Give clients a read-only project portal'),
    t(
      '客户只看获邀的里程碑、交付物和周报，不看内部讨论。邀请前确认可见范围，项目结束后撤销访问。',
      'Clients see the milestones, deliverables and reports they are invited to, not internal discussion. Check what they can see before inviting them and revoke access when the project ends.',
    ),
    [
      [
        t('客户能看到什么', 'What clients can see'),
        t(
          '获邀的里程碑、交付物和项目周报；任务评论和内部附件默认不可见。',
          'Invited milestones, deliverables and weekly reports; task comments and internal attachments stay hidden by default.',
        ),
      ],
      [
        t('项目结束后', 'When the project ends'),
        t(
          '结项不会自动撤销访客权限，交接清单里加一项“撤销客户访问”。',
          'Closing a project does not revoke guest access, so add “Revoke client access” to the handover checklist.',
        ),
      ],
    ],
    1.6,
    430,
    [{ kind: 'launch', at: 430, ramp: 14 }],
  ),
  page(
    '/blog/project-kickoff',
    t(
      '项目启动会怎么开：一份议程模板',
      'How to run a project kickoff: an agenda template',
    ),
    t(
      '45 分钟的启动会只做四件事：确认目标和范围、认领负责人、对齐里程碑、约定沟通方式。会后当天把决定写进项目。',
      'A 45-minute kickoff does four things: confirm goals and scope, name owners, agree milestones and settle how to communicate. Record the decisions in the project the same day.',
    ),
    [
      [
        t('议程', 'The agenda'),
        t(
          '目标和范围 10 分钟，负责人 10 分钟，里程碑 15 分钟，沟通方式 10 分钟。',
          'Goals and scope 10 minutes, owners 10, milestones 15, communication 10.',
        ),
      ],
      [
        t('会后当天', 'The same day'),
        t(
          '把每个决定写成任务或里程碑，并指定负责人；没有负责人的决定不算定下来。',
          'Turn every decision into a task or milestone with an owner; a decision without an owner is not settled.',
        ),
      ],
    ],
    1.3,
    330,
    [{ kind: 'launch', at: 330, ramp: 14 }],
  ),
];

/** Search phrases for each article, in the supported Taiwan and US markets. */
export const WORKSHOP_SEARCH_TERMS: Record<
  string,
  PerLanguage<readonly string[]>
> = {
  '/blog/client-requests-board': {
    zh: ['客戶需求管理', '客戶需求管理 看板', '如何管理客戶需求'],
    en: [
      'client request management',
      'client request management board',
      'how to manage client requests',
    ],
  },
  '/blog/choose-pm-tool': {
    zh: ['專案管理工具 比較', '專案管理工具 試算表', '專案管理工具怎麼選'],
    en: [
      'project management tool comparison',
      'project management tool vs spreadsheet',
      'how to pick a project management tool',
    ],
  },
  '/blog/ai-meeting-notes': {
    zh: ['AI 會議記錄', 'AI 會議記錄 轉任務', '如何用 AI 整理會議記錄'],
    en: [
      'ai meeting notes',
      'ai meeting notes to tasks',
      'how to turn meeting notes into tasks',
    ],
  },
  '/blog/shared-designer': {
    zh: ['跨專案資源排程', '跨專案資源排程 設計師', '如何安排跨專案人力'],
    en: [
      'cross-project resource scheduling',
      'cross-project resource scheduling for designers',
      'how to schedule shared people across projects',
    ],
  },
  '/blog/acme-2-4-1': {
    zh: ['Acme 匯入預覽', 'Acme 2.4.1 更新', 'Acme 匯入失敗怎麼辦'],
    en: [
      'acme import preview',
      'acme 2.4.1 release',
      'acme import failed rows',
    ],
  },
  '/blog/gantt-vs-kanban': {
    zh: ['甘特圖 看板', '甘特圖 看板 差異', '甘特圖和看板怎麼選'],
    en: [
      'gantt chart vs kanban',
      'gantt chart vs kanban board differences',
      'when to use a gantt chart or kanban',
    ],
  },
  '/blog/client-portal': {
    zh: ['客戶專案入口', '客戶專案入口 權限', '如何給客戶看專案進度'],
    en: [
      'client project portal',
      'client project portal permissions',
      'how to share project progress with clients',
    ],
  },
  '/blog/project-kickoff': {
    zh: ['專案啟動會議', '專案啟動會議 議程', '如何開好專案啟動會議'],
    en: [
      'project kickoff meeting',
      'project kickoff meeting agenda',
      'how to run a project kickoff meeting',
    ],
  },
};

const changesOf = (path: string) =>
  WORKSHOP_PAGES.find((p) => p.path === path)?.changes;
const head = (
  path: string,
  zh: string,
  en: string,
  impressions: number,
  position: number,
): PerLanguage<Query> => {
  const changes = changesOf(path);
  const query = {
    path,
    impressions,
    position,
    ...(changes ? { changes } : {}),
  };
  return { zh: { q: zh, ...query }, en: { q: en, ...query } };
};

/** The query that brings each article most of its clicks. */
const HEAD_QUERIES = [
  head(
    '/blog/client-requests-board',
    '客戶需求 看板',
    'client requests kanban',
    120,
    2.6,
  ),
  head(
    '/blog/choose-pm-tool',
    '專案管理工具推薦',
    'best project management tool for small teams',
    150,
    2.4,
  ),
  head(
    '/blog/ai-meeting-notes',
    '會議記錄 自動建立任務',
    'meeting notes to action items ai',
    60,
    3.5,
  ),
  head(
    '/blog/shared-designer',
    '共用人力 排程',
    'shared resource scheduling',
    80,
    4.2,
  ),
  head('/blog/gantt-vs-kanban', '甘特圖 vs 看板', 'gantt vs kanban', 200, 3.3),
  head(
    '/blog/client-portal',
    '給客戶看專案進度',
    'share project status with clients',
    140,
    3.8,
  ),
  head(
    '/blog/project-kickoff',
    '專案啟動會議 議程範本',
    'project kickoff agenda template',
    110,
    4.4,
  ),
];
export const WORKSHOP_QUERIES: PerLanguage<Query[]> = {
  zh: HEAD_QUERIES.map((q) => q.zh),
  en: HEAD_QUERIES.map((q) => q.en),
};

/** An AI question the comparison article answers, cited by every platform asked. */
export const WORKSHOP_AI: AiQuestion = {
  question: t(
    '项目管理工具怎么选？电子表格什么时候不够用？',
    'How do I choose a project management tool, and when is a spreadsheet no longer enough?',
  ),
  answer: t(
    '虚构演示资料说明：先看团队规模和协作方式；五人以内、任务不多时电子表格够用，跨团队排期或客户需要看进度时再换专门工具。',
    'The fictional demo explains: start from team size and how you work; a spreadsheet suits small teams with few tasks, and a dedicated tool pays off once schedules cross teams or clients need to see progress.',
  ),
  cites: ['/blog/choose-pm-tool'],
  volume: 260,
  topics: ['project management', 'task management'],
};

/** The brand kit's own community, and the voice Memory gives the adaptations. */
export const WORKSHOP_BRAND = {
  community: {
    name: t('Acme 社区', 'Acme Community'),
    url: 'https://community.acme.example/',
    sections: {
      zh: ['教程', '公告', '问答'],
      en: ['Tutorials', 'Announcements', 'Q&A'],
    },
  },
  voice: t(
    '像同事之间说话：直接、具体，用真实的协作场景举例。不写“颠覆”“一键解决”这类说法；数字只写有出处的，演示数据要说明是虚构的。面向社区时先说明自己是 Acme 团队的人。',
    'Talk like a colleague: direct and specific, with real collaboration scenes as examples. No "revolutionary" or "one click solves it"; only give figures with a source, and say when demo data is fictional. In communities, say first that you work on Acme.',
  ),
};

/** The topic the team adapted without an article: an online session two weeks from now. */
export const WORKSHOP_TOPIC = {
  topic: (date: L) =>
    t(
      `${date.zh}线上分享：用看板接住客户需求`,
      `Online session on ${date.en}: handling client requests on a board`,
    ),
  points: t(
    '晚上 8 点线上直播，约 40 分钟。\n现场演示：把共享收件箱里的需求搬到看板，设置等待超过三天的提醒。\n报名后会收到回放链接。',
    '8 pm, online, about 40 minutes.\nLive demo: move requests from a shared inbox onto a board and remind owners after three days of waiting.\nEveryone who signs up gets the recording.',
  ),
  links: ['https://acme.example/events/client-requests-board'],
};

export type WorkshopDraftSource =
  { kind: 'article'; path: string } | { kind: 'topic' };
export type WorkshopDraftPlace =
  | { kind: 'reddit'; subreddit: string; discussions?: number }
  | { kind: 'hn' }
  | { kind: 'own'; section: number };

/** One adaptation the demo team made: the form, where it came from, where it goes and the Agent's draft. */
export interface WorkshopDraft {
  key: string;
  form: 'x' | 'linkedin' | 'community';
  source: WorkshopDraftSource;
  destination?: WorkshopDraftPlace;
  state: 'review' | 'done';
  owner: 'content' | 'devrel';
  /** Days ago the task was created; the draft arrives a few minutes later. */
  created: number;
  /** Days ago the draft was approved. */
  approved?: number;
  /** `{date}` is the session's date, `{name}` the owner's name. */
  draft: L;
}

const english = (text: string): L => ({ zh: text, en: text });

/** Oldest first, so their task numbers follow the order they were made in. */
export const WORKSHOP_DRAFTS: readonly WorkshopDraft[] = [
  // Adapted to LinkedIn four months ago, so Library shows an older article already made into a post.
  {
    key: 'kickoff-linkedin',
    form: 'linkedin',
    source: { kind: 'article', path: '/blog/project-kickoff' },
    state: 'done',
    owner: 'content',
    created: 121.2,
    approved: 120.8,
    draft: t(
      `## Post
Sections: 1–2
项目启动会开了两个小时，散会时还是没人知道谁负责什么。这种情况我们见得太多了。

我们现在的启动会只开 45 分钟，只做四件事：目标和范围 10 分钟，认领负责人 10 分钟，对齐里程碑 15 分钟，约定沟通方式 10 分钟。

最重要的一条规矩：会后当天，把每个决定写成任务或里程碑，并指定负责人。没有负责人的决定，不算定下来。

完整的议程模板放在评论区，可以直接拿去用。`,
      `## Post
Sections: 1–2
A two-hour kickoff, and at the end nobody knows who owns what. We have seen it too many times.

Our kickoffs now take 45 minutes and do four things: goals and scope for 10 minutes, owners for 10, milestones for 15, and how we communicate for 10.

The one rule that matters most: the same day, turn every decision into a task or milestone with an owner. A decision without an owner is not settled.

The full agenda template is in the first comment, ready to copy.`,
    ),
  },
  {
    key: 'estimation-x',
    form: 'x',
    source: { kind: 'article', path: '/blog/estimation' },
    state: 'done',
    owner: 'content',
    created: 16.2,
    approved: 15.8,
    draft: t(
      `## Post 1
Sections: 1
估时总是不准？先别急着找更好的公式。比较同类任务的计划投入和实际投入，差距在哪一类任务上最大，就从哪一类开始改。
## Post 2
Sections: 1
每次估时都记下两件事：范围后来变了多少，开始时有哪些不知道的事。这两项通常比“估错了”本身更能解释偏差。
## Post 3
Sections: 1
也别太早下结论。十几条历史任务证明不了估时准确率，估时需要定期复查，而不是一次定死。
## Reply
全文：https://acme.example/blog/estimation`,
      `## Post 1
Sections: 1
Estimates always off? Before looking for a better formula, compare planned and actual effort for similar tasks, and start with the kind of task where the gap is largest.
## Post 2
Sections: 1
Each time you estimate, note two things: how much the scope changed later, and what you didn't know at the start. Those usually explain the gap better than "we estimated wrong".
## Post 3
Sections: 1
And don't conclude too early. A dozen past tasks can't prove how accurate your estimates are. Revisit estimates regularly instead of fixing them once.
## Reply
Full post: https://acme.example/blog/estimation`,
    ),
  },
  {
    key: 'choose-tool-linkedin',
    form: 'linkedin',
    source: { kind: 'article', path: '/blog/choose-pm-tool' },
    state: 'done',
    owner: 'content',
    created: 8.3,
    approved: 7.9,
    draft: t(
      `## Post
Sections: 1–4
“我们该不该换掉电子表格？”这是小团队问我们最多的问题之一。

我们的看法是：先别比功能，先看团队怎么协作。

五个人以内、任务不多、很少跨团队排期时，电子表格完全够用。问题通常出在三件事上：同一个任务改出了三个版本，没人知道哪个是最新的；前置任务延期了，后面的人最后才知道；客户想看进度，只能截图发过去。

出现这些情况，才值得换工具。换之前先把现有的表整理好：保留原表行号，先试导 20 行，核对负责人和日期。

我们把电子表格、Acme 和 Nimbus 放在一起比了一遍，写清楚各自适合什么团队。链接放在评论区。`,
      `## Post
Sections: 1–4
"Should we move off spreadsheets?" is one of the questions small teams ask us most.

Our answer: don't start by comparing features. Start with how your team works together.

For five people or fewer, a modest task list and little cross-team scheduling, a spreadsheet is fine. It usually breaks down in three places: a task edited into three versions with no one sure which is current; a slipped task that the people downstream hear about last; and a client who wants a status update and gets a screenshot.

When those start happening, a dedicated tool earns its keep. Before you switch, clean up what you have: keep the source row numbers, rehearse an import with 20 rows, and check owners and dates.

We compared spreadsheets, Acme and Nimbus side by side and wrote down which kind of team each one suits. Link in the first comment.`,
    ),
  },
  {
    key: 'choose-tool-community',
    form: 'community',
    source: { kind: 'article', path: '/blog/choose-pm-tool' },
    destination: { kind: 'own', section: 0 },
    state: 'done',
    owner: 'devrel',
    created: 8.3,
    approved: 7.1,
    draft: t(
      `## Title
项目管理工具怎么选：电子表格、Acme 和 Nimbus 各适合什么团队
## Body
Sections: 1–4
我是 Acme 团队的{name}。论坛里经常有人问“我们团队该用什么工具管项目”，这里把我们写过的对比整理成一篇，方便大家对照自己的情况。

先看团队规模和协作方式
人数、要不要跨团队排期、客户是否需要看进度，比功能清单更能决定该用什么。

电子表格适合什么时候
五人以内、任务不多、很少跨团队排期时，电子表格完全够用，不用为了“规范”换工具。

Acme 和 Nimbus 的差别
两者都有看板和时间线。Acme 更侧重客户协作：客户访客、交付验收和项目周报；Nimbus 更侧重内部研发流程。具体差别以两边的官方文档为准。

迁移前要准备什么
保留原表行号，先试导 20 行，核对负责人、状态和日期。同名任务不要直接当成重复。

完整对比：https://acme.example/blog/choose-pm-tool
如果你们团队已经从表格换到了别的工具，欢迎在下面说说当时卡在哪里。
## Rules
- 教程版的帖子要能独立看懂，不只贴链接
- 涉及竞品时只写可以核实的差别`,
      `## Title
Choosing a project management tool: which teams spreadsheets, Acme and Nimbus suit
## Body
Sections: 1–4
I'm {name} from the Acme team. "What should our team use to manage projects?" comes up here a lot, so I've turned the comparison we wrote into one post you can check against your own situation.

Start from team size and how you work together
Headcount, whether schedules cross teams and whether clients need to see progress decide more than any feature list.

When a spreadsheet is enough
For five people or fewer, a modest task list and little cross-team scheduling, a spreadsheet is fine. There is no need to switch tools for the sake of it.

Where Acme and Nimbus differ
Both have boards and timelines. Acme leans toward client work: client guests, delivery sign-off and weekly project reports. Nimbus leans toward internal engineering workflows. Check both products' own documentation for the details.

What to prepare before moving
Keep source row numbers, rehearse an import with 20 rows, and check owners, status and dates. Don't treat tasks with the same title as duplicates.

Full comparison: https://acme.example/blog/choose-pm-tool
If your team has already moved from spreadsheets to another tool, tell us below where you got stuck.
## Rules
- Tutorial posts must make sense on their own, not just a link
- Only state differences from competitors that can be checked`,
    ),
  },
  {
    key: 'session-community',
    form: 'community',
    source: { kind: 'topic' },
    destination: { kind: 'own', section: 1 },
    state: 'done',
    owner: 'devrel',
    created: 4.3,
    approved: 3.9,
    draft: t(
      `## Title
{date}线上分享：用看板接住客户需求
## Body
大家好，我们是 Acme 团队。{date}晚上 8 点，我们会做一场约 40 分钟的线上分享，主题是怎么把散在共享收件箱里的客户需求搬到看板上。

会讲什么
· 看板怎么分列：新需求、确认范围、进行中、等客户、已交付；
· 每张卡写明客户、截止日期和一位负责人；
· 卡片在“等客户”停超过三天时，怎么提醒负责人。

现场会用一个四人交付团队的演示项目从头搭一遍，最后留 10 分钟答疑。

报名链接：https://acme.example/events/client-requests-board
报名后会收到回放链接，当天来不了也可以之后看。
## Rules
- 公告版只发产品更新和活动通知
- 活动帖写明时间和报名方式`,
      `## Title
Online session on {date}: handling client requests on a board
## Body
Hi all, this is the Acme team. On {date} at 8 pm we're running a 40-minute online session on moving client requests out of a shared inbox and onto a board.

What we'll cover
• How to set up the columns: New, Scoping, In progress, Waiting on client, Delivered
• One client, one due date and one owner on every card
• Reminding the owner when a card has waited on the client for more than three days

We'll build it from scratch in a demo project for a four-person delivery team, then take questions for the last 10 minutes.

Sign up: https://acme.example/events/client-requests-board
Everyone who signs up gets the recording, so you can watch later if the time doesn't work.
## Rules
- Announcements is for product updates and events only
- Event posts give the time and how to sign up`,
    ),
  },
  {
    key: 'session-x',
    form: 'x',
    source: { kind: 'topic' },
    state: 'done',
    owner: 'content',
    created: 4.3,
    approved: 3.8,
    draft: t(
      `## Post 1
{date}晚上 8 点，我们做一场 40 分钟的线上分享：怎么把共享收件箱里的客户需求搬到看板上。
## Post 2
会现场搭一遍：五列怎么分，每张卡写什么，卡在“等客户”超过三天怎么提醒负责人。最后 10 分钟答疑。
## Post 3
当天来不了也没关系，报名后会收到回放链接。
## Reply
报名：https://acme.example/events/client-requests-board`,
      `## Post 1
On {date} at 8 pm we're running a 40-minute online session: moving client requests from a shared inbox onto a board.
## Post 2
We'll build it live: the five columns, what goes on each card, and how a card waiting on the client for more than three days reminds its owner. Q&A for the last 10 minutes.
## Post 3
Can't make it? Everyone who signs up gets the recording.
## Reply
Sign up: https://acme.example/events/client-requests-board`,
    ),
  },
  {
    key: 'release-x',
    form: 'x',
    source: { kind: 'article', path: '/blog/acme-2-4-1' },
    state: 'done',
    owner: 'content',
    created: 3.2,
    approved: 2.9,
    draft: t(
      `## Post 1
Sections: 1
Acme 2.4.1 上线了：导入 Excel 任务前，先看一眼预览。会新建多少条、更新多少条、跳过多少条，确认之后才真正写入。
## Post 2
Sections: 2
导入失败的行不再只给一句“格式错误”。每一行都标出它在原表里的行号和原因，比如日期写成了 10/11、负责人找不到，改完只重试这几行。
## Post 3
Sections: 3–4
还有一个常见误会：任务同名不等于重复。每周例会这类同名任务按负责人和日期区分，不会被合并。2.4.1 对所有方案开放。
## Reply
更新说明：https://acme.example/blog/acme-2-4-1`,
      `## Post 1
Sections: 1
Acme 2.4.1 is out: task imports now start with a preview. You see how many tasks will be created, updated and skipped before anything is written.
## Post 2
Sections: 2
Failed rows no longer get a bare "invalid format". Each one shows its row number in your sheet and the reason, like a 10/11 date or an owner we could not match. Fix them and retry just those rows.
## Post 3
Sections: 3–4
And a common surprise: the same title is not a duplicate. Weekly meetings that share a name are told apart by owner and date, so they are never merged. 2.4.1 is on every plan.
## Reply
Release notes: https://acme.example/blog/acme-2-4-1`,
    ),
  },
  {
    key: 'release-community',
    form: 'community',
    source: { kind: 'article', path: '/blog/acme-2-4-1' },
    destination: { kind: 'own', section: 1 },
    state: 'done',
    owner: 'devrel',
    created: 3.2,
    approved: 2.6,
    draft: t(
      `## Title
Acme 2.4.1 发布：导入前预览，失败行保留行号
## Body
Sections: 1–4
大家好，我们是 Acme 团队。2.4.1 今天对所有方案开放，这一版只改导入，解决论坛里大家反复提到的“导入完才发现不对”。

导入前先看预览
上传表格后，Acme 会先列出将要新建、更新和跳过的任务数量，你确认之后才写入。

失败行保留原始行号
日期格式不对、负责人匹配不上的行会单独列出，并标出它在原表里的行号和原因。改完之后只重试这些行，不用整张表重来。

同名任务不再当成重复
每周例会这类同名任务，按负责人和日期区分，不会被合并。

导入入口在项目设置 › 导入，已有的导入记录不受影响。用的时候遇到问题，直接在这个帖子下回复，我们会逐条看。
完整说明：https://acme.example/blog/acme-2-4-1
## Rules
- 公告版只发产品更新和活动通知
- 标题写明版本号`,
      `## Title
Acme 2.4.1: preview imports before they run, failed rows keep their row numbers
## Body
Sections: 1–4
Hi all, this is the Acme team. 2.4.1 is available on every plan today. It changes one thing, imports, and it comes straight from the "I only found out after the import" threads here.

Preview before you import
After you upload a sheet, Acme lists how many tasks will be created, updated and skipped. Nothing is written until you confirm.

Failed rows keep their row numbers
Rows with a date it cannot read or an owner it cannot match are listed separately, with their row number in your sheet and the reason. Fix them and retry only those rows.

The same title is not a duplicate
Tasks that share a name, like a weekly meeting, are told apart by owner and date and never merged.

You'll find import under Project settings › Import; earlier imports are not affected. If something doesn't work as described, reply here and we'll go through every report.
Release notes: https://acme.example/blog/acme-2-4-1
## Rules
- Announcements is for product updates and events only
- Put the version number in the title`,
    ),
  },
  {
    key: 'release-hn',
    form: 'community',
    source: { kind: 'article', path: '/blog/acme-2-4-1' },
    destination: { kind: 'hn' },
    state: 'done',
    owner: 'devrel',
    created: 3.2,
    approved: 2.2,
    draft: english(`## Title
Acme 2.4.1 – Task imports now preview before writing anything
## Body
Sections: 1–3
I work on Acme, a project management tool for small delivery teams. We changed how task imports work, and I'd like feedback on the approach more than on the product.

Imports used to be one step: upload a sheet, tasks appear. When a 240-row sheet had dates in three formats and owners written as nicknames, people found out afterwards and had to delete everything and import again.

Now an import is a dry run first. It reports how many tasks would be created, updated and skipped, and lists failed rows with their original row number and the reason (a date it cannot parse, an owner that matches no member). You fix those rows and retry only them.

One decision we went back and forth on: rows with the same title are not treated as duplicates. Recurring meetings share names, so we match on title, owner and date together. That lets some real duplicates through. Has anyone found a better key for this?
## Rules
- Use the original title, no editorializing
- Disclose your affiliation in the text
- Don't ask for votes`),
  },
  {
    key: 'release-linkedin',
    form: 'linkedin',
    source: { kind: 'article', path: '/blog/acme-2-4-1' },
    state: 'review',
    owner: 'content',
    created: 0.9,
    draft: t(
      `## Post
Sections: 1–3
最近两周，我们论坛里有 5 个帖子在问 Excel 导入，最常见的一句话是：“导入完才发现不对。”

一张 240 行的任务表，日期有三种写法，负责人有的写全名有的写昵称，还有每周都叫“例会”的任务。以前导入一步完成，错了只能全部删掉重来。

Acme 2.4.1 把导入拆成了先预览、再写入：
· 写入之前，先列出将要新建、更新和跳过的数量；
· 失败的行标出它在原表里的行号和原因，改完只重试这些行；
· 同名任务按负责人和日期区分，不再被当成重复合并。

改动不大，但导入从一次碰运气，变成了一个可以检查的步骤。

2.4.1 对所有方案开放，更新说明放在评论区。`,
      `## Post
Sections: 1–3
In the last two weeks, five threads in our forum asked about Excel imports. The line that kept coming up: "I only found out it was wrong after the import."

A 240-row task sheet, dates written three different ways, owners listed by full name in one row and by nickname in the next, and a "Weekly sync" task every week. Imports used to run in one step. If something was off, you deleted everything and started again.

Acme 2.4.1 splits import into preview, then write:
• Before anything is written, you see how many tasks will be created, updated and skipped.
• Failed rows show their row number in your sheet and the reason. Fix them and retry only those rows.
• Tasks with the same title are told apart by owner and date instead of being merged as duplicates.

A small change, but importing is now a step you can check rather than a gamble.

2.4.1 is available on every plan. Release notes in the first comment.`,
    ),
  },
  {
    key: 'requests-reddit',
    form: 'community',
    source: { kind: 'article', path: '/blog/client-requests-board' },
    destination: {
      kind: 'reddit',
      subreddit: 'projectmanagement',
      discussions: 3,
    },
    state: 'review',
    owner: 'devrel',
    created: 0.4,
    draft: english(`## Title
We moved client requests from a shared inbox to a board in one afternoon. Here's what broke in week one
## Body
Sections: 1–4
Disclosure: I work on Acme, a project management tool, and this is our own team's setup. I'm posting it because the problems we hit were not about any particular tool.

Four of us handle client requests for a small delivery team. For two years everything came into one shared inbox. Everyone could see every email, and no email had an owner. When a client followed up, we spent ten minutes working out who had replied last.

The board has five columns: New, Scoping, In progress, Waiting on client, Delivered. Each card names the client, the due date and one owner. A card moved to Waiting on client has to say what it is waiting for.

What broke in the first week:
- One email turned into three cards because three people picked it up. Rule since then: one request, one card, and whoever triages it first owns it.
- A card sat in Waiting on client for nine days and nobody noticed. Now a card that waits more than three days reminds its owner.

A month in, with the same four people, our first reply went from about a day and a half to about half a day. It's one small team, so read that as a direction rather than a benchmark.

How do you handle requests that are waiting on the client? Do you time-box them, or close and reopen?
## Rules
- Disclose any affiliation with a product you mention
- No link-only posts; the post has to stand on its own
- Self-promotion at most 1 in 10 of your posts and comments
- Use a descriptive title, no clickbait
- Questions about specific tools go in the weekly tools thread
- Be civil`),
  },
];
