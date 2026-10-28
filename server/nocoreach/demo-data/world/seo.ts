import {
  DAY,
  WorldUnsupported,
  json,
  list,
  names,
  object,
  slice,
  text,
  type Json,
} from './kit.js';
import { LIGHTHOUSE, TRENDS } from './script/market.js';
import { TOPIC_WORDS } from './script/search.js';
import type { Research, AiQuestion } from './script/types.js';
import type { World } from './world.js';

type Keyword = Research & { topic: string };

const iso = (t: number) => new Date(t).toISOString();
const dfsTime = (t: number) =>
  iso(t)
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' +00:00');

function envelope(
  world: World,
  operation: string,
  result: unknown[],
  cost = 0.0101,
): Response {
  return json({
    version: '0.1.20261014',
    status_code: 20000,
    status_message: 'Ok.',
    time: '0.4120 sec.',
    cost,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: `${new Date(world.now).toISOString().slice(0, 10).replaceAll('-', '')}-${world.seeded.hash(`${operation}:${world.now}`).slice(0, 20)}`,
        status_code: 20000,
        status_message: 'Ok.',
        time: '0.3870 sec.',
        cost,
        result_count: result.length,
        path: ['v3', ...operation.split('/')],
        result,
      },
    ],
  });
}

/** Monthly searches for the last twelve months, newest last, following the keyword's season. */
function monthly(
  world: World,
  k: Pick<Research, 'keyword' | 'volume' | 'season'>,
) {
  return Array.from({ length: 12 }, (_, j) => {
    const d = new Date(world.now);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 12 + j);
    const season = k.season?.[d.getUTCMonth()] ?? 1;
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      search_volume: Math.round(
        k.volume * season * world.seeded.jitter(`vol:${k.keyword}:${j}`, 0.08),
      ),
    };
  }).reverse();
}

function keywordInfo(world: World, k: Keyword) {
  const competition = Math.min(1, k.difficulty / 90 + 0.05);
  return {
    se_type: 'google',
    keyword: k.keyword,
    location_code: null,
    language_code: world.lang === 'zh' ? 'zh-CN' : 'en',
    keyword_info: {
      last_updated_time: dfsTime(world.now - 3 * DAY),
      competition: Number(competition.toFixed(2)),
      competition_level:
        competition > 0.66 ? 'HIGH' : competition > 0.33 ? 'MEDIUM' : 'LOW',
      cpc: k.cpc,
      search_volume: k.volume,
      low_top_of_page_bid: Number((k.cpc * 0.45).toFixed(2)),
      high_top_of_page_bid: Number((k.cpc * 1.9).toFixed(2)),
      search_volume_trend: {
        monthly: Math.round(
          (world.seeded.unit(`trend:${k.keyword}`) - 0.4) * 30,
        ),
        quarterly: Math.round(
          (world.seeded.unit(`trendq:${k.keyword}`) - 0.4) * 60,
        ),
        yearly: Math.round(
          (world.seeded.unit(`trendy:${k.keyword}`) - 0.3) * 90,
        ),
      },
      monthly_searches: monthly(world, k),
    },
    keyword_properties: {
      core_keyword: null,
      keyword_difficulty: k.difficulty,
      detected_language: world.lang === 'zh' ? 'zh' : 'en',
      is_another_language: false,
    },
    search_intent_info: {
      se_type: 'google',
      main_intent: k.intent,
      foreign_intent: k.intent === 'commercial' ? ['informational'] : null,
    },
    avg_backlinks_info: {
      backlinks: 40 + world.seeded.int(`bl:${k.keyword}`, 600),
      referring_domains: 12 + world.seeded.int(`rd:${k.keyword}`, 140),
      rank: 120 + world.seeded.int(`rk:${k.keyword}`, 300),
    },
    serp_info: {
      check_url: `https://www.google.com/search?q=${encodeURIComponent(k.keyword)}`,
      serp_item_types: [
        'organic',
        'people_also_ask',
        ...(k.intent === 'commercial' ? ['paid'] : []),
        ...(k.topic === 'ai' ? ['ai_overview'] : []),
      ],
      se_results_count:
        1_000_000 + world.seeded.int(`results:${k.keyword}`, 90_000_000),
    },
  };
}

/** Keywords around a seed: the seed's topic first, then words sharing its terms. */
function around(world: World, seed: string): Keyword[] {
  const lower = seed.toLowerCase();
  const topics = Object.entries(TOPIC_WORDS)
    .filter(([, words]) => words.some((w) => lower.includes(w)))
    .map(([topic]) => topic);
  const tokens = lower.split(/\s+/).filter((w) => w.length > 1);
  const scored = world.research
    .map((k) => {
      const kw = k.keyword.toLowerCase();
      const score =
        (topics.includes(k.topic) ? 2 : 0) +
        tokens.filter((t) => kw.includes(t)).length +
        (kw.includes(lower) ? 3 : 0);
      return { k, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.k.volume - a.k.volume)
    .map((x) => x.k);
  // A seed outside the script still gets plausible neighbours: its own variants.
  if (scored.length < 3) {
    const suffixes =
      world.lang === 'zh'
        ? ['教程', '开源', '工具', '对比', '价格', '模板']
        : [
            'tutorial',
            'open source',
            'tools',
            'comparison',
            'pricing',
            'template',
          ];
    for (const [i, suffix] of suffixes.entries())
      scored.push({
        keyword: `${seed} ${suffix}`,
        volume: 90 + world.seeded.int(`v:${seed}:${i}`, 1400),
        difficulty: 12 + world.seeded.int(`d:${seed}:${i}`, 50),
        cpc: Number((0.4 + world.seeded.unit(`c:${seed}:${i}`) * 4).toFixed(2)),
        intent: i % 2 ? 'commercial' : 'informational',
        topic: 'other',
      });
  }
  const seen = new Set<string>();
  return scored.filter(
    (k) =>
      !seen.has(k.keyword.toLowerCase()) && seen.add(k.keyword.toLowerCase()),
  );
}

function find(world: World, keyword: string): Keyword {
  return (
    world.research.find(
      (k) => k.keyword.toLowerCase() === keyword.toLowerCase(),
    ) ?? {
      keyword,
      volume: 70 + world.seeded.int(`v:${keyword}`, 900),
      difficulty: 10 + world.seeded.int(`d:${keyword}`, 55),
      cpc: Number((0.3 + world.seeded.unit(`c:${keyword}`) * 3).toFixed(2)),
      intent: 'informational',
      topic: 'other',
    }
  );
}

/** Estimated organic traffic of a domain from its ranking keywords. */
function organic(world: World, target: string, months = 0) {
  const own = target.replace(/^www\./, '') === world.project.domain;
  const rival = world.competitors.find((c) => c.domain === target);
  const size = own
    ? 1
    : rival
      ? rival.size
      : 0.05 + world.seeded.unit(`size:${target}`) * 0.4;
  const ranked = world.research.filter((k) => k.position);
  const etv = ranked.reduce(
    (sum, k) =>
      sum +
      k.volume * (k.position! <= 3 ? 0.18 : k.position! <= 10 ? 0.04 : 0.006),
    0,
  );
  // Monthly growth differs by site: the demo site grows steadily, StackMeadow fast, Gridline is flat to falling.
  const pace = own
    ? 0.033
    : ((
        {
          'nimbus.example': 0.012,
          'tasks.example': 0.055,
          'sales.example': -0.008,
        } as Record<string, number>
      )[target] ?? 0.01);
  const past = (1 + pace) ** -months;
  const count = Math.round((ranked.length * 38 + 420) * size * past);
  return {
    etv: Math.round(etv * size * past * 1.6),
    count,
    pos_1: Math.round(count * 0.03),
    pos_2_3: Math.round(count * 0.06),
    pos_4_10: Math.round(count * 0.17),
    pos_11_20: Math.round(count * 0.21),
    pos_21_30: Math.round(count * 0.16),
    is_new: Math.round(count * 0.05),
    is_up: Math.round(count * 0.11),
    is_down: Math.round(count * 0.08),
    is_lost: Math.round(count * 0.04),
  };
}

function serpItem(
  domain: string,
  path: string,
  title: string,
  rank: number,
  etv: number,
) {
  return {
    type: 'organic',
    rank_group: rank,
    rank_absolute: rank,
    domain,
    url: `https://${domain}${path}`,
    title,
    description: '',
    etv,
    breadcrumb: `https://${domain}${path}`,
  };
}

/** The organic results for a keyword: the demo site where it ranks, the competitors and other sites around it. */
function serp(world: World, keyword: string, depth: number) {
  const k = find(world, keyword);
  const ownPage = k.path ? world.page(k.path) : undefined;
  const others = [
    'wikipedia.org',
    'medium.com',
    'g2.example',
    'capterra.example',
    'stackoverflow.com',
    'youtube.com',
    'dev.to',
    'zhihu.com',
    'csdn.net',
    'github.com',
  ];
  const rows = [];
  for (let rank = 1; rank <= Math.min(depth, 100); rank++) {
    if (k.position && Math.round(k.position) === rank && ownPage) {
      rows.push(
        serpItem(
          world.project.domain,
          ownPage.path,
          world.text(ownPage.title),
          rank,
          Math.round(k.volume * 0.05),
        ),
      );
      continue;
    }
    const rival =
      world.competitors[
        (rank + world.seeded.int(`serp:${keyword}`, 3)) %
          world.competitors.length
      ];
    if (rank % 4 === 2 && rival) {
      const page = rival.pages[rank % rival.pages.length];
      rows.push(
        serpItem(
          rival.domain,
          page[0],
          world.text(page[1]),
          rank,
          Math.round(k.volume * 0.02),
        ),
      );
      continue;
    }
    const site =
      others[
        (rank + world.seeded.int(`o:${keyword}`, others.length)) % others.length
      ];
    rows.push(
      serpItem(
        site,
        `/${encodeURIComponent(keyword.replaceAll(' ', '-'))}-${rank}`,
        `${keyword} — ${site}`,
        rank,
        Math.round(k.volume * 0.01),
      ),
    );
  }
  return rows;
}

function redditSerp(world: World, keyword: string) {
  const term =
    keyword.match(/"([^"]+)"/)?.[1] ??
    keyword.replace('site:reddit.com', '').trim();
  return world.reddit.map((thread, i) => ({
    type: 'organic',
    rank_group: i + 1,
    rank_absolute: i + 1,
    domain: 'www.reddit.com',
    url: `https://www.reddit.com/r/${thread.subreddit}/comments/${world.seeded.hash(`rd:${i}`).slice(0, 6)}/${encodeURIComponent(world.text(thread.title).slice(0, 40).replaceAll(' ', '_'))}/`,
    title: `${world.text(thread.title)} : r/${thread.subreddit}`,
    description: world.text(thread.description),
    timestamp: dfsTime(
      world.now -
        thread.age * DAY -
        world.seeded.int(`rdh:${i}`, 20) * 3_600_000,
    ),
    etv: thread.traffic,
    // Search finds a thread by the project's name only when it is mentioned.
    keyword_match: term,
  }));
}

function trends(world: World, b: Json) {
  const words = names(b.keywords).slice(0, 5);
  const weeks = 52;
  const series = words.map((w) => {
    const term = TRENDS.find(
      (x) => world.text(x.term).toLowerCase() === w.toLowerCase(),
    );
    const base = term?.base ?? 20 + world.seeded.int(`tb:${w}`, 50);
    const slope = term?.slope ?? (world.seeded.unit(`ts:${w}`) - 0.4) * 0.6;
    return Array.from({ length: weeks }, (_, i) => {
      const ago = weeks - 1 - i;
      const month = new Date(world.now - ago * 7 * DAY).getUTCMonth();
      const burst = term?.bursts?.find(([at]) => at === ago)?.[1] ?? 1;
      return (
        base *
        (term?.season?.[month] ?? 1) *
        (1 + (slope * (i - weeks)) / 100) *
        burst *
        world.seeded.jitter(`tw:${w}:${ago}`, 0.08)
      );
    });
  });
  const peak = Math.max(1, ...series.flat());
  const data = Array.from({ length: weeks }, (_, i) => {
    const from = Date.parse(
      new Date(world.now - (weeks - i) * 7 * DAY).toISOString().slice(0, 10),
    );
    return {
      date_from: iso(from).slice(0, 10),
      date_to: iso(from + 6 * DAY).slice(0, 10),
      timestamp: from / 1000,
      missing_data: false,
      is_partial: i === weeks - 1,
      values: series.map((s) => Math.round((s[i] / peak) * 100)),
    };
  });
  const related = words.length
    ? around(world, words[0]).filter(
        (k) => k.keyword.toLowerCase() !== words[0].toLowerCase(),
      )
    : [];
  const all = [
    {
      type: 'google_trends_graph',
      keywords: words,
      data,
      averages: series.map((s) =>
        Math.round((s.reduce((a, b) => a + b, 0) / s.length / peak) * 100),
      ),
    },
    {
      type: 'google_trends_map',
      keywords: words,
      data: world.analytics.regions.slice(0, 6).map((r, i) => ({
        geo_id: r.countryId,
        geo_name: r.country,
        values: words.map((_, j) => Math.max(5, 100 - i * 14 - j * 6)),
      })),
    },
    {
      type: 'google_trends_queries_list',
      keywords: words,
      data: {
        top: related
          .slice(0, 8)
          .map((k, i) => ({ query: k.keyword, value: 100 - i * 11 })),
        rising: related
          .filter((k) => k.season?.[11] && k.season[11] > 1.1)
          .concat(related.slice(8, 12))
          .slice(0, 6)
          .map((k, i) => ({
            query: k.keyword,
            value: i === 0 ? 4850 : 350 - i * 50,
          })),
      },
    },
  ];
  const requested = names(b.item_types);
  return {
    datetime: dfsTime(world.now),
    keywords: words,
    check_url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(words.join(','))}`,
    items: all.filter((x) => !requested.length || requested.includes(x.type)),
  };
}

function lighthouse(world: World, b: Json) {
  const strategy =
    text(b.for_mobile) === 'true' ||
    b.for_mobile === true ||
    text(b.strategy) === 'mobile'
      ? 'mobile'
      : 'desktop';
  const m = LIGHTHOUSE[strategy];
  const audit = (id: string, title: string, value: string, score: number) => ({
    id,
    title,
    displayValue: value,
    score,
    scoreDisplayMode: 'numeric',
  });
  const audits: Json = {
    'largest-contentful-paint': audit(
      'largest-contentful-paint',
      'Largest Contentful Paint',
      `${m.lcp} s`,
      m.lcp < 2.5 ? 0.9 : m.lcp < 4 ? 0.55 : 0.2,
    ),
    'cumulative-layout-shift': audit(
      'cumulative-layout-shift',
      'Cumulative Layout Shift',
      String(m.cls),
      m.cls < 0.1 ? 0.95 : 0.6,
    ),
    'total-blocking-time': audit(
      'total-blocking-time',
      'Total Blocking Time',
      `${m.tbt} ms`,
      m.tbt < 200 ? 0.9 : 0.45,
    ),
    'first-contentful-paint': audit(
      'first-contentful-paint',
      'First Contentful Paint',
      `${m.fcp} s`,
      m.fcp < 1.8 ? 0.92 : 0.6,
    ),
    'speed-index': audit(
      'speed-index',
      'Speed Index',
      `${m.si} s`,
      m.si < 3.4 ? 0.88 : 0.5,
    ),
    interactive: audit(
      'interactive',
      'Time to Interactive',
      `${m.tti} s`,
      m.tti < 3.8 ? 0.85 : 0.4,
    ),
    'server-response-time': audit(
      'server-response-time',
      'Initial server response time was short',
      `Root document took ${m.ttfb} ms`,
      m.ttfb < 600 ? 0.9 : 0.5,
    ),
    'render-blocking-resources': {
      id: 'render-blocking-resources',
      title: 'Eliminate render-blocking resources',
      description: 'Resources are blocking the first paint of your page.',
      displayValue: `Potential savings of ${strategy === 'mobile' ? '1,350' : '420'} ms`,
      score: strategy === 'mobile' ? 0.28 : 0.71,
      scoreDisplayMode: 'metricSavings',
      details: {
        overallSavingsMs: strategy === 'mobile' ? 1350 : 420,
        overallSavingsBytes: 58_000,
      },
    },
    'unused-javascript': {
      id: 'unused-javascript',
      title: 'Reduce unused JavaScript',
      displayValue: 'Potential savings of 312 KiB',
      score: 0.35,
      scoreDisplayMode: 'metricSavings',
      details: {
        overallSavingsMs: strategy === 'mobile' ? 900 : 260,
        overallSavingsBytes: 319_000,
      },
    },
    'image-alt': {
      id: 'image-alt',
      title: 'Image elements do not have [alt] attributes',
      score: 0,
      scoreDisplayMode: 'binary',
    },
    'color-contrast': {
      id: 'color-contrast',
      title:
        'Background and foreground colors do not have a sufficient contrast ratio.',
      score: 0,
      scoreDisplayMode: 'binary',
    },
    'meta-description': {
      id: 'meta-description',
      title: 'Document has a meta description',
      score: 1,
      scoreDisplayMode: 'binary',
    },
  };
  const categories = Object.fromEntries(
    (
      [
        [
          'performance',
          m.performance,
          [
            'largest-contentful-paint',
            'total-blocking-time',
            'render-blocking-resources',
            'unused-javascript',
          ],
        ],
        ['accessibility', m.accessibility, ['image-alt', 'color-contrast']],
        ['best-practices', m.bestPractices, ['server-response-time']],
        ['seo', m.seo, ['meta-description']],
      ] as const
    ).map(([id, score, refs]) => [
      id,
      {
        id,
        title: id,
        score,
        auditRefs: refs.map((r) => ({ id: r, weight: 1 })),
      },
    ]),
  );
  return {
    requestedUrl: text(b.url, world.origin),
    finalUrl: text(b.url, world.origin),
    fetchTime: iso(world.now),
    lighthouseVersion: '12.2.1',
    categories,
    audits,
  };
}

function llmResponse(world: World, model: string, b: Json) {
  const prompt = text(b.user_prompt);
  const match =
    world.aiQuestions.find((q) => world.text(q.question) === prompt) ??
    world.aiQuestions.find(
      (q) =>
        prompt.toLowerCase().includes(world.site.name.toLowerCase()) &&
        q.cites.length,
    ) ??
    world.aiQuestions[0];
  const cite = (path: string) => {
    const page = world.page(path);
    return {
      type: 'url_citation',
      url: world.origin + path,
      title: page ? world.text(page.title) : path,
    };
  };
  const rival = match.rival
    ? world.competitors.find((c) => c.domain === match.rival)
    : undefined;
  // Models differ a little: some leave the demo site out.
  const omits =
    model === 'gemini' && !match.cites.includes('/docs/permissions');
  return {
    model_name: text(b.model_name, MODEL_NAMES[model]),
    web_search: true,
    fan_out_queries: [
      prompt,
      `${world.site.name} ${world.lang === 'zh' ? '评测' : 'review'}`,
    ],
    items: [
      {
        type: 'message',
        sections: [
          {
            type: 'text',
            text:
              omits && rival
                ? world.text(match.answer).replace(world.site.name, rival.name)
                : world.text(match.answer),
            annotations: [
              ...(omits ? [] : match.cites.map(cite)),
              ...(rival
                ? [
                    {
                      type: 'url_citation',
                      url: `https://${rival.domain}/`,
                      title: rival.name,
                    },
                  ]
                : []),
            ],
          },
        ],
      },
    ],
  };
}
// The catalog lists several models a provider offers; the newest of each family is the one asked.
const MODEL_CATALOG: Record<string, string[]> = {
  chat_gpt: ['gpt-5.6-luna', 'gpt-5.1', 'gpt-4.1-mini'],
  claude: ['claude-sonnet-4-5', 'claude-sonnet-4', 'claude-haiku-4-5'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  perplexity: ['sonar-reasoning-pro', 'sonar-pro', 'sonar'],
};
const MODEL_NAMES = Object.fromEntries(
  Object.entries(MODEL_CATALOG).map(([k, v]) => [k, v[0]]),
);

function mentions(world: World, b: Json) {
  const targets = list(b.target).map(object);
  const gap = targets.some((t) => t.search_filter === 'exclude');
  const include = targets.find((t) => t.search_filter !== 'exclude');
  const term = text(
    include?.keyword ?? include?.domain,
    world.site.name,
  ).toLowerCase();
  const rival = world.competitors.find(
    (c) => term.includes(c.name.toLowerCase()) || term.includes(c.domain),
  );
  // A topic search finds the questions asked under that topic.
  const topical = world.aiQuestions.filter((q) => q.topics.includes(term));
  if (topical.length && !gap) return questionRows(world, topical, b);
  const questions = world.aiQuestions.filter((q) =>
    gap
      ? q.rival && (!rival || q.rival === rival.domain) && !q.cites.length
      : rival
        ? q.rival === rival.domain
        : q.cites.length > 0 ||
          world.text(q.answer).toLowerCase().includes(term),
  );
  const pool =
    gap && !questions.length
      ? world.aiQuestions.filter((q) => q.rival)
      : questions;
  return questionRows(world, pool, b);
}

function questionRows(world: World, pool: readonly AiQuestion[], b: Json) {
  return pool.map((q, i) => ({
    id: world.seeded.hash(`q:${world.text(q.question)}`).slice(0, 16),
    question: world.text(q.question),
    answer: world.text(q.answer),
    ai_search_volume: q.volume,
    first_response_at: dfsTime(world.now - (40 + i * 3) * DAY),
    last_response_at: dfsTime(world.now - (1 + (i % 6)) * DAY),
    platform: text(b.platform, 'google'),
    sources: [
      ...q.cites.map((path) => ({
        url: world.origin + path,
        title: world.text(world.page(path)?.title ?? { zh: path, en: path }),
        domain: world.project.domain,
      })),
      ...(q.rival
        ? [
            {
              url: `https://${q.rival}/`,
              title:
                world.competitors.find((c) => c.domain === q.rival)?.name ??
                q.rival,
              domain: q.rival,
            },
          ]
        : []),
    ],
    brand_entities: [
      ...(q.cites.length
        ? [{ title: world.site.name, category: 'software' }]
        : []),
      ...(q.rival
        ? [
            {
              title:
                world.competitors.find((c) => c.domain === q.rival)?.name ??
                q.rival,
              category: 'software',
            },
          ]
        : []),
    ],
  }));
}

export function dataforseo(
  world: World,
  u: URL,
  init: RequestInit,
): Response | undefined {
  if (u.hostname !== 'api.dataforseo.com') return undefined;
  const operation = u.pathname.replace(/^\/v3\//, '').replace(/\/$/, '');
  let b: Json = {};
  if (typeof init.body === 'string') {
    const parsed: unknown = JSON.parse(init.body);
    if (!Array.isArray(parsed) || parsed.length !== 1)
      throw new WorldUnsupported('a DataForSEO request with several tasks');
    b = object(parsed[0]);
  }
  const wrap = (result: unknown[], cost?: number) =>
    envelope(world, operation, result, cost);
  const page = (rows: unknown[], extra: Json = {}) =>
    wrap([
      {
        se_type: 'google',
        location_code: b.location_code ?? null,
        language_code: b.language_code ?? null,
        total_count: rows.length,
        items_count: slice(rows, b.offset, b.limit, 100).length,
        items: slice(rows, b.offset, b.limit, 100),
        ...extra,
      },
    ]);
  if (operation === 'appendix/user_data')
    return wrap(
      [
        {
          login: `seo@${world.project.domain}`,
          timezone: 'UTC',
          money: { total: 50, balance: 38.42, limits: {} },
          rates: {},
        },
      ],
      0,
    );
  if (operation === 'dataforseo_labs/id_list') return wrap([], 0);
  const models = operation.match(
    /^ai_optimization\/(chat_gpt|claude|gemini|perplexity)\/llm_responses\/(models|live)$/,
  );
  if (models) {
    if (models[2] === 'models')
      return wrap(
        MODEL_CATALOG[models[1]].map((model_name) => ({ model_name })),
        0,
      );
    return wrap([llmResponse(world, models[1], b)], 0.02);
  }
  if (operation === 'on_page/lighthouse/live/json')
    return wrap([lighthouse(world, b)], 0.00425);
  if (operation === 'keywords_data/google_trends/explore/live')
    return wrap([trends(world, b)], 0.009);
  if (operation === 'keywords_data/google_ads/keywords_for_keywords/live')
    return wrap(
      names(b.keywords)
        .flatMap((w) => around(world, w).slice(0, 30))
        .map((k) => {
          const info = keywordInfo(world, k).keyword_info;
          return {
            keyword: k.keyword,
            ...info,
            competition: info.competition_level,
            competition_index: Math.round(info.competition * 100),
            keyword_annotations: { concepts: [] },
          };
        }),
      0.05,
    );
  if (operation.startsWith('ai_optimization/llm_mentions/')) {
    const platform = text(b.platform, 'google');
    const found = mentions(world, b);
    if (operation === 'ai_optimization/llm_mentions/aggregated_metrics/live')
      return wrap(
        [
          {
            total: {
              platform: [
                {
                  key: platform,
                  mentions:
                    found.length * 9 + world.seeded.int(`m:${platform}`, 12),
                  ai_search_volume: found.reduce(
                    (n, q) => n + q.ai_search_volume,
                    0,
                  ),
                },
              ],
            },
          },
        ],
        0.1,
      );
    if (
      operation === 'ai_optimization/llm_mentions/cross_aggregated_metrics/live'
    )
      return page(
        list(b.targets).map((v) => {
          const key = text(object(v).aggregation_key);
          const rival = world.competitors.find(
            (c) => c.name === key || c.domain === key,
          );
          return {
            key,
            platform: [
              {
                key: platform,
                mentions: Math.round(
                  (rival ? rival.size * 30 : 41) *
                    world.seeded.jitter(`cm:${key}`, 0.1),
                ),
              },
            ],
          };
        }),
      );
    if (operation === 'ai_optimization/llm_mentions/search/live')
      return page(found);
    return undefined;
  }
  if (/^serp\/google\/organic\/live\/(advanced|regular)$/.test(operation)) {
    const keyword = text(b.keyword);
    const rows = keyword.includes('site:reddit.com')
      ? redditSerp(world, keyword)
      : serp(world, keyword, Number(b.depth ?? 10));
    return wrap(
      [
        {
          keyword,
          type: 'organic',
          se_domain: 'google.com',
          location_code: b.location_code,
          language_code: b.language_code,
          check_url: `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
          datetime: dfsTime(world.now),
          se_results_count: 2_400_000,
          items_count: rows.length,
          items: rows,
        },
      ],
      0.002,
    );
  }
  const lab = operation.match(/^dataforseo_labs\/google\/([a-z_]+)\/live$/);
  if (lab) {
    const op = lab[1];
    const target = text(
      b.target,
      text(b.target1, world.project.domain),
    ).replace(/^www\./, '');
    if (op === 'domain_rank_overview')
      return page([
        {
          se_type: 'google',
          target,
          metrics: {
            organic: organic(world, target),
            paid: { etv: 0, count: 0 },
          },
        },
      ]);
    if (op === 'historical_rank_overview')
      return page(
        Array.from({ length: 13 }, (_, i) => {
          const d = new Date(world.now);
          d.setUTCDate(1);
          d.setUTCMonth(d.getUTCMonth() - 12 + i);
          return {
            se_type: 'google',
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            metrics: { organic: organic(world, target, 12 - i) },
          };
        }),
      );
    if (op === 'relevant_pages') {
      const own = target === world.project.domain;
      const rival = world.competitors.find((c) => c.domain === target);
      const rows = own
        ? world
            .pageShares()
            .sort((a, b) => b.share - a.share)
            .map((p) => ({
              page_address: world.origin + p.path,
              metrics: {
                organic: {
                  ...organic(world, target),
                  etv: Math.round(organic(world, target).etv * p.share),
                  count: Math.max(
                    1,
                    Math.round(organic(world, target).count * p.share),
                  ),
                },
              },
            }))
        : (rival?.pages ?? []).map(([path], i) => ({
            page_address: `https://${target}${path}`,
            metrics: {
              organic: {
                etv: Math.round(organic(world, target).etv / (i + 2)),
                count: Math.round(organic(world, target).count / (i + 3)),
              },
            },
          }));
      return page(rows);
    }
    if (
      ['related_keywords', 'keyword_suggestions', 'keyword_ideas'].includes(op)
    ) {
      const seed = text(b.keyword, names(b.keywords)[0] ?? '');
      const rows = around(world, seed).map((k) => keywordInfo(world, k));
      if (op === 'related_keywords')
        return page(
          rows.map((keyword_data, i) => ({
            se_type: 'google',
            keyword_data,
            depth: (i % 3) + 1,
            related_keywords: [],
          })),
          { seed_keyword: seed },
        );
      return page(rows, { seed_keyword: seed });
    }
    if (op === 'keyword_overview')
      return page(
        names(b.keywords).map((w) => keywordInfo(world, find(world, w))),
      );
    if (op === 'ranked_keywords' || op === 'domain_intersection') {
      const own = target === world.project.domain;
      const rival = world.competitors.find((c) => c.domain === target);
      const rows = world.research
        .filter(
          (k) =>
            k.topic !== 'brand' &&
            (op === 'domain_intersection'
              ? !k.position || k.position > 20
              : own
                ? k.position
                : true),
        )
        .map((k, i) => {
          const position = own
            ? k.position!
            : 1 +
              ((i * 7 + world.seeded.int(`rp:${target}:${k.keyword}`, 13)) %
                20);
          const page = own && k.path ? world.page(k.path) : undefined;
          const rp = rival?.pages[i % rival.pages.length];
          const item =
            own && page
              ? serpItem(
                  target,
                  page.path,
                  world.text(page.title),
                  Math.round(position),
                  Math.round(k.volume * 0.04),
                )
              : serpItem(
                  target,
                  rp?.[0] ?? '/',
                  rp ? world.text(rp[1]) : target,
                  Math.round(position),
                  Math.round(k.volume * 0.03),
                );
          return {
            se_type: 'google',
            keyword_data: keywordInfo(world, k),
            ranked_serp_element: {
              se_type: 'google',
              serp_item: item,
              check_url: item.url,
            },
            first_domain_serp_element: item,
            second_domain_serp_element: null,
          };
        })
        .sort(
          (a, b) =>
            b.ranked_serp_element.serp_item.etv -
            a.ranked_serp_element.serp_item.etv,
        );
      return page(
        rows,
        op === 'ranked_keywords'
          ? { target, metrics: { organic: organic(world, target) } }
          : {},
      );
    }
    throw new WorldUnsupported(`DataForSEO Labs ${op}`);
  }
  const backlink = operation.match(/^backlinks\/([a-z_]+)\/live$/);
  if (backlink) {
    const op = backlink[1];
    const target = text(b.target, world.project.domain);
    const links = world.backlinks.map((l) => ({
      ...l,
      firstSeen: l.firstSeen,
      url_from: `https://${l.domain}${l.path}`,
      url_to: world.origin + l.target,
    }));
    const live = links.filter((l) => l.lost === undefined);
    if (op === 'summary')
      return wrap(
        [
          {
            target,
            first_seen: dfsTime(world.now - 1080 * DAY),
            lost_date: null,
            rank: 412,
            backlinks: 18_420,
            backlinks_spam_score: 6,
            crawled_pages: 4_220,
            broken_backlinks: 86,
            broken_pages: 2,
            referring_domains: 1_284,
            referring_domains_nofollow: 233,
            referring_main_domains: 1_101,
            referring_ips: 1_052,
            referring_subnets: 913,
            referring_links_tld: {
              com: 690,
              org: 120,
              io: 96,
              cn: world.lang === 'zh' ? 180 : 22,
              dev: 41,
            },
            referring_links_types: {
              anchor: 16_900,
              image: 1_120,
              canonical: 400,
            },
          },
        ],
        0.02,
      );
    if (op === 'history')
      return wrap(
        Array.from({ length: 12 }, (_, i) => {
          const d = new Date(world.now);
          d.setUTCDate(1);
          d.setUTCMonth(d.getUTCMonth() - 11 + i);
          return {
            type: 'backlinks_history',
            date: dfsTime(d.getTime()),
            rank: 380 + i * 3,
            backlinks: 14_200 + i * 380,
            new_backlinks: 700 + world.seeded.int(`nb:${i}`, 400),
            lost_backlinks: 300 + world.seeded.int(`lb:${i}`, 250),
            referring_domains: 1_020 + i * 24,
            new_referring_domains: 40 + world.seeded.int(`nr:${i}`, 30),
            lost_referring_domains: 12 + world.seeded.int(`lr:${i}`, 15),
          };
        }),
        0.02,
      );
    const rows = links.map((l) => ({
      type: 'backlink',
      domain_from: l.domain,
      domain: l.domain,
      url_from: l.url_from,
      url_to: l.url_to,
      page_address: l.url_to,
      title: world.text(l.title),
      anchor: world.text(l.anchor),
      dofollow: l.dofollow,
      is_lost: l.lost !== undefined,
      lost_date:
        l.lost !== undefined ? dfsTime(world.now - l.lost * DAY) : null,
      is_new: l.firstSeen <= 30,
      rank: l.rank,
      domain_from_rank: l.rank,
      backlink_spam_score:
        l.rank < 10 ? 72 : 2 + world.seeded.int(`spam:${l.domain}`, 12),
      first_seen: dfsTime(world.now - l.firstSeen * DAY),
      last_seen: dfsTime(world.now - (l.lost ?? 1) * DAY),
      backlinks: 1 + world.seeded.int(`bc:${l.domain}`, 30),
      referring_domains: 1,
      date: iso(world.now - l.firstSeen * DAY).slice(0, 10),
      domain_intersection: {
        '1': {
          domain: l.domain,
          backlinks: 2 + world.seeded.int(`di:${l.domain}`, 12),
          rank: l.rank,
        },
      },
    }));
    if (
      op === 'backlinks' ||
      op === 'referring_domains' ||
      op === 'domain_intersection'
    )
      return page(
        op === 'domain_intersection'
          ? rows.filter((_, i) => i % 2 === 0)
          : rows,
      );
    if (op === 'domain_pages_summary') {
      const byPage = new Map<string, number>();
      for (const l of live)
        byPage.set(l.url_to, (byPage.get(l.url_to) ?? 0) + 1);
      return page(
        [...byPage.entries()].map(([url, count]) => ({
          type: 'backlinks_domain_pages_summary',
          url,
          rank: 200 + count * 30,
          backlinks: count * 140,
          referring_domains: count * 12,
          broken_backlinks: 0,
        })),
      );
    }
    throw new WorldUnsupported(`backlinks ${op}`);
  }
  return undefined;
}
