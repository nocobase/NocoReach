// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import {
  EVIDENCE_ROWS,
  GROWTH_KINDS,
  roundEstimate,
} from '../../shared/growth.js';
import { keepGap, hostOf, marketOf } from './competitor-research.js';
import { gained } from './github-trends.js';
// Growth points (2026-11-10 user decision, shared/growth.ts): the changes Opportunities is made of, found in data that
// is already collected and paid for, with the size of the growth and the rows behind it computed here. Every function
// reads saved state only and never calls a service. The model sees these numbers and writes about them; it never
// writes them (strategy-service.ts copies them onto the opportunity).

// Organic click-through rate by Google position 1–10: Backlinko's study of 4 million Google results (12.2 million
// queries; backlinko.com/google-ctr-stats, updated 2025-04-16): position 1 27.6%, falling to 2.4% at position 10;
// positions 2–10 are read from the study's chart. Below position 10 the estimate counts no clicks: in the same study
// 0.63% of searchers click anything on page two. Industry averages, so every number made with them reads "Est.".
const CTR_BY_POSITION = [
  0.276, 0.158, 0.11, 0.084, 0.063, 0.049, 0.039, 0.033, 0.027, 0.024,
];
// Search Console's windows are 28 days; a month reads as 30.4 days.
const MONTH = 30.4 / 28;
const DAY = 86400000;

/** The usual click-through rate at an average position, between whole positions in proportion; 0 below page one. */
function expectedCtr(position) {
  if (!Number.isFinite(position) || position <= 0) return 0;
  if (position <= 1) return CTR_BY_POSITION[0];
  if (position >= 11) return 0;
  const lo = Math.floor(position),
    hi = Math.ceil(position),
    at = (p) => (p > 10 ? 0 : CTR_BY_POSITION[p - 1]);
  return lo === hi ? at(lo) : at(lo) + (at(hi) - at(lo)) * (position - lo);
}
/** Extra clicks a month: impressions × (the usual CTR at the target position − the CTR now), never below 0. */
function extraClicks(impressions, target, ctrNow) {
  return Math.max(
    0,
    Math.round(
      (impressions || 0) * (expectedCtr(target) - (ctrNow || 0)) * MONTH,
    ),
  );
}
/** Extra visits a month for a keyword searched `volume` times a month, from where it ranks now (none: no visits). */
function extraVisits(volume, target, position) {
  return Math.max(
    0,
    Math.round((volume || 0) * (expectedCtr(target) - expectedCtr(position))),
  );
}
// A growth point's strength (the order the analysis passes changes on in): its estimated extra visits a month on a
// log scale, so 100 reads 59 and 1,000 reads 81.
const strengthOf = (gain) =>
  Math.max(
    1,
    Math.min(100, Math.round(15 + Math.log10(Math.max(0, gain) + 1) * 22)),
  );
const n = (v) => Number(v || 0).toLocaleString('en-US');
const sum = (list, f) => list.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const pathOf = (u) => {
  try {
    return new URL(u).pathname.replace(/\/$/, '') || '/';
  } catch {
    return String(u || '').replace(/\/$/, '') || '/';
  }
};
const text = (key, params) => ({ key, ...(params ? { params } : {}) });
const figure = (label, value, extra = {}) => ({
  label: text(`growth.figure.${label}`, extra.labelParams),
  value:
    extra.estimate && typeof value === 'number' ? roundEstimate(value) : value,
  ...(extra.format ? { format: extra.format } : {}),
  ...(extra.detail ? { detail: extra.detail } : {}),
  ...(extra.estimate ? { estimate: true } : {}),
});
const col = (key, format = 'text') => ({
  key,
  label: `growth.column.${key}`,
  format,
});
const table = (columns, rows, unit, link) => ({
  columns,
  rows: rows.slice(0, EVIDENCE_ROWS),
  total: rows.length,
  unit: `growth.unit.${unit}`,
  link,
});
// `subject`: the one keyword, topic or repository a growth is about, when it is about one (shared/growth.ts).
const growth = (
  kind,
  figures,
  evidence,
  category = GROWTH_KINDS[kind],
  subject = '',
) => ({
  kind,
  category,
  figures: figures.filter(Boolean).slice(0, 4),
  ...(evidence ? { evidence } : {}),
  ...(subject ? { subject } : {}),
});
// Difficulty in words, on the same tiers as the difficulty badge (client/components/seo/score-badge.tsx).
const level = (kd) =>
  text(
    kd <= 35
      ? 'growth.level.easy'
      : kd <= 65
        ? 'growth.level.medium'
        : 'growth.level.hard',
  );
const signal = (s) => ({ actionable: true, facts: [], ...s });
const mean = (list) =>
  list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
const examples = (list, k = 3) =>
  systemMessageText('messages.example', { 0: list.slice(0, k).join('；') });

// --- Search Console: the queries of a page, near page one, low CTR, new queries -----------------------------------------

/** A page's queries in the 28-day sample, most impressions first, as evidence rows. */
function queryRows(rows, path) {
  return (rows || [])
    .filter((r) => pathOf(r.page) === path)
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    .map((r) => ({
      query: r.keyword,
      impressions: r.impressions || 0,
      position: r.position || null,
      clicks: r.clicks || 0,
      ctr: r.impressions ? (r.clicks || 0) / r.impressions : 0,
    }));
}
const QUERY_COLUMNS = [
  col('query'),
  col('impressions', 'count'),
  col('position', 'position'),
  col('clicks', 'count'),
  col('ctr', 'percent'),
];

/** Close to page one: what reaching the target position would add, from the page's impressions and CTR now. */
function nearFirstGrowth(p, rows, target) {
  const gain = extraClicks(p.impressions, target, p.ctr);
  return {
    gain,
    growth: growth(
      'near-first',
      [
        figure('impressions28', p.impressions),
        figure('averagePosition', Number(p.position.toFixed(1)), {
          format: 'position',
        }),
        figure('clicks28', p.clicks),
        figure('topExtraClicks', gain, {
          labelParams: { 0: target },
          detail: text('growth.detail.clicks'),
          estimate: true,
        }),
      ],
      table(
        QUERY_COLUMNS,
        queryRows(rows, p.path),
        'queries',
        '/seo-opportunities',
      ),
    ),
  };
}
/** Many impressions, few clicks: what the usual CTR at the page's own position would add. */
function lowCtrGrowth(p, rows) {
  const usual = expectedCtr(p.position),
    gain = extraClicks(p.impressions, p.position, p.ctr);
  return {
    gain,
    growth: growth(
      'low-ctr',
      [
        figure('impressions28', p.impressions),
        figure('ctr', p.ctr, { format: 'percent' }),
        figure('usualCtr', usual, {
          format: 'percent',
          detail: text('growth.detail.atPosition', {
            0: p.position.toFixed(1),
          }),
        }),
        figure('snippetExtraClicks', gain, {
          detail: text('growth.detail.clicks'),
          estimate: true,
        }),
      ],
      table(
        QUERY_COLUMNS,
        queryRows(rows, p.path),
        'queries',
        '/seo-opportunities',
      ),
    ),
  };
}
/**
 * New searches: queries a page started to show for in the last 28 days (no impressions in the 28 days before) or that
 * grew several times over, per page; what reaching the top 3 for them would add.
 */
function newQuerySignals({ queries, identity, canonical, V }) {
  const minImpressions = V('gsc-new-query', 'minImpressions'),
    rise = V('gsc-new-query', 'risePct') / 100,
    by = new Map();
  for (const r of queries || []) {
    const now = r.impressions || 0,
      before = r.previousImpressions || 0;
    if (now < minImpressions || (before > 0 && now < before * (1 + rise)))
      continue;
    const url = canonical(String(r.page || ''), identity),
      k = pathOf(url),
      o = by.get(k) || { url, rows: [] };
    o.rows.push({
      query: r.keyword,
      impressions: now,
      previousImpressions: before,
      position: r.position || null,
      clicks: r.clicks || 0,
      ctr: now ? (r.clicks || 0) / now : 0,
    });
    by.set(k, o);
  }
  const out = [];
  for (const [path, { url, rows }] of by) {
    if (rows.length < V('gsc-new-query', 'minQueries')) continue;
    rows.sort((a, b) => b.impressions - a.impressions);
    const impressions = sum(rows, (r) => r.impressions),
      weighted = sum(rows, (r) => (r.position || 0) * r.impressions),
      position = impressions ? weighted / impressions : null,
      gain = sum(rows, (r) => extraClicks(r.impressions, 3, r.ctr)),
      fresh = rows.filter((r) => !r.previousImpressions).length;
    out.push(
      signal({
        key: `gsc-new-query:${path}`,
        type: 'page',
        source: 'gsc',
        url,
        title: systemMessageText('growthSignals.newQueriesTitle', {
          0: path,
          1: rows.length,
        }),
        chip: {
          tone: 'blue',
          text: systemMessageText('growthSignals.newQueriesChip', {
            0: rows.length,
          }),
        },
        facts: [
          systemMessageText('growthSignals.newQueriesFacts', {
            0: rows.length,
            1: fresh,
            2: n(impressions),
          }),
          examples(rows.map((r) => r.query)),
        ],
        strength: strengthOf(gain),
        action: 'optimize',
        growth: growth(
          'new-query',
          [
            figure('newQueries', rows.length, {
              detail: text('growth.detail.newSince', { 0: fresh }),
            }),
            figure('impressions28', impressions),
            position === null
              ? null
              : figure('averagePosition', Number(position.toFixed(1)), {
                  format: 'position',
                }),
            figure('topExtraClicks', gain, {
              labelParams: { 0: 3 },
              detail: text('growth.detail.clicks'),
              estimate: true,
            }),
          ],
          table(
            [
              col('query'),
              col('impressions', 'count'),
              col('previousImpressions', 'count'),
              col('position', 'position'),
              col('clicks', 'count'),
            ],
            rows,
            'queries',
            '/seo-opportunities',
          ),
        ),
      }),
    );
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

// --- Keywords › AI suggestions and Competitors › Overview ----------------------------------------------------------

/** The current AI suggestions (format 2), every group's keywords once: the built-in groups and the dug directions. */
function suggestionGroups(ks) {
  if (ks?.version !== 2) return [];
  const groups = new Map(),
    seen = new Set();
  const add = (id, label, item) => {
    const k = String(item?.keyword || '').toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    const g = groups.get(id) || { id, label, items: [] };
    g.items.push(item);
    groups.set(id, g);
  };
  for (const i of ks.items || [])
    if (i.group && !(ks.deletedGroups || []).includes(i.group))
      add(i.group, ks.groupNames?.[i.group] || i.group, i);
  for (const d of ks.digs || [])
    for (const i of d.items || [])
      add(`dig-${d.id}`, d.name || d.direction || String(d.id), i);
  return [...groups.values()];
}
/** Each competitor's keywords in Competitors › Overview: the ones it ranks top 20 for and we do not, with its pages. */
function competitorGaps({ cr, cw }) {
  if (!cr?.domains || !cw?.list?.length) return [];
  const market = marketOf(cr.market),
    mk = `${market.locationCode}|${market.language}`;
  return cw.list
    .map((c) => {
      const domain = c.site ? hostOf(c.site) : '',
        d = domain ? cr.domains[domain] : null;
      return d && d.market === mk
        ? {
            name: c.name,
            domain,
            gap: keepGap(d.gap, c.name, domain),
            pages: d.pages || [],
          }
        : null;
    })
    .filter(Boolean);
}
/** Where competitors rank for a keyword in the top 10, from their keyword gaps. */
function rivalRanks(gaps) {
  const out = new Map();
  for (const g of gaps)
    for (const x of g.gap) {
      if (!(x.position <= 10)) continue;
      const k = String(x.keyword || '').toLowerCase(),
        list = out.get(k) || [];
      list.push({ name: g.name, rank: x.position });
      out.set(k, list);
    }
  for (const list of out.values()) list.sort((a, b) => a.rank - b.rank);
  return out;
}
const ranksOf = (ranks, keyword) =>
  ranks.get(String(keyword || '').toLowerCase()) || [];
// A keyword the site has no Search Console position for, or one past page two, is not ranking.
const notRanking = (i) => !(i.site?.position > 0 && i.site.position <= 20);

/** Demand without a page: an AI suggestion group's keywords with real searches that the site does not rank for. */
function demandSignals({ ks, gaps, V }) {
  const ranks = rivalRanks(gaps),
    out = [];
  for (const g of suggestionGroups(ks)) {
    const list = g.items
      .filter((i) => (i.metrics?.volume || 0) > 0 && notRanking(i))
      .sort((a, b) => b.metrics.volume - a.metrics.volume);
    const volume = sum(list, (i) => i.metrics.volume);
    if (
      list.length < V('keyword-demand', 'minKeywords') ||
      volume < V('keyword-demand', 'minVolume')
    )
      continue;
    const kds = list
        .map((i) => i.metrics.difficulty)
        .filter((x) => Number.isFinite(x)),
      kd = mean(kds),
      change = groupChange(list),
      // Searched and not written, and clearly rising too: trending, which is time-bound (2026-11-10 user decision).
      trending =
        change !== null && change >= V('keyword-demand', 'risingPct') / 100,
      gain = sum(list, (i) =>
        extraVisits(i.metrics.volume, 3, i.site?.position),
      ),
      rivals = [
        ...new Set(
          list.flatMap((i) => ranksOf(ranks, i.keyword).map((r) => r.name)),
        ),
      ];
    out.push(
      signal({
        key: `keyword-demand:${g.id}`,
        type: 'gap',
        source: 'keywords',
        title: systemMessageText('growthSignals.demandTitle', {
          0: g.label,
          1: list.length,
        }),
        chip: {
          tone: 'blue',
          text: systemMessageText('growthSignals.searchesChip', {
            0: n(volume),
          }),
        },
        facts: [
          systemMessageText('growthSignals.demandFacts', {
            0: list.length,
            1: n(volume),
          }),
          examples(list.map((i) => i.keyword)),
          ...(rivals.length
            ? [
                systemMessageText('growthSignals.rivalsTop10', {
                  0: rivals.join('、'),
                }),
              ]
            : []),
        ],
        strength: strengthOf(gain),
        action: 'create',
        growth: growth(
          'demand-gap',
          [
            figure('monthlySearchesTotal', volume),
            figure('ranking', 0, {
              detail: text('growth.detail.ofKeywords', { 0: list.length }),
            }),
            trending
              ? figure('threeMonthChange', change, { format: 'change' })
              : kd === null
                ? null
                : figure('averageDifficulty', Math.round(kd), {
                    detail: level(kd),
                  }),
            figure('topExtraVisits', gain, {
              labelParams: { 0: 3 },
              detail: text('growth.detail.visits'),
              estimate: true,
            }),
          ],
          table(
            [
              col('keyword'),
              col('volume', 'count'),
              col('difficulty', 'difficulty'),
              col('ourPosition', 'position'),
              col('rivalsTop10', 'list'),
            ],
            list.map((i) => ({
              keyword: i.keyword,
              volume: i.metrics.volume,
              difficulty: i.metrics.difficulty ?? null,
              ourPosition: i.site?.position ?? null,
              rivalsTop10: ranksOf(ranks, i.keyword),
            })),
            'keywords',
            g.id.startsWith('dig-')
              ? `/keywords?tab=suggest&group=${encodeURIComponent(g.id.slice(4))}`
              : '/keywords?tab=suggest',
          ),
          trending ? 'trending' : 'new-content',
        ),
      }),
    );
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 5);
}
/**
 * A keyword group's searches over the last 3 months against the 3 months before, summed month by month, when the data
 * has 12 months of them; otherwise none, and the group is new content.
 */
function groupChange(list) {
  const months = new Map();
  for (const i of list)
    for (const m of i.metrics?.monthlySearches || [])
      if (Number.isFinite(m?.volume)) {
        const k = m.year * 12 + m.month;
        months.set(k, (months.get(k) || 0) + m.volume);
      }
  const series = [...months].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  if (series.length < 12) return null;
  const last = mean(series.slice(-3)),
    before = mean(series.slice(-6, -3));
  return before ? (last - before) / before : null;
}

/** Rising searches: an AI suggestion whose monthly searches over the last 3 months clearly exceed the 3 months before. */
function risingKeywordSignals({ ks, gaps, V }) {
  const ranks = rivalRanks(gaps),
    out = [];
  for (const g of suggestionGroups(ks))
    for (const i of g.items) {
      const months = (i.metrics?.monthlySearches || [])
        .filter((m) => Number.isFinite(m?.volume))
        .sort((a, b) => a.year - b.year || a.month - b.month);
      if (
        months.length < 6 ||
        (i.metrics.volume || 0) < V('keyword-rising', 'minVolume') ||
        (i.site?.position > 0 && i.site.position <= 10)
      )
        continue;
      const last = mean(months.slice(-3).map((m) => m.volume)),
        before = mean(months.slice(-6, -3).map((m) => m.volume));
      if (
        !before ||
        (last - before) / before < V('keyword-rising', 'changePct') / 100
      )
        continue;
      // A rising keyword is searched as often as it is now (the last 3 months), not as its yearly average says.
      const change = (last - before) / before,
        now = Math.round(last),
        gain = extraVisits(now, 3, i.site?.position),
        rivals = ranksOf(ranks, i.keyword);
      out.push(
        signal({
          key: `keyword-rising:${i.keyword}`,
          type: 'timing',
          source: 'keywords',
          title: systemMessageText('growthSignals.risingKeywordTitle', {
            0: i.keyword,
            1: `${Math.round(change * 100)}%`,
          }),
          chip: { tone: 'green', text: `↑ ${Math.round(change * 100)}%` },
          facts: [
            systemMessageText('growthSignals.risingKeywordFacts', {
              0: n(Math.round(last)),
              1: n(Math.round(before)),
              2: n(i.metrics.volume),
            }),
            ...(rivals.length
              ? [
                  systemMessageText('growthSignals.rivalsTop10', {
                    0: rivals.map((r) => `${r.name} #${r.rank}`).join('、'),
                  }),
                ]
              : []),
          ],
          strength: strengthOf(gain),
          action: 'create',
          growth: growth(
            'rising',
            [
              figure('monthlySearches', now),
              figure('threeMonthChange', change, { format: 'change' }),
              figure(
                'ourPosition',
                i.site?.position ? Number(i.site.position.toFixed(1)) : '—',
                { format: 'position' },
              ),
              figure('topExtraVisits', gain, {
                labelParams: { 0: 3 },
                detail: text('growth.detail.visits'),
                estimate: true,
              }),
            ],
            table(
              [col('month'), col('volume', 'count')],
              months
                .slice()
                .reverse()
                .map((m) => ({
                  month: `${m.year}-${String(m.month).padStart(2, '0')}`,
                  volume: m.volume,
                })),
              'months',
              '/keywords?tab=suggest',
            ),
            undefined,
            i.keyword,
          ),
        }),
      );
    }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

/** What competitors have and we do not: a competitor page that ranks for several keywords we do not rank for. */
function competitorGapSignals({ gaps, V }) {
  const out = [];
  for (const g of gaps) {
    const by = new Map();
    for (const x of g.gap) {
      if (!x.url || !(x.volume > 0)) continue;
      const k = pathOf(x.url),
        o = by.get(k) || { url: x.url, items: [] };
      o.items.push(x);
      by.set(k, o);
    }
    for (const [path, { url, items }] of by) {
      const volume = sum(items, (x) => x.volume);
      if (
        items.length < V('competitor-gap', 'minKeywords') ||
        volume < V('competitor-gap', 'minVolume')
      )
        continue;
      items.sort((a, b) => b.volume - a.volume);
      const top = g.pages.find((p) => pathOf(p.url) === path),
        traffic = top?.traffic ?? sum(items, (x) => x.traffic),
        gain = sum(items, (x) => extraVisits(x.volume, 3, null));
      out.push(
        signal({
          key: `competitor-gap:${g.domain}${path}`,
          type: 'gap',
          source: 'competitors',
          url,
          title: systemMessageText('growthSignals.competitorGapTitle', {
            0: g.name,
            1: path,
            2: items.length,
          }),
          chip: {
            tone: 'blue',
            text: systemMessageText('growthSignals.searchesChip', {
              0: n(volume),
            }),
          },
          facts: [
            systemMessageText('growthSignals.competitorGapFacts', {
              0: g.name,
              1: n(roundEstimate(traffic)),
              2: items.length,
              3: n(volume),
            }),
            examples(items.map((x) => x.keyword)),
          ],
          strength: strengthOf(gain),
          action: 'create',
          growth: growth(
            'competitor-gap',
            [
              figure('rivalPageTraffic', traffic, {
                labelParams: { 0: g.name },
                detail: text('growth.detail.visits'),
                estimate: true,
              }),
              figure('monthlySearchesTotal', volume),
              figure('ranking', 0, {
                detail: text('growth.detail.ofKeywords', { 0: items.length }),
              }),
              figure('topExtraVisits', gain, {
                labelParams: { 0: 3 },
                detail: text('growth.detail.visits'),
                estimate: true,
              }),
            ],
            table(
              [
                col('keyword'),
                col('volume', 'count'),
                col('difficulty', 'difficulty'),
                col('rivalPosition', 'position'),
              ],
              items.map((x) => ({
                keyword: x.keyword,
                volume: x.volume,
                difficulty: x.difficulty ?? null,
                rivalPosition: x.position,
              })),
              'keywords',
              '/research/domain',
            ),
          ),
        }),
      );
    }
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

// --- AI search › Questions -----------------------------------------------------------------------------------------

const PLATFORM_COUNT = (list) =>
  text('growth.detail.platformSplit', {
    0: list.filter((q) => q.platform === 'chat_gpt').length,
    1: list.filter((q) => q.platform === 'google').length,
  });
/** Not mentioned: per topic, the questions whose AI answers name competitors or other products and not us. */
function aiMissingSignals({ aq, name, V }) {
  const out = [];
  for (const topic of [...new Set((aq || []).flatMap((q) => q.topics))]) {
    const all = aq.filter((q) => q.topics.includes(topic)),
      gap = all.filter((q) => q.status === 'gap');
    if (gap.length < V('ai-missing', 'minQuestions')) continue;
    const volume = sum(gap, (q) => q.volume),
      named = [...new Set(gap.flatMap((q) => [...q.rivals, ...q.brands]))],
      ours = all.filter((q) => q.status === 'ours').length,
      domains = new Map();
    for (const q of gap)
      for (const d of new Set(
        q.sources.filter((s) => !s.own && !s.rival).map((s) => s.domain),
      ))
        domains.set(d, (domains.get(d) || 0) + 1);
    const top = [...domains]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([d]) => d);
    out.push(
      signal({
        key: `ai-missing:${topic}`,
        type: 'gap',
        source: 'ai-search',
        title: systemMessageText('growthSignals.aiMissingTitle', {
          0: topic,
          1: gap.length,
        }),
        chip: {
          tone: 'amber',
          text: systemMessageText('growthSignals.questionsChip', {
            0: gap.length,
          }),
        },
        facts: [
          systemMessageText('growthSignals.aiMissingFacts', {
            0: all.length,
            1: gap.length,
            2: ours,
          }),
          ...(named.length
            ? [
                systemMessageText('growthSignals.namedInstead', {
                  0: named.slice(0, 5).join('、'),
                }),
              ]
            : []),
          ...(volume
            ? [
                systemMessageText('growthSignals.aiSearchesFact', {
                  0: n(volume),
                }),
              ]
            : []),
          examples(gap.map((q) => q.question)),
        ],
        strength: strengthOf(volume || gap.length * 20),
        action: 'create',
        growth: growth(
          'not-mentioned',
          [
            figure('relatedQuestions', all.length, {
              detail: PLATFORM_COUNT(all),
            }),
            figure('rivalQuestions', gap.length, {
              detail: text('growth.detail.questions'),
            }),
            name
              ? figure('namingUs', ours, {
                  labelParams: { 0: name },
                  detail: text('growth.detail.questions'),
                })
              : figure('ourQuestions', ours, {
                  detail: text('growth.detail.questions'),
                }),
            top.length ? figure('topSources', top.join(' · ')) : null,
          ],
          table(
            [
              col('question'),
              col('platform', 'platform'),
              col('named', 'list'),
              col('cited', 'list'),
            ],
            // Every related question, as AI search lists them, those naming others and not us first.
            [...gap, ...all.filter((q) => q.status !== 'gap')].map((q) => ({
              question: q.question,
              platform: q.platform,
              named: [...q.rivals, ...q.brands].slice(0, 4),
              cited: [...new Set(q.sources.map((s) => s.domain))].slice(0, 3),
            })),
            'questions',
            '/ai-search',
          ),
        ),
      }),
    );
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 5);
}
/**
 * The sources AI cites: per topic, the pages (rankings, reviews, forum threads) the answers that name others and not
 * us cite most, leaving out our own site and the competitors' own sites.
 */
function aiCitedSignals({ aq, V }) {
  const out = [];
  for (const topic of [...new Set((aq || []).flatMap((q) => q.topics))]) {
    const gap = aq.filter(
        (q) => q.topics.includes(topic) && q.status === 'gap',
      ),
      pages = new Map();
    for (const q of gap)
      for (const s of q.sources) {
        if (s.own || s.rival || !s.domain) continue;
        const k = s.url || s.domain,
          o = pages.get(k) || {
            url: s.url || null,
            title: s.title || s.domain,
            domain: s.domain,
            citations: 0,
            questions: new Set(),
            named: new Set(),
            volume: 0,
          };
        o.citations++;
        if (!o.questions.has(q.key)) {
          o.questions.add(q.key);
          o.volume += q.volume || 0;
        }
        for (const b of [...q.rivals, ...q.brands]) o.named.add(b);
        pages.set(k, o);
      }
    const list = [...pages.values()]
      .filter((p) => p.citations >= V('ai-cited', 'minCitations'))
      .sort((a, b) => b.citations - a.citations);
    if (!list.length) continue;
    const citations = sum(list, (p) => p.citations),
      questions = new Set(list.flatMap((p) => [...p.questions])),
      volume = sum(
        gap.filter((q) => questions.has(q.key)),
        (q) => q.volume,
      ),
      brands = new Map();
    for (const p of list)
      for (const b of p.named) brands.set(b, (brands.get(b) || 0) + 1);
    const named = [...brands]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([b]) => b);
    out.push(
      signal({
        key: `ai-cited:${topic}`,
        type: 'gap',
        source: 'ai-search',
        url: list[0].url || undefined,
        title: systemMessageText('growthSignals.aiCitedTitle', {
          0: topic,
          1: list.length,
        }),
        chip: {
          tone: 'amber',
          text: systemMessageText('growthSignals.citationsChip', {
            0: citations,
          }),
        },
        facts: [
          systemMessageText('growthSignals.aiCitedFacts', {
            0: list.length,
            1: citations,
            2: questions.size,
          }),
          ...(named.length
            ? [
                systemMessageText('growthSignals.namedInstead', {
                  0: named.join('、'),
                }),
              ]
            : []),
          ...(volume
            ? [
                systemMessageText('growthSignals.aiSearchesFact', {
                  0: n(volume),
                }),
              ]
            : []),
          examples(list.map((p) => p.url || p.domain)),
        ],
        strength: strengthOf(volume || citations * 20),
        action: 'create',
        growth: growth(
          'cited-sources',
          [
            figure('citedPages', list.length),
            figure('citations', citations, {
              detail: text('growth.detail.times'),
            }),
            figure('rivalQuestions', questions.size, {
              detail: text('growth.detail.questions'),
            }),
            named.length ? figure('namedInThem', named.join(' · ')) : null,
          ],
          table(
            [
              col('page'),
              col('domain'),
              col('citations', 'count'),
              col('named', 'list'),
            ],
            list.map((p) => ({
              page: p.title,
              url: p.url,
              domain: p.domain,
              citations: p.citations,
              named: [...p.named].slice(0, 4),
            })),
            'pages',
            '/ai-search',
          ),
        ),
      }),
    );
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 5);
}
/** Mentioned, not cited (AI search › Brand mentions): the answers that name us without citing our site. */
function uncitedGrowth(questions, missed) {
  const volume = sum(missed, (q) => q.volume);
  return growth(
    'uncited',
    [
      figure('mentioningAnswers', questions.length),
      figure('citingAnswers', questions.length - missed.length),
      figure('uncitedAnswers', missed.length),
      volume ? figure('aiSearches', volume) : null,
    ],
    table(
      [col('question'), col('aiVolume', 'count'), col('cited', 'list')],
      missed
        .slice()
        .sort((a, b) => (b.volume || 0) - (a.volume || 0))
        .map((q) => ({
          question: q.question,
          aiVolume: q.volume ?? null,
          cited: [
            ...new Set(
              (q.sources || []).filter((s) => !s.own).map((s) => s.domain),
            ),
          ].slice(0, 3),
        })),
      'questions',
      '/ai-search?tab=brand',
    ),
  );
}

// --- Google Trends, GitHub hot topics and competitor launches ------------------------------------------------------

/** Rising related searches: how many started rising, the largest rise, and the monthly searches of those we know. */
function trendsGrowth(fresh, volumes) {
  const known = fresh
    .map((q) => volumes.get(String(q.query).toLowerCase()))
    .filter((v) => v > 0);
  return growth(
    'rising',
    [
      figure('risingSearches', fresh.length),
      figure(
        'largestRise',
        Math.max(...fresh.map((q) => Number(q.value) || 0)) / 100,
        { format: 'change' },
      ),
      known.length
        ? figure(
            'monthlySearchesTotal',
            sum(known, (v) => v),
            { detail: text('growth.detail.forKeywords', { 0: known.length }) },
          )
        : null,
    ],
    table(
      [col('query'), col('rise', 'change'), col('volume', 'count')],
      fresh.map((q) => ({
        query: q.query,
        rise: (Number(q.value) || 0) / 100,
        volume: volumes.get(String(q.query).toLowerCase()) ?? null,
      })),
      'searches',
      '/trends',
    ),
  );
}
/** The monthly searches of every keyword Keywords › AI suggestions and Competitors › Overview know. */
function keywordVolumes(ks, gaps) {
  const out = new Map();
  for (const g of suggestionGroups(ks))
    for (const i of g.items)
      if (i.metrics?.volume)
        out.set(String(i.keyword).toLowerCase(), i.metrics.volume);
  for (const g of gaps)
    for (const x of g.gap)
      if (x.volume && !out.has(x.keyword)) out.set(x.keyword, x.volume);
  return out;
}
const repoRows = (ght, repos) =>
  repos.map((r) => {
    const x = ght.repos?.[r] || {},
      samples = ght.stars?.[r] || {},
      latest = samples[Object.keys(samples).sort().at(-1)];
    return {
      repo: r,
      repository: r,
      url: x.url || `https://github.com/${r}`,
      stars: latest ?? x.stars ?? null,
      created: x.createdAt || null,
      language: x.language || null,
    };
  });
const REPO_COLUMNS = [
  col('repository'),
  col('stars', 'count'),
  col('created', 'date'),
  col('language'),
];
/** How many repositories a followed topic has, as the latest daily read counted them. */
const topicSize = (ght, topic) => {
  const h = ght.heat?.[topic] || {};
  return h[Object.keys(h).sort().at(-1)]?.total ?? null;
};
/** A followed GitHub topic heating up: new repositories last week against the four weeks before. */
function topicHeatGrowth(ght, topic, last, avg) {
  const total = topicSize(ght, topic);
  return growth(
    'topic-heat',
    [
      figure('newRepositoriesWeek', last),
      figure('newRepositoriesBefore', Math.round(avg), {
        detail: text('growth.detail.perWeek'),
      }),
      figure('weekChange', (last - avg) / avg, { format: 'change' }),
      total === null ? null : figure('topicRepositories', total),
    ],
    table(
      REPO_COLUMNS,
      repoRows(ght, ght.topicNew?.[topic] || []).sort(
        (a, b) => (b.stars || 0) - (a.stars || 0),
      ),
      'repositories',
      '/data/github?view=hot',
    ),
    undefined,
    topic,
  );
}
/** New hot repositories: in a followed topic, created in the last 7 days, with the most stars. */
function newRepoSignals({ ght, gh, now, V }) {
  const day = ght?.lastRun?.day;
  if (!day || !ght.topics?.length) return [];
  const since = new Date(now - 7 * DAY).toISOString().slice(0, 10),
    best = new Map();
  for (const topic of ght.topics) {
    const rows = repoRows(ght, ght.topicNew?.[topic] || [])
      .filter((r) => r.repo !== gh?.repo && (!r.created || r.created >= since))
      .map((r) => ({
        ...r,
        gained: gained(ght.stars?.[r.repo], day, 7) ?? r.stars ?? 0,
      }))
      .sort((a, b) => b.gained - a.gained);
    rows.forEach((r, i) => {
      if (r.gained < V('github-new-repo', 'minStars')) return;
      const known = best.get(r.repo);
      if (!known || known.rank > i + 1)
        best.set(r.repo, { ...r, topic, rank: i + 1, rows });
    });
  }
  return [...best.values()]
    .sort((a, b) => b.gained - a.gained)
    .slice(0, 3)
    .map((r) =>
      signal({
        key: `github-new-repo:${r.repo}`,
        type: 'timing',
        source: 'github',
        url: r.url,
        title: systemMessageText('growthSignals.newRepoTitle', {
          0: r.topic,
          1: r.repo,
          2: n(r.gained),
        }),
        chip: { tone: 'green', text: `+${n(r.gained)} ★` },
        facts: [
          systemMessageText('growthSignals.newRepoFacts', {
            0: r.created ? r.created.slice(0, 10) : '—',
            1: r.rank,
            2: r.topic,
          }),
          ...(ght.repos?.[r.repo]?.description
            ? [ght.repos[r.repo].description]
            : []),
        ],
        strength: strengthOf(r.gained),
        action: 'create',
        growth: growth(
          'new-repo',
          // The size of the chance: its stars, where it stands among the topic's new repositories, and the topic with
          // its size. When it was created and its language are in the evidence.
          [
            figure('starsWeek', r.gained),
            figure('topicRank', r.rank, {
              detail: text('growth.detail.ofNewRepositories', {
                0: r.rows.length,
              }),
            }),
            figure('topic', r.topic),
            topicSize(ght, r.topic) === null
              ? null
              : figure('topicRepositories', topicSize(ght, r.topic)),
          ],
          table(REPO_COLUMNS, r.rows, 'repositories', '/data/github?view=hot'),
          undefined,
          r.repo,
        ),
      }),
    );
}
/** A competitor that just launched: its new pages or releases, with its stars and search traffic when known. */
function launchGrowth({ c, events, ght, cr }) {
  const day = ght?.lastRun?.day,
    starsWeek = c.repo && day ? gained(ght.stars?.[c.repo], day, 7) : null,
    domain = c.site ? hostOf(c.site) : '',
    months = domain ? cr?.domains?.[domain]?.months || [] : [],
    traffic = months.at(-1)?.etv ?? null,
    pages = events.filter((e) => e.type === 'page'),
    releases = events.filter((e) => e.type === 'release');
  return growth(
    'competitor-launch',
    [
      pages.length ? figure('newPagesWeek', pages.length) : null,
      releases.length ? figure('latestRelease', releases[0].title) : null,
      starsWeek === null
        ? null
        : figure('rivalStarsWeek', starsWeek, { labelParams: { 0: c.name } }),
      traffic === null
        ? null
        : figure('rivalTraffic', traffic, {
            labelParams: { 0: c.name },
            detail: text('growth.detail.visits'),
            estimate: true,
          }),
      events.length
        ? figure('latestAt', String(events[0].at).slice(0, 10), {
            format: 'date',
          })
        : null,
    ],
    table(
      [col('title'), col('kind', 'label'), col('date', 'date')],
      events.map((e) => ({
        title: e.title,
        url: e.url,
        kind:
          e.type === 'release' ? 'growth.value.release' : 'growth.value.page',
        date: String(e.at).slice(0, 10),
      })),
      'items',
      '/research/domain?view=watch',
    ),
  );
}

// --- Content optimization: what existing pages are losing or could win back (2026-11-10 user decision) -----------
// Falling rankings and clicks, outdated or thin pages with traffic, AI answers that stopped naming us and technical
// issues on pages with traffic are opportunities again, each with what it can win back. Only pages with traffic count.

const before28 = (value) => text('growth.detail.before28', { 0: n(value) });
/** A page's queries with the clicks they had the 28 days before, those that lost most first. */
function lostQueryRows(rows, path) {
  return (rows || [])
    .filter((r) => pathOf(r.page) === path)
    .map((r) => ({
      query: r.keyword,
      clicks: r.clicks || 0,
      previousClicks: r.previous || 0,
      clickChange: (r.clicks || 0) - (r.previous || 0),
      position: r.position || null,
    }))
    .sort((a, b) => a.clickChange - b.clickChange);
}
const LOST_COLUMNS = [
  col('query'),
  col('clicks', 'count'),
  col('previousClicks', 'count'),
  col('clickChange', 'delta'),
  col('position', 'position'),
];

/** A page losing search clicks: what it had the 28 days before, which it can win back, a month. */
function clickDropGrowth(p, rows) {
  const gain = Math.max(0, p.previous - p.clicks) * MONTH;
  return {
    gain,
    growth: growth(
      'click-drop',
      [
        figure('clicks28', p.clicks, { detail: before28(p.previous) }),
        figure('impressions28', p.impressions, {
          detail: before28(p.previousImpressions),
        }),
        p.position === null
          ? null
          : figure('averagePosition', Number(p.position.toFixed(1)), {
              format: 'position',
            }),
        figure('recoverClicks', gain, {
          detail: text('growth.detail.clicks'),
          estimate: true,
        }),
      ],
      table(
        LOST_COLUMNS,
        lostQueryRows(rows, p.path),
        'queries',
        '/seo-opportunities',
      ),
    ),
  };
}

/**
 * A page that fell for tracked keywords (Keywords › Tracking), each `{ keyword, before, now, ahead }` with its positions
 * (none: out of the top 100) and the sites above it now. What it can win back: the clicks the page lost in Search
 * Console, a month; without them, what the keywords' searches bring at the former positions against the present ones.
 */
function rankDropGrowth({ keywords, page, rows, path, volumes }) {
  const at = (x) => x ?? 100,
    volumeOf = (k) => volumes.get(String(k.keyword).toLowerCase()) ?? null,
    out = keywords.filter(
      (k) => k.before && k.before <= 3 && !(k.now && k.now <= 3),
    ).length,
    byKeywords = sum(
      keywords,
      (k) =>
        (volumeOf(k) || 0) *
        Math.max(0, expectedCtr(k.before) - expectedCtr(k.now ?? 101)),
    ),
    gain =
      page && page.previous > page.clicks
        ? (page.previous - page.clicks) * MONTH
        : byKeywords,
    change = (k) => {
      const r = (rows || []).find(
        (x) =>
          pathOf(x.page) === path &&
          String(x.keyword).toLowerCase() === String(k.keyword).toLowerCase(),
      );
      return r ? (r.clicks || 0) - (r.previous || 0) : null;
    };
  return {
    gain,
    growth: growth(
      'rank-drop',
      [
        page
          ? figure('clicks28', page.clicks, { detail: before28(page.previous) })
          : null,
        figure(
          'averagePosition',
          Number(mean(keywords.map((k) => at(k.now))).toFixed(1)),
          {
            format: 'position',
            detail: text('growth.detail.beforePosition', {
              0: mean(keywords.map((k) => at(k.before))).toFixed(1),
            }),
          },
        ),
        figure('outOfTop3', out, {
          detail: text('growth.detail.ofKeywords', { 0: keywords.length }),
        }),
        figure('recoverClicks', gain, {
          detail: text('growth.detail.clicks'),
          estimate: true,
        }),
      ],
      table(
        [
          col('keyword'),
          col('volume', 'count'),
          { ...col('position', 'position'), from: 'previousPosition' },
          col('clickChange', 'delta'),
          col('ahead', 'list'),
        ],
        [...keywords]
          .sort((a, b) => at(b.now) - at(b.before) - (at(a.now) - at(a.before)))
          .map((k) => ({
            keyword: k.keyword,
            volume: volumeOf(k),
            position: k.now ?? '100+',
            previousPosition: k.before ?? null,
            clickChange: change(k),
            ahead: k.ahead || [],
          })),
        'keywords',
        '/keywords?tab=tracking',
      ),
    ),
  };
}

/**
 * A page with traffic that is outdated (`updated`, months ago) or thin (`words` of body text): the visits it gets a
 * month, which it keeps or loses with it, and the searches that bring them.
 */
function pageGrowth(
  kind: 'stale-page' | 'thin-page',
  {
    path,
    visits,
    q,
    rows,
    updated,
    months,
    words,
  }: {
    path: string;
    visits: number;
    q?: { clicks: number; impressions: number } | null;
    rows?: object[];
    updated?: string;
    months?: number;
    words?: number;
  },
) {
  const queries = queryRows(rows, path);
  return growth(
    kind,
    [
      figure('monthlyVisits', visits * MONTH, {
        detail: text('growth.detail.visits'),
        estimate: true,
      }),
      kind === 'stale-page'
        ? figure('lastUpdated', updated, {
            format: 'date',
            detail: text('growth.detail.monthsAgo', { 0: months }),
          })
        : figure('bodyWords', words, { detail: text('growth.detail.words') }),
      q ? figure('clicks28', q.clicks) : null,
      q ? figure('impressions28', q.impressions) : null,
    ],
    queries.length
      ? table(QUERY_COLUMNS, queries, 'queries', '/content')
      : undefined,
  );
}

/**
 * Questions AI answers named us in at the lookup before and do not now (AI search › Brand mentions), on one platform.
 * A lookup keeps a sample of the most searched questions: when the newer one is as full, a question less searched than
 * the least searched in it may only have been pushed out, so it is not counted.
 */
function aiDropped(previous, current) {
  const now = new Set(current.map((q) => String(q.question).toLowerCase())),
    floor =
      current.length && current.length >= previous.length
        ? Math.min(...current.map((q) => q.volume || 0))
        : 0;
  return previous.filter(
    (q) =>
      !now.has(String(q.question).toLowerCase()) && (q.volume || 0) >= floor,
  );
}
function aiDroppedGrowth({ platform, dropped, before, after, at }) {
  const volume = sum(dropped, (q) => q.volume);
  return growth(
    'ai-dropped',
    [
      figure('droppedQuestions', dropped.length, {
        detail: text('growth.detail.questions'),
      }),
      figure('mentionedBefore', before, {
        detail: text('growth.detail.onDay', { 0: String(at).slice(5, 10) }),
      }),
      figure('mentionedNow', after, {
        detail: text('growth.detail.questions'),
      }),
      volume ? figure('aiSearches', volume) : null,
    ],
    table(
      [
        col('question'),
        col('platform', 'platform'),
        col('aiVolume', 'count'),
        col('cited', 'list'),
      ],
      [...dropped]
        .sort((a, b) => (b.volume || 0) - (a.volume || 0))
        .map((q) => ({
          question: q.question,
          platform,
          aiVolume: q.volume ?? null,
          cited: [...new Set((q.sources || []).map((x) => x.domain))].slice(
            0,
            3,
          ),
        })),
      'questions',
      '/ai-search',
    ),
  );
}

/**
 * A site audit issue on pages with search traffic (`pages`, each with its Search Console figures): the clicks those
 * pages get a month, which the issue puts at risk.
 */
function pageIssueGrowth({ issue, pages, total }) {
  const clicks = sum(pages, (p) => p.clicks) * MONTH;
  return {
    gain: clicks,
    growth: growth(
      'page-issue',
      [
        figure('issue', issue),
        figure('pagesWithTraffic', pages.length, {
          detail: text('growth.detail.ofPages', { 0: total }),
        }),
        figure('affectedClicks', clicks, {
          detail: text('growth.detail.clicks'),
          estimate: true,
        }),
        figure(
          'impressions28',
          sum(pages, (p) => p.impressions),
        ),
      ],
      table(
        [
          col('page'),
          col('clicks', 'count'),
          col('impressions', 'count'),
          col('position', 'position'),
        ],
        [...pages]
          .sort((a, b) => b.clicks - a.clicks)
          .map((p) => ({
            page: p.path,
            clicks: p.clicks,
            impressions: p.impressions,
            position: p.position ? Number(p.position.toFixed(1)) : null,
            url: p.url,
          })),
        'pages',
        '/audit',
      ),
    ),
  };
}

/** A growth's figures as the model reads them, each a sentence in the stored language ("Est. extra a month in top 3 1,100 visits"). */
function growthForModel(g) {
  const value = (f) =>
    typeof f.value !== 'number'
      ? String(f.value)
      : f.format === 'percent'
        ? `${(f.value * 100).toFixed(1)}%`
        : f.format === 'change'
          ? `${f.value >= 0 ? '+' : ''}${Math.round(f.value * 100)}%`
          : f.format === 'position'
            ? String(f.value)
            : n(f.value);
  const say = (t) => (t ? systemMessageText(t.key, t.params || {}) : '');
  return {
    kind: g.kind,
    category: g.category || GROWTH_KINDS[g.kind],
    figures: (g.figures || []).map((f) =>
      [say(f.label), value(f), say(f.detail)].filter(Boolean).join(' '),
    ),
    ...(g.evidence ? { evidenceRows: g.evidence.total } : {}),
  };
}

export {
  CTR_BY_POSITION,
  growthForModel,
  expectedCtr,
  extraClicks,
  extraVisits,
  strengthOf,
  nearFirstGrowth,
  lowCtrGrowth,
  newQuerySignals,
  suggestionGroups,
  competitorGaps,
  demandSignals,
  risingKeywordSignals,
  competitorGapSignals,
  aiMissingSignals,
  aiCitedSignals,
  uncitedGrowth,
  trendsGrowth,
  keywordVolumes,
  topicHeatGrowth,
  newRepoSignals,
  launchGrowth,
  clickDropGrowth,
  rankDropGrowth,
  pageGrowth,
  aiDropped,
  aiDroppedGrowth,
  pageIssueGrowth,
  MONTH,
};
