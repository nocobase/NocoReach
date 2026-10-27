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
    case 'keyword-seeds': {
      const direction = str(input.direction, 60);
      if (direction)
        return {
          seeds: [
            direction,
            `${direction} software`,
            `${direction} tool`,
            `${direction} open source`,
            `best ${direction}`,
          ],
        };
      return {
        seeds: [
          'internal tool builder',
          'low code platform',
          'no code database',
          'approval workflow',
          'workflow automation',
          'self hosted crm',
          'role based access control',
          'ai agent builder',
          'airtable alternative',
          'retool alternative',
          'admin panel',
          'inventory management system',
        ],
      };
    }
    case 'keyword-curate': {
      // Picks from the looked-up candidates only, as the real model is told to; grouped by the words they use.
      const pages = list(input.pages),
        pick = Math.max(1, Number(input.pick) || 40);
      const groupOf = (k: string) =>
        /alternative|\bvs\b|versus|compare|替代|对比/.test(k)
          ? 3
          : /how|example|template|what is|教程|模板/.test(k)
            ? 2
            : /builder|platform|database|tool|software|系统|平台|工具/.test(k)
              ? 1
              : 4;
      // A dig keeps to its direction: candidates sharing one of its words.
      const words = str(input.direction, 60)
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
      const candidates = list(input.candidates).filter(
        (c) =>
          !words.length ||
          words.some((w) => str(c.keyword, 80).toLowerCase().includes(w)),
      );
      return {
        keywords: candidates.slice(0, pick).map((c) => {
          const keyword = str(c.keyword, 80),
            token = keyword.split(' ').find((w) => w.length > 3) ?? '';
          const page = pages.find(
            (p) =>
              token &&
              (str(p.url, 500).includes(token) ||
                str(p.title, 120).toLowerCase().includes(token)),
          );
          return {
            keyword,
            group: groupOf(keyword.toLowerCase()),
            relevance: c.position ? 3 : 2,
            reason: t(
              `月搜索量 ${Number(c.volume) || 0}，难度 ${Number(c.difficulty) || 0}。（演示建议）`,
              `${Number(c.volume) || 0} searches a month, difficulty ${Number(c.difficulty) || 0}. (Demo suggestion.)`,
            ),
            page: str(page?.url, 500),
          };
        }),
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

const CONFIRM =
  /^\s*(确认|好的?|可以|开始|查吧|yes|ok(ay)?|confirm|go( ahead)?|sure)(?=$|[\s，。,.!！])/iu;
const DIG =
  /挖|多找|对比词|竞品|市场|关键词|dig|more keywords|comparison|competitor|market/iu;
const EXPLAIN = /怎么找|如何找|explain how|how (these|the) keywords/iu;

/** What a Keywords › AI suggestions request asks keyword_dig for, from the row it was opened on or the prompt. */
function digArguments(
  request: DemoModelRequest,
  prompt = request.prompt,
): Record<string, unknown> {
  const row = /on the keyword "([^"]{2,80})"/u.exec(request.system)?.[1];
  if (/日本|japan/iu.test(prompt))
    return { mode: 'list', market: { locationCode: 2392, language: 'ja' } };
  if (/美国市场|US market|united states/iu.test(prompt))
    return { mode: 'list', market: { locationCode: 2840, language: 'en' } };
  if (/对比词|竞品|competitor|comparison/iu.test(prompt))
    return { mode: 'group', direction: 'alternative' };
  const quoted = /[“"「]([^”"」]{2,60})[”"」]/u.exec(prompt)?.[1];
  const direction = quoted ?? row ?? 'workflow';
  return { mode: 'group', direction, seeds: [direction] };
}

/** The user's request the last answer quoted a lookup cost for, if the last answer did. */
function dugBefore(request: DemoModelRequest): string | undefined {
  const earlier = request.messages.slice(0, -1);
  const answer = [...earlier].reverse().find((m) => m.role === 'assistant');
  if (!answer || !/\$\d/u.test(answer.content)) return undefined;
  return [...earlier.slice(0, earlier.lastIndexOf(answer))]
    .reverse()
    .find((m) => m.role === 'user')?.content;
}

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
      id: 'nocoreach-keywords-explain',
      match: (request) =>
        has(request, 'keyword_dig') &&
        asks(request, EXPLAIN) &&
        request.toolResults.length === 0,
      reply: (request) =>
        request.language === 'en'
          ? "The AI first chose short seed words the way people search, from the project memory, the Search Console queries and the competitors. For each seed, DataForSEO returned the Google searches that contain it, and all seeds together returned searches on related topics. Only keywords searched at least 50 times a month in the market were kept; the AI then picked those closest to the product and ranked them by search volume, relevance, difficulty and the site's current position. (Demo answer.)"
          : 'AI 先根据项目记忆、Search Console 里的查询和竞品，按用户的搜索习惯定了一组短的种子词。每个种子词从 DataForSEO 取包含它的 Google 搜索词，所有种子词再一起取相关话题的词；只保留目标市场月搜索量 50 以上的词，再由 AI 挑出和产品最相关的，按搜索量、相关度、难度和本站现在的排名排序。（演示回答）',
    },
    {
      id: 'nocoreach-keywords-confirm',
      match: (request) =>
        has(request, 'keyword_dig') &&
        request.toolResults.length === 0 &&
        CONFIRM.test(request.prompt) &&
        Boolean(dugBefore(request)),
      // Earlier turns reach the model as their text: the request the cost was asked for is the user's message before.
      reply: (request) => ({
        toolCalls: [
          {
            name: 'keyword_dig',
            arguments: {
              ...digArguments(request, dugBefore(request)!),
              confirm: true,
            },
          },
        ],
      }),
    },
    {
      id: 'nocoreach-keywords-plan',
      match: (request) =>
        has(request, 'keyword_dig') &&
        request.toolResults.length === 0 &&
        asks(request, DIG),
      reply: (request) => ({
        toolCalls: [{ name: 'keyword_dig', arguments: digArguments(request) }],
      }),
    },
    {
      id: 'nocoreach-keywords-answer',
      match: (request) =>
        request.toolResults.some((result) => result.name === 'keyword_dig'),
      reply: (request) => {
        const en = request.language === 'en';
        const result = object(
          safeJson(
            request.toolResults.find((r) => r.name === 'keyword_dig')!.content,
          ),
        );
        if (result.error) return str(result.error, 400);
        if (result.confirmed === false)
          return en
            ? `This lookup costs at most $${Number(result.maxCostUsd).toFixed(2)} from the DataForSEO budget (this month: $${Number(result.monthSpentUsd).toFixed(2)} of $${Number(result.monthlyBudgetUsd).toFixed(2)}). Reply "confirm" to run it.`
            : `这次查询最多花费 $${Number(result.maxCostUsd).toFixed(2)}，从 DataForSEO 预算里扣（本月已用 $${Number(result.monthSpentUsd).toFixed(2)} / $${Number(result.monthlyBudgetUsd).toFixed(2)}）。回复“确认”开始查。`;
        const group = object(result.group);
        const lines = list(result.keywords)
          .slice(0, 8)
          .map((k) => `- ${str(k.keyword, 80)}: ${str(k.reason, 80)}`);
        const head = group.name
          ? en
            ? `Added "From ${str(group.name, 60)}" to AI suggestions (keywords: ${Number(group.keywords) || 0}), each with real searches:`
            : `已加到 AI 建议的“从 ${str(group.name, 60)} 挖”，共 ${Number(group.keywords) || 0} 个词，都有真实搜索量：`
          : en
            ? 'AI suggestions were found again for the new market:'
            : 'AI 建议已按新市场重新找词：';
        return [head, '', ...lines].join('\n');
      },
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
