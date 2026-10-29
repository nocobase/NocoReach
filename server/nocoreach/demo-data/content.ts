import type { DemoTaskStory } from './editorial.js';
import {
  ACME_STORIES,
  acmeDocuments,
  acmeOpportunities,
} from './acme-content.js';
import { crmDocuments, crmOpportunities, CRM_STORIES } from './crm-content.js';
import { historicalStories } from './history-content.js';
import { localizeStories } from './editorial.js';
import { EN_US } from './content-en-US.js';

/** The people of the demo. Each is a sign-in; the stories' comments name them. */
export type DemoPerson =
  'growth' | 'editor' | 'content' | 'devrel' | 'consultant';

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
  roles: Record<'growth' | 'editor' | 'community' | 'viewer', string>;
  stories: readonly DemoTaskStory[];
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
  /** The CRM project has its own editorial catalog. */
  secondTasks: readonly DemoTaskStory[];
  secondDocuments: DemoContent['documents'];
  secondOpportunities: DemoContent['opportunities'];
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

/** Shared interface copy for the Chinese demo. */
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
  observationNote:
    '根据演示页面的日明细计算，不代表真实发布效果，不据此推断因果。',
  projects: {
    main: {
      name: 'Acme',
      domain: 'acme.example',
      description:
        '虚构的项目管理软件，帮助团队从 Excel 迁移任务，管理看板、排期、里程碑与客户协作；所有指标与反馈均为演示。',
      audience: '项目经理、设计团队、产品团队与客户交付团队',
      market: '全球',
    },
    second: {
      name: 'Acme CRM',
      domain: 'crm.acme.example',
      description:
        '虚构的销售协作产品，围绕客户导入、线索分配、商机跟进与续约持续运营；所有人物与经营数据均为演示。',
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
  },
  roles: {
    growth: '增长负责人',
    editor: '内容主编',
    community: '社区与开发者关系',
    viewer: '只读观察',
  },
  stories: [],
  documents: acmeDocuments('zh-CN'),
  opportunities: acmeOpportunities('zh-CN'),
  secondTasks: [],
  secondDocuments: crmDocuments('zh-CN'),
  secondOpportunities: crmOpportunities('zh-CN'),
  chat: {
    metricsIntro: '根据演示项目的搜索数据（截至 {0}），点击最多的搜索词：',
    metricsLine: '- 「{0}」：点击 {1}，展示 {2}，平均排名 {3}',
    metricsOutro:
      '这些是当前项目的搜索数据。下一步可打开对应页面，核对搜索意图和转化路径；这是演示环境的模拟回答。',
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
      '根据当前项目的证据与优先级选择下一步，可在「机会」页面查看详情并转成任务。（模拟回答）',
    none: '演示项目里没有找到可以展示的内容。（模拟回答）',
  },
};

export const DEMO_LANGUAGES = ['zh-CN', 'en-US'] as const;
export type DemoLanguage = (typeof DEMO_LANGUAGES)[number];

const localized = new Map<string, DemoContent>();

export function demoContent(language: string): DemoContent {
  const key = language === 'en-US' ? 'en-US' : 'zh-CN';
  const cached = localized.get(key);
  if (cached) return cached;
  const base = key === 'en-US' ? EN_US : ZH_CN;
  const content: DemoContent = {
    ...base,
    stories: localizeStories(
      [...ACME_STORIES, ...historicalStories(true)],
      key,
      base.people,
    ),
    secondTasks: localizeStories(
      [...CRM_STORIES, ...historicalStories(false)],
      key,
      base.people,
    ),
    secondDocuments: crmDocuments(key),
    secondOpportunities: crmOpportunities(key),
  };
  localized.set(key, content);
  return content;
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
