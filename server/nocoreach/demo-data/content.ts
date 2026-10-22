import {
  DEMO_DOCUMENTS,
  DEMO_STORIES,
  type DemoStory,
} from '../demo-content.js';
import { briefs as ZH_BRIEFS } from '../demo-opportunities.js';
import { EN_US } from './content-en-US.js';

/** The people of the demo. Each is a sign-in; the stories' comments name them. */
export type DemoPerson =
  'growth' | 'editor' | 'content' | 'devrel' | 'consultant' | 'admin';

type Brief = readonly [
  key: string,
  title: string,
  observation: string,
  meaning: string,
  suggestion: string,
  objective: string,
  path: string,
  source: string,
  priority: 'high' | 'medium' | 'low',
];

/** Everything the demo says, in one language. Comments read `<name> · <team>: <text>`, the name a demo person's. */
export interface DemoContent {
  notice: string;
  taskNote: string;
  flows: Record<
    'content' | 'research',
    { name: string; draft: string; review: string; checklist: string }
  >;
  sourcePage: string;
  uncertainty: string;
  observationNote: string;
  projects: Record<
    'main' | 'second',
    {
      name: string;
      domain: string;
      description: string;
      audience: string;
      market: string;
    }
  >;
  people: Record<DemoPerson, { username: string; name: string; title: string }>;
  roles: Record<'growth' | 'editor' | 'community' | 'viewer' | 'admin', string>;
  stories: readonly DemoStory[];
  documents: readonly {
    key: string;
    title: string;
    category: string;
    text: string;
  }[];
  opportunities: {
    notice: string;
    limitation: string;
    priorityHigh: string;
    priorityOther: string;
    audience: string;
    observations: readonly string[];
    doReason: string;
    skipReason: string;
    briefs: readonly Brief[];
    watches: readonly (readonly [
      key: string,
      title: string,
      fact: string,
      waitingFor: string,
    ])[];
    normal: readonly [title: string, fact: string];
    goal: { intent: string; audience: string; focus: string; progress: string };
  };
  /** The second project's few tasks. */
  secondTasks: readonly DemoStory[];
  chat: {
    metricsIntro: string;
    metricsLine: string;
    metricsOutro: string;
    tasksIntro: string;
    /** Board states as people read them. */
    states: Record<string, string>;
    tasksOutro: string;
    opportunitiesIntro: string;
    opportunitiesOutro: string;
    none: string;
  };
}

/** The Chinese demo reuses the hand-written editorial material of the simulated deployment. */
const ZH_CN: DemoContent = {
  notice:
    '> 人工编写的虚构演示资料；人物、讨论、指标和历史成果不代表真实客户、Agent 执行或线上发布。\n\n',
  taskNote:
    '人工编写的演示情景。未指派真实 Agent，未执行模型、Runner 或对外发布。',
  flows: {
    content: {
      name: '内容起草与人工复核',
      draft: '准备内容稿',
      review: '核对事实与适用边界',
      checklist: '核对引用、权限与不确定项',
    },
    research: {
      name: '问题研究与人工复核',
      draft: '整理研究资料',
      review: '核对事实与适用边界',
      checklist: '核对引用、权限与不确定项',
    },
  },
  sourcePage: '演示项目页面',
  uncertainty: '全部资料为手工编写的合成样例，未验证真实产品或流量。',
  observationNote: '人工编写的历史观察样例，不是实际发布效果，不据此推断因果。',
  projects: {
    main: {
      name: 'NocoBase',
      domain: 'nocobase.example',
      description:
        '虚构的开源低代码业务应用平台；所有指标、任务与讨论均为演示数据。',
      audience: '实施顾问、运营负责人与企业内部开发团队',
      market: '全球',
    },
    second: {
      name: 'NocoCRM',
      domain: 'nococrm.example',
      description:
        '基于 NocoBase 的虚构 CRM 产品，刚加入团队的项目列表，目前只接入了网站和 Google。',
      audience: '中小企业销售主管与销售团队',
      market: '中国大陆',
    },
  },
  people: {
    growth: { username: 'xulan', name: '许岚', title: '增长负责人' },
    editor: { username: 'linyao', name: '林遥', title: '内容主编' },
    content: { username: 'zhouning', name: '周宁', title: '内容编辑' },
    devrel: { username: 'hechuan', name: '何川', title: '开发者关系' },
    consultant: {
      username: 'chencheng',
      name: '陈澄',
      title: '实施顾问',
    },
    admin: { username: 'admin', name: '赵琦', title: '系统管理员' },
  },
  roles: {
    growth: '增长负责人',
    editor: '内容主编',
    community: '社区与开发者关系',
    viewer: '只读观察',
    admin: '演示管理员',
  },
  stories: DEMO_STORIES,
  documents: DEMO_DOCUMENTS.map((document) =>
    document.key === 'personas'
      ? {
          ...document,
          text: document.text.replace(
            '以上为虚构的演示人物，不对应真实用户或登录账号。',
            '以上均为虚构的演示人物，也是本演示的登录账号。',
          ),
        }
      : document,
  ),
  opportunities: {
    notice: '人工编写的虚构演示情景；指标、客户反馈和判断均不代表真实业务。',
    limitation: '单一渠道和有限样本不能证明因果，执行前需核对实际产品版本。',
    priorityHigh: '直接阻碍用户完成首次实施或数据恢复。',
    priorityOther: '先核对需求，再安排编辑与技术复核。',
    audience: '评估与实施 NocoBase 的业务负责人和开发者',
    observations: [
      '优先处理首次实施、权限验证与恢复演练；短期流量波动继续观察。',
    ],
    doReason: '基于手写演示材料整理的待办建议，实施前仍需核实。',
    skipReason: '正常波动，继续常规监测。',
    briefs: ZH_BRIEFS,
    watches: [
      [
        'conversion',
        '文档改版后试用转化暂时下降',
        '样例最近三天有 96 次文档访问、4 次试用，窗口尚短，周末结构也不同。',
        '等待完整七天并核对关键事件是否漏报，再与同星期比较。',
      ],
      [
        'github',
        'GitHub 新增关注是否带来实际使用',
        '演示仓库一周新增 78 个 Star，但下载和首次启动数据尚未同步完整。',
        '等下载与首次启动覆盖同一周后再判断，不把 Star 当成活跃用户。',
      ],
      [
        'localization',
        '英文采购案例是否值得优先翻译',
        '样例英文询问只有两条，来自不同规模团队，采购流程差异较大。',
        '补充至少三次需求访谈，确认共同问题后再确定内容范围。',
      ],
    ],
    normal: [
      '品牌词点击保持稳定，暂不新增动作',
      '演示本周品牌词点击 318 次，上周 311 次，波动不足以支持单独立项。',
    ],
    goal: {
      intent: '让评估 NocoBase 的团队完成第一个可验证的小型业务应用。',
      audience: '实施负责人、业务分析师和负责集成的开发者。',
      focus: '权限、数据迁移、审批、首次部署与恢复演练。',
      progress: '以成功完成练习和提出具体实施问题为进展；本项目为虚构演示。',
    },
  },
  secondTasks: [
    {
      key: 'nococrm-landing',
      title: '为小型销售团队写 NocoCRM 落地页',
      kind: 'content',
      state: 'todo',
      path: '/',
      brief:
        'NocoCRM 刚加入项目列表。从五人销售团队第一周会检查的事情写起：导入联系人、销售漏斗视图，以及谁能看到哪些商机。',
      comments: [
        '许岚 · 增长：目前只接入了网站和 Google，先看搜索数据再动笔。',
      ],
    },
    {
      key: 'nococrm-google',
      title: '重新连接 NocoCRM 的 Google Search Console',
      kind: 'research',
      state: 'doing',
      path: '/',
      brief:
        '这个项目的 Google 授权已过期，搜索数据停止更新。下次周会前在「数据接入」页面重新登录授权。',
      comments: [
        '周宁 · 内容：连接显示「授权已过期」，这是演示里特意保留的问题数据。',
      ],
    },
  ],
  chat: {
    metricsIntro: '根据演示项目的搜索数据（截至 {0}），点击最多的搜索词：',
    metricsLine: '- 「{0}」：点击 {1}，展示 {2}，平均排名 {3}',
    metricsOutro:
      '这些点击主要来自入门指南和权限相关页面。在正式环境里，模型会读取同样的数据并给出下一步建议；这是演示环境的模拟回答。',
    tasksIntro: '你在演示项目中的任务：',
    states: {
      todo: '待处理',
      doing: '进行中',
      review: '待确认',
      done: '已完成',
    },
    tasksOutro: '打开任务可以查看讨论和稿件。（模拟回答）',
    opportunitiesIntro: '演示项目里待处理的机会：',
    opportunitiesOutro:
      '权限和 Docker 首次启动两条被标为高优先级，因为它们直接阻碍首次实施。可以在「机会」页面把其中一条转成任务。（模拟回答）',
    none: '演示项目里没有找到可以展示的内容。（模拟回答）',
  },
};

export const DEMO_LANGUAGES = ['zh-CN', 'en-US'] as const;
export type DemoLanguage = (typeof DEMO_LANGUAGES)[number];

export function demoContent(language: string): DemoContent {
  return language === 'en-US' ? EN_US : ZH_CN;
}

/** The demo person a comment names, read from `<name> · <team>：` or `<name> · <team>: `. */
export function commentAuthor(
  content: DemoContent,
  comment: string,
): { person?: DemoPerson; name: string; text: string } {
  const match = /^(.+?) · ([^:：]+)[:：]\s*([\s\S]*)$/u.exec(comment);
  if (!match) return { name: '', text: comment };
  const [, name, , text] = match;
  const person = (Object.keys(content.people) as DemoPerson[]).find(
    (key) => content.people[key].name === name,
  );
  return { ...(person ? { person } : {}), name: name, text: text };
}
