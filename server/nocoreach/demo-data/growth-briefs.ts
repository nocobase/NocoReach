import {
  EVIDENCE_ROWS,
  GROWTH_KINDS,
  type EvidenceColumn,
  type EvidenceRow,
  type Growth,
  type GrowthFigure,
  type GrowthKind,
  type GrowthText,
  type GrowthTopic,
  type DiscussionWeek,
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
import { addDays, lastWholeWeek } from '../topic-weeks.js';

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
  /** Found this many days ago (2026-11-10 step 2b), for growth points newer than their place in the list says. */
  found?: number;
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

// --- Followed topics' discussions and the step 2b sources (2026-11-10) -----------------------------------------------

type WeekCounts = [
  reddit: number,
  hackernews: number,
  youtube: number,
  github: number,
];
/** The last eight whole weeks before `now`, oldest first, with each source's discussions (topic-weeks.ts). */
const discussionWeeks = (now: Date, counts: WeekCounts[]): DiscussionWeek[] => {
  const last = lastWholeWeek(now.getTime());
  return counts.map(([reddit, hackernews, youtube, github], i) => ({
    week: addDays(last, -7 * (counts.length - 1 - i)),
    counts: { reddit, hackernews, youtube, github },
  }));
};
const SOURCE_NAMES = ['Reddit', 'Hacker News', 'YouTube', 'GitHub'];
/** A discussion: [title, source, heat, date, link]. */
type Discussion = [
  discussion: string,
  source: string,
  heat: GrowthText | null,
  date: string,
  url: string,
];
const googleRank = (rank: number) =>
  text('growth.value.googleRank', { 0: rank });
const hnHeat = (points: number, comments: number) =>
  text('growth.value.pointsComments', {
    0: points.toLocaleString('en-US'),
    1: comments.toLocaleString('en-US'),
  });
const viewsHeat = (views: number) =>
  text('growth.value.views', { 0: views.toLocaleString('en-US') });
const starsHeat = (stars: number) =>
  text('growth.value.stars', { 0: stars.toLocaleString('en-US') });
/**
 * A topic discussed more (topic-signals.ts): the last four weeks against the four before, the sources rising on their
 * own, Google's interest and the pages dedicated to it, with the weeks drawn as Discussions a week.
 */
function topicRise(
  kind: 'topic-rise' | 'new-topic',
  weeks: DiscussionWeek[],
  google: { change: number; monthly: number } | null,
  dedicated: { count: number; domains: string[] },
  rows: Discussion[],
  total: number,
  topic: GrowthTopic,
): Growth {
  const sum = (list: DiscussionWeek[], s: string) =>
    list.reduce((n, w) => n + (w.counts[s as keyof typeof w.counts] ?? 0), 0);
  const sources = ['reddit', 'hackernews', 'youtube', 'github'];
  const last = weeks.slice(4),
    before = weeks.slice(0, 4);
  const lastAll = sources.reduce((n, s) => n + sum(last, s), 0),
    beforeAll = sources.reduce((n, s) => n + sum(before, s), 0);
  const rising = sources
    .map((s, i) => [SOURCE_NAMES[i], sum(last, s), sum(before, s)] as const)
    .filter(([, l, b]) => l >= 3 && l > b && l >= b * 1.5)
    .map(([name]) => name);
  return {
    ...growth(
      kind,
      [
        figure('discussions4w', lastAll, {
          detail: text('growth.detail.before4w', { 0: beforeAll }),
        }),
        figure('risingSources', rising.length, {
          detail: text('growth.detail.list', { 0: rising.join(' · ') }),
        }),
        ...(google
          ? [
              figure('googleSearch3m', google.change, {
                format: 'change',
                detail: text('growth.detail.monthlyNow', {
                  0: google.monthly.toLocaleString('en-US'),
                }),
              }),
            ]
          : []),
        figure('dedicatedTop10', dedicated.count, {
          ...(dedicated.domains.length
            ? {
                detail: text('growth.detail.list', {
                  0: dedicated.domains.join(' · '),
                }),
              }
            : {}),
        }),
      ],
      [
        col('discussion'),
        col('source'),
        col('heat', 'message'),
        col('date', 'date'),
      ],
      rows.map(([discussion, source, heat, date, url]) => ({
        discussion,
        source,
        heat,
        date,
        url,
      })),
      'discussions',
      '/data/reddit?group=topics',
      total,
    ),
    weeks,
    topic,
  };
}
/** A Reddit thread Google ranks first among the week's threads on a topic: no votes or comments, which Reddit through Google does not give. */
function hotThread(
  topic: string,
  thread: { rank: number; posted: string; subreddit: string; named: string },
  week: [discussion: string, position: number, date: string, url: string][],
): Growth {
  return {
    ...growth(
      'hot-discussion',
      [
        figure('googlePosition', thread.rank, {
          format: 'position',
          detail: text('growth.detail.ofWeekThreads', { 0: week.length }),
        }),
        figure('posted', thread.posted, { format: 'date' }),
        figure('subreddit', thread.subreddit),
        figure('namedOnGoogle', thread.named),
      ],
      [col('discussion'), col('position', 'position'), col('date', 'date')],
      week.map(([discussion, position, date, url]) => ({
        discussion,
        position,
        date,
        url,
      })),
      'discussions',
      '/data/reddit?group=topics',
    ),
    topic: { name: topic, followed: true },
  };
}
/** A Hacker News story with many points, and the products its comments name. */
function hotStory(
  topic: string,
  story: {
    points: number;
    comments: number;
    named: string;
    own: [string, number] | null;
    posted: string;
    url: string;
  },
  excerpts: [comment: string, named: string[]][],
): Growth {
  return {
    ...growth(
      'hot-discussion',
      [
        figure('points', story.points),
        figure('comments', story.comments),
        figure('namedInComments', story.named, {
          ...(story.own
            ? {
                detail: text('growth.detail.ownMentions', {
                  0: story.own[0],
                  1: story.own[1],
                }),
              }
            : {}),
        }),
        figure('posted', story.posted, { format: 'date' }),
      ],
      [col('comment'), col('named', 'list')],
      excerpts.map(([comment, named]) => ({ comment, named, url: story.url })),
      'comments',
      story.url,
    ),
    topic: { name: topic, followed: true },
  };
}
/** Questions asked again and again with no page answering them: [question, forum | reddit | hackernews, date]. */
function askedOften(
  forum: number,
  views: number,
  rows: [
    question: string,
    source: 'forum' | 'reddit' | 'hackernews',
    date: string,
  ][],
  total: number,
): Growth {
  return growth(
    'asked-often',
    [
      figure('askedPosts30', total, {
        detail: text('growth.detail.askedSplit', {
          0: forum,
          1: total - forum,
        }),
      }),
      figure('forumViews', views),
      figure('latestAsked', rows[0][2], { format: 'date' }),
      figure('matchingPages', 0),
    ],
    [col('question'), col('source', 'label'), col('date', 'date')],
    rows.map(([question, source, date]) => ({
      question,
      source: `growth.value.${source}`,
      date,
    })),
    'questions',
    '/data/community',
    total,
  );
}
/** A popular video on a followed topic, and the topic's other videos of the month. */
function hotVideo(
  topic: string,
  video: { views: number; posted: string; channel: string; likes: number },
  others: [title: string, channel: string, views: number, date: string][],
): Growth {
  return {
    ...growth(
      'hot-video',
      [
        figure('views', video.views),
        figure('posted', video.posted, { format: 'date' }),
        figure('channel', video.channel),
        figure('likes', video.likes),
      ],
      [
        col('title'),
        col('channel'),
        col('views', 'count'),
        col('date', 'date'),
      ],
      others.map(([title, channel, views, date]) => ({
        title,
        channel,
        views,
        date,
      })),
      'videos',
      '/data/youtube?group=topics',
    ),
    topic: { name: topic, followed: true },
  };
}
/** A market's searches for the main keywords as people there search: [keyword, original keyword, volume, 12-month change]. */
function otherMarket(
  market: string,
  rival: [name: string, keywords: number],
  change: number,
  rows: [keyword: string, source: string, volume: number, change: number][],
): Growth {
  return growth(
    'other-market',
    [
      figure(
        'monthlySearchesTotal',
        rows.reduce((n, r) => n + r[2], 0),
        { detail: text('growth.detail.keywordCount', { 0: rows.length }) },
      ),
      figure('yearChange', change, { format: 'change' }),
      figure('pagesInLanguage', 0, { labelParams: { 0: market } }),
      figure('rivalKeywordsThere', rival[1], { labelParams: { 0: rival[0] } }),
    ],
    [
      col('keyword'),
      col('sourceKeyword'),
      col('volume', 'count'),
      col('yearChange', 'change'),
    ],
    rows.map(([keyword, sourceKeyword, volume, yearChange]) => ({
      keyword,
      sourceKeyword,
      volume,
      yearChange,
    })),
    'keywords',
    '/keywords?tab=suggest',
  );
}
/** A site search term with no page, and the related terms people searched: [term, searches, people]. */
function siteSearch(
  rows: [term: string, searches: number, people: number][],
): Growth {
  return growth(
    'site-search',
    [
      figure('siteSearches28', rows[0][1]),
      figure('searchers28', rows[0][2]),
      figure('matchingPages', 0),
    ],
    [col('term'), col('searches', 'count'), col('searchers', 'count')],
    rows.map(([term, searches, searchers]) => ({ term, searches, searchers })),
    'terms',
    '/rules',
  );
}
/** People also ask questions no page answers in one keyword group: [question, keyword, volume]. */
function peopleAlsoAsk(
  group: string,
  asked: number,
  rows: [question: string, keyword: string, volume: number][],
): Growth {
  const keywords = new Map(rows.map((r) => [r[1], r[2]]));
  return growth(
    'people-also-ask',
    [
      figure('unansweredQuestions', rows.length, {
        detail: text('growth.detail.ofQuestions', { 0: asked }),
      }),
      figure(
        'monthlySearchesTotal',
        [...keywords.values()].reduce((n, v) => n + v, 0),
        { detail: text('growth.detail.keywordCount', { 0: keywords.size }) },
      ),
      figure('keywordGroup', group),
    ],
    [col('question'), col('keyword'), col('volume', 'count')],
    rows.map(([question, keyword, volume]) => ({ question, keyword, volume })),
    'questions',
    '/keywords?tab=suggest',
  );
}
/** Sites linking to two or more competitors and not to us: [domain, authority, competitors, first seen]. */
function linkGap(
  rivals: string[],
  total: number,
  average: number,
  rows: [
    domain: string,
    authority: number,
    linksTo: string[],
    firstSeen: string,
  ][],
): Growth {
  return growth(
    'link-gap',
    [
      figure('linkingSites', total, {
        detail: text('growth.detail.linkAtLeast', { 0: 2 }),
      }),
      figure('topAuthority', rows[0][1], {
        detail: text('growth.detail.list', { 0: rows[0][0] }),
      }),
      figure('averageAuthority', average),
      figure('comparedWith', rivals.join(' · ')),
    ],
    [
      col('domain'),
      col('authority', 'count'),
      col('linksTo', 'list'),
      col('firstSeen', 'date'),
    ],
    rows.map(([domain, authority, linksTo, firstSeen]) => ({
      domain,
      authority,
      linksTo,
      firstSeen,
      url: `https://${domain}`,
    })),
    'sites',
    '/backlinks?view=gap',
    total,
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
      ignored: 3,
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
      ignored: 1,
      effort: 'medium',
      growth: () =>
        rising(
          [850, 900, 880, 940, 910, 980, 1050, 1150, 1450, 2100, 2850, 3300],
          month,
        ),
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
      ignored: 2,
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
      ignored: 2,
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
      ignored: 2,
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
      ignored: 3,
      effort: 'medium',
      growth: () =>
        topicHeat(64, 23, 18400, [
          ['openboard/openboard', 1240, dayBefore(now, 6), 'TypeScript'],
          ['laneflow/laneflow', 410, dayBefore(now, 5), 'Go'],
          ['kanbanui/react-kanban-kit', 260, dayBefore(now, 4), 'TypeScript'],
          ['taskdeck/taskdeck', 180, dayBefore(now, 6), 'Rust'],
          ['boardsync/boardsync', 95, dayBefore(now, 2), 'Python'],
        ]),
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
      growth: () =>
        newRepo('project-management', 9_600, [
          ['openboard/openboard', 1240, dayBefore(now, 6), 'TypeScript'],
          ['planr/planr', 520, dayBefore(now, 5), 'TypeScript'],
          ['sprintly/sprintly', 330, dayBefore(now, 3), 'Go'],
          ['roadmap-kit/roadmap-kit', 140, dayBefore(now, 6), 'TypeScript'],
        ]),
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
      ignored: 2,
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
      ignored: 1,
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
    // Step 2b (2026-11-10): what the followed topics' discussions, site search, People also ask, other-language markets
    // and the link gap find.
    {
      key: 'acme-growth-ai-assistant',
      title: t(
        '“AI 项目助理”讨论 4 周多了近 5 倍，抢先写一篇入门指南',
        'Discussion of “AI project assistant” is up almost 5× in 4 weeks: write the first guide',
      ),
      reason: t(
        '近 4 周 58 条讨论，之前 4 周只有 12 条；Google 前 10 里专门讲它的只有 1 篇。',
        '58 discussions in the last 4 weeks against 12 the 4 weeks before; only 1 page in Google’s top 10 is dedicated to it.',
      ),
      meaning: t(
        '“project management”的讨论里，越来越多人在问能不能让 AI 自动整理进度、写周报，Reddit、Hacker News、YouTube 和 GitHub 一起变多。Acme 的 AI 周报和自动排期正好做这件事。Google 上这个说法的搜索 3 个月涨了 180%，前 10 名大多是泛泛的 AI 工具榜单，专门的指南只有 Nimbus 的一篇博客；早写更容易排上，也更容易被 AI 回答引用。',
        'In the “project management” discussions more and more people ask whether AI can keep track of progress and write the weekly update, on Reddit, Hacker News, YouTube and GitHub at once. Acme’s AI weekly report and automatic scheduling do exactly that. Google searches for the phrase rose 180% in 3 months; the top 10 are mostly general AI tool lists, and the only dedicated guide is a Nimbus blog post. An early guide ranks more easily and is more likely to be cited by AI answers.',
      ),
      suggestion: t(
        '写一篇“用 AI 助理管项目进度”的入门指南，用 Acme 的 AI 周报做例子；再为讨论最多的 3 个 Reddit 帖子起草回复，你确认后自己发。',
        'Write a getting-started guide to running project progress with an AI assistant, using Acme’s AI weekly report as the example, and draft replies to the 3 most discussed Reddit threads for you to post yourself.',
      ),
      objective: t(
        '在“AI 项目助理”讨论升温时排进前 10',
        'Reach the top 10 for “AI project assistant” while the discussion grows',
      ),
      newPage: { section: '/blog/', linkFrom: ['/docs/weekly-reports'] },
      source: 'topics',
      priority: 'high',
      effort: 'medium',
      found: 1,
      growth: (lang) =>
        topicRise(
          'new-topic',
          discussionWeeks(now, [
            [2, 0, 1, 0],
            [1, 0, 1, 0],
            [2, 1, 0, 1],
            [2, 0, 1, 0],
            [3, 0, 1, 1],
            [5, 1, 1, 2],
            [9, 1, 3, 4],
            [14, 2, 4, 7],
          ]),
          { change: 1.8, monthly: 2400 },
          { count: 1, domains: ['nimbus.example'] },
          pick<Discussion[]>(
            lang,
            [
              [
                '有人让 AI 助理来写每周进度更新吗？',
                'Reddit · r/projectmanagement',
                googleRank(2),
                dayBefore(now, 3),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                'Show HN：把看板更新整理成每周简报的 AI 助理',
                'Hacker News',
                hnHeat(312, 141),
                dayBefore(now, 6),
                'https://news.ycombinator.com/',
              ],
              [
                '我用了一个月的 4 款 AI 项目助理',
                'YouTube · Workflow Lab',
                viewsHeat(86_000),
                dayBefore(now, 9),
                'https://www.youtube.com/',
              ],
              [
                'pm-copilot：给项目看板用的 AI 助理',
                'GitHub',
                starsHeat(860),
                dayBefore(now, 5),
                'https://github.com/pm-copilot/pm-copilot',
              ],
              [
                '用 AI 助理排迭代计划，值得吗？',
                'Reddit · r/agile',
                googleRank(4),
                dayBefore(now, 4),
                'https://www.reddit.com/r/agile/',
              ],
              [
                '我们让 AI 项目经理跑了两个迭代，记录一下',
                'Reddit · r/projectmanagement',
                googleRank(5),
                dayBefore(now, 8),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                'Ask HN：AI 项目助理真的省时间吗？',
                'Hacker News',
                hnHeat(188, 97),
                dayBefore(now, 12),
                'https://news.ycombinator.com/',
              ],
              [
                '用 AI 助理保持看板整洁',
                'YouTube · Team Ops',
                viewsHeat(24_000),
                dayBefore(now, 15),
                'https://www.youtube.com/',
              ],
            ],
            [
              [
                'Has anyone let an AI assistant run their weekly status updates?',
                'Reddit · r/projectmanagement',
                googleRank(2),
                dayBefore(now, 3),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                'Show HN: An AI assistant that turns board updates into a weekly brief',
                'Hacker News',
                hnHeat(312, 141),
                dayBefore(now, 6),
                'https://news.ycombinator.com/',
              ],
              [
                'I tried 4 AI project assistants for a month',
                'YouTube · Workflow Lab',
                viewsHeat(86_000),
                dayBefore(now, 9),
                'https://www.youtube.com/',
              ],
              [
                'pm-copilot: An AI assistant for project boards',
                'GitHub',
                starsHeat(860),
                dayBefore(now, 5),
                'https://github.com/pm-copilot/pm-copilot',
              ],
              [
                'AI assistant for sprint planning: worth it?',
                'Reddit · r/agile',
                googleRank(4),
                dayBefore(now, 4),
                'https://www.reddit.com/r/agile/',
              ],
              [
                'Our team let an AI PM run two sprints. Notes',
                'Reddit · r/projectmanagement',
                googleRank(5),
                dayBefore(now, 8),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                'Ask HN: Do AI project assistants actually save time?',
                'Hacker News',
                hnHeat(188, 97),
                dayBefore(now, 12),
                'https://news.ycombinator.com/',
              ],
              [
                'Keeping boards tidy with an AI assistant',
                'YouTube · Team Ops',
                viewsHeat(24_000),
                dayBefore(now, 15),
                'https://www.youtube.com/',
              ],
            ],
          ),
          58,
          {
            name: 'AI project assistant',
            from: 'project management',
            followed: false,
          },
        ),
    },
    {
      key: 'acme-growth-five-tools',
      title: t(
        '参与 r/projectmanagement 上“试了五个工具”的讨论',
        'Join the r/projectmanagement thread on trying five tools',
      ),
      reason: t(
        '本周话题的 9 个 Reddit 帖子里 Google 把它排第 1；Google 收录的内容里提到了 Nimbus。',
        'Google ranks it first among this week’s 9 Reddit threads on the topic; the text Google shows names Nimbus.',
      ),
      meaning: t(
        '发帖的是 10–30 人的团队，两年换了四个工具，正是 Acme 的目标用户。帖子排在 Google 前面，搜同类问题的人和 AI 回答都会长期看到它；现在回复，还能排在前面的回复里。Reddit 经 Google 找到，拿不到赞数和评论数。',
        'The poster’s team of 10–30 went through four tools in two years, exactly Acme’s audience. The thread ranks high on Google, so people searching the same question and AI answers will keep seeing it; a reply now can still be among the first. Reddit is found through Google, so votes and comment counts are not available.',
      ),
      suggestion: t(
        'Agent 起草一条回复：先回答他们怎么选定工具，再讲 Acme 从 Excel 迁移和跨团队依赖的做法，附导入指南链接；你确认后用自己的账号发。',
        'The agent drafts a reply that first answers how teams settled on a tool, then explains how Acme handles moving from Excel and cross-team dependencies, with a link to the import guide; you post it from your own account after checking it.',
      ),
      objective: t(
        '让正在换工具的团队看到 Acme',
        'Let teams switching tools see Acme',
      ),
      offsite: t(
        'Reddit · r/projectmanagement 的这个帖子（回复）',
        'This thread in r/projectmanagement (a reply)',
      ),
      source: 'reddit',
      priority: 'high',
      effort: 'low',
      found: 1,
      growth: (lang) =>
        hotThread(
          'project management',
          {
            rank: 1,
            posted: dayBefore(now, 1),
            subreddit: 'r/projectmanagement',
            named: 'Nimbus 1',
          },
          pick<[string, number, string, string][]>(
            lang,
            [
              [
                '试了五个项目管理工具，最后留下来的是哪个？',
                1,
                dayBefore(now, 1),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                '有人让 AI 助理来写每周进度更新吗？',
                2,
                dayBefore(now, 3),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                '不用甘特图，三个团队之间的依赖怎么跟？',
                3,
                dayBefore(now, 3),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                '迭代评审变成了进度汇报会，你们怎么改回来的？',
                4,
                dayBefore(now, 5),
                'https://www.reddit.com/r/agile/',
              ],
              [
                '项目经理每周花多少时间在写报告上？',
                5,
                dayBefore(now, 2),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                '给客户看的项目进度页，你们用什么做？',
                6,
                dayBefore(now, 4),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                '从 Excel 迁到项目管理工具，最难的是哪一步？',
                7,
                dayBefore(now, 6),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                '小团队需要 PMO 吗？',
                8,
                dayBefore(now, 5),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                '资源排期表大家怎么维护？',
                9,
                dayBefore(now, 6),
                'https://www.reddit.com/r/projectmanagement/',
              ],
            ],
            [
              [
                'Which project management tool finally stuck after you tried five?',
                1,
                dayBefore(now, 1),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                'Has anyone let an AI assistant run their weekly status updates?',
                2,
                dayBefore(now, 3),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                'Tracking dependencies across three teams without a Gantt chart',
                3,
                dayBefore(now, 3),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                'Our sprint reviews turned into status meetings. How did you fix yours?',
                4,
                dayBefore(now, 5),
                'https://www.reddit.com/r/agile/',
              ],
              [
                'How much of your week goes into writing status reports?',
                5,
                dayBefore(now, 2),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                'What do you use for a client-facing progress page?',
                6,
                dayBefore(now, 4),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                'Moving from Excel to a PM tool: what was the hardest part?',
                7,
                dayBefore(now, 6),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                'Does a small team need a PMO?',
                8,
                dayBefore(now, 5),
                'https://www.reddit.com/r/projectmanagement/',
              ],
              [
                'How do you keep a resource plan up to date?',
                9,
                dayBefore(now, 6),
                'https://www.reddit.com/r/projectmanagement/',
              ],
            ],
          ),
        ),
    },
    {
      key: 'acme-growth-client-visibility',
      title: t(
        '写清楚怎么让客户只看到自己的项目',
        'Explain how clients can see only their own projects',
      ),
      reason: t(
        '近 30 天 17 个帖子在问这件事（论坛 11 个，Reddit 和 Hacker News 6 个），帮助中心没有对应页面。',
        '17 posts asked this in the last 30 days (11 in the forum, 6 on Reddit and Hacker News), and the help center has no page for it.',
      ),
      meaning: t(
        '代理商和外包团队想把客户请进来看进度，又怕客户看到别的项目。Acme 的访客权限可以按项目限制，但帮助中心只有一页设置说明，没讲这个用法；同样的问题每周都有人问，回答散在帖子里。',
        'Agencies and outsourcing teams want clients to follow progress without seeing other projects. Acme’s guest access can be limited per project, but the help center has only a settings page and does not explain this use; the same question comes up every week and the answers are scattered across threads.',
      ),
      suggestion: t(
        '在帮助中心写一篇“让客户只看到自己的项目”，按访客权限、项目分组和共享链接三种做法分别说明，从访客权限文档链接过来；写好后回复论坛里还没解决的帖子。',
        'Write a help article on letting clients see only their own projects, covering guest access, project groups and shared links, link to it from the guest access docs, and reply to the unsolved forum topics once it is up.',
      ),
      objective: t(
        '让问这个问题的人直接找到答案',
        'Let people asking this find the answer directly',
      ),
      newPage: {
        section: '/docs/',
        linkFrom: ['/docs/guests', '/docs/permissions'],
      },
      source: 'discourse',
      priority: 'medium',
      effort: 'low',
      found: 2,
      growth: (lang) =>
        askedOften(
          11,
          2340,
          pick<[string, 'forum' | 'reddit' | 'hackernews', string][]>(
            lang,
            [
              ['怎么让客户只看到他们自己的项目？', 'forum', dayBefore(now, 1)],
              [
                '访客能不能只看一个项目里的部分任务？',
                'forum',
                dayBefore(now, 2),
              ],
              ['有没有给客户看的只读视图？', 'reddit', dayBefore(now, 3)],
              [
                '外部协作者会看到团队里其他项目吗？',
                'forum',
                dayBefore(now, 5),
              ],
              [
                '给多个客户共用一个工作区，怎么隔离？',
                'forum',
                dayBefore(now, 6),
              ],
              [
                '代理商怎么在一个工具里管好几个客户的项目？',
                'reddit',
                dayBefore(now, 8),
              ],
              ['共享链接能设置只看进度吗？', 'forum', dayBefore(now, 9)],
              [
                'Ask HN：你们怎么给客户看项目进度又不暴露内部讨论？',
                'hackernews',
                dayBefore(now, 11),
              ],
              [
                '邀请客户进来以后，他能看到成员列表吗？',
                'forum',
                dayBefore(now, 13),
              ],
              ['按客户分项目组，权限怎么设？', 'forum', dayBefore(now, 16)],
            ],
            [
              [
                'How do I let clients see only their own projects?',
                'forum',
                dayBefore(now, 1),
              ],
              [
                'Can a guest see only some tasks in a project?',
                'forum',
                dayBefore(now, 2),
              ],
              [
                'Is there a read-only view for clients?',
                'reddit',
                dayBefore(now, 3),
              ],
              [
                'Do external collaborators see the team’s other projects?',
                'forum',
                dayBefore(now, 5),
              ],
              [
                'One workspace for several clients: how do you keep them apart?',
                'forum',
                dayBefore(now, 6),
              ],
              [
                'Agencies: how do you run several clients’ projects in one tool?',
                'reddit',
                dayBefore(now, 8),
              ],
              [
                'Can a shared link show progress only?',
                'forum',
                dayBefore(now, 9),
              ],
              [
                'Ask HN: How do you show clients progress without exposing internal discussion?',
                'hackernews',
                dayBefore(now, 11),
              ],
              [
                'After inviting a client, can they see the member list?',
                'forum',
                dayBefore(now, 13),
              ],
              [
                'Project groups per client: how should permissions be set?',
                'forum',
                dayBefore(now, 16),
              ],
            ],
          ),
          17,
        ),
    },
    {
      key: 'acme-growth-japan',
      title: t(
        '日语市场“ガントチャート”等 14 个词每月搜索 2.2 万次，先做日语页面',
        'Japanese searches: 14 keywords like “ガントチャート” get 22,000 a month. Start Japanese pages',
      ),
      reason: t(
        '日本这 14 个词每月合计搜索 22,000 次，一年涨了 34%；本站没有日语页面，Nimbus 在那里排上了 380 个词。',
        'These 14 keywords get 22,000 searches a month in Japan, up 34% in a year; the site has no Japanese pages, and Nimbus ranks for 380 keywords there.',
      ),
      meaning: t(
        'Acme 的甘特图、看板和模板在日本也有人找，搜索量一年里稳定上升；排在前面的多是本地工具和 Nimbus 的日语页面。先把访问最多的 3 页做成日语，就能试出这个市场有多少需求。',
        'People in Japan look for what Acme’s Gantt charts, boards and templates do, and the searches grew steadily over the year; the top results are mostly local tools and Nimbus’s Japanese pages. Making the 3 most visited pages Japanese first shows how much demand there is.',
      ),
      suggestion: t(
        '先把时间线（甘特图）功能页、模板页和 Excel 导入指南做成日语版，放在 /ja/ 下，标题用当地说法；各语言版本用 hreflang 互相指向。',
        'Make Japanese versions of the timeline (Gantt chart) feature page, the templates page and the Excel import guide under /ja/, with titles in local phrasing, and point the language versions to each other with hreflang.',
      ),
      objective: t(
        '在日本市场拿到第一批搜索访问',
        'Win the first search visits from Japan',
      ),
      newPage: { section: '/ja/', linkFrom: ['/', '/features/timeline'] },
      source: 'keywords',
      priority: 'medium',
      effort: 'high',
      found: 3,
      growth: (lang) =>
        otherMarket(
          lang === 'zh' ? '日本（日语）' : 'Japan (Japanese)',
          ['Nimbus', 380],
          0.34,
          pick<[string, string, number, number][]>(
            lang,
            [
              ['ガントチャート', '甘特圖', 8100, 0.22],
              ['プロジェクト管理ツール', '專案管理工具', 3600, 0.41],
              ['ガントチャート エクセル', '甘特圖 Excel', 2900, 0.18],
              ['タスク管理 アプリ', '任務管理 App', 2400, 0.36],
              ['カンバン ボード', '看板工具', 1300, 0.52],
              ['ガントチャート 無料', '免費甘特圖', 1000, 0.29],
              ['プロジェクト管理 テンプレート', '專案管理範本', 880, 0.15],
              ['WBS テンプレート', 'WBS 範本', 590, 0.08],
              ['工数管理 ツール', '工時管理工具', 390, 0.44],
              ['タスク 依存関係', '任務相依性', 260, 0.61],
              ['リソース管理 ツール', '資源管理工具', 210, 0.12],
              ['進捗管理 エクセル', '進度管理 Excel', 170, -0.05],
              ['週報 テンプレート', '週報範本', 110, 0.2],
              ['ガントチャート 共有', '甘特圖 共享', 90, 0.33],
            ],
            [
              ['ガントチャート', 'gantt chart', 8100, 0.22],
              ['プロジェクト管理ツール', 'project management tool', 3600, 0.41],
              ['ガントチャート エクセル', 'gantt chart excel', 2900, 0.18],
              ['タスク管理 アプリ', 'task management app', 2400, 0.36],
              ['カンバン ボード', 'kanban board', 1300, 0.52],
              ['ガントチャート 無料', 'free gantt chart', 1000, 0.29],
              [
                'プロジェクト管理 テンプレート',
                'project management template',
                880,
                0.15,
              ],
              ['WBS テンプレート', 'wbs template', 590, 0.08],
              ['工数管理 ツール', 'time tracking tool', 390, 0.44],
              ['タスク 依存関係', 'task dependencies', 260, 0.61],
              ['リソース管理 ツール', 'resource management tool', 210, 0.12],
              ['進捗管理 エクセル', 'progress tracking excel', 170, -0.05],
              ['週報 テンプレート', 'weekly report template', 110, 0.2],
              ['ガントチャート 共有', 'share gantt chart', 90, 0.33],
            ],
          ),
        ),
    },
    {
      key: 'acme-growth-link-gap',
      title: t(
        '23 个网站链接了 Nimbus 和 Example Tasks，没有链接我们',
        '23 sites link to Nimbus and Example Tasks but not to us',
      ),
      reason: t(
        '这 23 个网站各链接了至少 2 个竞品，权威度最高 71、平均 38。',
        'Each of these 23 sites links to at least 2 competitors; their authority is 71 at most and 38 on average.',
      ),
      meaning: t(
        '链接了几个竞品的网站多是工具榜单、评测和模板合集，已经在推荐同类产品；请它们加上 Acme，比找新网站容易得多，这些页面也常被 AI 回答引用。',
        'Sites linking to several competitors are mostly tool lists, reviews and template collections that already recommend products like ours; asking them to add Acme is far easier than finding new sites, and AI answers often cite these pages.',
      ),
      suggestion: t(
        'Agent 按权威度为前 10 个网站起草联系邮件，写明 Acme 和已列产品的区别并附上对比页；你确认后自己发送。',
        'The agent drafts outreach emails to the top 10 sites by authority, saying how Acme differs from the products they list and linking the comparison page; you send them yourself after checking.',
      ),
      objective: t(
        '让推荐同类产品的网站也列上 Acme',
        'Get listed by the sites that recommend products like ours',
      ),
      offsite: t(
        '权威度最高的 10 个网站（联系邮件）',
        'The 10 sites with the highest authority (outreach emails)',
      ),
      source: 'competitors',
      priority: 'medium',
      effort: 'medium',
      found: 4,
      growth: () =>
        linkGap(['Nimbus', 'Example Tasks'], 23, 38, [
          [
            'pmtoolsreview.example',
            71,
            ['Nimbus', 'Example Tasks'],
            dayBefore(now, 210),
          ],
          [
            'saasgrid.example',
            64,
            ['Nimbus', 'Example Tasks'],
            dayBefore(now, 340),
          ],
          [
            'teamstack.example',
            58,
            ['Nimbus', 'Example Tasks'],
            dayBefore(now, 95),
          ],
          [
            'remotetools.example',
            52,
            ['Nimbus', 'Example Tasks'],
            dayBefore(now, 160),
          ],
          [
            'agencyplaybook.example',
            47,
            ['Nimbus', 'Example Tasks'],
            dayBefore(now, 60),
          ],
          [
            'ganttguide.example',
            44,
            ['Nimbus', 'Example Tasks'],
            dayBefore(now, 400),
          ],
          [
            'startupkit.example',
            41,
            ['Nimbus', 'Example Tasks'],
            dayBefore(now, 120),
          ],
          [
            'opsweekly.example',
            37,
            ['Nimbus', 'Example Tasks'],
            dayBefore(now, 45),
          ],
          [
            'templatesheet.example',
            33,
            ['Nimbus', 'Example Tasks'],
            dayBefore(now, 280),
          ],
          [
            'devteamtools.example',
            30,
            ['Nimbus', 'Example Tasks'],
            dayBefore(now, 75),
          ],
        ]),
    },
    {
      key: 'acme-growth-kanban-video',
      title: t(
        '“看板和 Scrum 怎么选”视频一个月 8.6 万次播放，做一期同题内容',
        'A “Kanban vs Scrum” video got 86,000 views in a month: make one on the same subject',
      ),
      reason: t(
        '话题 task management 下这个视频 23 天播放 86,000 次；同话题近 30 天还有 3 个视频过万。',
        'This task management video got 86,000 views in 23 days; 3 more on the topic passed 10,000 in the last 30 days.',
      ),
      meaning: t(
        '看的人多是正在给团队选流程的负责人，评论里反复问“看板和迭代能不能一起用”。Acme 的看板和迭代视图正好能演示两种做法，网站上还没有讲这个对比的内容。',
        'Its viewers are mostly leads choosing a process for their team, and the comments keep asking whether boards and sprints can be combined. Acme’s board and sprint views can show both, and the site has nothing on the comparison yet.',
      ),
      suggestion: t(
        '用 Acme 的看板和迭代视图录一期 8 分钟的对比视频，配一篇同题博客；在视频说明里链接看板功能页。',
        'Record an 8-minute comparison with Acme’s board and sprint views, publish a blog post on the same subject, and link the kanban feature page from the video description.',
      ),
      objective: t(
        '借这个话题的热度让选流程的团队看到 Acme',
        'Reach teams choosing a process while the subject is popular',
      ),
      newPage: { section: '/blog/', linkFrom: ['/features/kanban'] },
      source: 'youtube',
      priority: 'medium',
      effort: 'medium',
      found: 2,
      growth: (lang) =>
        hotVideo(
          'task management',
          {
            views: 86_000,
            posted: dayBefore(now, 23),
            channel: 'Workflow Lab',
            likes: 3_100,
          },
          pick<[string, string, number, string][]>(
            lang,
            [
              [
                '用一张看板管好个人任务',
                'Team Ops',
                31_000,
                dayBefore(now, 12),
              ],
              [
                '迭代计划会怎么开才不超时',
                'Agile Coach Lin',
                18_000,
                dayBefore(now, 19),
              ],
              [
                '任务拆分的 5 个常见错误',
                'Workflow Lab',
                12_000,
                dayBefore(now, 27),
              ],
            ],
            [
              [
                'Run your own tasks from one board',
                'Team Ops',
                31_000,
                dayBefore(now, 12),
              ],
              [
                'Sprint planning that ends on time',
                'Agile Coach Lin',
                18_000,
                dayBefore(now, 19),
              ],
              [
                '5 common mistakes when breaking down tasks',
                'Workflow Lab',
                12_000,
                dayBefore(now, 27),
              ],
            ],
          ),
        ),
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
      growth: () =>
        rising(
          [720, 760, 740, 800, 780, 820, 900, 1000, 1250, 1800, 2400, 3000],
          month,
        ),
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
    // Step 2b (2026-11-10): a followed topic discussed more, a hot Hacker News story, site search and People also ask.
    {
      key: 'crm-growth-automation-topic',
      title: t(
        '“workflow automation”讨论是之前 4 周的 2.7 倍，写一篇 CRM 自动化指南',
        'Discussion of “workflow automation” is 2.7× the 4 weeks before: write a CRM automation guide',
      ),
      reason: t(
        '近 4 周 49 条讨论，之前 4 周 18 条；Reddit 和 Hacker News 一起变多。',
        '49 discussions in the last 4 weeks against 18 the 4 weeks before, rising on Reddit and Hacker News together.',
      ),
      meaning: t(
        '销售团队在讨论怎么把跟进提醒、线索分配和报价审批自动化，问得最多的是“不写代码能不能做”。Acme CRM 的自动化规则正好能做，但网站上只有功能列表，没有讲做法的指南。',
        'Sales teams are discussing how to automate follow-up reminders, lead routing and quote approvals, most often asking whether it works without code. Acme CRM’s automation rules do this, but the site only lists the feature and has no how-to guide.',
      ),
      suggestion: t(
        '写一篇“不写代码自动化销售流程”的指南，用跟进提醒、线索分配、报价审批三个例子，从线索分配文档链接过来。',
        'Write a guide to automating the sales process without code, with follow-up reminders, lead routing and quote approvals as examples, and link to it from the lead routing docs.',
      ),
      objective: t(
        '在销售自动化讨论升温时排进前 10',
        'Reach the top 10 while sales automation is discussed more',
      ),
      newPage: { section: '/blog/', linkFrom: ['/docs/lead-routing'] },
      source: 'topics',
      priority: 'medium',
      effort: 'medium',
      found: 1,
      growth: (lang) =>
        topicRise(
          'topic-rise',
          discussionWeeks(now, [
            [3, 1, 1, 0],
            [2, 1, 0, 0],
            [3, 0, 1, 0],
            [4, 1, 1, 0],
            [6, 2, 1, 0],
            [8, 3, 1, 0],
            [9, 3, 0, 0],
            [11, 4, 1, 0],
          ]),
          { change: 0.45, monthly: 1600 },
          { count: 2, domains: ['sales.example', 'flowdesk.example'] },
          pick<Discussion[]>(
            lang,
            [
              [
                '不写代码，销售跟进提醒能自动化到什么程度？',
                'Reddit · r/sales',
                googleRank(1),
                dayBefore(now, 2),
                'https://www.reddit.com/r/sales/',
              ],
              [
                'Show HN：开源的销售流程自动化规则引擎',
                'Hacker News',
                hnHeat(176, 64),
                dayBefore(now, 4),
                'https://news.ycombinator.com/',
              ],
              [
                '线索自动分配，你们按什么规则？',
                'Reddit · r/salesops',
                googleRank(3),
                dayBefore(now, 5),
                'https://www.reddit.com/r/salesops/',
              ],
              [
                '我们把报价审批从邮件搬进了自动化流程',
                'Hacker News',
                hnHeat(121, 38),
                dayBefore(now, 9),
                'https://news.ycombinator.com/',
              ],
              [
                'CRM 自动化做太多，反而没人看提醒了',
                'Reddit · r/sales',
                googleRank(4),
                dayBefore(now, 11),
                'https://www.reddit.com/r/sales/',
              ],
              [
                '10 分钟搭好销售自动化',
                'YouTube · RevOps Daily',
                viewsHeat(14_000),
                dayBefore(now, 13),
                'https://www.youtube.com/',
              ],
            ],
            [
              [
                'How far can you automate sales follow-ups without code?',
                'Reddit · r/sales',
                googleRank(1),
                dayBefore(now, 2),
                'https://www.reddit.com/r/sales/',
              ],
              [
                'Show HN: An open source rule engine for sales workflows',
                'Hacker News',
                hnHeat(176, 64),
                dayBefore(now, 4),
                'https://news.ycombinator.com/',
              ],
              [
                'Automatic lead routing: which rules do you use?',
                'Reddit · r/salesops',
                googleRank(3),
                dayBefore(now, 5),
                'https://www.reddit.com/r/salesops/',
              ],
              [
                'We moved quote approvals from email into an automated workflow',
                'Hacker News',
                hnHeat(121, 38),
                dayBefore(now, 9),
                'https://news.ycombinator.com/',
              ],
              [
                'Too much CRM automation and nobody reads the reminders',
                'Reddit · r/sales',
                googleRank(4),
                dayBefore(now, 11),
                'https://www.reddit.com/r/sales/',
              ],
              [
                'Set up sales automation in 10 minutes',
                'YouTube · RevOps Daily',
                viewsHeat(14_000),
                dayBefore(now, 13),
                'https://www.youtube.com/',
              ],
            ],
          ),
          49,
          { name: 'workflow automation', followed: true },
        ),
    },
    {
      key: 'crm-growth-pipeline-math',
      title: t(
        '在 Hacker News 热帖“早期 B2B 销售的漏斗算术”下回复',
        'Reply under the Hacker News story “Pipeline math for early-stage B2B sales”',
      ),
      reason: t(
        '2 天 143 分、41 条评论；读了的评论里提到 Example Sales 2 次，没有提到 Acme CRM。',
        '143 points and 41 comments in 2 days; the comments read name Example Sales twice and Acme CRM not at all.',
      ),
      meaning: t(
        '评论里的创始人在比较用表格还是用 CRM 算漏斗，已经有人推荐了 Example Sales。Acme CRM 的漏斗报表能直接算出每阶段转化率，正好回答他们在问的事。',
        'Founders in the comments compare spreadsheets with a CRM for pipeline math, and someone already recommended Example Sales. Acme CRM’s pipeline report computes each stage’s conversion rate directly, which is what they are asking about.',
      ),
      suggestion: t(
        'Agent 起草一条回复：先补充算漏斗时容易漏掉的阶段停留时间，再说明 Acme CRM 的漏斗报表怎么算，附上漏斗阶段的博客；你确认后自己发。',
        'The agent drafts a reply that first adds the stage durations people tend to miss, then explains how Acme CRM’s pipeline report works, linking the pipeline stages post; you post it yourself after checking.',
      ),
      objective: t(
        '让在算漏斗的创始人看到 Acme CRM',
        'Let founders doing pipeline math see Acme CRM',
      ),
      offsite: t(
        'Hacker News 上这个帖子的评论（回复）',
        'The comments of this Hacker News story (a reply)',
      ),
      source: 'hackernews',
      priority: 'medium',
      effort: 'low',
      found: 2,
      growth: (lang) =>
        hotStory(
          'sales pipeline',
          {
            points: 143,
            comments: 41,
            named: 'Example Sales 2',
            own: null,
            posted: dayBefore(now, 2),
            url: 'https://news.ycombinator.com/',
          },
          pick<[string, string[]][]>(
            lang,
            [
              [
                '我们一开始用表格算，换到 Example Sales 以后才看到每个阶段卡了多久。',
                ['Example Sales'],
              ],
              [
                'Example Sales 的漏斗报表不错，就是自定义阶段要升级套餐。',
                ['Example Sales'],
              ],
              ['转化率算对了，才知道每月该开多少个新机会。', []],
            ],
            [
              [
                'We started in a spreadsheet; only after moving to Example Sales did we see how long each stage stalled.',
                ['Example Sales'],
              ],
              [
                'Example Sales has a good pipeline report, but custom stages need a higher plan.',
                ['Example Sales'],
              ],
              [
                'Get the conversion rates right and you know how many new opportunities a month you need.',
                [],
              ],
            ],
          ),
        ),
    },
    {
      key: 'crm-growth-merge-contacts',
      title: t(
        '站内搜“合并重复联系人”73 次，补一篇帮助文档',
        '“merge duplicate contacts” was searched 73 times on the site: add a help article',
      ),
      reason: t(
        '近 28 天站内搜索 73 次、46 人搜过，网站上没有对应页面；相近的“合并联系人”还有 22 次。',
        'Searched 73 times by 46 people on the site in the last 28 days with no matching page; the similar “merge contacts” adds 22 more.',
      ),
      meaning: t(
        '搜这个的多是刚导入联系人的新用户：导入后出现重复，他们在站内找办法，找不到就会去问客服或放弃。Acme CRM 有按邮箱合并的功能，只是没写进帮助中心。',
        'Most people searching this are new users who just imported contacts and found duplicates; when the site has no answer they ask support or give up. Acme CRM can merge by email address, but the help center does not say so.',
      ),
      suggestion: t(
        '在帮助中心写一篇“合并重复联系人”，讲按邮箱自动合并和手动合并两种做法，从导入指南的最后一步链接过来。',
        'Write a help article on merging duplicate contacts, covering automatic merging by email and merging by hand, and link to it from the last step of the import guide.',
      ),
      objective: t(
        '让导入后遇到重复的用户自己解决',
        'Let users who find duplicates after an import solve it themselves',
      ),
      newPage: { section: '/docs/', linkFrom: ['/docs/import'] },
      source: 'ga4',
      priority: 'medium',
      effort: 'low',
      found: 3,
      growth: (lang) =>
        siteSearch(
          pick<[string, number, number][]>(
            lang,
            [
              ['合并重复联系人', 73, 46],
              ['合并联系人', 22, 17],
            ],
            [
              ['merge duplicate contacts', 73, 46],
              ['merge contacts', 22, 17],
            ],
          ),
        ),
    },
    {
      key: 'crm-growth-pipeline-paa',
      title: t(
        '销售漏斗：Google 上大家还问了 6 个我们没回答的问题',
        'Sales pipeline: 6 People also ask questions no page of ours answers',
      ),
      reason: t(
        '4 个关键词每月合计搜索 9,300 次，结果页里 18 个问题有 6 个本站页面没回答。',
        '4 keywords get 9,300 searches a month; 6 of the 18 questions on their results pages are not answered by any page of ours.',
      ),
      meaning: t(
        '这些问题出现在“销售漏斗”相关词的 Google 结果页里，回答得好的页面会被摘进“大家还问了”，也常被 AI 回答引用。漏斗阶段那篇博客只讲了阶段怎么分，没讲怎么算转化率和多久该清理。',
        'These questions appear on the results pages of the sales pipeline keywords; a page that answers them well is quoted in People also ask and often cited by AI answers. The pipeline stages post explains how to split stages but not how to compute conversion rates or when to clean up.',
      ),
      suggestion: t(
        '在漏斗阶段那篇博客后面加一节常见问题，逐条回答这 6 个问题，每条 2–3 句，并加上 FAQ 结构化数据。',
        'Add an FAQ section to the pipeline stages post answering these 6 questions in 2–3 sentences each, with FAQ structured data.',
      ),
      objective: t(
        '让漏斗相关的问题由我们的页面回答',
        'Have our page answer the pipeline questions',
      ),
      path: '/blog/pipeline-stages',
      source: 'keywords',
      priority: 'low',
      effort: 'low',
      found: 5,
      growth: (lang) =>
        peopleAlsoAsk(
          lang === 'zh' ? '銷售漏斗' : 'Sales pipeline',
          18,
          pick<[string, string, number][]>(
            lang,
            [
              ['銷售漏斗轉換率怎麼算？', '銷售漏斗', 4400],
              ['銷售漏斗多久要清理一次？', '銷售漏斗', 4400],
              ['B2B 銷售漏斗一般有幾個階段？', '銷售漏斗 階段', 2400],
              ['銷售漏斗和銷售管道有什麼不同？', '銷售管道', 1600],
              ['怎麼判斷商機卡在哪個階段？', '銷售漏斗 階段', 2400],
              ['小團隊需要 CRM 來管銷售漏斗嗎？', '銷售漏斗 CRM', 900],
            ],
            [
              [
                'How do you calculate sales pipeline conversion rate?',
                'sales pipeline',
                4400,
              ],
              [
                'How often should you clean up your sales pipeline?',
                'sales pipeline',
                4400,
              ],
              [
                'How many stages does a B2B sales pipeline have?',
                'sales pipeline stages',
                2400,
              ],
              [
                'What is the difference between a sales funnel and a pipeline?',
                'sales funnel vs pipeline',
                1600,
              ],
              [
                'How do you tell which stage a deal is stuck in?',
                'sales pipeline stages',
                2400,
              ],
              [
                'Does a small team need a CRM for its pipeline?',
                'sales pipeline crm',
                900,
              ],
            ],
          ),
        ),
    },
  ];
}

/**
 * A followed topic discussed more on Reddit alone (Acme, 2026-11-10 step 2b): the rule waits in Watching until a
 * second source rises as well, with the weeks drawn in the change's detail.
 */
export function acmeTopicWatch(now: Date, lang: Lang) {
  const weeks = discussionWeeks(now, [
    [3, 1, 1, 0],
    [4, 0, 1, 0],
    [2, 1, 0, 0],
    [3, 1, 1, 0],
    [5, 1, 1, 0],
    [7, 0, 0, 0],
    [9, 1, 1, 0],
    [12, 0, 1, 0],
  ]);
  const rows = pick<Discussion[]>(
    lang,
    [
      [
        '远程团队怎么避免每天开站会？',
        'Reddit · r/remotework',
        googleRank(1),
        dayBefore(now, 3),
        'https://www.reddit.com/r/remotework/',
      ],
      [
        '跨部门协作，大家用什么工具对齐进度？',
        'Reddit · r/projectmanagement',
        googleRank(2),
        dayBefore(now, 6),
        'https://www.reddit.com/r/projectmanagement/',
      ],
      [
        '团队消息太多，任务反而被淹没了',
        'Reddit · r/productivity',
        googleRank(4),
        dayBefore(now, 10),
        'https://www.reddit.com/r/productivity/',
      ],
      [
        '异步协作的团队是怎么交接工作的？',
        'Reddit · r/remotework',
        googleRank(3),
        dayBefore(now, 15),
        'https://www.reddit.com/r/remotework/',
      ],
    ],
    [
      [
        'How do remote teams avoid a daily standup?',
        'Reddit · r/remotework',
        googleRank(1),
        dayBefore(now, 3),
        'https://www.reddit.com/r/remotework/',
      ],
      [
        'Cross-team work: which tool keeps everyone on the same page?',
        'Reddit · r/projectmanagement',
        googleRank(2),
        dayBefore(now, 6),
        'https://www.reddit.com/r/projectmanagement/',
      ],
      [
        'Too many team messages and the tasks get buried',
        'Reddit · r/productivity',
        googleRank(4),
        dayBefore(now, 10),
        'https://www.reddit.com/r/productivity/',
      ],
      [
        'How do async teams hand work over?',
        'Reddit · r/remotework',
        googleRank(3),
        dayBefore(now, 15),
        'https://www.reddit.com/r/remotework/',
      ],
    ],
  );
  return {
    key: 'topic-rise:team collaboration',
    title: pick(
      lang,
      '话题 team collaboration 近 4 周讨论是之前 4 周的 2.1 倍',
      'Topic team collaboration: 2.1× the discussions of the 4 weeks before',
    ),
    fact: pick(
      lang,
      '近 4 周 38 条讨论，之前 4 周 18 条；一起变多的来源：Reddit',
      '38 discussions in the last 4 weeks, 18 the 4 weeks before; rising on Reddit',
    ),
    waitingFor: pick(
      lang,
      '再有一个来源一起变多',
      'One more source rising as well',
    ),
    chip: '18 → 38',
    growth: topicRise(
      'topic-rise',
      weeks,
      { change: 0.06, monthly: 6600 },
      { count: 6, domains: ['teamhub.example', 'nimbus.example'] },
      rows,
      38,
      { name: 'team collaboration', followed: true },
    ),
  };
}
