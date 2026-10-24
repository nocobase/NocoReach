import type {
  DemoAnswer,
  DemoModelRequest,
} from '@nocobase/app-plugin-demo-mode/server/tokens';

import { demoContent } from './content.js';

type Value = Record<string, unknown>;
const object = (value: unknown): Value =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Value)
    : {};
const list = (value: unknown): Value[] =>
  Array.isArray(value) ? (value as unknown[]).map(object) : [];
const str = (value: unknown, limit = 400): string =>
  typeof value === 'string' ? value.slice(0, limit) : '';

/** The note `forLanguage` appends for an English project; its prompts are otherwise Chinese. */
const ENGLISH = 'Language: write every text meant for people in English';
const english = (request: DemoModelRequest) =>
  request.system.includes(ENGLISH) || request.prompt.includes(ENGLISH);

/** The JSON input a business prompt carries after any leading sentence. */
function inputOf(prompt: string): Value {
  const start = prompt.indexOf('{');
  if (start < 0) return {};
  try {
    return object(JSON.parse(prompt.slice(start)));
  } catch {
    return {};
  }
}

/** What each business operation answers, written for people to read in the demo. */
function business(operation: string, input: Value, en: boolean): Value | null {
  const t = (zh: string, enText: string) => (en ? enText : zh);
  switch (operation) {
    case 'content-source-map':
      return { mappings: [] };
    case 'daily-report': {
      const signals = list(object(object(input.evidence).signals).items);
      const actionable = signals
        .filter((s) => s.actionable === true && typeof s.key === 'string')
        .slice(0, 3);
      const cited = new Set(actionable.map((s) => s.key));
      return {
        observations: [
          t(
            `本次分析读取了 ${signals.length} 条信号，挑出 ${actionable.length} 条值得跟进的变化。（演示模型生成）`,
            `This analysis read ${signals.length} signals and picked ${actionable.length} changes worth following up. (Written by the demo model.)`,
          ),
        ],
        insights: actionable.map((s) => ({
          title: t(
            `跟进：${str(s.title, 120)}`,
            `Follow up: ${str(s.title, 120)}`,
          ),
          reason: t(
            '信号强度较高，且与当前内容目标相关。',
            'A strong signal related to the current content goal.',
          ),
          observation: str(s.title, 300),
          meaning: t(
            '值得安排一次人工复核，确认是否需要更新页面。',
            'Worth a human review to decide whether the page needs updating.',
          ),
          evidenceText: JSON.stringify(s.facts ?? {}).slice(0, 2200),
          limitation: t(
            '演示环境的模拟分析，执行前请核对数据。',
            'A simulated analysis in the demo; check the data before acting.',
          ),
          suggestion: t(
            '打开相关页面核对数据，再决定是否创建任务。',
            'Open the page, check the numbers, then decide whether to create a task.',
          ),
          objective: t(
            '让页面更好地回答读者的问题。',
            'Make the page answer readers’ questions better.',
          ),
          signalIds: [s.key],
          sources: [str(s.source, 80)].filter(Boolean),
          target: str(s.target || s.page || s.url, 500),
          audience: t('评估 NocoBase 的团队', 'Teams evaluating NocoBase'),
          category: 'optimize',
          priority: 'medium',
          priorityReason: t(
            '需要人工确认影响范围。',
            'The impact needs a human check.',
          ),
          confidence: 'verify',
          effort: 'small',
          lifecycle: 'watch',
          source: 'mixed',
        })),
        signalReviews: signals.map((s) => ({
          key: str(s.key, 200),
          verdict: cited.has(s.key) ? 'do' : 'skip',
          reason: cited.has(s.key)
            ? t('值得跟进。', 'Worth following up.')
            : t('变化不大，继续观察。', 'Small change; keep watching.'),
        })),
        sourceReviews: [
          ...new Set(signals.map((s) => str(s.source, 80)).filter(Boolean)),
        ].map((sourceId) => ({
          sourceId,
          result: 'insufficient',
          reason: t('演示数据样本有限。', 'The demo data is a limited sample.'),
        })),
      };
    }
    case 'daily-judge':
      return {
        key: str(object(input.signal).key, 200),
        verdict: 'skip',
        reason: t('变化不大，继续观察。', 'Small change; keep watching.'),
      };
    case 'daily-judge-many':
      return {
        reviews: list(input.signals).map((s) => ({
          key: str(s.key, 200),
          verdict: 'skip',
          reason: t('变化不大，继续观察。', 'Small change; keep watching.'),
        })),
      };
    case 'daily-rewrite':
      return { rewrites: [] };
    case 'keyword-suggest': {
      const pages = list(input.pages);
      const groups = en
        ? [
            [
              'Product and features',
              ['internal tool builder', 'open source low code platform'],
            ],
            [
              'Use cases and problems',
              ['customer data permissions', 'approval workflow example'],
            ],
            [
              'Comparisons',
              [
                'spreadsheet vs database for teams',
                'self-hosted crm alternative',
              ],
            ],
          ]
        : [
            [
              '产品与功能词',
              ['internal tool builder', 'open source low code platform'],
            ],
            [
              '使用场景与问题词',
              ['customer data permissions', 'approval workflow example'],
            ],
            [
              '对比与替代词',
              [
                'spreadsheet vs database for teams',
                'self-hosted crm alternative',
              ],
            ],
          ];
      return {
        groups: (groups as [string, string[]][]).map(([name, keywords], i) => ({
          name,
          keywords: keywords.map((keyword) => ({
            keyword,
            intent: 'informational',
            reason: t(
              '与现有文档主题一致，搜索意图明确。（演示建议）',
              'Matches existing docs topics with a clear intent. (Demo suggestion.)',
            ),
            page: str(pages[i % Math.max(1, pages.length)]?.url, 500),
          })),
        })),
      };
    }
    case 'ai-question-suggest':
      return {
        topics: [
          'internal tools',
          'data permissions',
          'approval workflows',
          'self-hosting',
        ].map((topic) => ({
          topic,
          reason: t(
            '用户在 AI 搜索里常问的选型问题。（演示建议）',
            'A selection question people ask AI search. (Demo suggestion.)',
          ),
        })),
      };
    case 'knowledge-suggest':
      return {
        title: t('资料摘要（演示）', 'Material summary (demo)'),
        category: 'other',
        summary: t(
          '演示模型整理的资料摘要，请人工核对后再保存。',
          'A summary written by the demo model; check it before saving.',
        ),
        memory: [],
      };
    case 'memory-draft':
      return {
        memory: {
          brand: t(
            `${str(input.project, 100) || 'NocoBase'}：面向需要管理关联数据和岗位权限的团队。`,
            `${str(input.project, 100) || 'NocoBase'}: for teams managing related data and role-based permissions.`,
          ),
          product: t(
            '开源、可私有部署的低代码业务应用平台。',
            'An open-source, self-hostable low-code platform for business applications.',
          ),
          rules: t(
            '所有对外内容都要经人工审核；不编造客户案例与价格。',
            'Every public piece gets a human review; never invent customer cases or prices.',
          ),
        },
      };
    case 'memory-check':
      return { memory: [] };
    case 'competitor-suggest':
      return {
        competitors: [
          {
            name: 'FlowGrove',
            site: 'https://flowgrove.example',
            repo: 'flowgrove/flowgrove',
            reason: t(
              '同样面向内部工具搭建的虚构竞品。',
              'A fictional competitor that also targets internal tools.',
            ),
          },
        ],
      };
    case 'analysis-rules-propose':
      return {
        explanation: t(
          '演示模型不修改规则；可以在页面上手动调整。',
          'The demo model changes no rules; adjust them on the page.',
        ),
        changes: [],
      };
    case 'analysis-rule-draft':
      return {
        name: t('关注文档页点击下降', 'Watch for falling clicks on docs pages'),
        source: Array.isArray(input.sources) ? input.sources[0] : 'site',
        condition: t(
          '文档页七天点击下降超过 20%。',
          'A docs page loses more than 20% of its clicks over seven days.',
        ),
        evidence: t(
          '需要保存的来源链接和时间。',
          'Requires saved source URLs and timestamps.',
        ),
      };
    case 'analysis-rule-evaluate':
      return {
        results: list(input.rules).map((rule) => ({
          ruleId: rule.id,
          status: 'insufficient',
          reason: t(
            '演示数据不足以判断。',
            'The demo data is not enough to decide.',
          ),
          evidenceIds: [],
        })),
      };
    default:
      return null;
  }
}

const format = (template: string, ...values: (string | number)[]) =>
  template.replace(/\{(\d+)\}/gu, (_, index: string) =>
    String(values[Number(index)] ?? ''),
  );

/** Pulls the top keywords out of `project_data`'s metrics section, which may be cut off mid-JSON. */
function keywordsOf(text: string): {
  keyword: string;
  clicks: number;
  impressions: number;
  position: number;
}[] {
  const found: {
    keyword: string;
    clicks: number;
    impressions: number;
    position: number;
  }[] = [];
  const pattern =
    /"keyword":"((?:[^"\\]|\\.)*)"[^}]*?"clicks":([\d.]+),"impressions":([\d.]+),"position":([\d.]+)/gu;
  for (const match of text.matchAll(pattern))
    found.push({
      keyword: match[1],
      clicks: Number(match[2]),
      impressions: Number(match[3]),
      position: Math.round(Number(match[4]) * 10) / 10,
    });
  return found.sort((a, b) => b.clicks - a.clicks).slice(0, 5);
}

const has = (request: DemoModelRequest, name: string) =>
  request.tools.some((tool) => tool.name === name);
const asks = (request: DemoModelRequest, words: RegExp) =>
  words.test(request.prompt);

const TASKS = /任务|待办|进度|task|to-?do|progress/iu;
const METRICS =
  /流量|搜索|点击|数据|指标|排名|访问|traffic|search|click|metric|ranking|visit|seo/iu;
const OPPORTUNITIES =
  /机会|建议|下一步|该做|opportunit|suggest|next step|what should/iu;

/** Business calls carry their operation as the tag; online agents ask in their own words and get tool-backed answers. */
export function demoAnswers(): DemoAnswer[] {
  return [
    {
      id: 'nocoreach-business',
      match: (request) =>
        Boolean(request.tag) && business(request.tag!, {}, false) !== null,
      reply: (request) =>
        JSON.stringify(
          business(request.tag!, inputOf(request.prompt), english(request)),
        ),
    },
    {
      id: 'nocoreach-tasks-read',
      match: (request) =>
        has(request, 'task_list') &&
        asks(request, TASKS) &&
        request.toolResults.length === 0,
      reply: () => ({
        toolCalls: [
          { name: 'task_list', arguments: { scope: 'accessible', limit: 8 } },
        ],
      }),
    },
    {
      id: 'nocoreach-tasks-answer',
      match: (request) =>
        request.toolResults.some((result) => result.name === 'task_list'),
      reply: (request) => {
        const chat = demoContent(
          request.language === 'en' ? 'en-US' : 'zh-CN',
        ).chat;
        const items = list(
          object(
            safeJson(
              request.toolResults.find((r) => r.name === 'task_list')!.content,
            ),
          ).items,
        );
        if (!items.length) return chat.none;
        return [
          chat.tasksIntro,
          '',
          ...items.map(
            (item) =>
              `- [${str(item.title, 160)}](${str(item.url, 500)})${item.state ? ` · ${chat.states[str(item.state, 40)] ?? str(item.state, 40)}` : ''}`,
          ),
          '',
          chat.tasksOutro,
        ].join('\n');
      },
    },
    {
      id: 'nocoreach-metrics-read',
      match: (request) =>
        has(request, 'project_data') &&
        asks(request, METRICS) &&
        request.toolResults.length === 0,
      reply: () => ({
        toolCalls: [
          { name: 'project_data', arguments: { section: 'metrics' } },
        ],
      }),
    },
    {
      id: 'nocoreach-metrics-answer',
      match: (request) =>
        request.toolResults.some((result) => result.name === 'project_data'),
      reply: (request) => {
        const chat = demoContent(
          request.language === 'en' ? 'en-US' : 'zh-CN',
        ).chat;
        const text = str(
          object(
            safeJson(
              request.toolResults.find((r) => r.name === 'project_data')!
                .content,
            ),
          ).text,
          20000,
        );
        const keywords = keywordsOf(text);
        if (!keywords.length) return chat.none;
        const through = /"availableThrough":"([\d-]+)"/u.exec(text)?.[1] ?? '';
        return [
          format(chat.metricsIntro, through),
          '',
          ...keywords.map((k) =>
            format(
              chat.metricsLine,
              k.keyword,
              k.clicks,
              k.impressions,
              k.position,
            ),
          ),
          '',
          chat.metricsOutro,
        ].join('\n');
      },
    },
    {
      id: 'nocoreach-opportunities',
      match: (request) =>
        asks(request, OPPORTUNITIES) && request.toolResults.length === 0,
      reply: (request) => {
        const content = demoContent(
          request.language === 'en' ? 'en-US' : 'zh-CN',
        );
        return [
          content.chat.opportunitiesIntro,
          '',
          ...content.opportunities.briefs
            .slice(0, 6)
            .map(
              ([, title, , , , , , , priority]) => `- ${title} (${priority})`,
            ),
          '',
          content.chat.opportunitiesOutro,
        ].join('\n');
      },
    },
  ];
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
