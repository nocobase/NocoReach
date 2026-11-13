import {
  EVIDENCE_ROWS,
  GROWTH_KINDS,
  type EvidenceColumn,
  type EvidenceRow,
  type Growth,
  type GrowthFigure,
  type GrowthKind,
  type GrowthText,
  type NewPage,
  roundEstimate,
} from '../../../shared/growth.js';
import {
  aiDroppedGrowth,
  clickDropGrowth,
  expectedCtr,
  extraClicks,
  extraVisits,
  pageGrowth,
  pageIssueGrowth,
  rankDropGrowth,
} from '../growth-signals.js';

// The demo's growth opportunities (2026-11-10): hand-authored growth points of the four categories, every kind among
// them, for Acme and Acme CRM, in the shapes server/nocoreach/growth-signals.ts computes, with every estimate made by
// its formulas (the content optimization ones by its own builders). Keywords are those of the demo's markets (Taiwan
// for Chinese, the United States for English); products, sites and numbers are fictional.

type Lang = 'zh' | 'en';
type L = { zh: string; en: string };
const t = (zh: string, en: string): L => ({ zh, en });

/** A demo growth opportunity: the card's words in both languages, and its growth in the reader's language. */
export interface GrowthBrief {
  key: string;
  title: L;
  /** The list's one line: the growth's size, in the words the analysis is asked for. */
  reason: L;
  meaning: L;
  suggestion: L;
  objective: L;
  /** The existing page to change, where a new page goes and the pages to link to it from, or where off the site. */
  path?: string;
  newPage?: NewPage;
  offsite?: L;
  source: string;
  priority: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  growth: (lang: Lang) => Growth;
  /**
   * Ignored this many days ago, so it is under Handled rather than To do: To do keeps the four categories in about the
   * proportion of the approved mockup, with at most three Content optimization (2026-11-10 review).
   */
  ignored?: number;
}

const text = (
  key: string,
  params?: Record<string, string | number>,
): GrowthText => ({ key, ...(params ? { params } : {}) });
const figure = (
  label: string,
  value: number | string,
  extra: {
    labelParams?: Record<string, string | number>;
    format?: GrowthFigure['format'];
    detail?: GrowthText;
    estimate?: boolean;
  } = {},
): GrowthFigure => ({
  label: text(`growth.figure.${label}`, extra.labelParams),
  value:
    extra.estimate && typeof value === 'number' ? roundEstimate(value) : value,
  ...(extra.format ? { format: extra.format } : {}),
  ...(extra.detail ? { detail: extra.detail } : {}),
  ...(extra.estimate ? { estimate: true } : {}),
});
const col = (
  key: string,
  format: EvidenceColumn['format'] = 'text',
): EvidenceColumn => ({ key, label: `growth.column.${key}`, format });
const growth = (
  kind: GrowthKind,
  figures: GrowthFigure[],
  columns: EvidenceColumn[],
  rows: EvidenceRow[],
  unit: string,
  link: string,
  total = rows.length,
): Growth => ({
  kind,
  category: GROWTH_KINDS[kind],
  figures,
  evidence: {
    columns,
    rows: rows.slice(0, EVIDENCE_ROWS),
    total,
    unit: `growth.unit.${unit}`,
    link,
  },
});
const clicksDetail = text('growth.detail.clicks');
const visitsDetail = text('growth.detail.visits');
const questionsDetail = text('growth.detail.questions');
const round1 = (value: number) => Math.round(value * 10) / 10;

// --- Search Console ---------------------------------------------------------------------------------------------------

type Query = [
  query: string,
  impressions: number,
  position: number,
  clicks: number,
];
const QUERY_COLUMNS = [
  col('query'),
  col('impressions', 'count'),
  col('position', 'position'),
  col('clicks', 'count'),
  col('ctr', 'percent'),
];
const queryRows = (rows: Query[]): EvidenceRow[] =>
  rows.map(([query, impressions, position, clicks]) => ({
    query,
    impressions,
    position,
    clicks,
    ctr: clicks / impressions,
  }));
function pageOf(rows: Query[]) {
  const impressions = rows.reduce((total, r) => total + r[1], 0),
    clicks = rows.reduce((total, r) => total + r[3], 0);
  return {
    impressions,
    clicks,
    ctr: clicks / impressions,
    position: round1(
      rows.reduce((total, r) => total + r[1] * r[2], 0) / impressions,
    ),
  };
}
function nearFirst(rows: Query[]): Growth {
  const p = pageOf(rows);
  return growth(
    'near-first',
    [
      figure('impressions28', p.impressions),
      figure('averagePosition', p.position, { format: 'position' }),
      figure('clicks28', p.clicks),
      figure('topExtraClicks', extraClicks(p.impressions, 3, p.ctr), {
        labelParams: { 0: 3 },
        detail: clicksDetail,
        estimate: true,
      }),
    ],
    QUERY_COLUMNS,
    queryRows(rows),
    'queries',
    '/seo-opportunities',
  );
}
function lowCtr(rows: Query[]): Growth {
  const p = pageOf(rows);
  return growth(
    'low-ctr',
    [
      figure('impressions28', p.impressions),
      figure('ctr', p.ctr, { format: 'percent' }),
      figure('usualCtr', expectedCtr(p.position), {
        format: 'percent',
        detail: text('growth.detail.atPosition', { 0: p.position.toFixed(1) }),
      }),
      figure(
        'snippetExtraClicks',
        extraClicks(p.impressions, p.position, p.ctr),
        { detail: clicksDetail, estimate: true },
      ),
    ],
    QUERY_COLUMNS,
    queryRows(rows),
    'queries',
    '/seo-opportunities',
  );
}
/** New searches: [query, impressions, impressions in the 28 days before, position, clicks]. */
function newQueries(rows: [string, number, number, number, number][]): Growth {
  const impressions = rows.reduce((total, r) => total + r[1], 0);
  return growth(
    'new-query',
    [
      figure('newQueries', rows.length, {
        detail: text('growth.detail.newSince', {
          0: rows.filter((r) => !r[2]).length,
        }),
      }),
      figure('impressions28', impressions),
      figure(
        'averagePosition',
        round1(rows.reduce((total, r) => total + r[1] * r[3], 0) / impressions),
        { format: 'position' },
      ),
      figure(
        'topExtraClicks',
        rows.reduce((total, r) => total + extraClicks(r[1], 3, r[4] / r[1]), 0),
        { labelParams: { 0: 3 }, detail: clicksDetail, estimate: true },
      ),
    ],
    [
      col('query'),
      col('impressions', 'count'),
      col('previousImpressions', 'count'),
      col('position', 'position'),
      col('clicks', 'count'),
    ],
    rows.map(([query, impressions, previousImpressions, position, clicks]) => ({
      query,
      impressions,
      previousImpressions,
      position,
      clicks,
    })),
    'queries',
    '/seo-opportunities',
  );
}

// --- Keywords and competitors -----------------------------------------------------------------------------------------

type Rival = { name: string; rank: number };
/** A keyword we do not rank for: [keyword, monthly searches, difficulty, competitors in the top 10]. */
type Keyword = [
  keyword: string,
  volume: number,
  difficulty: number,
  rivals: Rival[],
];
const level = (kd: number) =>
  text(
    kd <= 35
      ? 'growth.level.easy'
      : kd <= 65
        ? 'growth.level.medium'
        : 'growth.level.hard',
  );
const top3Visits = (keywords: Keyword[]) =>
  keywords.reduce((total, k) => total + extraVisits(k[1], 3, null), 0);
function demandGap(keywords: Keyword[], link: string): Growth {
  const kd = Math.round(
    keywords.reduce((total, k) => total + k[2], 0) / keywords.length,
  );
  return growth(
    'demand-gap',
    [
      figure(
        'monthlySearchesTotal',
        keywords.reduce((total, k) => total + k[1], 0),
      ),
      figure('ranking', 0, {
        detail: text('growth.detail.ofKeywords', { 0: keywords.length }),
      }),
      figure('averageDifficulty', kd, { detail: level(kd) }),
      figure('topExtraVisits', top3Visits(keywords), {
        labelParams: { 0: 3 },
        detail: visitsDetail,
        estimate: true,
      }),
    ],
    [
      col('keyword'),
      col('volume', 'count'),
      col('difficulty', 'difficulty'),
      col('ourPosition', 'position'),
      col('rivalsTop10', 'list'),
    ],
    keywords.map(([keyword, volume, difficulty, rivals]) => ({
      keyword,
      volume,
      difficulty,
      ourPosition: null,
      rivalsTop10: rivals,
    })),
    'keywords',
    link,
  );
}
function competitorGap(
  name: string,
  traffic: number,
  keywords: [
    keyword: string,
    volume: number,
    difficulty: number,
    rank: number,
  ][],
): Growth {
  return growth(
    'competitor-gap',
    [
      figure('rivalPageTraffic', traffic, {
        labelParams: { 0: name },
        detail: visitsDetail,
        estimate: true,
      }),
      figure(
        'monthlySearchesTotal',
        keywords.reduce((total, k) => total + k[1], 0),
      ),
      figure('ranking', 0, {
        detail: text('growth.detail.ofKeywords', { 0: keywords.length }),
      }),
      figure(
        'topExtraVisits',
        keywords.reduce((total, k) => total + extraVisits(k[1], 3, null), 0),
        { labelParams: { 0: 3 }, detail: visitsDetail, estimate: true },
      ),
    ],
    [
      col('keyword'),
      col('volume', 'count'),
      col('difficulty', 'difficulty'),
      col('rivalPosition', 'position'),
    ],
    keywords.map(([keyword, volume, difficulty, rivalPosition]) => ({
      keyword,
      volume,
      difficulty,
      rivalPosition,
    })),
    'keywords',
    '/research/domain',
  );
}
/** A rising keyword we are not in the top 10 for, from its last twelve months of searches (oldest first). */
function rising(months: number[], end: string): Growth {
  const mean = (list: number[]) =>
    list.reduce((total, v) => total + v, 0) / list.length;
  // Searched as often as it is now, the last 3 months (growth-signals.ts risingKeywordSignals).
  const last = mean(months.slice(-3)),
    before = mean(months.slice(-6, -3)),
    volume = Math.round(last);
  const [year, month] = end.split('-').map(Number);
  return growth(
    'rising',
    [
      figure('monthlySearches', volume),
      figure('threeMonthChange', (last - before) / before, {
        format: 'change',
      }),
      figure('ourPosition', '—', { format: 'position' }),
      figure('topExtraVisits', extraVisits(volume, 3, null), {
        labelParams: { 0: 3 },
        detail: visitsDetail,
        estimate: true,
      }),
    ],
    [col('month'), col('volume', 'count')],
    months
      .map((volume, i) => {
        const at = new Date(
          Date.UTC(year, month - 1 - (months.length - 1 - i)),
        );
        return {
          month: `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`,
          volume,
        };
      })
      .reverse(),
    'months',
    '/keywords?tab=suggest',
  );
}
/** The competitor's last week: its new pages and releases ([title, url, release or page, day]). */
function competitorLaunch(
  name: string,
  release: string,
  stars: number,
  traffic: number,
  events: [
    title: string,
    url: string,
    kind: 'release' | 'page',
    date: string,
  ][],
): Growth {
  return growth(
    'competitor-launch',
    [
      figure('newPagesWeek', events.filter((e) => e[2] === 'page').length),
      figure('latestRelease', release),
      figure('rivalStarsWeek', stars, { labelParams: { 0: name } }),
      figure('rivalTraffic', traffic, {
        labelParams: { 0: name },
        detail: visitsDetail,
        estimate: true,
      }),
    ],
    [col('title'), col('kind', 'label'), col('date', 'date')],
    events.map(([title, url, kind, date]) => ({
      title,
      url,
      kind: kind === 'release' ? 'growth.value.release' : 'growth.value.page',
      date,
    })),
    'items',
    '/research/domain?view=watch',
  );
}

// --- AI search --------------------------------------------------------------------------------------------------------

/** A question: [question, platform, products named, sources cited]. */
type Question = [
  question: string,
  platform: 'chat_gpt' | 'google',
  named: string[],
  cited: string[],
];
function notMentioned(
  name: string,
  all: number,
  split: [chatGpt: number, google: number],
  others: number,
  ours: number,
  source: string,
  questions: Question[],
): Growth {
  return growth(
    'not-mentioned',
    [
      figure('relatedQuestions', all, {
        detail: text('growth.detail.platformSplit', {
          0: split[0],
          1: split[1],
        }),
      }),
      figure('rivalQuestions', others, { detail: questionsDetail }),
      figure('namingUs', ours, {
        labelParams: { 0: name },
        detail: questionsDetail,
      }),
      figure('topSources', source),
    ],
    [
      col('question'),
      col('platform', 'platform'),
      col('named', 'list'),
      col('cited', 'list'),
    ],
    questions.map(([question, platform, named, cited]) => ({
      question,
      platform,
      named,
      cited,
    })),
    'questions',
    '/ai-search',
    all,
  );
}
/** A page AI cites: [title, url, site, citations, products it lists]. */
type Cited = [
  title: string,
  url: string,
  domain: string,
  citations: number,
  named: string[],
];
function citedSources(questions: number, pages: Cited[]): Growth {
  return growth(
    'cited-sources',
    [
      figure('citedPages', pages.length),
      figure(
        'citations',
        pages.reduce((total, p) => total + p[3], 0),
        { detail: text('growth.detail.times') },
      ),
      figure('rivalQuestions', questions, { detail: questionsDetail }),
      figure(
        'namedInThem',
        [...new Set(pages.flatMap((p) => p[4]))].join(' · '),
      ),
    ],
    [
      col('page'),
      col('domain'),
      col('citations', 'count'),
      col('named', 'list'),
    ],
    pages.map(([page, url, domain, citations, named]) => ({
      page,
      url,
      domain,
      citations,
      named,
    })),
    'pages',
    '/ai-search',
  );
}
/** Answers naming us without a link: [question, AI searches a month, sources cited instead]. */
function uncited(
  mentioning: number,
  citing: number,
  searches: number,
  rows: [question: string, volume: number, cited: string[]][],
): Growth {
  return growth(
    'uncited',
    [
      figure('mentioningAnswers', mentioning),
      figure('citingAnswers', citing),
      figure('uncitedAnswers', mentioning - citing),
      figure('aiSearches', searches),
    ],
    [col('question'), col('aiVolume', 'count'), col('cited', 'list')],
    rows.map(([question, aiVolume, cited]) => ({ question, aiVolume, cited })),
    'questions',
    '/ai-search?tab=brand',
    mentioning - citing,
  );
}

// --- GitHub -----------------------------------------------------------------------------------------------------------

/** A new repository: [owner/name, stars, created, language]. */
type Repo = [
  repository: string,
  stars: number,
  created: string,
  language: string,
];
const REPO_COLUMNS = [
  col('repository'),
  col('stars', 'count'),
  col('created', 'date'),
  col('language'),
];
const repoRows = (repos: Repo[]): EvidenceRow[] =>
  repos.map(([repository, stars, created, language]) => ({
    repository,
    url: `https://github.com/${repository}`,
    stars,
    created,
    language,
  }));
function topicHeat(
  last: number,
  before: number,
  total: number,
  repos: Repo[],
): Growth {
  return growth(
    'topic-heat',
    [
      figure('newRepositoriesWeek', last),
      figure('newRepositoriesBefore', before, {
        detail: text('growth.detail.perWeek'),
      }),
      figure('weekChange', (last - before) / before, { format: 'change' }),
      figure('topicRepositories', total),
    ],
    REPO_COLUMNS,
    repoRows(repos),
    'repositories',
    '/data/github?view=hot',
    last,
  );
}
function newRepo(topic: string, topicTotal: number, repos: Repo[]): Growth {
  const [, stars] = repos[0];
  return growth(
    'new-repo',
    [
      figure('starsWeek', stars),
      figure('topicRank', 1, {
        detail: text('growth.detail.ofNewRepositories', { 0: repos.length }),
      }),
      figure('topic', topic),
      figure('topicRepositories', topicTotal),
    ],
    REPO_COLUMNS,
    repoRows(repos),
    'repositories',
    '/data/github?view=hot',
  );
}

/** Days before the demo's import, as a date: the demo's dates move with it. */
const dayBefore = (now: Date, days: number) =>
  new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
const pick = <T>(lang: Lang, zh: T, en: T): T => (lang === 'zh' ? zh : en);
const nimbus = (rank: number): Rival => ({ name: 'Nimbus', rank });
const tasks = (rank: number): Rival => ({ name: 'Example Tasks', rank });

/** Acme's growth points, the first of them on the Excel import guide (the page the demo's hand-off test reads). */
export function acmeGrowthBriefs(now: Date): GrowthBrief[] {
  const month = dayBefore(now, 0).slice(0, 7);
  return [
    {
      key: 'acme-growth-import',
      title: t(
        '把 Excel 导入指南推进 Google 前 3 名',
        "Get the Excel import guide into Google's top 3",
      ),
      reason: t(
        '6 个搜索词近 28 天曝光 2,140 次，平均排第 9.3；进前 3 预计每月多 210 次点击。',
        '6 searches, 2,140 impressions in 28 days at position 9.3 on average; in the top 3, an estimated 210 more clicks a month.',
      ),
      meaning: t(
        '从 Excel 导入是试用团队迁移的第一步，搜这些词的人正准备换工具。页面已经在第一页末尾，排在前面的教程都讲了日期格式和子任务，这两点本站还没写。',
        'Importing from Excel is the first step of a trial team’s move, and people searching these terms are about to switch tools. The page is already at the bottom of page one; the guides above it cover date formats and subtasks, which ours does not.',
      ),
      suggestion: t(
        '补写日期格式、子任务和 CSV 导入三段，各配一个示例文件；标题改为“如何用 Excel 导入任务（含日期与子任务）”。',
        'Add sections on date formats, subtasks and CSV imports, each with a sample file, and retitle the page “How to import tasks from Excel (with dates and subtasks)”.',
      ),
      objective: t(
        '让 Excel 导入指南排进前 3 名',
        'Rank the Excel import guide in the top 3',
      ),
      path: '/docs/import-excel',
      source: 'gsc',
      priority: 'high',
      effort: 'low',
      growth: (lang) =>
        nearFirst(
          pick<Query[]>(
            lang,
            [
              ['Excel 匯入任務', 880, 8.1, 19],
              ['Excel 匯入任務 日期格式', 420, 9.6, 8],
              ['如何用 Excel 匯入任務', 360, 10.4, 6],
              ['Excel 匯入 子任務', 190, 9, 4],
              ['專案 Excel 範本 匯入', 160, 11.2, 2],
              ['CSV 匯入任務', 130, 10.8, 2],
            ],
            [
              ['import tasks from excel', 880, 8.1, 19],
              ['import tasks from excel with subtasks', 420, 9.6, 8],
              ['how to import tasks from excel', 360, 10.4, 6],
              ['excel task list import', 190, 9, 4],
              ['import project plan from excel', 160, 11.2, 2],
              ['import tasks from csv', 130, 10.8, 2],
            ],
          ),
        ),
    },
    {
      key: 'acme-growth-gantt',
      title: t(
        '写一篇甘特图指南，拿下 12 个还没排上的词',
        'Write a Gantt chart guide to win 12 keywords we do not rank for',
      ),
      reason: t(
        '这 12 个词每月搜索 9,750 次，本站都没排进前 20；Nimbus 有 6 个排在前 10。',
        'These 12 keywords are searched 9,750 times a month and we rank in the top 20 for none; Nimbus has 6 in the top 10.',
      ),
      meaning: t(
        'Acme 的时间线视图就是甘特图，但网站上没有一篇讲甘特图的文章。这些词前 10 名里有 4 篇是工具教程，Nimbus 靠同类文章拿到了这部分流量；平均难度 27，新页面有机会进前 10。',
        'Acme’s timeline view is a Gantt chart, yet the site has no article about Gantt charts. Four of the top 10 results are tool tutorials, and Nimbus takes this traffic with one; at an average difficulty of 27 a new page can reach the top 10.',
      ),
      suggestion: t(
        '写一篇“如何用甘特图排项目进度”的指南，用产品发布排期做例子，附一个可下载的范本；在时间线功能页加上到这篇指南的链接。',
        'Write a guide to scheduling a project with a Gantt chart, using a product launch as the example and offering a downloadable template; link to it from the timeline feature page.',
      ),
      objective: t(
        '用一篇甘特图指南拿下这组关键词',
        'Win this keyword group with a Gantt chart guide',
      ),
      newPage: {
        section: '/blog/',
        linkFrom: ['/features/timeline', '/templates'],
      },
      source: 'keywords',
      priority: 'high',
      effort: 'medium',
      growth: (lang) =>
        demandGap(
          pick<Keyword[]>(
            lang,
            [
              ['甘特圖', 2900, 34, [nimbus(4)]],
              ['甘特圖 範本', 1600, 22, [tasks(6), nimbus(9)]],
              ['甘特圖 excel', 1300, 27, [nimbus(7)]],
              ['線上甘特圖', 880, 31, [nimbus(5), tasks(8)]],
              ['甘特圖 製作', 720, 19, []],
              ['甘特圖 軟體', 590, 41, [nimbus(3), tasks(5)]],
              ['免費甘特圖', 480, 24, [tasks(7)]],
              ['甘特圖 怎麼做', 390, 15, []],
              ['專案 甘特圖', 320, 29, [nimbus(6)]],
              ['甘特圖 工具', 260, 38, [tasks(4)]],
              ['甘特圖 app', 170, 33, []],
              ['甘特圖 教學', 140, 12, []],
            ],
            [
              ['gantt chart for project management', 2900, 34, [nimbus(4)]],
              ['gantt chart template', 1600, 22, [tasks(6), nimbus(9)]],
              ['gantt chart in excel', 1300, 27, [nimbus(7)]],
              ['online gantt chart', 880, 31, [nimbus(5), tasks(8)]],
              ['how to make a gantt chart', 720, 19, []],
              [
                'gantt chart software for small teams',
                590,
                41,
                [nimbus(3), tasks(5)],
              ],
              ['free gantt chart maker', 480, 24, [tasks(7)]],
              ['gantt chart example', 390, 15, []],
              ['project timeline gantt chart', 320, 29, [nimbus(6)]],
              ['gantt chart tool', 260, 38, [tasks(4)]],
              ['gantt chart app', 170, 33, []],
              ['gantt chart tutorial', 140, 12, []],
            ],
          ),
          '/keywords?tab=suggest',
        ),
    },
    {
      key: 'acme-growth-ai-collaboration',
      title: t(
        '让 AI 推荐团队协作工具时提到 Acme',
        'Get Acme named when AI recommends team collaboration tools',
      ),
      reason: t(
        '26 个相关问题里，19 个的回答提到了 Nimbus 等产品，只有 3 个提到 Acme。',
        'Of 26 related questions, the answers to 19 name Nimbus and others; only 3 name Acme.',
      ),
      meaning: t(
        '选协作工具的人越来越多先问 AI。回答里反复出现的是 Nimbus 和 Example Tasks，引用最多的是一个软件评测站和几篇对比文章；Acme 的访客协作和交接功能正好对应这些问题，但没有页面直接回答。',
        'More and more people ask AI before choosing a collaboration tool. The answers keep naming Nimbus and Example Tasks and cite a software review site and a few comparison articles most; Acme’s guest collaboration and handover features answer these questions, but no page says so directly.',
      ),
      suggestion: t(
        '写一页“小团队怎么选协作工具”，按访客权限、交接、价格三项列出 Acme 的做法和适用场景；更新评测站上的产品资料。',
        'Write a page on how small teams choose a collaboration tool, setting out Acme’s approach to guest access, handovers and pricing; update the review site’s product profile.',
      ),
      objective: t(
        '让 AI 回答协作工具问题时提到 Acme',
        'Have AI answers on collaboration tools name Acme',
      ),
      newPage: { section: '/blog/', linkFrom: ['/', '/docs/guests'] },
      source: 'ai-search',
      priority: 'high',
      effort: 'medium',
      growth: (lang) =>
        notMentioned(
          'Acme',
          26,
          [15, 11],
          19,
          3,
          'reviews-hub.example',
          pick<Question[]>(
            lang,
            [
              [
                '小团队用什么协作工具管理项目比较好？',
                'chat_gpt',
                ['Nimbus', 'Example Tasks', 'Flowboard'],
                ['reviews-hub.example', 'pm-weekly.example'],
              ],
              [
                '有哪些可以让客户查看进度的项目管理工具？',
                'chat_gpt',
                ['Nimbus', 'Example Tasks'],
                ['saas-review.example'],
              ],
              [
                '适合设计团队的任务协作软件推荐',
                'google',
                ['Nimbus', 'Flowboard'],
                ['reviews-hub.example'],
              ],
              [
                '远程团队怎么同步项目进度？',
                'chat_gpt',
                ['Example Tasks'],
                ['pm-weekly.example'],
              ],
              [
                '外包团队和甲方用什么工具协作？',
                'google',
                ['Nimbus'],
                ['forum.example'],
              ],
              [
                '项目交接用什么工具不容易漏事？',
                'chat_gpt',
                ['Nimbus', 'Example Tasks'],
                ['reviews-hub.example'],
              ],
              [
                '免费的团队协作工具有哪些？',
                'google',
                ['Example Tasks', 'Flowboard'],
                ['saas-review.example'],
              ],
            ],
            [
              [
                'What is the best collaboration tool for a small project team?',
                'chat_gpt',
                ['Nimbus', 'Example Tasks', 'Flowboard'],
                ['reviews-hub.example', 'pm-weekly.example'],
              ],
              [
                'Which project management tools let clients see progress?',
                'chat_gpt',
                ['Nimbus', 'Example Tasks'],
                ['saas-review.example'],
              ],
              [
                'Task collaboration software for design teams',
                'google',
                ['Nimbus', 'Flowboard'],
                ['reviews-hub.example'],
              ],
              [
                'How do remote teams keep project status in sync?',
                'chat_gpt',
                ['Example Tasks'],
                ['pm-weekly.example'],
              ],
              [
                'What tool should an agency and its client use together?',
                'google',
                ['Nimbus'],
                ['forum.example'],
              ],
              [
                'Which tool makes project handovers less error-prone?',
                'chat_gpt',
                ['Nimbus', 'Example Tasks'],
                ['reviews-hub.example'],
              ],
              [
                'Free team collaboration tools',
                'google',
                ['Example Tasks', 'Flowboard'],
                ['saas-review.example'],
              ],
            ],
          ),
        ),
    },
    {
      key: 'acme-growth-roundups',
      title: t(
        '进入 AI 常引用的 3 篇项目管理工具榜单',
        'Get into the 3 project management roundups AI cites most',
      ),
      reason: t(
        '这 3 篇在 AI 回答里被引用 41 次，都列了 Nimbus、Example Tasks，没有 Acme。',
        'These 3 pages are cited 41 times in AI answers and all list Nimbus and Example Tasks, not Acme.',
      ),
      meaning: t(
        'AI 回答“哪款项目管理软件好用”时，大多直接引用这 3 篇榜单。榜单每季度更新，作者接受产品提交；进入其中一篇，相关的 17 个问题就有机会提到 Acme。',
        'When AI answers which project management software to use, it mostly cites these 3 roundups. They are updated every quarter and accept product submissions; getting into one gives Acme a chance in the 17 related questions.',
      ),
      suggestion: t(
        '按每篇榜单的提交要求准备产品资料（定位、价格、截图和一段客户引述），提交给作者；同时在对比页补上榜单关注的导入和访客权限说明。',
        'Prepare the product details each roundup asks for (positioning, pricing, screenshots and a customer quote) and submit them; add the import and guest-access details these roundups weigh to the comparison page.',
      ),
      objective: t(
        '被 AI 常引用的榜单收录',
        'Be listed in the roundups AI cites',
      ),
      offsite: t(
        '提交给 saas-review.example、pm-weekly.example 的榜单作者，并在 forum.example 的讨论里回复',
        'Submit to the authors of the saas-review.example and pm-weekly.example roundups, and reply in the forum.example thread',
      ),
      source: 'ai-search',
      priority: 'high',
      effort: 'low',
      growth: (lang) =>
        citedSources(
          17,
          pick<Cited[]>(
            lang,
            [
              [
                '2026 年 10 款最好用的项目管理软件',
                'https://saas-review.example/best-project-management-software',
                'saas-review.example',
                18,
                ['Nimbus', 'Example Tasks', 'Flowboard'],
              ],
              [
                '小团队项目管理工具横评',
                'https://pm-weekly.example/small-team-tools',
                'pm-weekly.example',
                14,
                ['Nimbus', 'Example Tasks'],
              ],
              [
                '大家现在都用什么做项目管理？',
                'https://forum.example/t/project-tools-2026',
                'forum.example',
                9,
                ['Example Tasks', 'Nimbus'],
              ],
            ],
            [
              [
                'The 10 best project management tools in 2026',
                'https://saas-review.example/best-project-management-software',
                'saas-review.example',
                18,
                ['Nimbus', 'Example Tasks', 'Flowboard'],
              ],
              [
                'Project management tools for small teams, compared',
                'https://pm-weekly.example/small-team-tools',
                'pm-weekly.example',
                14,
                ['Nimbus', 'Example Tasks'],
              ],
              [
                'What do you use for project management now?',
                'https://forum.example/t/project-tools-2026',
                'forum.example',
                9,
                ['Example Tasks', 'Nimbus'],
              ],
            ],
          ),
        ),
    },
    {
      key: 'acme-growth-ai-pm',
      title: t(
        '趁“AI 專案管理”搜索量上升写一页',
        'Write a page while searches for “ai project management” rise',
      ),
      reason: t(
        '近 3 个月搜索量涨了 126%，现在每月 2,750 次；竞品里只有 Nimbus 有对应页面。',
        'Searches are up 126% over the last 3 months to 2,750 a month now; among competitors only Nimbus has a page for it.',
      ),
      meaning: t(
        '这个词还在上升期，排在前面的多是新闻，工具页很少；Acme 的自动排期和周报摘要正好对应这个需求，早一点写更容易排上。',
        'The term is still rising and its top results are mostly news, with few tool pages. Acme’s automatic scheduling and weekly report summaries fit the need, and an early page ranks more easily.',
      ),
      suggestion: t(
        '写一页“Acme 里的 AI 功能”，讲清自动排期、周报摘要和任务拆分能做什么、不能做什么，配上真实截图。',
        'Write a page on Acme’s AI features that says what automatic scheduling, weekly report summaries and task breakdowns can and cannot do, with real screenshots.',
      ),
      objective: t(
        '在“AI 專案管理”上升期排进前 10',
        'Reach the top 10 for “ai project management” while it rises',
      ),
      newPage: { section: '/features/', linkFrom: ['/', '/features/workload'] },
      source: 'keywords',
      priority: 'high',
      effort: 'medium',
      growth: (lang) => ({
        ...rising(
          [850, 900, 880, 940, 910, 980, 1050, 1150, 1450, 2100, 2850, 3300],
          month,
        ),
        subject: lang === 'zh' ? 'AI 專案管理' : 'ai project management',
      }),
    },
    {
      key: 'acme-growth-client-portal',
      title: t(
        '补一页 Nimbus 已有的客户门户用例',
        'Add the client portal use case Nimbus already has',
      ),
      reason: t(
        '这页每月给 Nimbus 带来约 3,200 次搜索访问，相关 9 个词本站都没排上。',
        'This page brings Nimbus about 3,200 search visits a month; we rank for none of its 9 keywords.',
      ),
      meaning: t(
        '代理商和外包团队找的是“让客户看进度、审文件”的工具，这正是 Acme 访客权限能做的事，但网站上只有一页设置说明，没有讲这个用例。',
        'Agencies and outsourcing teams look for a tool that lets clients follow progress and approve files, which is what Acme’s guest access does; the site has only a settings page and does not describe the use case.',
      ),
      suggestion: t(
        '新建“客户门户”用例页：客户能看什么、能审什么、怎么邀请，附一个代理商的完整流程；从访客权限文档链接过来。',
        'Create a client portal use-case page covering what clients can see and approve and how to invite them, with an agency’s full workflow; link to it from the guest access docs.',
      ),
      objective: t('拿下客户门户这组关键词', 'Win the client portal keywords'),
      newPage: { section: '/use-cases/', linkFrom: ['/docs/guests'] },
      source: 'competitors',
      priority: 'medium',
      effort: 'medium',
      growth: (lang) =>
        competitorGap(
          'Nimbus',
          3200,
          pick<[string, number, number, number][]>(
            lang,
            [
              ['客戶入口 網站', 1900, 36, 3],
              ['客戶協作平台', 1300, 42, 5],
              ['專案 客戶入口', 880, 28, 2],
              ['客戶 專案進度 查看', 720, 21, 4],
              ['外部協作 專案管理', 590, 33, 6],
              ['客戶 審核 檔案', 480, 25, 8],
              ['與客戶共享專案', 390, 19, 3],
              ['客戶 回饋 專案管理', 320, 30, 9],
              ['代理商 專案管理 客戶', 260, 27, 7],
            ],
            [
              ['client portal for project management', 1900, 36, 3],
              ['client collaboration platform', 1300, 42, 5],
              ['project client portal', 880, 28, 2],
              ['share project progress with clients', 720, 21, 4],
              ['external collaboration project management', 590, 33, 6],
              ['client file approval', 480, 25, 8],
              ['share a project with a client', 390, 19, 3],
              ['client feedback project management', 320, 30, 9],
              ['agency project management for clients', 260, 27, 7],
            ],
          ),
        ),
    },
    {
      key: 'acme-growth-kanban-snippet',
      title: t(
        '改写看板页的标题和摘要，拿回点击',
        "Rewrite the Kanban page's title and snippet to win back clicks",
      ),
      reason: t(
        '近 28 天曝光 3,860 次、点击率 0.9%，同排名常见是 7.6%；改好标题和摘要预计每月多 280 次点击。',
        '3,860 impressions in 28 days at 0.9% CTR against the usual 7.6% at this position; a better title and snippet would bring an estimated 280 more clicks a month.',
      ),
      meaning: t(
        '看板页排在第 4 名左右，但搜索结果里的标题只有“看板 - Acme”，摘要是导航文字，看不出能做什么，搜索的人都点了前后的教程。',
        'The Kanban page ranks around position 4, but its result reads only “Kanban - Acme” with navigation text as the snippet, so searchers click the guides around it.',
      ),
      suggestion: t(
        '把标题改成“专案看板：拖拽排任务、按负责人分组（附范例）”，写一段 150 字以内的描述，说明三个常见用法。',
        'Retitle it “Kanban boards: drag tasks, group by owner (with examples)” and write a description of under 160 characters naming three common uses.',
      ),
      objective: t(
        '把看板页的点击率提到同排名的常见水平',
        'Raise the Kanban page’s CTR to the usual rate at its position',
      ),
      path: '/features/kanban',
      source: 'gsc',
      priority: 'medium',
      effort: 'low',
      growth: (lang) =>
        lowCtr(
          pick<Query[]>(
            lang,
            [
              ['專案看板', 1600, 3.8, 14],
              ['專案看板 範例', 900, 4.6, 8],
              ['如何建立專案看板', 620, 5.1, 6],
              ['看板 管理 工具', 420, 4.4, 4],
              ['線上看板', 320, 5, 3],
            ],
            [
              ['kanban boards', 1600, 3.8, 14],
              ['kanban board examples', 900, 4.6, 8],
              ['how to use kanban boards', 620, 5.1, 6],
              ['kanban management tool', 420, 4.4, 4],
              ['online kanban board', 320, 5, 3],
            ],
          ),
        ),
    },
    {
      key: 'acme-growth-recurring',
      title: t(
        '重复任务文档开始被新搜索词找到，补上对应段落',
        'The recurring tasks guide is found by new searches; add the sections they ask for',
      ),
      reason: t(
        '近 28 天有 7 个搜索词新出现或成倍增长，合计曝光 1,180 次；进前 3 预计每月多 130 次点击。',
        '7 searches appeared or multiplied in 28 days with 1,180 impressions in all; in the top 3, an estimated 130 more clicks a month.',
      ),
      meaning: t(
        '新出现的词多在问“每月最后一个工作日”和“跳过假日”，文档里只讲了每天和每周，搜到的人找不到答案。',
        'Most of the new searches ask about “the last working day of the month” and “skipping holidays”, while the guide covers only daily and weekly repeats, so searchers do not find the answer.',
      ),
      suggestion: t(
        '在重复任务文档里补“按月和按工作日重复”“跳过假日”两节，各给一个设置示例。',
        'Add sections on monthly and working-day repeats and on skipping holidays to the guide, each with a setup example.',
      ),
      objective: t(
        '让重复任务文档回答新出现的问题',
        'Have the recurring tasks guide answer the new searches',
      ),
      path: '/docs/recurring-tasks',
      source: 'gsc',
      priority: 'medium',
      effort: 'low',
      growth: (lang) =>
        newQueries(
          pick<[string, number, number, number, number][]>(
            lang,
            [
              ['重複任務 每月最後一天', 310, 0, 6.2, 6],
              ['重複任務 跳過假日', 240, 0, 7.9, 3],
              ['每月 重複 任務 設定', 190, 40, 8.4, 2],
              ['工作日 重複任務', 150, 0, 6.8, 2],
              ['重複任務 到期日', 120, 30, 7.1, 1],
              ['週期性任務 管理', 100, 20, 8.8, 1],
              ['重複任務 提醒', 70, 0, 9.5, 0],
            ],
            [
              ['recurring task last day of month', 310, 0, 6.2, 6],
              ['recurring tasks skip holidays', 240, 0, 7.9, 3],
              ['set up monthly recurring tasks', 190, 40, 8.4, 2],
              ['recurring tasks on working days', 150, 0, 6.8, 2],
              ['recurring tasks due date', 120, 30, 7.1, 1],
              ['manage periodic tasks', 100, 20, 8.8, 1],
              ['recurring task reminders', 70, 0, 9.5, 0],
            ],
          ),
        ),
    },
    {
      key: 'acme-growth-ai-links',
      title: t(
        '让提到 Acme 的 AI 回答引用 Acme 的页面',
        "Get AI answers that name Acme to cite Acme's pages",
      ),
      reason: t(
        '34 个提到 Acme 的回答里有 25 个没有引用本站，这些问题每月在 AI 里约被问 4,800 次。',
        '25 of the 34 answers naming Acme do not cite our site; these questions are asked about 4,800 times a month in AI search.',
      ),
      meaning: t(
        'AI 提到 Acme 时引用的是论坛帖子和旧的评测文章，内容停在两个版本以前；本站的文档没有可以直接摘录的答案段落。',
        'When AI names Acme it cites forum threads and old reviews written two versions ago; our docs have no answer paragraphs AI could quote.',
      ),
      suggestion: t(
        '给这些问题对应的 5 个文档页开头各加一段两三句话的直接回答，补上更新日期和 FAQ 结构化数据。',
        'Open the 5 docs pages these questions concern with a direct two- or three-sentence answer, and add update dates and FAQ structured data.',
      ),
      objective: t(
        '让 AI 回答引用 Acme 的文档',
        'Have AI answers cite Acme’s docs',
      ),
      path: '/docs/getting-started',
      source: 'ai-search',
      priority: 'medium',
      effort: 'low',
      ignored: 3,
      growth: (lang) =>
        uncited(
          34,
          9,
          4800,
          pick<[string, number, string[]][]>(
            lang,
            [
              ['Acme 支持从 Excel 导入任务吗？', 880, ['forum.example']],
              ['Acme 的访客能看到哪些内容？', 720, ['saas-review.example']],
              [
                'Acme 和 Nimbus 哪个更适合小团队？',
                690,
                ['pm-weekly.example', 'forum.example'],
              ],
              ['Acme 怎么设置重复任务？', 540, ['forum.example']],
              ['Acme 能导出甘特图吗？', 410, ['saas-review.example']],
              ['Acme 的价格怎么算？', 380, ['reviews-hub.example']],
            ],
            [
              ['Can Acme import tasks from Excel?', 880, ['forum.example']],
              ['What can guests see in Acme?', 720, ['saas-review.example']],
              [
                'Acme or Nimbus for a small team?',
                690,
                ['pm-weekly.example', 'forum.example'],
              ],
              [
                'How do I set up recurring tasks in Acme?',
                540,
                ['forum.example'],
              ],
              ['Can Acme export a Gantt chart?', 410, ['saas-review.example']],
              ['How is Acme priced?', 380, ['reviews-hub.example']],
            ],
          ),
        ),
    },
    {
      key: 'acme-growth-nimbus-launch',
      title: t(
        '趁 Nimbus 4.0 刚发布，更新 Acme 与 Nimbus 的对比页',
        'Update the Acme vs Nimbus comparison while Nimbus 4.0 is new',
      ),
      reason: t(
        'Nimbus 近 7 天发布 4.0 和 3 个新页面，主打资源负荷视图；它每月约有 41,000 次搜索访问。',
        'Nimbus released 4.0 and 3 new pages in the last 7 days, led by a workload view; it draws about 41,000 search visits a month.',
      ),
      meaning: t(
        '发布后的几周里搜“Nimbus 4.0”和“Nimbus 替代”的人会增加。Acme 的负荷页已经上线，对比页还停在 Nimbus 3.x，写的是对方没有负荷视图。',
        'Searches for “Nimbus 4.0” and Nimbus alternatives rise in the weeks after a launch. Acme’s workload page is live, but the comparison page still describes Nimbus 3.x and says it has no workload view.',
      ),
      suggestion: t(
        '按 Nimbus 4.0 的发布说明更新对比页，如实写出双方的负荷视图差异，加上迁移步骤和价格对比。',
        'Update the comparison page from the Nimbus 4.0 release notes, describe both workload views accurately, and add migration steps and a price comparison.',
      ),
      objective: t(
        '对比页反映 Nimbus 4.0 后的真实差异',
        'Keep the comparison page accurate after Nimbus 4.0',
      ),
      path: '/compare/nimbus',
      source: 'competitors',
      priority: 'medium',
      effort: 'low',
      growth: (lang) =>
        competitorLaunch(
          'Nimbus',
          'v4.0.0',
          380,
          41000,
          pick<[string, string, 'release' | 'page', string][]>(
            lang,
            [
              [
                'Nimbus 4.0：资源负荷视图',
                'https://github.com/nimbus/tasks/releases/tag/v4.0.0',
                'release',
                dayBefore(now, 3),
              ],
              [
                '资源负荷视图',
                'https://nimbus.example/features/workload',
                'page',
                dayBefore(now, 3),
              ],
              [
                '从 Excel 迁移到 Nimbus',
                'https://nimbus.example/guides/migrate-from-excel',
                'page',
                dayBefore(now, 4),
              ],
              [
                'Nimbus 与 Acme 对比',
                'https://nimbus.example/compare/acme',
                'page',
                dayBefore(now, 5),
              ],
            ],
            [
              [
                'Nimbus 4.0: workload view',
                'https://github.com/nimbus/tasks/releases/tag/v4.0.0',
                'release',
                dayBefore(now, 3),
              ],
              [
                'Workload view',
                'https://nimbus.example/features/workload',
                'page',
                dayBefore(now, 3),
              ],
              [
                'Migrate from Excel to Nimbus',
                'https://nimbus.example/guides/migrate-from-excel',
                'page',
                dayBefore(now, 4),
              ],
              [
                'Nimbus vs Acme',
                'https://nimbus.example/compare/acme',
                'page',
                dayBefore(now, 5),
              ],
            ],
          ),
        ),
    },
    {
      key: 'acme-growth-kanban-topic',
      title: t(
        '趁 kanban 话题升温，发布 Acme 看板 API 的示例项目',
        'Publish a Kanban API example while the kanban topic heats up',
      ),
      reason: t(
        '上周 kanban 话题新建 64 个仓库，是前 4 周平均的 2.8 倍。',
        '64 repositories were created in the kanban topic last week, 2.8 times the average of the 4 weeks before.',
      ),
      meaning: t(
        '新仓库大多是自托管看板和看板组件，开发者正在找可以接入的看板数据；Acme 有看板 API，但 GitHub 上没有示例项目，搜不到。',
        'Most new repositories are self-hosted boards and board components, so developers are looking for board data to connect to; Acme has a board API but no example project on GitHub to find.',
      ),
      suggestion: t(
        '发布一个用 Acme API 读写看板的示例仓库（TypeScript），加上 kanban 话题标签，并在快速上手文档里链接。',
        'Publish an example repository (TypeScript) that reads and writes boards through the Acme API, tag it with the kanban topic and link it from the getting-started guide.',
      ),
      objective: t(
        '让 GitHub 上找看板方案的开发者找到 Acme',
        'Let developers looking for boards on GitHub find Acme',
      ),
      path: '/docs/getting-started',
      source: 'github',
      priority: 'low',
      effort: 'medium',
      growth: () => ({
        subject: 'kanban',
        ...topicHeat(64, 23, 18400, [
          ['openboard/openboard', 1240, dayBefore(now, 6), 'TypeScript'],
          ['laneflow/laneflow', 410, dayBefore(now, 5), 'Go'],
          ['kanbanui/react-kanban-kit', 260, dayBefore(now, 4), 'TypeScript'],
          ['taskdeck/taskdeck', 180, dayBefore(now, 6), 'Rust'],
          ['boardsync/boardsync', 95, dayBefore(now, 2), 'Python'],
        ]),
      }),
    },
    {
      key: 'acme-growth-openboard',
      title: t(
        '给新晋热门项目 openboard 写一篇 Acme 集成示例',
        'Write an Acme integration example for the new popular project openboard',
      ),
      reason: t(
        'openboard 近 7 天拿到 1,240 个 Star，在 project-management 话题的新仓库里排第 1。',
        'openboard gained 1,240 stars in 7 days, first among new repositories in project-management.',
      ),
      meaning: t(
        'openboard 是自托管的看板，用户在讨论区里问怎么和现有项目管理工具同步任务；第一个给出集成示例的产品会被写进它的文档。',
        'openboard is a self-hosted board whose users ask in its discussions how to sync tasks with their project management tool; the first product with an integration example gets into its docs.',
      ),
      suggestion: t(
        '写一篇“openboard 与 Acme 双向同步任务”的教程，附示例代码，并到 openboard 的讨论区回复链接。',
        'Write a tutorial on two-way task sync between openboard and Acme with sample code, and reply with a link in openboard’s discussions.',
      ),
      objective: t(
        '借 openboard 的热度让开发者知道 Acme',
        'Reach developers through openboard’s momentum',
      ),
      newPage: { section: '/blog/', linkFrom: ['/docs/getting-started'] },
      source: 'github',
      priority: 'high',
      effort: 'medium',
      growth: () => ({
        subject: 'openboard/openboard',
        ...newRepo('project-management', 9_600, [
          ['openboard/openboard', 1240, dayBefore(now, 6), 'TypeScript'],
          ['planr/planr', 520, dayBefore(now, 5), 'TypeScript'],
          ['sprintly/sprintly', 330, dayBefore(now, 3), 'Go'],
          ['roadmap-kit/roadmap-kit', 140, dayBefore(now, 6), 'TypeScript'],
        ]),
      }),
    },
    {
      key: 'acme-growth-okr',
      title: t(
        '写一篇 OKR 范本指南，拿下 8 个还没排上的词',
        'Write an OKR template guide to win 8 keywords we do not rank for',
      ),
      reason: t(
        '这 8 个词每月搜索 5,230 次，本站都没排进前 20；Example Tasks 有 4 个排在前 10。',
        'These 8 keywords are searched 5,230 times a month and we rank in the top 20 for none; Example Tasks has 4 in the top 10.',
      ),
      meaning: t(
        '对应 Acme 的项目组合视图：每个目标可以挂到对应的项目上看进度，但网站上没有讲 OKR 的内容。这组词一直有稳定的搜索，前 10 名多是范本下载页，Example Tasks 靠一篇范本文章拿到了大部分流量。',
        'This fits Acme’s portfolio view, where each goal links to the projects that move it, yet the site has nothing on OKRs. These terms are searched steadily, the top 10 are mostly template downloads, and Example Tasks takes most of the traffic with one template article.',
      ),
      suggestion: t(
        '写一篇“OKR 范本与写法”的指南，给出产品、市场、工程三个团队的范例和一个可下载的范本，讲清怎么在项目组合里跟进；从项目组合功能页链接过来。',
        'Write a guide to OKR templates and how to write them, with examples for product, marketing and engineering teams and a downloadable template, showing how to follow them in the portfolio view; link to it from the portfolio feature page.',
      ),
      objective: t(
        '用一篇 OKR 指南拿下这组关键词',
        'Win this keyword group with an OKR guide',
      ),
      newPage: { section: '/blog/', linkFrom: ['/features/portfolio'] },
      source: 'keywords',
      priority: 'medium',
      effort: 'medium',
      growth: (lang) =>
        demandGap(
          pick<Keyword[]>(
            lang,
            [
              ['OKR 範本', 1900, 29, [tasks(3)]],
              ['OKR 是什麼', 1300, 18, []],
              ['OKR 範例', 720, 24, [tasks(6)]],
              ['團隊 OKR', 480, 31, [tasks(5), nimbus(8)]],
              ['OKR 管理工具', 390, 44, [tasks(4), nimbus(6)]],
              ['OKR excel', 210, 22, []],
              ['OKR 追蹤', 140, 35, [nimbus(9)]],
              ['個人 OKR 範例', 90, 16, []],
            ],
            [
              ['okr template', 1900, 29, [tasks(3)]],
              ['what is okr', 1300, 18, []],
              ['okr examples', 720, 24, [tasks(6)]],
              ['team okrs', 480, 31, [tasks(5), nimbus(8)]],
              ['okr software', 390, 44, [tasks(4), nimbus(6)]],
              ['okr excel template', 210, 22, []],
              ['okr tracking', 140, 35, [nimbus(9)]],
              ['personal okr examples', 90, 16, []],
            ],
          ),
          '/keywords?tab=suggest',
        ),
    },
    {
      key: 'acme-growth-status-report',
      title: t(
        '写一篇项目周报模板指南，拿下 7 个还没排上的词',
        'Write a project status report guide to win 7 keywords we do not rank for',
      ),
      reason: t(
        '这 7 个词每月搜索 6,620 次，本站都没排进前 20；Example Tasks 和 Nimbus 各有 3 个排在前 10。',
        'These 7 keywords are searched 6,620 times a month and we rank in the top 20 for none; Example Tasks and Nimbus each have 3 in the top 10.',
      ),
      meaning: t(
        '对应 Acme 的周报摘要：每周自动汇总项目进度发给相关的人，但网站上没有讲项目周报怎么写的内容。这组词一年来搜索平稳，前 10 名多是范本下载和写法教程，Example Tasks 和 Nimbus 都靠范本页拿到了这部分流量。',
        'This fits Acme’s weekly report summaries, which sum up a project’s progress every week for the people involved, yet the site has nothing on writing a status report. These terms have been searched steadily for a year, the top 10 are mostly template downloads and how-tos, and Example Tasks and Nimbus both take this traffic with template pages.',
      ),
      suggestion: t(
        '写一篇“项目周报模板与写法”的指南，给出周报、月报两个范例和一份可下载的模板，演示周报摘要怎么自动生成；从模板页链接过来。',
        'Write a guide to project status report templates and how to write them, with a weekly and a monthly example and a downloadable template, showing how the weekly report summary writes one for you; link to it from the templates page.',
      ),
      objective: t(
        '用一篇周报模板指南拿下这组关键词',
        'Win this keyword group with a status report guide',
      ),
      newPage: { section: '/blog/', linkFrom: ['/templates'] },
      source: 'keywords',
      priority: 'medium',
      effort: 'medium',
      growth: (lang) =>
        demandGap(
          pick<Keyword[]>(
            lang,
            [
              ['專案週報範本', 2400, 26, [tasks(2), nimbus(7)]],
              ['週報怎麼寫', 1600, 15, []],
              ['專案進度報告', 880, 23, [tasks(5)]],
              ['週報範例', 720, 19, [nimbus(4)]],
              ['專案狀態報告', 590, 28, [tasks(3), nimbus(9)]],
              ['進度報告 excel', 260, 17, []],
              ['主管週報', 170, 12, []],
            ],
            [
              [
                'project status report template',
                2400,
                26,
                [tasks(2), nimbus(7)],
              ],
              ['how to write a status report', 1600, 15, []],
              ['project progress report', 880, 23, [tasks(5)]],
              ['weekly status report example', 720, 19, [nimbus(4)]],
              ['project status report', 590, 28, [tasks(3), nimbus(9)]],
              ['status report excel template', 260, 17, []],
              ['weekly report to manager', 170, 12, []],
            ],
          ),
          '/keywords?tab=suggest',
        ),
    },
    {
      key: 'acme-growth-permissions',
      title: t(
        '找回权限文档每月约 860 次点击',
        'Win back about 860 clicks a month on the permissions docs',
      ),
      reason: t(
        '5 个跟踪的关键词排名下降，3 个掉出前 3；近 28 天点击 1,020 次，之前 28 天 1,810 次。',
        '5 tracked keywords fell, 3 of them out of the top 3; 1,020 clicks in the last 28 days against 1,810 before.',
      ),
      meaning: t(
        '对应 Acme 的角色和访客权限，是团队开始邀请成员时必看的一页。现在排到前面的是 Nimbus 新写的权限指南和一篇评测站文章，它们都有按角色列的权限表，本站这页只有文字说明。',
        'This covers Acme’s roles and guest access, the page teams read when they start inviting people. Nimbus’s new permissions guide and a review-site article now rank above it; both have a table of permissions by role, while ours is text only.',
      ),
      suggestion: t(
        '加一张按角色（所有者、管理员、成员、访客）列的权限表，补上“访客能看到什么”和常见问答；标题改为“Acme 权限设置：角色与访客权限一览”。',
        'Add a table of permissions by role (owner, admin, member, guest), a section on what guests can see and an FAQ; retitle the page “Acme permissions: roles and guest access at a glance”.',
      ),
      objective: t(
        '让权限文档回到前 3 名',
        'Bring the permissions docs back into the top 3',
      ),
      path: '/docs/permissions',
      source: 'rank',
      priority: 'high',
      effort: 'low',
      growth: (lang) => {
        const page = '/docs/permissions',
          keywords = pick<[string, number, number, number, number, number][]>(
            lang,
            [
              ['專案管理 權限設定', 1300, 2, 6, 410, 820],
              ['團隊成員 權限', 880, 3, 8, 190, 380],
              ['訪客 權限 專案', 720, 1, 4, 160, 300],
              ['專案 角色 權限', 480, 4, 11, 40, 70],
              ['Acme 權限', 260, 1, 2, 220, 240],
            ],
            [
              ['project permissions settings', 1300, 2, 6, 410, 820],
              ['team member permissions', 880, 3, 8, 190, 380],
              ['guest access project management', 720, 1, 4, 160, 300],
              ['project roles and permissions', 480, 4, 11, 40, 70],
              ['acme permissions', 260, 1, 2, 220, 240],
            ],
          ),
          ahead = [
            'nimbus.example',
            'saas-review.example',
            'docs.example-tasks.example',
          ];
        return rankDropGrowth({
          keywords: keywords.map(([keyword, , before, now]) => ({
            keyword,
            before,
            now,
            ahead: ahead.slice(0, Math.min(3, now - 1)),
          })),
          page: { clicks: 1020, previous: 1810 },
          rows: keywords.map(([keyword, , , position, clicks, previous]) => ({
            keyword,
            page,
            clicks,
            previous,
            position,
          })),
          path: page,
          volumes: new Map(
            keywords.map(([keyword, volume]) => [
              keyword.toLowerCase(),
              volume,
            ]),
          ),
        }).growth;
      },
    },
    {
      key: 'acme-growth-migrate',
      title: t(
        '更新每月约 1,800 次访问的迁移文档',
        'Update the migration docs, visited about 1,800 times a month',
      ),
      reason: t(
        '这页 15 个月没更新，每月仍有约 1,800 次访问，是从其他工具迁移过来的团队最常看的文档之一。',
        'The page has not been updated for 15 months and still gets about 1,800 visits a month, one of the docs teams moving from other tools read most.',
      ),
      meaning: t(
        '对应 Acme 的导入功能，迁移是试用团队的常见第一步。文档里的截图还是旧版界面，步骤里也没提到新加的看板列映射，读者照着做会卡住。',
        'This covers Acme’s import feature, and moving over is a common first step for trial teams. The screenshots still show the old interface and the steps miss the new board column mapping, so readers following them get stuck.',
      ),
      suggestion: t(
        '按现在的导入流程重写步骤并换新截图，补上看板列和标签怎么对应、导入后怎么检查；在页首写明更新日期。',
        'Rewrite the steps for the current import flow with new screenshots, add how board columns and labels map and how to check the result, and show the update date at the top.',
      ),
      objective: t(
        '让迁移文档和现在的产品一致',
        'Bring the migration docs in line with the product',
      ),
      path: '/docs/migrate',
      source: 'site',
      priority: 'medium',
      effort: 'low',
      ignored: 2,
      growth: (lang) => {
        const page = '/docs/migrate';
        return pageGrowth('stale-page', {
          path: page,
          visits: 1660,
          q: { clicks: 1240, impressions: 18400 },
          rows: pick<[string, number, number, number][]>(
            lang,
            [
              ['專案管理工具 搬家', 6200, 4.2, 520],
              ['看板 匯入 其他工具', 4800, 5.1, 330],
              ['任務 從試算表 匯入', 3900, 6.3, 220],
              ['專案資料 轉移', 2100, 7.8, 110],
              ['匯入 看板 標籤', 1400, 8.5, 60],
            ],
            [
              ['migrate project management tool', 6200, 4.2, 520],
              ['import boards from another tool', 4800, 5.1, 330],
              ['import tasks from spreadsheet', 3900, 6.3, 220],
              ['move project data to new tool', 2100, 7.8, 110],
              ['import board labels', 1400, 8.5, 60],
            ],
          ).map(([keyword, impressions, position, clicks]) => ({
            keyword,
            page,
            impressions,
            position,
            clicks,
          })),
          updated: dayBefore(now, 456),
          months: 15,
        });
      },
    },
    {
      key: 'acme-growth-ai-dropped',
      title: t(
        '让 ChatGPT 回答这 6 个问题时重新提到 Acme',
        'Get ChatGPT to name Acme again in these 6 questions',
      ),
      reason: t(
        '上次查询有 15 个问题的回答提到 Acme，这次只有 9 个；不再提到的 6 个问题每月在 AI 里约被问 2,400 次。',
        'Answers to 15 questions named Acme in the lookup before, 9 now; the 6 that stopped are asked about 2,400 times a month in AI search.',
      ),
      meaning: t(
        '这 6 个问题都在比较小团队的项目管理工具，对应 Acme 的看板和访客协作。新的回答引用的是 Nimbus 4.0 的发布文章和一篇新评测，Acme 被挤了出去。',
        'All 6 questions compare project management tools for small teams, where Acme’s boards and guest collaboration fit. The new answers cite the Nimbus 4.0 launch post and a new review, which pushed Acme out.',
      ),
      suggestion: t(
        '在对比页和看板功能页直接回答这几个问题（适合多大的团队、访客怎么协作、价格），并把评测站上的产品资料更新到最新版本。',
        'Answer these questions directly on the comparison page and the board feature page (team size, guest collaboration, pricing), and bring the review site’s product profile up to the latest version.',
      ),
      objective: t(
        '让 AI 回答小团队选工具的问题时重新提到 Acme',
        'Be named again when AI answers small teams choosing a tool',
      ),
      path: '/compare/nimbus',
      source: 'ai-search',
      priority: 'medium',
      effort: 'medium',
      ignored: 4,
      growth: (lang) =>
        aiDroppedGrowth({
          platform: 'chat_gpt',
          dropped: pick<[string, number][]>(
            lang,
            [
              ['小團隊適合用哪個專案管理工具？', 720],
              ['有沒有適合 10 人團隊的看板工具？', 520],
              ['哪個專案管理軟體可以讓客戶一起看進度？', 430],
              ['從試算表換到專案管理工具，選哪個好？', 330],
              ['遠端團隊用什麼工具追蹤任務？', 250],
              ['有沒有免費的專案管理工具推薦？', 150],
            ],
            [
              ['which project management tool is best for a small team', 720],
              ['kanban tool for a 10 person team', 520],
              ['project management software clients can follow', 430],
              ['switching from spreadsheets to a project management tool', 330],
              ['what do remote teams use to track tasks', 250],
              ['free project management tool recommendations', 150],
            ],
          ).map(([question, volume], i) => ({
            question,
            volume,
            sources: [
              { domain: 'nimbus.example' },
              { domain: i % 2 ? 'pm-weekly.example' : 'saas-review.example' },
            ],
          })),
          before: 15,
          after: 9,
          at: dayBefore(now, 31),
        }),
    },
    {
      key: 'acme-growth-template-titles',
      title: t(
        '改掉模板页的重复标题，涉及每月约 1,500 次点击',
        'Fix the duplicate titles on template pages, which get about 1,500 clicks a month',
      ),
      reason: t(
        '7 个模板页用了同一个标题，其中 3 个有搜索流量，近 28 天点击 1,380 次。',
        '7 template pages share one title; 3 of them get search traffic, 1,380 clicks in the last 28 days.',
      ),
      meaning: t(
        '对应 Acme 的项目模板，模板页是新用户试用前常看的页面。标题相同时，搜索引擎只挑其中一页显示，另外几页的点击会被分走。',
        'This covers Acme’s project templates, pages new users often read before a trial. With one title for all, search engines show one of them and split the clicks of the others.',
      ),
      suggestion: t(
        '给每个模板页写不同的标题和描述，写明它适合的场景，例如“冲刺计划模板：两周迭代的任务拆分”。',
        'Give each template page its own title and description saying what it is for, such as “Sprint planning template: breaking down a two-week iteration”.',
      ),
      objective: t(
        '让每个模板页都能被单独搜到',
        'Let each template page be found on its own',
      ),
      path: '/templates/sprint',
      source: 'site',
      priority: 'medium',
      effort: 'low',
      ignored: 1,
      growth: (lang) =>
        pageIssueGrowth({
          issue: pick(lang, '标题重复', 'Duplicate title'),
          pages: [
            ['/templates/sprint', 620, 9800, 4.6],
            ['/templates/sprint-retro', 480, 7400, 5.2],
            ['/templates/sprint-review', 280, 5100, 7.9],
          ].map(([path, clicks, impressions, position]) => ({
            path,
            url: `https://acme.example${path}`,
            clicks,
            impressions,
            position,
          })),
          total: 7,
        }).growth,
    },
  ];
}

const sales = (rank: number): Rival => ({ name: 'Example Sales', rank });

/** Why a growth point has its priority, under Why it is worth doing. */
export const GROWTH_PRIORITY = {
  high: t(
    '增长空间大，和核心功能直接相关。',
    'Large growth potential, directly tied to a core feature.',
  ),
  other: t(
    '有增长空间，投入不大，排在高优先级之后。',
    'Some growth potential at small effort; after the high-priority ones.',
  ),
};

/** Acme CRM's growth points, one of each kind its data finds. */
export function crmGrowthBriefs(now: Date): GrowthBrief[] {
  const month = dayBefore(now, 0).slice(0, 7);
  return [
    {
      key: 'crm-growth-small-teams',
      title: t(
        '把小团队 CRM 文章推上 Google 首页',
        'Get the small-team CRM article onto Google’s first page',
      ),
      reason: t(
        '5 个搜索词近 28 天曝光 3,240 次，平均排第 10.2；进前 3 预计每月多 340 次点击。',
        '5 searches, 3,240 impressions in 28 days at position 10.2 on average; in the top 3, an estimated 340 more clicks a month.',
      ),
      meaning: t(
        '搜“小团队 CRM”的多是 5 到 20 人的销售团队，正是 Acme CRM 的目标用户。文章停在第二页开头，排在前面的文章都有价格表和上手时间。',
        'People searching for a CRM for small teams are mostly sales teams of 5 to 20, Acme CRM’s target users. The article sits at the top of page two; those above it give prices and setup times.',
      ),
      suggestion: t(
        '在文章里补一张 5 款 CRM 的价格与上手时间对比表，加一节“从 Excel 搬过来要多久”，更新发布日期。',
        'Add a table comparing five CRMs on price and setup time, a section on how long moving from Excel takes, and an updated date.',
      ),
      objective: t(
        '让小团队 CRM 文章排进前 3 名',
        'Rank the small-team CRM article in the top 3',
      ),
      path: '/blog/crm-for-small-teams',
      source: 'gsc',
      priority: 'high',
      effort: 'low',
      growth: (lang) =>
        nearFirst(
          pick<Query[]>(
            lang,
            [
              ['小團隊 crm', 1240, 8.6, 21],
              ['免費crm 小團隊', 860, 12.3, 6],
              ['小型企業 crm 推薦', 520, 10.1, 7],
              ['crm 推薦 中小企業', 380, 9.4, 5],
              ['小團隊 客戶管理', 240, 11.8, 2],
            ],
            [
              ['crm for small sales team', 1240, 8.6, 21],
              ['free crm for small teams', 860, 12.3, 6],
              ['best crm for small business', 520, 10.1, 7],
              ['crm recommendations for smb', 380, 9.4, 5],
              ['small team customer management', 240, 11.8, 2],
            ],
          ),
        ),
    },
    {
      key: 'crm-growth-quotes',
      title: t(
        '写一篇报价单范本指南，拿下 8 个还没排上的词',
        'Write a quote template guide to win 8 keywords we do not rank for',
      ),
      reason: t(
        '这 8 个词每月搜索 6,570 次，本站都没排进前 20；Example Sales 有 4 个排在前 10。',
        'These 8 keywords are searched 6,570 times a month and we rank in the top 20 for none; Example Sales has 4 in the top 10.',
      ),
      meaning: t(
        '做报价单的人很多会接着找报价审批和客户跟进工具。Acme CRM 有报价模板和审批，但网站上只有一页设置文档，搜这些词的人看不到。',
        'Many people making quotes go on to look for quote approval and follow-up tools. Acme CRM has quote templates and approvals, but the site has only a settings page that these searchers never see.',
      ),
      suggestion: t(
        '写一篇“报价单怎么做（附范本）”，给出三种行业的范本下载，再讲在 Acme CRM 里怎么生成和审批报价。',
        'Write a guide to making a quote with downloadable templates for three industries, then show how Acme CRM creates and approves quotes.',
      ),
      objective: t(
        '用报价单指南拿下这组关键词',
        'Win the quote keywords with a template guide',
      ),
      newPage: {
        section: '/blog/',
        linkFrom: ['/features/quotes', '/docs/quotes'],
      },
      source: 'keywords',
      priority: 'high',
      effort: 'medium',
      growth: (lang) =>
        demandGap(
          pick<Keyword[]>(
            lang,
            [
              ['報價單 範本', 2400, 18, [sales(5)]],
              ['報價單 excel', 1300, 21, [sales(8)]],
              ['報價單 格式', 880, 14, []],
              ['線上報價單', 590, 26, [sales(3)]],
              ['報價單 軟體', 480, 37, [sales(4)]],
              ['報價單 製作', 390, 16, []],
              ['報價 系統', 320, 42, []],
              ['報價單 自動化', 210, 29, []],
            ],
            [
              ['quote template', 2400, 18, [sales(5)]],
              ['quote template excel', 1300, 21, [sales(8)]],
              ['quote format', 880, 14, []],
              ['online quote maker', 590, 26, [sales(3)]],
              ['quoting software', 480, 37, [sales(4)]],
              ['how to make a quote', 390, 16, []],
              ['quote management system', 320, 42, []],
              ['quote automation', 210, 29, []],
            ],
          ),
          '/keywords?tab=suggest',
        ),
    },
    {
      key: 'crm-growth-ai-open-source',
      title: t(
        '让 AI 推荐开源 CRM 时提到 Acme CRM',
        'Get Acme CRM named when AI recommends open-source CRMs',
      ),
      reason: t(
        '22 个相关问题里，17 个的回答提到了 Example Sales 等产品，只有 2 个提到 Acme CRM。',
        'Of 22 related questions, the answers to 17 name Example Sales and others; only 2 name Acme CRM.',
      ),
      meaning: t(
        '想自己部署 CRM 的团队会先问 AI 有哪些选择。回答里常见的是 Example Sales 和两个老牌开源项目，Acme CRM 的 Docker 部署和权限设置正好对应这些问题。',
        'Teams that want to host their own CRM ask AI for options first. The answers name Example Sales and two long-standing open-source projects, while Acme CRM’s Docker setup and permissions answer the same questions.',
      ),
      suggestion: t(
        '写一页“自托管 CRM 怎么选”，按部署、权限、数据导入三项写清 Acme CRM 的做法；把 GitHub 仓库的 README 开头改成一句话说明定位。',
        'Write a page on choosing a self-hosted CRM covering Acme CRM’s deployment, permissions and data import; open the GitHub README with a one-sentence positioning.',
      ),
      objective: t(
        '让 AI 回答开源 CRM 问题时提到 Acme CRM',
        'Have AI answers on open-source CRMs name Acme CRM',
      ),
      newPage: { section: '/blog/', linkFrom: ['/', '/docs/permissions'] },
      source: 'ai-search',
      priority: 'high',
      effort: 'medium',
      growth: (lang) =>
        notMentioned(
          'Acme CRM',
          22,
          [13, 9],
          17,
          2,
          'reviews-hub.example',
          pick<Question[]>(
            lang,
            [
              [
                '有哪些可以自己部署的开源 CRM？',
                'chat_gpt',
                ['Example Sales', 'OpenLedger CRM'],
                ['reviews-hub.example', 'crm-guide.example'],
              ],
              [
                '小公司用开源 CRM 靠谱吗？',
                'chat_gpt',
                ['Example Sales'],
                ['forum.example'],
              ],
              [
                '开源 CRM 和商业 CRM 怎么选？',
                'google',
                ['Example Sales', 'OpenLedger CRM'],
                ['crm-guide.example'],
              ],
              [
                '支持 Docker 部署的 CRM 推荐',
                'chat_gpt',
                ['Example Sales'],
                ['reviews-hub.example'],
              ],
              [
                '免费的销售管理系统有哪些？',
                'google',
                ['Example Sales', 'Pipewise'],
                ['saas-review.example'],
              ],
            ],
            [
              [
                'Which open-source CRMs can I host myself?',
                'chat_gpt',
                ['Example Sales', 'OpenLedger CRM'],
                ['reviews-hub.example', 'crm-guide.example'],
              ],
              [
                'Is an open-source CRM a good idea for a small company?',
                'chat_gpt',
                ['Example Sales'],
                ['forum.example'],
              ],
              [
                'Open-source or commercial CRM?',
                'google',
                ['Example Sales', 'OpenLedger CRM'],
                ['crm-guide.example'],
              ],
              [
                'CRMs you can deploy with Docker',
                'chat_gpt',
                ['Example Sales'],
                ['reviews-hub.example'],
              ],
              [
                'Free sales management software',
                'google',
                ['Example Sales', 'Pipewise'],
                ['saas-review.example'],
              ],
            ],
          ),
        ),
    },
    {
      key: 'crm-growth-forecast',
      title: t(
        '补一页 Example Sales 已有的销售预测用例',
        'Add the sales forecasting use case Example Sales already has',
      ),
      reason: t(
        '这页每月给 Example Sales 带来约 2,600 次搜索访问，相关 7 个词本站都没排上。',
        'This page brings Example Sales about 2,600 search visits a month; we rank for none of its 7 keywords.',
      ),
      meaning: t(
        '销售主管每到季末都会找预测方法和工具。Acme CRM 的商机阶段和成交概率可以直接算出预测，但网站上没有讲这个用法。',
        'Sales leads look for forecasting methods and tools every quarter end. Acme CRM’s deal stages and win probabilities produce a forecast directly, but the site never describes it.',
      ),
      suggestion: t(
        '新建“销售预测”用例页，用一个季度的样例数据演示按阶段加权的预测，并附一个 Excel 对照模板。',
        'Create a sales forecasting use-case page that walks through a stage-weighted forecast on a quarter of sample data, with an Excel template for comparison.',
      ),
      objective: t(
        '拿下销售预测这组关键词',
        'Win the sales forecasting keywords',
      ),
      newPage: {
        section: '/use-cases/',
        linkFrom: ['/docs/forecast', '/features/pipeline'],
      },
      source: 'competitors',
      priority: 'medium',
      effort: 'medium',
      growth: (lang) =>
        competitorGap(
          'Example Sales',
          2600,
          pick<[string, number, number, number][]>(
            lang,
            [
              ['銷售預測', 1600, 38, 4],
              ['銷售預測 excel', 720, 24, 6],
              ['銷售預測 方法', 590, 31, 3],
              ['業績預測 工具', 480, 35, 5],
              ['crm 銷售預測', 390, 29, 2],
              ['銷售 預測 模型', 260, 33, 9],
              ['季度 業績 預測', 170, 22, 7],
            ],
            [
              ['sales forecasting', 1600, 38, 4],
              ['sales forecast excel', 720, 24, 6],
              ['sales forecasting methods', 590, 31, 3],
              ['revenue forecasting tool', 480, 35, 5],
              ['crm sales forecasting', 390, 29, 2],
              ['sales forecast model', 260, 33, 9],
              ['quarterly sales forecast', 170, 22, 7],
            ],
          ),
        ),
    },
    {
      key: 'crm-growth-ai-crm',
      title: t(
        '趁“AI CRM”搜索量上升写一页',
        'Write a page while searches for “ai crm” rise',
      ),
      reason: t(
        '近 3 个月搜索量涨了 129%，现在每月 2,400 次；竞品里只有 Example Sales 有对应页面。',
        'Searches are up 129% over the last 3 months to 2,400 a month now; among competitors only Example Sales has a page for it.',
      ),
      meaning: t(
        '这个词的前 10 名里还有 6 个是新闻和概念文章，工具页很少；Acme CRM 的线索打分和跟进提醒可以直接回答“AI 在 CRM 里能做什么”。',
        'Six of the top 10 results for the term are still news and explainers, with few tool pages; Acme CRM’s lead scoring and follow-up reminders answer what AI can do in a CRM.',
      ),
      suggestion: t(
        '写一页“Acme CRM 里的 AI”，讲清线索打分、跟进提醒和通话摘要的效果和限制。',
        'Write a page on AI in Acme CRM that sets out what lead scoring, follow-up reminders and call summaries do and where they stop.',
      ),
      objective: t(
        '在“AI CRM”上升期排进前 10',
        'Reach the top 10 for “ai crm” while it rises',
      ),
      newPage: { section: '/features/', linkFrom: ['/', '/features/pipeline'] },
      source: 'keywords',
      priority: 'medium',
      effort: 'medium',
      growth: (lang) => ({
        ...rising(
          [720, 760, 740, 800, 780, 820, 900, 1000, 1250, 1800, 2400, 3000],
          month,
        ),
        subject: lang === 'zh' ? 'AI CRM' : 'ai crm',
      }),
    },
    {
      key: 'crm-growth-pipeline-snippet',
      title: t(
        '改写销售漏斗页的标题和摘要，拿回点击',
        "Rewrite the sales pipeline page's title and snippet to win back clicks",
      ),
      reason: t(
        '近 28 天曝光 3,030 次、点击率 0.9%，同排名常见是 8.0%；改好标题和摘要预计每月多 230 次点击。',
        '3,030 impressions in 28 days at 0.9% CTR against the usual 8.0% at this position; a better title and snippet would bring an estimated 230 more clicks a month.',
      ),
      meaning: t(
        '销售漏斗页排在第 4 名左右，但搜索结果里显示的是“功能 - Acme CRM”，摘要是 Cookie 提示，看不出页面讲什么。',
        'The sales pipeline page ranks around position 4, but its result reads “Features - Acme CRM” with the cookie notice as its snippet, so nothing says what the page covers.',
      ),
      suggestion: t(
        '把标题改成“销售漏斗管理：按阶段看商机、预测成交（附看板示例）”，写一段说明三个用法的描述，并修好 Cookie 提示被抓成摘要的问题。',
        'Retitle it “Sales pipeline management: deals by stage and forecasts (with a board example)”, write a description naming three uses, and stop the cookie notice from becoming the snippet.',
      ),
      objective: t(
        '把销售漏斗页的点击率提到同排名的常见水平',
        'Raise the pipeline page’s CTR to the usual rate at its position',
      ),
      path: '/features/pipeline',
      source: 'gsc',
      priority: 'medium',
      effort: 'low',
      growth: (lang) =>
        lowCtr(
          pick<Query[]>(
            lang,
            [
              ['銷售漏斗 管理', 1400, 4.1, 12],
              ['銷售漏斗 看板', 760, 3.6, 9],
              ['銷售漏斗', 540, 5.2, 3],
              ['銷售階段 管理', 330, 4.8, 3],
            ],
            [
              ['sales pipeline management', 1400, 4.1, 12],
              ['kanban sales pipeline', 760, 3.6, 9],
              ['sales pipeline', 540, 5.2, 3],
              ['sales stage management', 330, 4.8, 3],
            ],
          ),
        ),
    },
    {
      key: 'crm-growth-roundups',
      title: t(
        '进入 AI 常引用的 4 篇开源 CRM 榜单',
        'Get into the 4 open-source CRM roundups AI cites most',
      ),
      reason: t(
        '这 4 篇在 AI 回答里被引用 36 次，都列了 Example Sales，没有 Acme CRM。',
        'These 4 pages are cited 36 times in AI answers and all list Example Sales, not Acme CRM.',
      ),
      meaning: t(
        'AI 回答开源 CRM 问题时大多引用这 4 篇；其中 2 篇在 GitHub 上接受 PR 补充新项目，进入门槛低。',
        'AI answers on open-source CRMs mostly cite these 4 pages; 2 of them take pull requests on GitHub to add projects, so getting in is easy.',
      ),
      suggestion: t(
        '给两份 GitHub 榜单提 PR 补上 Acme CRM；按另外两篇的提交要求准备产品资料并联系作者。',
        'Open pull requests adding Acme CRM to the two GitHub lists, and prepare the details the other two ask for and contact their authors.',
      ),
      objective: t(
        '被 AI 常引用的开源 CRM 榜单收录',
        'Be listed in the open-source CRM roundups AI cites',
      ),
      offsite: t(
        '给 GitHub 上的 awesome-crm 和自托管销售工具清单提 PR，并联系 crm-guide.example 的作者',
        'Open pull requests on the awesome-crm and self-hosted sales lists on GitHub, and contact the crm-guide.example author',
      ),
      source: 'ai-search',
      priority: 'medium',
      effort: 'low',
      growth: (lang) =>
        citedSources(
          15,
          pick<Cited[]>(
            lang,
            [
              [
                '2026 年最好的开源 CRM',
                'https://crm-guide.example/best-open-source-crm',
                'crm-guide.example',
                13,
                ['Example Sales', 'OpenLedger CRM'],
              ],
              [
                'awesome-crm',
                'https://github.com/awesome-lists/awesome-crm',
                'github.com',
                10,
                ['Example Sales', 'OpenLedger CRM', 'Pipewise'],
              ],
              [
                '自托管销售工具清单',
                'https://github.com/selfhosted-lists/sales',
                'github.com',
                8,
                ['Example Sales'],
              ],
              [
                '中小企业 CRM 怎么选',
                'https://saas-review.example/smb-crm',
                'saas-review.example',
                5,
                ['Example Sales', 'Pipewise'],
              ],
            ],
            [
              [
                'The best open-source CRMs in 2026',
                'https://crm-guide.example/best-open-source-crm',
                'crm-guide.example',
                13,
                ['Example Sales', 'OpenLedger CRM'],
              ],
              [
                'awesome-crm',
                'https://github.com/awesome-lists/awesome-crm',
                'github.com',
                10,
                ['Example Sales', 'OpenLedger CRM', 'Pipewise'],
              ],
              [
                'Self-hosted sales tools',
                'https://github.com/selfhosted-lists/sales',
                'github.com',
                8,
                ['Example Sales'],
              ],
              [
                'Choosing a CRM for a small business',
                'https://saas-review.example/smb-crm',
                'saas-review.example',
                5,
                ['Example Sales', 'Pipewise'],
              ],
            ],
          ),
        ),
    },
    {
      key: 'crm-growth-sales-launch',
      title: t(
        '趁 Example Sales 5.2 刚发布，写一篇线索打分对比',
        'Compare lead scoring while Example Sales 5.2 is new',
      ),
      reason: t(
        'Example Sales 近 7 天发布 5.2 和 2 个新页面，主打 AI 线索打分；它每月约有 28,000 次搜索访问。',
        'Example Sales released 5.2 and 2 new pages in the last 7 days, led by AI lead scoring; it draws about 28,000 search visits a month.',
      ),
      meaning: t(
        '发布后几周搜“Example Sales 线索打分”和替代品的人会增加；Acme CRM 的线索打分已经上线一年，可以拿真实规则做对比。',
        'Searches for Example Sales lead scoring and its alternatives rise in the weeks after a launch; Acme CRM’s lead scoring has been live for a year and can be compared rule by rule.',
      ),
      suggestion: t(
        '写一篇“线索打分怎么做：Acme CRM 与 Example Sales 5.2 对比”，如实列出两边的规则和限制，更新对比页的功能表。',
        'Write a comparison of lead scoring in Acme CRM and Example Sales 5.2 that lists both sides’ rules and limits accurately, and update the comparison page’s feature table.',
      ),
      objective: t(
        '在 Example Sales 新版的搜索热度里出现',
        'Show up while Example Sales’ new release is searched',
      ),
      path: '/compare/example-sales',
      source: 'competitors',
      priority: 'low',
      effort: 'low',
      growth: (lang) =>
        competitorLaunch(
          'Example Sales',
          'v5.2.0',
          520,
          28000,
          pick<[string, string, 'release' | 'page', string][]>(
            lang,
            [
              [
                'Example Sales 5.2：AI 线索打分',
                'https://github.com/example-sales/crm/releases/tag/v5.2.0',
                'release',
                dayBefore(now, 2),
              ],
              [
                'AI 线索打分',
                'https://sales.example/features/lead-scoring',
                'page',
                dayBefore(now, 2),
              ],
              [
                '从表格迁移到 Example Sales',
                'https://sales.example/guides/migrate-from-spreadsheets',
                'page',
                dayBefore(now, 4),
              ],
            ],
            [
              [
                'Example Sales 5.2: AI lead scoring',
                'https://github.com/example-sales/crm/releases/tag/v5.2.0',
                'release',
                dayBefore(now, 2),
              ],
              [
                'AI lead scoring',
                'https://sales.example/features/lead-scoring',
                'page',
                dayBefore(now, 2),
              ],
              [
                'Migrate from spreadsheets to Example Sales',
                'https://sales.example/guides/migrate-from-spreadsheets',
                'page',
                dayBefore(now, 4),
              ],
            ],
          ),
        ),
    },
    {
      key: 'crm-growth-pipeline-stages',
      title: t(
        '找回销售阶段文章每月约 250 次点击',
        'Win back about 250 clicks a month on the sales stages article',
      ),
      reason: t(
        '近 28 天点击 380 次，之前 28 天 610 次；曝光变化不大，平均排第 8.4。',
        '380 clicks in the last 28 days against 610 before; impressions barely changed, at position 8.4 on average.',
      ),
      meaning: t(
        '对应 Acme CRM 的管道看板，销售阶段是团队搭建销售管道时最先查的内容。这篇文章还停留在 5 个固定阶段，排到前面的文章都讲了怎么按自己的流程改阶段。',
        'This covers Acme CRM’s pipeline board, and sales stages are what teams look up first when they set up a pipeline. The article still describes 5 fixed stages, while the ones above it explain how to fit the stages to your own process.',
      ),
      suggestion: t(
        '补一段“按自己的流程调整阶段”，用两个行业的例子说明，配上管道看板的截图；把标题改成“销售阶段怎么定：模板与调整方法”。',
        'Add a section on fitting the stages to your own process with examples from two industries and screenshots of the pipeline board, and retitle it “How to set sales stages: a template and how to adjust it”.',
      ),
      objective: t(
        '让销售阶段文章找回点击',
        'Win back the sales stages article’s clicks',
      ),
      path: '/blog/sales-pipeline-stages',
      source: 'gsc',
      priority: 'medium',
      effort: 'low',
      growth: (lang) => {
        const page = '/blog/sales-pipeline-stages';
        return clickDropGrowth(
          {
            path: page,
            clicks: 380,
            previous: 610,
            impressions: 8900,
            previousImpressions: 9400,
            position: 8.4,
          },
          pick<[string, number, number, number][]>(
            lang,
            [
              ['銷售階段', 170, 290, 7.6],
              ['銷售管道 階段', 110, 180, 8.1],
              ['B2B 銷售流程', 60, 85, 9.4],
              ['銷售漏斗 階段', 40, 55, 10.2],
            ],
            [
              ['sales pipeline stages', 170, 290, 7.6],
              ['stages of a sales pipeline', 110, 180, 8.1],
              ['b2b sales process', 60, 85, 9.4],
              ['sales funnel stages', 40, 55, 10.2],
            ],
          ).map(([keyword, clicks, previous, position]) => ({
            keyword,
            page,
            clicks,
            previous,
            position,
          })),
        ).growth;
      },
    },
    {
      key: 'crm-growth-email-sync',
      title: t(
        '补全每月约 830 次访问的邮件同步文档',
        'Fill out the email sync docs, visited about 830 times a month',
      ),
      reason: t(
        '这页正文只有约 120 字，每月仍有约 830 次访问；读者要找的授权步骤和常见错误都没写。',
        'The page has about 120 words of body text and still gets about 830 visits a month; the authorization steps and common errors readers look for are missing.',
      ),
      meaning: t(
        '对应 Acme CRM 的邮件同步，是销售团队上手时最先配置的功能之一。这页只有一句说明和一张截图，读者看完还得去问客服。',
        'This covers Acme CRM’s email sync, one of the first things a sales team sets up. The page has one sentence and a screenshot, so readers still end up asking support.',
      ),
      suggestion: t(
        '补上邮箱授权的完整步骤、同步哪些邮件、常见错误和解决办法，各配一张截图。',
        'Add the full mailbox authorization steps, which emails sync, and common errors with their fixes, each with a screenshot.',
      ),
      objective: t(
        '让读者看完邮件同步文档就能配好',
        'Let readers set up email sync from the docs alone',
      ),
      path: '/docs/email-sync',
      source: 'site',
      priority: 'low',
      effort: 'low',
      growth: (lang) => {
        const page = '/docs/email-sync';
        return pageGrowth('thin-page', {
          path: page,
          visits: 760,
          q: { clicks: 540, impressions: 7200 },
          rows: pick<[string, number, number, number][]>(
            lang,
            [
              ['CRM 郵件同步', 3100, 5.4, 260],
              ['CRM 郵箱 授權', 2200, 6.8, 170],
              ['郵件同步 失敗', 1900, 7.2, 110],
            ],
            [
              ['crm email sync', 3100, 5.4, 260],
              ['crm mailbox authorization', 2200, 6.8, 170],
              ['email sync failed crm', 1900, 7.2, 110],
            ],
          ).map(([keyword, impressions, position, clicks]) => ({
            keyword,
            page,
            impressions,
            position,
            clicks,
          })),
          words: 120,
        });
      },
    },
  ];
}
