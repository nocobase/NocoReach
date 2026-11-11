// @ts-nocheck
import { expect, test } from 'vitest';
import {
  tally,
  chartWeeks,
  lastWholeWeek,
} from '../../server/nocoreach/topic-weeks.js';
import * as topic from '../../server/nocoreach/topic-signals.js';
import * as sources from '../../server/nocoreach/source-signals.js';
import {
  cleanDiscovery,
  material,
} from '../../server/nocoreach/topic-discovery.js';
import {
  GrowthSources,
  mainKeywords,
  marketVolume,
  ADS_KEYWORD,
} from '../../server/nocoreach/growth-sources.js';
import {
  RULES,
  resolver,
  ruleCost,
} from '../../server/nocoreach/analysis-rules.js';
import { growthOf } from '../../shared/growth.js';

// Opportunities step 2b (2026-11-10): trending topics from the followed topics' discussions, what people keep asking,
// and the first batch of new data. Every number is counted from saved state; nothing here calls a service.

const rules = resolver({}, RULES);
const V = (id, key) => rules.value(id, key);
const NOW = Date.parse('2026-11-11T12:00:00Z');
// The eight whole weeks before 2026-11-11: four before (09-14 … 10-05) and the last four (10-12 … 11-02).
const WEEKS = [
  '2026-09-14',
  '2026-09-21',
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
];
const TOPIC = 'AI project assistant';
const keys = (g) =>
  g.figures.map((f) => f.label.key.replace('growth.figure.', ''));

/** Saved source state for one topic: Reddit threads and YouTube videos per week, Hacker News and GitHub weekly counts. */
function world({ reddit = [], youtube = [], hn = [], github = [] } = {}) {
  const posts = {},
    videos = {};
  WEEKS.forEach((w, i) => {
    for (let k = 0; k < (reddit[i] || 0); k++)
      posts[`r${i}${k}`] = {
        id: `r${i}${k}`,
        title: `Thread ${i}.${k} about an AI project assistant`,
        subreddit: 'projectmanagement',
        url: `https://www.reddit.com/r/projectmanagement/comments/r${i}${k}/`,
        postedAt: w,
        firstSeenAt: '2026-09-08T08:00:00.000Z',
        topics: [TOPIC],
      };
    for (let k = 0; k < (youtube[i] || 0); k++)
      videos[`v${i}${k}`] = {
        id: `v${i}${k}`,
        title: `Video ${i}.${k}`,
        url: `https://www.youtube.com/watch?v=v${i}${k}`,
        channel: 'PM Weekly',
        publishedAt: w,
        views: 1000 * (k + 1),
        firstSeenAt: '2026-09-09T08:00:00.000Z',
        topics: [TOPIC],
      };
  });
  return {
    rd: { topicPosts: posts, topicChecks: {} },
    yt: { topicVideos: videos },
    hn: {
      topicWeeks: hn.length
        ? { [TOPIC]: Object.fromEntries(WEEKS.map((w, i) => [w, hn[i]])) }
        : {},
      topicStories: {},
    },
    ght: {
      weekly: github.length
        ? { [TOPIC]: Object.fromEntries(WEEKS.map((w, i) => [w, github[i]])) }
        : {},
      topicNew: {},
      repos: {},
    },
  };
}

test('topic weeks: each source counted per whole week from the week it covers the topic; a week counted keeps its larger count', () => {
  expect(lastWholeWeek(NOW)).toBe('2026-11-02');
  const w = world({
      reddit: [1, 1, 0, 1, 2, 3, 4, 6],
      hn: [2, 1, 2, 1, 3, 5, 6, 8],
      github: [0, 1, 0, 0, 1, 1, 2, 2],
    }),
    t = tally({ topics: [TOPIC], ...w, stored: null, now: NOW }),
    entry = t.topics.aiprojectassistant;
  expect(entry.name).toBe(TOPIC);
  expect(entry.since).toEqual({
    reddit: '2026-09-07',
    hackernews: '2026-09-14',
    github: '2026-09-14',
  });
  expect(entry.weeks['2026-11-02']).toEqual({
    reddit: 6,
    hackernews: 8,
    github: 2,
  });
  // The current week (11-09) is not whole yet.
  expect(entry.weeks['2026-11-09']).toBeUndefined();
  // Threads no longer kept do not lower a week already counted.
  const pruned = { ...w, rd: { topicPosts: {} } },
    again = tally({ topics: [TOPIC], ...pruned, stored: t, now: NOW });
  expect(again.topics.aiprojectassistant.weeks['2026-11-02'].reddit).toBe(6);
  // A topic no longer followed is dropped.
  expect(tally({ topics: [], ...w, stored: t, now: NOW }).topics).toEqual({});
  // The chart: eight weeks, a source only from the week it covers.
  const weeks = chartWeeks(entry, t.until);
  expect(weeks.map((x) => x.week)).toEqual(WEEKS);
  expect(weeks[0].counts).toEqual({ reddit: 1, hackernews: 2, github: 0 });
});

test('topic rise: the last 4 weeks clearly up on the 4 before on two sources; one source alone is watched', () => {
  const w = world({
      reddit: [1, 1, 0, 1, 2, 3, 4, 6],
      hn: [2, 1, 2, 1, 3, 5, 6, 8],
      github: [1, 1, 1, 1, 1, 1, 1, 1],
    }),
    tw = tally({ topics: [TOPIC], ...w, stored: null, now: NOW }),
    [s] = topic.topicRiseSignals({
      tw,
      ...w,
      tr: null,
      volumes: new Map(),
      serps: {},
      V,
    });
  expect(s.key).toBe('topic-rise:aiprojectassistant');
  expect(s.actionable).toBe(true);
  const g = growthOf(s.growth);
  expect(g.category).toBe('trending');
  expect(keys(g)).toEqual(['discussions4w', 'risingSources']);
  // 15 Reddit + 22 HN + 4 GitHub in the last four weeks, 3 + 6 + 4 before.
  expect(g.figures[0].value).toBe(41);
  expect(g.figures[0].detail.params[0]).toBe('13');
  expect(g.figures[1].value).toBe(2);
  expect(g.figures[1].detail.params[0]).toBe('Reddit · Hacker News');
  expect(g.weeks).toHaveLength(8);
  expect(g.weeks[7].counts).toEqual({ reddit: 6, hackernews: 8, github: 1 });
  expect(g.topic).toEqual({ name: TOPIC, followed: true });
  expect(g.evidence.columns.map((c) => c.format)).toEqual([
    'text',
    'text',
    'message',
    'date',
  ]);
  // Reddit's rows carry no votes or comment counts.
  expect(
    g.evidence.rows
      .filter((r) => r.source.startsWith('Reddit'))
      .every((r) => r.heat === null),
  ).toBe(true);
  // Hacker News alone rising: watched, not an opportunity.
  const one = world({
      reddit: [2, 2, 2, 2, 2, 2, 2, 2],
      hn: [1, 1, 1, 1, 5, 6, 7, 8],
    }),
    tw1 = tally({ topics: [TOPIC], ...one, stored: null, now: NOW }),
    [watched] = topic.topicRiseSignals({ tw: tw1, ...one, V });
  expect(watched.actionable).toBe(false);
  expect(watched.watchOnly).toBe(true);
  expect(watched.waitingFor).toBeTruthy();
  // Flat: nothing.
  const flat = world({
    hn: [3, 3, 3, 3, 3, 3, 3, 3],
    github: [2, 2, 2, 2, 2, 2, 2, 2],
  });
  expect(
    topic.topicRiseSignals({
      tw: tally({ topics: [TOPIC], ...flat, stored: null, now: NOW }),
      ...flat,
      V,
    }),
  ).toEqual([]);
});

test('topic rise: a source that started reading the topic inside the window is not judged', () => {
  const w = world({
    reddit: [0, 0, 0, 0, 3, 5, 8, 9],
    hn: [1, 1, 1, 1, 1, 1, 1, 2],
  });
  for (const p of Object.values(w.rd.topicPosts))
    p.firstSeenAt = '2026-10-14T08:00:00.000Z';
  const tw = tally({ topics: [TOPIC], ...w, stored: null, now: NOW });
  expect(tw.topics.aiprojectassistant.since.reddit).toBe('2026-10-12');
  expect(topic.topicRiseSignals({ tw, ...w, V })).toEqual([]);
});

test('topic rise: Google interest over 3 months and the dedicated pages of the top 10 when known', () => {
  const w = world({
      reddit: [1, 1, 0, 1, 2, 3, 4, 6],
      hn: [2, 1, 2, 1, 3, 5, 6, 8],
    }),
    tw = tally({ topics: [TOPIC], ...w, stored: null, now: NOW }),
    points = Array.from({ length: 52 }, (_, i) => ({
      date: `w${i}`,
      value: i < 39 ? 20 : 56,
    })),
    tr = { keywords: [{ keyword: TOPIC, latest: { points } }] },
    serps = {
      aiprojectassistant: {
        items: [
          {
            title: 'What is an AI project assistant?',
            domain: 'nimbus.example',
          },
          { title: 'Best AI tools 2026', domain: 'list.example' },
        ],
      },
    },
    [s] = topic.topicRiseSignals({
      tw,
      ...w,
      tr,
      volumes: new Map([['ai project assistant', 2400]]),
      serps,
      V,
    });
  expect(keys(s.growth)).toEqual([
    'discussions4w',
    'risingSources',
    'googleSearch3m',
    'dedicatedTop10',
  ]);
  expect(s.growth.figures[2].value).toBeCloseTo(1.8);
  expect(s.growth.figures[2].detail.params[0]).toBe('2,400');
  expect(s.growth.figures[3].value).toBe(1);
  expect(s.growth.figures[3].detail.params[0]).toBe('nimbus.example');
});

test('new topics: the AI’s phrases counted in the discussions and on Hacker News, not followed yet, with where they came from', () => {
  const w = world({ hn: [1, 1, 1, 1, 1, 1, 1, 1] }),
    tw = tally({
      topics: ['project management'],
      ...w,
      stored: null,
      now: NOW,
    });
  const td = {
    newTopics: [
      {
        phrase: 'AI status report',
        from: 'project management',
        terms: ['ai status report'],
        hnWeeks: Object.fromEntries(
          WEEKS.map((x, i) => [x, [0, 1, 1, 1, 3, 4, 6, 9][i]]),
        ),
      },
      {
        phrase: 'project management',
        from: 'project management',
        terms: ['project management'],
        hnWeeks: {},
      },
    ],
  };
  const [s, ...rest] = topic.newTopicSignals({
    td,
    tw,
    ...w,
    volumes: new Map(),
    serps: {},
    followed: ['project management'],
    V,
  });
  expect(rest).toEqual([]);
  expect(s.key).toBe('new-topic:aistatusreport');
  expect(s.growth.kind).toBe('new-topic');
  expect(s.growth.topic).toEqual({
    name: 'AI status report',
    from: 'project management',
    followed: false,
  });
  expect(s.growth.figures[0].value).toBe(22);
});

test('hot discussions: Hacker News with points, comments and the products its comments name; Reddit with Google’s order only', () => {
  const since = new Date(NOW - 2 * 86400000).toISOString();
  const hn = {
    topicStories: {
      1: {
        id: '1',
        title: 'Show HN: an AI assistant for project boards',
        hnUrl: 'https://news.ycombinator.com/item?id=1',
        points: 312,
        comments: 141,
        createdAt: since,
        topics: [TOPIC],
        commentsRead: 141,
        named: [
          { name: 'Acme', own: true, mentions: 0 },
          { name: 'Nimbus', own: false, mentions: 9 },
        ],
        excerpts: [{ text: 'We moved to Nimbus for this.', names: ['Nimbus'] }],
      },
      2: {
        id: '2',
        title: 'Quiet story',
        hnUrl: 'https://news.ycombinator.com/item?id=2',
        points: 20,
        comments: 2,
        createdAt: since,
        topics: [TOPIC],
      },
    },
  };
  const rd = {
    topicChecks: {
      aiprojectassistant: { week: '2026-11-09', status: 'completed' },
    },
    topicPosts: {
      a: {
        id: 'a',
        title: 'I tried five tools, Nimbus won',
        snippet: 'Nimbus and Acme compared',
        subreddit: 'projectmanagement',
        url: 'https://www.reddit.com/r/projectmanagement/comments/a/',
        postedAt: '2026-11-10',
        firstSeenAt: '2026-11-10T08:00:00.000Z',
        topics: [TOPIC],
        ranks: { aiprojectassistant: { week: '2026-11-09', rank: 2 } },
      },
      b: {
        id: 'b',
        title: 'Old thread',
        subreddit: 'pm',
        url: 'https://www.reddit.com/r/pm/comments/b/',
        postedAt: '2026-11-10',
        firstSeenAt: '2026-11-03T08:00:00.000Z',
        topics: [TOPIC],
        ranks: { aiprojectassistant: { week: '2026-11-02', rank: 1 } },
      },
    },
  };
  const out = topic.hotDiscussionSignals({
    rd,
    hn,
    followed: [TOPIC],
    names: [
      { name: 'Acme', own: true },
      { name: 'Nimbus', own: false },
    ],
    now: NOW,
    V,
  });
  expect(out.map((s) => s.key)).toEqual([
    'topic-hot:hackernews:1',
    'topic-hot:reddit:a',
  ]);
  const [story, thread] = out;
  expect(keys(story.growth)).toEqual([
    'points',
    'comments',
    'namedInComments',
    'posted',
  ]);
  expect(story.growth.figures[2].value).toBe('Nimbus 9');
  expect(story.action).toBe('reply');
  expect(keys(thread.growth)).toEqual([
    'googlePosition',
    'posted',
    'subreddit',
    'namedOnGoogle',
  ]);
  expect(thread.growth.figures[0].value).toBe(2);
  expect(thread.growth.figures[3].value).toBe('Nimbus 2 · Acme 1');
  // Nothing about votes or comment counts for Reddit.
  expect(JSON.stringify(thread.growth)).not.toMatch(/vote|upvote|comments"/i);
});

test('asked often: a group of questions with enough posts and no page answering it', () => {
  const now = NOW,
    day = '2026-11-01T00:00:00.000Z';
  const cm = {
    origin: 'https://forum.acme.example',
    topics: Object.fromEntries(
      Array.from({ length: 4 }, (_, i) => [
        i,
        {
          id: i,
          slug: `t${i}`,
          title: `How do clients see only their own projects? ${i}`,
          createdAt: day,
          views: 100,
          solved: false,
        },
      ]),
    ),
  };
  const rd = {
    topicPosts: {
      x: {
        id: 'x',
        title: 'Client-only project view?',
        url: 'https://www.reddit.com/r/pm/comments/x/',
        postedAt: '2026-11-02',
        topics: [TOPIC],
      },
    },
  };
  const td = {
    questions: [
      {
        theme: 'Letting clients see only their own projects',
        query: 'client portal projects',
        ids: [
          'forum:0',
          'forum:1',
          'forum:2',
          'forum:3',
          'reddit:x',
          'forum:missing',
        ],
      },
    ],
  };
  const [s] = topic.askedOftenSignals({
    td,
    cm,
    rd,
    hn: null,
    site: {
      pages: [
        { url: 'https://acme.example/docs/gantt', title: 'Gantt charts' },
      ],
    },
    now,
    V,
  });
  expect(s.growth.kind).toBe('asked-often');
  expect(s.growth.figures[0].value).toBe(5);
  expect(s.growth.figures[0].detail).toEqual({
    key: 'growth.detail.askedSplit',
    params: { 0: 4, 1: 1 },
  });
  expect(s.growth.evidence.rows[0].source).toMatch(/^growth\.value\./);
  // A page answering it: no opportunity.
  const covered = {
    pages: [
      {
        url: 'https://acme.example/docs/client-portal',
        title: 'Client portal: projects for each client',
      },
    ],
  };
  expect(
    topic.askedOftenSignals({ td, cm, rd, hn: null, site: covered, now, V }),
  ).toEqual([]);
});

test('hot videos: topic videos of the last 30 days with many views', () => {
  const yt = {
    topicVideos: {
      a: {
        id: 'a',
        url: 'https://www.youtube.com/watch?v=a',
        title: 'I tried 4 AI project assistants',
        channel: 'PM Weekly',
        publishedAt: '2026-11-02',
        views: 86000,
        likes: 2100,
        topics: [TOPIC],
      },
      b: {
        id: 'b',
        title: 'Old',
        publishedAt: '2026-08-01',
        views: 900000,
        topics: [TOPIC],
      },
    },
  };
  const [s, ...rest] = topic.hotVideoSignals({
    yt,
    followed: [TOPIC],
    now: NOW,
    V,
  });
  expect(rest).toEqual([]);
  expect(s.growth.kind).toBe('hot-video');
  expect(keys(s.growth)).toEqual(['views', 'posted', 'channel', 'likes']);
});

test('other-language markets: searches there and no page in the language; the competitors present when read', () => {
  const gs = {
    markets: {
      list: ['jp', 'de'],
      results: {
        jp: {
          keywords: [
            {
              keyword: 'ガントチャート',
              source: 'gantt chart',
              volume: 18000,
              monthly: Array.from({ length: 12 }, (_, i) => ({
                month: `2026-${String(i + 1).padStart(2, '0')}`,
                volume: i < 3 ? 10000 : 18000,
              })),
            },
            {
              keyword: 'ガントチャート 無料',
              source: 'free gantt chart',
              volume: 4000,
              monthly: [],
            },
          ],
          rivals: [
            { name: 'Nimbus', domain: 'nimbus.example', keywords: 1240 },
          ],
        },
        de: {
          keywords: [
            {
              keyword: 'gantt diagramm',
              source: 'gantt chart',
              volume: 9000,
              monthly: [],
            },
          ],
          rivals: [],
        },
      },
    },
  };
  const site = {
    pages: [
      { url: 'https://acme.example/de/gantt', title: 'Gantt-Diagramm' },
      { url: 'https://acme.example/docs', title: 'Docs' },
    ],
  };
  const out = sources.otherMarketSignals({ gs, site, V });
  expect(out.map((s) => s.key)).toEqual(['other-market:jp']);
  expect(keys(out[0].growth)).toEqual([
    'monthlySearchesTotal',
    'yearChange',
    'pagesInLanguage',
    'rivalKeywordsThere',
  ]);
  expect(out[0].growth.figures[0].value).toBe(22000);
  expect(
    sources.pagesIn(
      [
        { url: 'https://ja.acme.example/' },
        { url: 'https://acme.example/jp/docs' },
        { url: 'https://acme.example/', title: 'プロジェクト管理' },
      ],
      { language: 'ja' },
    ),
  ).toHaveLength(3);
});

test('site search: terms searched often with no page; GA4 without site search reports no rows', () => {
  const gs = {
    siteSearch: {
      status: 'ok',
      rows: [
        { term: 'gantt export', searches: 48, users: 31 },
        { term: 'pricing', searches: 90, users: 70 },
        { term: 'rare', searches: 2, users: 2 },
      ],
    },
  };
  const site = {
    pages: [{ url: 'https://acme.example/pricing', title: 'Pricing' }],
  };
  const out = sources.siteSearchSignals({ gs, site, identity: null, V });
  expect(out.map((s) => s.key)).toEqual(['site-search:ganttexport']);
  expect(keys(out[0].growth)).toEqual([
    'siteSearches28',
    'searchers28',
    'matchingPages',
  ]);
  expect(
    sources.siteSearchSignals({
      gs: { siteSearch: { status: 'not-enabled', rows: [] } },
      site,
      V,
    }),
  ).toEqual([]);
});

test('people also ask: unanswered questions of a keyword group, with its keywords’ searches', () => {
  const gs = {
    paa: {
      keywords: [
        {
          keyword: 'gantt chart',
          volume: 5400,
          group: 'g1',
          groupName: 'Gantt',
          questions: [
            'How do I make a Gantt chart?',
            'What is a Gantt chart used for?',
            'Is a Gantt chart agile?',
          ],
        },
        {
          keyword: 'gantt chart template',
          volume: 1900,
          group: 'g1',
          groupName: 'Gantt',
          questions: [
            'Is a Gantt chart agile?',
            'Where can I get a free Gantt chart template?',
          ],
        },
      ],
    },
  };
  const [s] = sources.peopleAlsoAskSignals({ gs, site: { pages: [] }, V });
  expect(s.key).toBe('people-also-ask:g1');
  expect(s.growth.figures[0].value).toBe(4);
  expect(s.growth.figures[1].value).toBe(7300);
});

test('link gap: sites linking to at least two competitors and not to us, strongest first', () => {
  const gs = {
    linkGap: {
      own: 'acme.example',
      competitors: [
        { name: 'Nimbus', domain: 'nimbus.example' },
        { name: 'Flowboard', domain: 'flowboard.example' },
      ],
      items: [
        {
          domain: 'weak.example',
          rank: 20,
          competitors: ['Nimbus', 'Flowboard'],
        },
        {
          domain: 'strong.example',
          rank: 71,
          competitors: ['Nimbus', 'Flowboard'],
        },
        {
          domain: 'mid.example',
          rank: 45,
          competitors: ['Nimbus', 'Flowboard'],
        },
        { domain: 'one.example', rank: 90, competitors: ['Nimbus'] },
      ],
    },
  };
  const [s] = sources.linkGapSignals({ gs, V });
  expect(s.growth.kind).toBe('link-gap');
  expect(s.growth.category).toBe('competitor-gaps');
  expect(s.growth.evidence.rows.map((r) => r.domain)).toEqual([
    'strong.example',
    'mid.example',
    'weak.example',
  ]);
  expect(s.action).toBe('distribute');
});

test('discovery: only phrases not followed whose words are in the titles, and groups of posts that exist', () => {
  const now = NOW,
    { discussions, forum } = material({
      rd: {
        topicPosts: {
          a: {
            id: 'a',
            title: 'Anyone using an AI status report?',
            postedAt: '2026-11-02',
            topics: ['project management'],
          },
        },
      },
      hn: null,
      yt: null,
      cm: {
        topics: {
          7: {
            id: 7,
            title: 'Client view?',
            createdAt: '2026-11-01T00:00:00Z',
          },
        },
      },
      now,
    });
  expect(discussions.map((d) => d.id)).toEqual(['reddit:a']);
  expect(forum.map((d) => d.id)).toEqual(['forum:7']);
  const out = cleanDiscovery(
    {
      newTopics: [
        {
          phrase: 'AI status report',
          from: 'Project Management',
          terms: ['ai status report', 'never there'],
          reason: 'up',
        },
        {
          phrase: 'project management',
          from: 'project management',
          terms: ['project'],
        },
        { phrase: 'Ghost', from: 'project management', terms: ['ghost'] },
      ],
      questions: [
        {
          theme: 'Client view',
          query: 'client view',
          ids: ['forum:7', 'reddit:a', 'made:up'],
        },
        { theme: 'One', query: 'x', ids: ['forum:7'] },
      ],
    },
    { followed: ['project management'], discussions, forum },
  );
  expect(out.newTopics).toEqual([
    {
      phrase: 'AI status report',
      from: 'project management',
      terms: ['ai status report'],
      reason: 'up',
    },
  ]);
  expect(out.questions).toEqual([
    {
      theme: 'Client view',
      query: 'client view',
      ids: ['forum:7', 'reddit:a'],
    },
  ]);
});

test('growth sources: main keywords by searches, and Google Ads takes only keywords it accepts', () => {
  const ks = {
    version: 2,
    items: [
      { keyword: 'gantt chart', group: 'g', metrics: { volume: 5400 } },
      { keyword: 'kanban', group: 'g', metrics: { volume: 9000 } },
      { keyword: 'Gantt Chart', group: 'h', metrics: { volume: 1 } },
    ],
    groupNames: { g: 'Planning' },
  };
  expect(mainKeywords(ks, 5).map((k) => k.keyword)).toEqual([
    'kanban',
    'gantt chart',
  ]);
  expect(ADS_KEYWORD('ガントチャート 無料')).toBe(true);
  expect(ADS_KEYWORD('a, b')).toBe(false);
  const spec = marketVolume.specification({
    market: 'jp',
    keywords: ['ガントチャート', 'bad!', 'ガントチャート'],
  });
  expect(spec.request).toEqual({
    keywords: ['ガントチャート'],
    location_code: 2392,
    language_code: 'ja',
  });
  expect(spec.taskGet).toBe('keywords_data/google_ads/search_volume/task_get');
  expect(spec.estimatedUsd).toBe(0.06);
  const parsed = marketVolume.result({
    status_code: 20000,
    cost: 0.06,
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            keyword: 'ガントチャート',
            search_volume: 18100,
            monthly_searches: [{ year: 2026, month: 10, search_volume: 18100 }],
          },
        ],
      },
    ],
  });
  expect(parsed.result.items).toEqual([
    {
      keyword: 'ガントチャート',
      volume: 18100,
      monthly: [{ month: '2026-10', volume: 18100 }],
    },
  ]);
});

test('paid rules say what they can cost a month at most', () => {
  const cost = (id) =>
    ruleCost(
      RULES.find((x) => x.id === id),
      (k) => V(id, k),
    );
  expect(cost('other-market')).toBe(0.45);
  expect(cost('people-also-ask')).toBe(0.04);
  expect(cost('link-gap')).toBe(0.08);
  expect(cost('topic-rise')).toBe(0.02);
  expect(cost('topic-new')).toBe(0.01);
  expect(RULES.find((x) => x.id === 'site-search').cost).toBeUndefined();
  // The catalog is plain data: pages and tests copy it as it is.
  expect(() => structuredClone(RULES)).not.toThrow();
});

/** A GrowthSources over an in-memory nrSnapshots, a GA4 stub and no verified DataForSEO (so nothing paid runs). */
function service(ga4Rows) {
  const rows = [];
  let seq = 1;
  const repo = {
    findOne: async ({ filter }) => {
      const r = rows.find((x) => x.key === filter.key);
      return r ? { id: r.id, get: (k) => structuredClone(r[k]) } : null;
    },
    create: async ({ values }) =>
      rows.push({ id: seq++, ...structuredClone(values) }),
    update: async ({ filterByTk, values }) =>
      Object.assign(
        rows.find((x) => x.id === filterByTk),
        structuredClone(values),
      ),
  };
  const asked = [];
  const gs = new GrowthSources({
    db: { getRepository: () => repo },
    project: async () => ({ analyticsPropertyId: '123' }),
    dataViews: {
      ga4: {
        post: async (id, property, method, body) => (
          asked.push(body),
          { rows: ga4Rows }
        ),
      },
    },
    analysisRules: { config: async () => ({}) },
  });
  gs.d4s = { config: () => null };
  return { gs, asked };
}

test('growth sources: site search read from GA4 for free, the markets chosen by the team, nothing paid without DataForSEO', async () => {
  const off = service([]);
  expect((await off.gs.update('1')).siteSearch.status).toBe('not-enabled');
  expect((await off.gs.view('1')).siteSearch).toMatchObject({
    status: 'not-enabled',
    terms: 0,
  });
  const on = service([
    {
      dimensionValues: [{ value: 'merge contacts' }],
      metricValues: [{ value: '73' }, { value: '46' }],
    },
    {
      dimensionValues: [{ value: '(not set)' }],
      metricValues: [{ value: '9' }, { value: '9' }],
    },
  ]);
  const s = await on.gs.update('1');
  expect(s.siteSearch.rows).toEqual([
    { term: 'merge contacts', searches: 73, users: 46 },
  ]);
  expect(on.asked[0].dimensionFilter.filter.stringFilter.value).toBe(
    'view_search_results',
  );
  // Without a verified DataForSEO connection the paid steps are not tried.
  expect(Object.keys(s).sort()).toEqual(['siteSearch']);
  // The team's markets replace the AI's (at most five, known ones only); an empty list hands the choice back to the AI.
  const view = await on.gs.setMarkets('1', {
    markets: ['de', 'jp', 'xx', 'jp', 'fr', 'es', 'br', 'kr'],
  });
  expect(view.markets).toMatchObject({
    list: ['de', 'jp', 'fr', 'es', 'br'],
    by: 'person',
  });
  expect(view.markets.options).toHaveLength(12);
  expect((await on.gs.setMarkets('1', { markets: [] })).markets).toMatchObject({
    list: [],
    by: 'ai',
  });
});
