// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { topicKey } from '../../shared/followed-topics.js';
import { growthMarket } from '../../shared/growth-markets.js';
import { findPages } from '../../shared/page-search.js';
import { kit } from './growth-signals.js';
import { answeredBy } from './topic-signals.js';
// Growth points from the first batch of new data (2026-11-10 step 2b, growth-sources.ts): other-language markets,
// what people search on the site and find nothing for, Google's People also ask, and the sites that link to several
// competitors but not to us. Saved state only; the numbers are counted here.

const { text, figure, col, table, growth, signal, n, sum, strengthOf } = kit;
const mean = (list) =>
  list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;

// How a site shows a language: the first segment of the path or the first label of the host (/ja/, ja.example.com,
// /ja-jp/), and for Japanese, Korean and Traditional Chinese the script of the title.
const LANGUAGE_MARKS = {
  ja: ['ja', 'jp'],
  de: ['de'],
  fr: ['fr'],
  es: ['es'],
  pt: ['pt', 'br'],
  ko: ['ko', 'kr'],
  'zh-TW': ['zh-tw', 'tw', 'zh-hant', 'hk'],
  it: ['it'],
  nl: ['nl'],
  id: ['id'],
  vi: ['vi', 'vn'],
};
const SCRIPT = {
  ja: /[぀-ヿ]/,
  ko: /[가-힯]/,
  'zh-TW': /[一-鿿]/,
};
/** The site's pages in a market's language. */
function pagesIn(pages, market) {
  const marks = LANGUAGE_MARKS[market.language] || [
      market.language.toLowerCase(),
    ],
    marked = (seg) =>
      marks.some(
        (m) => seg === m || seg.startsWith(`${m}-`) || seg.startsWith(`${m}_`),
      );
  return (pages || []).filter((p) => {
    let u;
    try {
      u = new URL(String(p.url || ''));
    } catch {
      return false;
    }
    const seg = u.pathname.split('/').filter(Boolean)[0]?.toLowerCase() || '',
      label = u.hostname.split('.')[0].toLowerCase(),
      title = String(p.title || '');
    if (marked(seg) || marked(label)) return true;
    if (market.language === 'zh-TW')
      return SCRIPT['zh-TW'].test(title) && !SCRIPT.ja.test(title);
    return SCRIPT[market.language]?.test(title) || false;
  });
}

/** A keyword's change over the year: its last three months against its first three of the twelve. */
function yearChange(monthly) {
  const v = (monthly || [])
    .map((m) => m.volume)
    .filter((x) => Number.isFinite(x));
  if (v.length < 9) return null;
  const first = mean(v.slice(0, 3)),
    last = mean(v.slice(-3));
  return first > 0 ? (last - first) / first : null;
}

/** Markets where people search for what the product does and the site has no pages in their language. */
function otherMarketSignals({ gs, site, V }) {
  const out = [];
  for (const [mid, r] of Object.entries(gs?.markets?.results || {})) {
    const market = growthMarket(mid);
    if (!market || !(gs.markets.list || []).includes(mid)) continue;
    const rows = (r.keywords || [])
        .filter((k) => (k.volume || 0) > 0)
        .sort((a, b) => b.volume - a.volume),
      total = sum(rows, (k) => k.volume);
    if (!rows.length || total < V('other-market', 'minVolume')) continue;
    if (pagesIn(site?.pages, market).length) continue;
    const months = new Map();
    for (const k of rows)
      for (const m of k.monthly || [])
        months.set(m.month, (months.get(m.month) || 0) + (m.volume || 0));
    const change = yearChange(
        [...months]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, volume]) => ({ month, volume })),
      ),
      rival = [...(r.rivals || [])].sort(
        (a, b) => (b.keywords || 0) - (a.keywords || 0),
      )[0],
      name = systemMessageText(`growthMarket.${mid}`);
    out.push(
      signal({
        key: `other-market:${mid}`,
        type: 'gap',
        source: 'keywords',
        title: systemMessageText('growthSignals.otherMarketTitle', {
          0: name,
          1: rows[0].keyword,
          2: rows.length,
          3: n(total),
        }),
        chip: {
          tone: 'amber',
          text: systemMessageText('growthSignals.searchesChip', {
            0: n(total),
          }),
        },
        facts: [
          systemMessageText('growthSignals.otherMarketFacts', {
            0: name,
            1: rows.length,
            2: n(total),
            3: market.language,
          }),
          kit.examples(
            rows.map((k) =>
              k.source ? `${k.keyword}（${k.source}）` : k.keyword,
            ),
          ),
          ...(rival
            ? [
                systemMessageText('growthSignals.rivalInMarket', {
                  0: rival.name,
                  1: n(rival.keywords),
                }),
              ]
            : []),
        ],
        strength: strengthOf(total / 10),
        action: 'create',
        growth: growth(
          'other-market',
          [
            figure('monthlySearchesTotal', total, {
              detail: text('growth.detail.keywordCount', { 0: rows.length }),
            }),
            change === null
              ? null
              : figure('yearChange', change, { format: 'change' }),
            figure('pagesInLanguage', 0, { labelParams: { 0: name } }),
            rival
              ? figure('rivalKeywordsThere', rival.keywords || 0, {
                  labelParams: { 0: rival.name },
                })
              : null,
          ],
          table(
            [
              col('keyword'),
              col('sourceKeyword'),
              col('volume', 'count'),
              col('yearChange', 'change'),
            ],
            rows.map((k) => ({
              keyword: k.keyword,
              sourceKeyword: k.source || null,
              volume: k.volume,
              yearChange: yearChange(k.monthly),
            })),
            'keywords',
            '/keywords?tab=suggest',
          ),
        ),
      }),
    );
  }
  return out.sort((a, b) => b.strength - a.strength);
}

/** Site search terms (GA4, 28 days) with no page of the site: the most searched first, at most five. */
function siteSearchSignals({ gs, site, identity, V }) {
  const s = gs?.siteSearch;
  if (s?.status !== 'ok' || !s.rows?.length) return [];
  const pages = site?.pages || [],
    missing = s.rows.filter(
      (r) =>
        r.searches >= V('site-search', 'minSearches') &&
        !findPages(pages, r.term, [], identity).pages.length &&
        !answeredBy(pages, r.term),
    );
  return missing.slice(0, 5).map((r) => {
    const words = r.term
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
      near = missing.filter(
        (x) =>
          x.term === r.term ||
          words.some((w) => x.term.toLowerCase().includes(w)),
      );
    return signal({
      key: `site-search:${topicKey(r.term).slice(0, 80)}`,
      type: 'gap',
      source: 'ga4',
      title: systemMessageText('growthSignals.siteSearchTitle', {
        0: r.term,
        1: n(r.searches),
      }),
      chip: {
        tone: 'amber',
        text: systemMessageText('growthSignals.siteSearchesChip', {
          0: n(r.searches),
        }),
      },
      facts: [
        systemMessageText('growthSignals.siteSearchFacts', {
          0: n(r.searches),
          1: n(r.users),
          2: r.term,
        }),
      ],
      strength: strengthOf(r.searches * 3),
      action: 'create',
      growth: growth(
        'site-search',
        [
          figure('siteSearches28', r.searches),
          figure('searchers28', r.users),
          figure('matchingPages', 0),
        ],
        table(
          [col('term'), col('searches', 'count'), col('searchers', 'count')],
          near.map((x) => ({
            term: x.term,
            searches: x.searches,
            searchers: x.users,
          })),
          'terms',
          '/rules',
        ),
      ),
    });
  });
}

/** People also ask: questions on the main keywords' results pages no page of the site answers, one point per keyword group. */
function peopleAlsoAskSignals({ gs, site, V }) {
  const groups = new Map();
  for (const k of gs?.paa?.keywords || []) {
    const g = groups.get(k.group) || {
      name: k.groupName || k.group,
      keywords: [],
    };
    g.keywords.push(k);
    groups.set(k.group, g);
  }
  const out = [];
  for (const [id, g] of groups) {
    const seen = new Set(),
      rows = [];
    for (const k of g.keywords)
      for (const q of k.questions || []) {
        const key = q.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (!answeredBy(site?.pages, q))
          rows.push({
            question: q,
            keyword: k.keyword,
            volume: k.volume || null,
          });
      }
    if (rows.length < V('people-also-ask', 'minQuestions')) continue;
    const asked = g.keywords.filter((k) =>
        rows.some((r) => r.keyword === k.keyword),
      ),
      volume = sum(asked, (k) => k.volume),
      related = [...new Set(g.keywords.flatMap((k) => k.related || []))];
    out.push(
      signal({
        key: `people-also-ask:${id}`,
        type: 'gap',
        source: 'keywords',
        title: systemMessageText('growthSignals.paaTitle', {
          0: g.name,
          1: rows.length,
        }),
        chip: {
          tone: 'amber',
          text: systemMessageText('growthSignals.questionsChip', {
            0: rows.length,
          }),
        },
        facts: [
          systemMessageText('growthSignals.paaFacts', {
            0: asked.length,
            1: n(volume),
            2: rows.length,
          }),
          kit.examples(rows.map((r) => r.question)),
          ...(related.length
            ? [
                systemMessageText('growthSignals.paaRelated', {
                  0: related.slice(0, 5).join('、'),
                }),
              ]
            : []),
        ],
        strength: strengthOf(volume / 5 + rows.length * 10),
        action: 'create',
        growth: growth(
          'people-also-ask',
          [
            figure('unansweredQuestions', rows.length, {
              detail: text('growth.detail.ofQuestions', { 0: seen.size }),
            }),
            figure('monthlySearchesTotal', volume, {
              detail: text('growth.detail.keywordCount', { 0: asked.length }),
            }),
            figure('keywordGroup', g.name),
          ],
          table(
            [col('question'), col('keyword'), col('volume', 'count')],
            rows,
            'questions',
            '/keywords?tab=suggest',
          ),
        ),
      }),
    );
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 3);
}

/** Sites linking to at least two competitors and not to us, strongest first: one point for outreach. */
function linkGapSignals({ gs, V }) {
  const lg = gs?.linkGap;
  if (!lg?.items?.length) return [];
  const list = lg.items
    .filter(
      (i) => (i.competitors || []).length >= V('link-gap', 'minCompetitors'),
    )
    .sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1));
  if (list.length < V('link-gap', 'minSites')) return [];
  const names = (lg.competitors || []).map((c) => c.name),
    top = list[0];
  return [
    signal({
      key: 'link-gap',
      type: 'gap',
      source: 'competitors',
      title: systemMessageText('growthSignals.linkGapTitle', {
        0: list.length,
        1: V('link-gap', 'minCompetitors'),
      }),
      chip: {
        tone: 'amber',
        text: systemMessageText('growthSignals.sitesChip', { 0: list.length }),
      },
      facts: [
        systemMessageText('growthSignals.linkGapFacts', {
          0: names.join('、'),
          1: list.length,
          2: lg.own || '',
        }),
        kit.examples(list.map((i) => `${i.domain}（${i.rank ?? '—'}）`)),
      ],
      strength: strengthOf(sum(list.slice(0, 10), (i) => i.rank || 0) * 2),
      action: 'distribute',
      growth: growth(
        'link-gap',
        [
          figure('linkingSites', list.length, {
            detail: text('growth.detail.linkAtLeast', {
              0: V('link-gap', 'minCompetitors'),
            }),
          }),
          figure('topAuthority', top.rank ?? '—', {
            detail: text('growth.detail.list', { 0: top.domain }),
          }),
          figure(
            'averageAuthority',
            Math.round(sum(list, (i) => i.rank || 0) / list.length),
          ),
          figure('comparedWith', names.join(' · ')),
        ],
        table(
          [
            col('domain'),
            col('authority', 'count'),
            col('linksTo', 'list'),
            col('firstSeen', 'date'),
          ],
          list.map((i) => ({
            domain: i.domain,
            authority: i.rank,
            linksTo: i.competitors,
            firstSeen: i.firstSeen,
            url: `https://${i.domain}`,
          })),
          'sites',
          '/backlinks?view=gap',
        ),
      ),
    }),
  ];
}

export {
  pagesIn,
  yearChange,
  otherMarketSignals,
  siteSearchSignals,
  peopleAlsoAskSignals,
  linkGapSignals,
};
