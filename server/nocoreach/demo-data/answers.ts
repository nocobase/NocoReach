import type {
  DemoAnswer,
  DemoModelRequest,
} from '@nocobase/app-plugin-demo-mode/server/tokens';

import { demoContent } from './content.js';
import { ACME_PAGES } from './acme-content.js';
import { CRM_PAGES } from './crm-content.js';

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

/**
 * A direction as an English market searches it: a group named in Chinese (Self-hosting and open source) gets English search words,
 * as the real model is told to choose seeds in the market's language.
 */
const DIRECTION_WORDS: [RegExp, string][] = [
  [/自托管|私有部署|自建/u, 'self hosted'],
  [/开源/u, 'open source'],
  [/审批/u, 'approval workflow'],
  [/权限/u, 'permissions'],
  [/工作流|流程/u, 'workflow automation'],
  [/客户|销售|crm/iu, 'crm'],
  [/内部工具|后台/u, 'internal tools'],
  [/表格|excel/iu, 'spreadsheet'],
  [/门户/u, 'portal'],
  [/智能体|ai/iu, 'ai agent'],
  [/看板/u, 'kanban boards'],
  [/排期|日程|调度/u, 'team scheduling'],
  [/协作/u, 'collaboration'],
  [/任务/u, 'task management'],
];
const searchedAs = (direction: string): string[] => {
  if (!/\p{Script=Han}/u.test(direction)) return [direction];
  const found = DIRECTION_WORDS.filter(([w]) => w.test(direction)).map(
    ([, words]) => words,
  );
  return found.length ? found : [direction];
};

/** What each business operation answers, written for people to read in the demo. */
function business(operation: string, input: Value, en: boolean): Value | null {
  const t = (zh: string, enText: string) => (en ? enText : zh);
  const projectName =
    str(input.project, 100) || str(object(input.memory)['项目'], 100);
  const crm = projectName.toLowerCase() === 'acme crm';
  const project = demoContent(en ? 'en-US' : 'zh-CN').projects[
    crm ? 'second' : 'main'
  ];
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
          audience: t(
            '评估当前演示项目的团队',
            'Teams evaluating the current demo project',
          ),
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
      // Each seed with the input it came from, as the real model is asked to say.
      const direction = str(input.direction, 60);
      if (direction)
        return {
          seeds: searchedAs(direction)
            .flatMap((words) => [words, `${words} software`, `best ${words}`])
            .slice(0, 6)
            .map((seed) => ({
              seed,
              from: ['direction'],
              why: t(
                `围绕这次的方向“${direction}”`,
                `Around the direction "${direction}"`,
              ),
            })),
        };
      const seeds = crm
        ? [
            'sales pipeline',
            'crm import',
            'lead routing',
            'quote approval',
            'account handover',
            'renewal management',
          ]
        : [
            'project management',
            'task management',
            'kanban boards',
            'team scheduling',
            'Excel task import',
            'client collaboration',
            'project templates',
            'ACME vs Nimbus',
          ];
      // Why each seed, as the real model is asked to say: the memory line, query or competitor behind it.
      const p = project.name;
      const why: Record<string, [string[], string, string]> = {
        'project management': [
          ['memory'],
          `${p} 的定位是团队项目管理工具，这是品类主词`,
          `${p} is a team project management tool; the category's main term`,
        ],
        'task management': [
          ['memory'],
          `任务分派和截止日期是 ${p} 的核心功能`,
          `Owned, dated tasks are a core ${p} feature`,
        ],
        'kanban boards': [
          ['memory', 'searchConsole'],
          `${p} 用看板协作，本站看板相关查询曝光最多`,
          `${p} works on boards; board queries get the most impressions`,
        ],
        'team scheduling': [
          ['memory'],
          `${p} 记忆里写了排期和团队负荷视图`,
          `Project memory mentions ${p}'s schedules and workload views`,
        ],
        'Excel task import': [
          ['memory', 'searchConsole'],
          `不少团队从 Excel 迁到 ${p}，本站已有导入相关查询`,
          `Teams move from Excel to ${p}; the site already gets import queries`,
        ],
        'client collaboration': [
          ['memory'],
          `${p} 支持客户访客一起看项目，记忆里写了这个场景`,
          `${p} lets client guests follow projects, as project memory says`,
        ],
        'project templates': [
          ['memory', 'searchConsole'],
          `${p} 的模板页在 Search Console 里已有曝光`,
          `${p}'s templates page already shows in Search Console`,
        ],
        'ACME vs Nimbus': [
          ['memory', 'competitors'],
          `竞品 Nimbus 的用户在拿它和 ${p} 比较`,
          `Nimbus users compare it with ${p}`,
        ],
        'sales pipeline': [
          ['memory'],
          `${p} 的主要场景是管理销售管道`,
          `${p}'s main use is managing the sales pipeline`,
        ],
        'crm import': [
          ['memory', 'searchConsole'],
          `新用户先导入客户数据，${p} 的导入文档已有曝光`,
          `New users import customer data first; ${p}'s import docs already show`,
        ],
        'lead routing': [
          ['memory'],
          `线索自动分配是 ${p} 的核心功能`,
          `Routing leads is a core ${p} feature`,
        ],
        'quote approval': [
          ['memory'],
          `${p} 支持报价审批，记忆里写了这个流程`,
          `${p} supports quote approvals, as project memory says`,
        ],
        'account handover': [
          ['memory'],
          `客户交接是 ${p} 记忆里强调的场景`,
          `Account handover is a ${p} scenario project memory stresses`,
        ],
        'renewal management': [
          ['memory', 'competitors'],
          `竞品主打续约提醒，${p} 可以写对比`,
          `Competitors lead with renewal reminders; ${p} can compare`,
        ],
      };
      return {
        seeds: seeds.map((seed) => {
          const [from, zh, en] = why[seed] ?? [
            ['memory'],
            `${p} 的主要场景之一`,
            `One of ${p}'s main uses`,
          ];
          return { seed, from, why: t(zh, en) };
        }),
      };
    }
    case 'keyword-names': {
      // Short group names in the language asked for, from the direction's words.
      const zh = /中文/u.test(str(input.language, 40));
      const words: [RegExp, string][] = [
        [/self-?host/iu, '自托管'],
        [/open source/iu, '开源'],
        [/approval/iu, '审批'],
        [/permission/iu, '权限'],
        [/governance/iu, '治理'],
        [/maintenance/iu, '维护'],
        [/moderni[sz]/iu, '升级改造'],
        [/spreadsheet|excel/iu, '表格替代'],
        [/internal tool|operations/iu, '内部工具'],
        [/portal/iu, '客户门户'],
        [/crm/iu, 'CRM'],
        [/workflow/iu, '工作流'],
        [/alternative/iu, '竞品替代'],
      ];
      return {
        names: list(input.groups).map((g) => {
          const direction = str(g.direction, 200);
          const found = words
            .filter(([w]) => w.test(direction))
            .map(([, n]) => n)
            .slice(0, 2);
          const en = direction
            .replace(/\(.*\)/u, '')
            .split(/\s+/u)
            .filter((w) => w.length > 3)
            .slice(0, 2)
            .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
          return {
            id: str(g.id, 40),
            name: zh ? found.join('与') || '其他方向' : en || 'Other',
          };
        }),
      };
    }
    case 'keyword-curate': {
      // Picks from the looked-up candidates only, as the real model is told to; grouped by the words they use. Each
      // pick says why it is worth doing (not its volume or difficulty, which the table shows), and every candidate left
      // out gets one of the reasons the real model gives, by its number.
      const pages = list(input.pages),
        pick = Math.max(1, Number(input.pick) || 40),
        product =
          str(object(input.memory)['项目'], 40) || t('产品', 'the product');
      const groupOf = (k: string) =>
        /alternative|\bvs\b|versus|compare|替代|对比/.test(k)
          ? 3
          : /how|example|template|what is|教程|模板|什么是|区别/.test(k)
            ? 2
            : /builder|platform|database|tool|software|系统|平台|工具/.test(k)
              ? 1
              : 4;
      const rival = (k: string) =>
        /\b(airtable|retool|n8n|notion|slack|zapier|飞书|钉钉|企业微信)\b/u.exec(
          k,
        )?.[1];
      const leftOut = (k: string) =>
        /\bfree\b|download|\bjobs?\b|salary|course|免费|下载|招聘|课程/.test(k)
          ? 'intent'
          : /docker|kubernetes|helm|\bport\b|backup|pagination|rest api|one to many|deduplicate|端口|备份|分页|一对多|去重/.test(
                k,
              )
            ? 'unrelated'
            : rival(k) && !/alternative|\bvs\b|替代|对比/.test(k)
              ? 'brand'
              : '';
      const brand = (k: string) => {
        const name = rival(k);
        return name ? name[0].toUpperCase() + name.slice(1) : '';
      };
      // What the searcher wants first (a tutorial, a price, a template, a choice), then the product area it touches.
      const REASONS: [RegExp, (k: string) => [string, string]][] = [
        [
          /alternative|替代/,
          (k) => [
            `在找 ${brand(k) || '竞品'} 的替代方案，对比页正好接住`,
            `People replacing ${brand(k) || 'a competitor'}; a comparison page wins them`,
          ],
        ],
        [
          /\bvs\b|versus|compare|comparison|区别|对比/,
          () => [
            '在比较几种做法，对比文章可以讲清各自适合什么',
            'People weighing options; a comparison explains which fits when',
          ],
        ],
        [
          /pricing|price|cost|价格/,
          () => [
            `在比价格，方案页写清 ${product} 开源免费和企业版的区别`,
            `People checking prices; say what is free in ${product} and what is not`,
          ],
        ],
        [
          /tutorial|guide|how to|教程/,
          () => [
            '想照着做的人在找教程，文档能接住',
            'People following steps; a guide in the docs catches them',
          ],
        ],
        [
          /template|example|模板/,
          () => [
            '想要现成的模板，给一个能直接用的就能留住',
            'People who want a ready template; one that works keeps them',
          ],
        ],
        [
          /what is|什么是/,
          () => [
            '刚了解这个概念的人，科普文章可以顺带介绍产品',
            'People new to the idea; an explainer can introduce the product',
          ],
        ],
        [
          /self.?hosted|on.?prem|私有部署|自建/,
          () => [
            `要把数据留在自己服务器上的团队，${product} 可私有部署`,
            `Teams keeping data on their own servers; ${product} self-hosts`,
          ],
        ],
        [
          /open source|开源/,
          () => [
            `要开源方案的团队，${product} 的源码和插件都开放`,
            `Teams who want open source; ${product}'s code and plugins are open`,
          ],
        ],
        [
          /crm|客户|销售/,
          () => [
            '想按自己的流程搭 CRM 的团队，CRM 方案页能接住',
            'Teams building a CRM their way; the CRM solution page fits',
          ],
        ],
        [
          /approval|审批/,
          () => [
            '审批流是核心功能，适合写方案页带出产品',
            'Approvals are a core feature; worth a solution page',
          ],
        ],
        [
          /workflow|automation|工作流|自动化|流程/,
          () => [
            '工作流是核心功能，适合用真实场景讲清楚',
            'Workflows are a core feature; show them on a real case',
          ],
        ],
        [
          /rbac|permission|access|权限/,
          () => [
            '权限是核心能力，适合写教程带出产品',
            'Permissions are a core strength; a tutorial can feature them',
          ],
        ],
        [
          /\bai\b|agent|llm|大模型/,
          () => [
            `正对 ${product} 的 AI 员工，适合写场景文章`,
            `Matches ${product}'s AI employees; worth a use-case article`,
          ],
        ],
        [
          /internal|admin|内部|后台/,
          () => [
            '产品主打场景：搭内部工具和后台',
            'The main use case: building internal tools and admin panels',
          ],
        ],
        [
          /project|task|kanban|sprint|schedul|workload|gantt|项目|任务|看板|排期/,
          () => [
            `正对 ${product} 的主要功能，功能页能接住`,
            `On ${product}'s main features; a feature page catches it`,
          ],
        ],
        [
          /inventory|ticket|dashboard|进销存|工单/,
          () => [
            '具体业务场景，能用产品搭出来，适合写方案页',
            'A concrete business case the product can build; worth a solution page',
          ],
        ],
        [
          /low code|no code|低代码|无代码/,
          () => [
            '产品品类词，选型阶段的人在搜',
            'The product category, searched while choosing a tool',
          ],
        ],
      ];
      // Keywords built from a page of the site ("project management Team plans and seats guide") are explained by that
      // page: its topic in the reader's language, its path, and whether the searcher is learning or choosing.
      const pageOf = (k: string) =>
        [...ACME_PAGES, ...CRM_PAGES].find((p) =>
          k.includes(p.title.en.toLowerCase()),
        );
      const byPage = (k: string, intent: string) => {
        const p = pageOf(k);
        if (!p) return null;
        const topic = p.title.zh.split('：')[0],
          title = p.title.en.split(':')[0],
          choosing = intent === 'commercial' || intent === 'transactional';
        return /common questions/.test(k)
          ? [
              `对“${topic}”有疑问的人，在 ${p.path} 补一段问答就能接住`,
              `People with questions about ${title}; a Q&A on ${p.path} answers them`,
            ]
          : /template/.test(k)
            ? choosing
              ? [
                  `想直接套用“${topic}”的团队，给一份能改的模板`,
                  `Teams ready to adopt ${title}; offer an editable template`,
                ]
              : [
                  `在找“${topic}”参考做法的人，模板页给出现成例子`,
                  `People looking for ${title} examples; a template shows one`,
                ]
            : /guide/.test(k)
              ? choosing
                ? [
                    `选工具前先看“${topic}”怎么做，教程能顺带介绍 ${product}`,
                    `People checking how ${title} works before choosing; a guide introduces ${product}`,
                  ]
                : [
                    `在学“${topic}”怎么做的人，${p.path} 的步骤能直接回答`,
                    `People learning ${title}; the steps on ${p.path} answer them`,
                  ]
              : null;
      };
      const why = (k: string, position: number, intent = '') => {
        const [zh, en] =
          byPage(k, intent) ??
          REASONS.find(([w]) => w.test(k))?.[1](k) ??
          (position
            ? [
                '本站已有排名，补强页面就能往前走',
                'The site already ranks; a stronger page moves it up',
              ]
            : [
                '和产品方向相关，适合补一篇内容',
                'Close to the product; worth a page of its own',
              ]);
        return t(zh, en);
      };
      // The same search with other filler words: "workflow automation tools" and "workflow automation software".
      const core = (k: string) =>
        k
          .replace(
            /\b(software|tools?|platforms?|systems?|apps?)\b|系统|工具|平台/gu,
            ' ',
          )
          .split(/\s+/u)
          .filter(Boolean)
          .sort()
          .join(' ');
      // A dig keeps to its direction: candidates sharing one of its words.
      const direction = str(input.direction, 60);
      const words = (direction ? searchedAs(direction) : [])
        .join(' ')
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
      const candidates = list(input.candidates);
      const picked: Value[] = [],
        cores = new Map<string, number>(),
        skipped: Record<string, unknown[]> = {
          unrelated: [],
          brand: [],
          intent: [],
          weaker: [],
          direction: [],
          duplicate: [],
        };
      // The most searched of a set of duplicates is the one kept.
      const ordered = [...candidates].sort(
        (a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0),
      );
      for (const c of ordered) {
        const keyword = str(c.keyword, 80),
          k = keyword.toLowerCase(),
          n = Number(c.i) || 0,
          reason = leftOut(k);
        if (words.length && !words.some((w) => k.includes(w))) {
          skipped.direction.push(n);
          continue;
        }
        if (reason) {
          skipped[reason].push(n);
          continue;
        }
        const same = cores.get(core(k));
        if (same) {
          skipped.duplicate.push([n, same]);
          continue;
        }
        if (picked.length >= pick) {
          skipped.weaker.push(n);
          continue;
        }
        cores.set(core(k), n);
        const token = keyword.split(' ').find((w) => w.length > 3) ?? '';
        const page = pages.find(
          (p) =>
            token &&
            (str(p.url, 500).includes(token) ||
              str(p.title, 120).toLowerCase().includes(token)),
        );
        picked.push({
          keyword,
          group: groupOf(k),
          relevance: c.position ? 3 : 2,
          reason: why(k, Number(c.position) || 0, str(c.intent, 20)),
          page: str(page?.url, 500),
        });
      }
      return { keywords: picked, skipped };
    }
    case 'ai-question-suggest':
      return {
        topics: (crm
          ? [
              'sales pipeline',
              'account imports',
              'quote approval',
              'sales handover',
            ]
          : [
              'project management',
              'team collaboration',
              'task management',
              'project handover',
            ]
        ).map((topic) => ({
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
          brand: `${str(input.project, 100) || project.name}: ${project.audience}`,
          product: project.description,
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
            name: crm ? 'Example Sales' : 'Nimbus',
            site: crm ? 'https://sales.example' : 'https://nimbus.example',
            repo: crm ? 'example-sales/crm' : 'nimbus/tasks',
            reason: t(
              '可用于核对当前协作场景的虚构对比样例。',
              'A fictional comparison for the current collaboration workflow.',
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

const DIG =
  /挖|多找|对比词|竞品|关键词|dig|more keywords|comparison|competitor/iu;
const EXPLAIN =
  /怎么找|如何找|怎么定|explain how|how (these|the) (keywords|seed words)/iu;
const SEED_FOUND = /找出了哪些|which keywords did/iu;
const CHANGE =
  /换掉|换一组|更偏|加上|去掉|重新找|另一个市场|市场|replace|lean|add or remove|find again|another market|market/iu;

/** The page data the keywords page context put in the instructions (its JSON line), or an empty object. */
function keywordsPage(request: DemoModelRequest): Value {
  const line = request.system
    .split('\n')
    .find((l) => l.startsWith('{"madeAt"'));
  return object(line ? safeJson(line) : {});
}
const focusSeed = (request: DemoModelRequest) =>
  /on the seed word "([^"]{2,80})"/u.exec(request.system)?.[1];

/** What a Keywords › AI suggestions request proposes, from what it was opened on and the prompt. */
function runArguments(request: DemoModelRequest): Record<string, unknown> {
  const prompt = request.prompt,
    seeds = (
      Array.isArray(keywordsPage(request).seeds)
        ? (keywordsPage(request).seeds as unknown[])
        : []
    ).map(String),
    seed = focusSeed(request);
  if (/日本|japan/iu.test(prompt))
    return { mode: 'list', market: { locationCode: 2392, language: 'ja' } };
  if (/另一个市场|another market|美国市场|US market/iu.test(prompt))
    return { mode: 'list', market: { locationCode: 2826, language: 'en' } };
  if (seed && /换掉|replace/iu.test(prompt))
    return {
      mode: 'list',
      seeds: seeds.map((s) => (s === seed ? `${seed} software` : s)),
    };
  if (/更偏|lean/iu.test(prompt))
    return {
      mode: 'list',
      seeds: [
        'approval workflow example',
        'crm template',
        'inventory management system',
        'internal tool examples',
        'admin panel template',
        'customer portal',
      ],
    };
  if (/加上|去掉|add or remove/iu.test(prompt))
    return {
      mode: 'list',
      seeds: [...seeds.slice(0, -1), 'project management tool'],
    };
  if (/重新找|find again/iu.test(prompt)) return { mode: 'list', seeds };
  const row = /on the keyword "([^"]{2,80})"/u.exec(request.system)?.[1];
  if (/对比词|竞品|competitor|comparison/iu.test(prompt))
    return {
      mode: 'group',
      direction: 'alternative',
      name: request.language === 'en' ? 'Alternatives' : '竞品替代',
    };
  const quoted = /[“"「]([^”"」]{2,60})[”"」]/u.exec(prompt)?.[1];
  const direction = quoted ?? row ?? 'workflow';
  // A short group name in the user's language, as the real model is asked to give.
  const name =
    request.language === 'en'
      ? direction.slice(0, 16)
      : `${direction.split(' ').slice(0, 2).join(' ')}相关`.slice(0, 16);
  return { mode: 'group', direction, name, seeds: [direction] };
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
        has(request, 'propose_keyword_run') &&
        asks(request, EXPLAIN) &&
        request.toolResults.length === 0,
      reply: (request) => {
        const en = request.language === 'en',
          page = keywordsPage(request),
          stats = new Map(list(page.seedStats).map((x) => [str(x.seed), x]));
        const notes = list(page.seedNotes);
        if (!notes.length)
          return en
            ? 'The reasons for these seed words were not recorded when the list was made. Ask me to choose them again and I will say why for each. (Demo answer.)'
            : '这份列表生成时还没有记录每个种子词的依据。可以让我重新定一组，我会逐个说明依据。（演示回答）';
        const source = (f: string) =>
          ({
            memory: en ? 'project memory' : '项目记忆',
            searchConsole: en
              ? 'Search Console queries'
              : 'Search Console 查询',
            competitors: en ? 'competitors' : '竞品',
            direction: en ? 'the direction asked for' : '这次的方向',
            person: en ? 'added by you' : '你加上的',
          })[f] ?? f;
        return [
          en
            ? 'Each seed word, where it came from and what it found (demo answer):'
            : '每个种子词的来源和找到的词（演示回答）：',
          '',
          ...notes.map((n) => {
            const st = object(stats.get(str(n.seed)));
            const from = (Array.isArray(n.from) ? n.from : [])
              .map((f) => source(String(f)))
              .join(en ? ', ' : '、');
            return en
              ? `- ${str(n.seed)} — from ${from}: ${str(n.why)} (found ${Number(st.found) || 0}, picked ${Number(st.picked) || 0})`
              : `- ${str(n.seed)}：来自${from}，${str(n.why)}（找到 ${Number(st.found) || 0} 个，挑出 ${Number(st.picked) || 0} 个）`;
          }),
        ].join('\n');
      },
    },
    {
      id: 'nocoreach-keywords-seed',
      match: (request) =>
        has(request, 'propose_keyword_run') &&
        asks(request, SEED_FOUND) &&
        Boolean(focusSeed(request)) &&
        request.toolResults.length === 0,
      reply: (request) => {
        const en = request.language === 'en',
          seed = focusSeed(request)!;
        const rows = list(keywordsPage(request).list).filter(
          (r) => Array.isArray(r.seeds) && r.seeds.includes(seed),
        );
        if (!rows.length)
          return en
            ? `None of the keywords picked came from "${seed}". (Demo answer.)`
            : `挑出的词里没有来自“${seed}”的。（演示回答）`;
        return [
          en
            ? `From "${seed}" (demo answer):`
            : `来自“${seed}”的词（演示回答）：`,
          '',
          ...rows.map(
            (r) => `- ${str(r.keyword, 80)} · ${Number(r.volume) || 0}`,
          ),
        ].join('\n');
      },
    },
    {
      id: 'nocoreach-keywords-plan',
      match: (request) =>
        has(request, 'propose_keyword_run') &&
        request.toolResults.length === 0 &&
        (asks(request, CHANGE) || asks(request, DIG)),
      reply: (request) => ({
        toolCalls: [
          { name: 'propose_keyword_run', arguments: runArguments(request) },
        ],
      }),
    },
    {
      id: 'nocoreach-keywords-answer',
      match: (request) =>
        request.toolResults.some(
          (result) => result.name === 'propose_keyword_run',
        ),
      reply: (request) => {
        const en = request.language === 'en';
        const result = object(
          safeJson(
            request.toolResults.find((r) => r.name === 'propose_keyword_run')!
              .content,
          ),
        );
        if (result.error) return str(result.error, 400);
        const p = object(result.proposal);
        const cost = `$${(Math.ceil(Number(p.maxUsd) * 100) / 100).toFixed(2)}`;
        if (p.same)
          return en
            ? `The seed words come out the same as now: nothing in the project memory, the Search Console queries or the competitors points elsewhere. They were looked up in the last 30 days, so finding again costs at most ${cost} and only picks again from the same data. Confirm in the card below if you still want it. (Demo answer.)`
            : `种子词和现在一样：项目记忆、Search Console 查询和竞品里没有指向别处的内容。它们 30 天内都查过，重新找最多花 ${cost}，只会在同样的数据里重新挑选。仍要重新找的话，在下面的卡片里确认。（演示回答）`;
        const added = Array.isArray(p.added) ? p.added.map(String) : [],
          removed = Array.isArray(p.removed) ? p.removed.map(String) : [];
        const change =
          p.kind === 'dig'
            ? en
              ? `I proposed digging from "${str(p.direction)}".`
              : `我拟了一个从“${str(p.direction)}”往下挖的方案。`
            : en
              ? `I proposed new seed words${added.length ? `, adding ${added.join(', ')}` : ''}${removed.length ? `, removing ${removed.join(', ')}` : ''}.`
              : `我拟了一组新的种子词${added.length ? `，加上 ${added.join('、')}` : ''}${removed.length ? `，去掉 ${removed.join('、')}` : ''}。`;
        return en
          ? `${change} The card below shows them before and after; the lookup costs at most ${cost} and starts only when you click Confirm and look up. (Demo answer.)`
          : `${change}下面的卡片列出了改前改后；这次最多花费 ${cost}，点“确认查词”后才开始查。（演示回答）`;
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
        has(request, 'daily_analysis') &&
        asks(request, OPPORTUNITIES) &&
        request.toolResults.length === 0,
      reply: () => ({ toolCalls: [{ name: 'daily_analysis', arguments: {} }] }),
    },
    {
      id: 'nocoreach-opportunities-answer',
      match: (request) =>
        request.toolResults.some((result) => result.name === 'daily_analysis'),
      reply: (request) => {
        const content = demoContent(
          request.language === 'en' ? 'en-US' : 'zh-CN',
        );
        const result = object(
          safeJson(
            request.toolResults.find((r) => r.name === 'daily_analysis')!
              .content,
          ),
        );
        const analysis = object(
          result.text ? safeJson(str(result.text, 50000)) : result,
        );
        const cards = list(analysis.awaitingDecisionNow).slice(0, 6);
        if (!cards.length) return content.chat.none;
        return [
          content.chat.opportunitiesIntro,
          '',
          ...cards.map(
            (card) =>
              `- [${str(card.title, 160)}](${str(card.url, 500)}) (${str(card.priority, 40)})`,
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
