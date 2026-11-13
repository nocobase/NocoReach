import {
  categoryOf,
  growthOf,
  type Growth,
  type GrowthText,
} from './growth.js';
import {
  citedSignals,
  opportunityState,
  pendingOrder,
  rowsFor,
  type Row,
} from './strategy-pending.js';
import type { Opportunity, Signal, StrategyState } from './strategy-model.js';
import type { TaskStanding } from './task-pending.js';

// Content workshop's recommendations (2026-11-13, ui-references/content-workshop-2026-11-12/brief-v4.md), worked out by
// the server from data already collected: no AI judgement and no paid lookups. Trending now lists the opportunities of
// Opportunities' Trending now category that are still live; Site articles lists the site's blog articles by why they are
// worth adapting now, an adapted one again after a while. Shared so the tests and the pages read the same rules.

const DAY = 86400000;
const shift = (d: string, n: number) =>
  new Date(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) + n * DAY)
    .toISOString()
    .slice(0, 10);

// --- Site articles ------------------------------------------------------------------------------------------------

/** At most this many articles are recommended. */
export const ARTICLES_MAX = 6;
/** Clicks rising: the last 7 days up this much on the 7 days before, with at least RISE_MIN clicks. */
export const RISE = 0.3;
export const RISE_MIN = 20;
/** New: published within this many days. */
export const NEW_DAYS = 30;
/** Steady traffic: at least this many clicks over the 12 months, with clicks in at least STEADY_MONTHS of them. */
export const STEADY_MIN = 100;
export const STEADY_MONTHS = 9;
/** An adapted article is not recommended for this many days; a steady one comes back after STEADY_COOL_DAYS. */
export const COOL_DAYS = 14;
export const STEADY_COOL_DAYS = 90;
export const WEEKS = 8;
export const MONTHS = 12;
const MONTH_STARTS = Array.from({ length: MONTHS + 1 }, (_, m) =>
  Math.round((365 * m) / MONTHS),
);

/**
 * The periods Search Console clicks are summed in, back from the last synced day: cut wherever a week (of the last
 * eight) or a month (365 days in twelve) starts, so each period lies in one week, when within the eight, and one month.
 */
export type ClickPeriod = {
  start: string;
  end: string;
  week: number | null;
  month: number;
};
export function clickPeriods(end: string): ClickPeriod[] {
  const cuts = [
    ...new Set([
      ...Array.from({ length: WEEKS + 1 }, (_, w) => w * 7),
      ...MONTH_STARTS,
    ]),
  ].sort((a, b) => a - b);
  return cuts.slice(0, -1).map((from, i) => ({
    start: shift(end, -(cuts[i + 1] - 1)),
    end: shift(end, -from),
    week: from < WEEKS * 7 ? Math.floor(from / 7) : null,
    month: MONTH_STARTS.findIndex(
      (m, j) => j < MONTHS && from >= m && from < MONTH_STARTS[j + 1],
    ),
  }));
}

/** An article's clicks by week and by month, the newest first. */
export type ClickSeries = { weeks: number[]; months: number[] };
export function seriesOf(
  byPeriod: number[],
  periods: ClickPeriod[],
): ClickSeries {
  const weeks = Array<number>(WEEKS).fill(0),
    months = Array<number>(MONTHS).fill(0);
  periods.forEach((p, i) => {
    const c = byPeriod[i] || 0;
    if (p.week !== null) weeks[p.week] += c;
    if (p.month >= 0) months[p.month] += c;
  });
  return { weeks, months };
}

export type ArticleReason = 'rising' | 'new' | 'steady';
export type ArticleFigures = ClickSeries & {
  /** When it went out, as a day. */
  published?: string;
  /** AI answers citing it now. */
  cited: number;
  /** Published after the 7 days before began: there is no full week to compare with. */
  partial?: boolean;
};

/**
 * Why an article is worth adapting now, in the order its card leads with them: clicks rising, new, steady traffic.
 * Being cited by AI answers is an extra tag, never a reason of its own. Without Search Console only New is known.
 */
export function articleReasons(
  a: ArticleFigures,
  { today, searched }: { today: string; searched: boolean },
): ArticleReason[] {
  const out: ArticleReason[] = [];
  const [now, before] = a.weeks;
  if (
    searched &&
    !a.partial &&
    before > 0 &&
    now >= RISE_MIN &&
    (now - before) / before >= RISE
  )
    out.push('rising');
  if (a.published && a.published >= shift(today, -(NEW_DAYS - 1)))
    out.push('new');
  // A new article has no year of traffic to be steady over.
  const year = a.months.reduce((s, c) => s + c, 0);
  if (
    !out.includes('new') &&
    searched &&
    year >= STEADY_MIN &&
    a.months.filter((c) => c > 0).length >= STEADY_MONTHS
  )
    out.push('steady');
  return out;
}

/** When an article was last adapted, with its 7-day clicks and AI citations then when they were kept. */
export type Adaptation = { at: string; clicks7?: number; cited?: number };

/**
 * An article's 7-day clicks when it was adapted: as kept then, else those of the week (of the last eight) the day fell
 * in, else a month's clicks over seven of its days.
 */
export function clicksAt(
  a: ClickSeries,
  last: Adaptation,
  end: string | null,
): number | null {
  if (last.clicks7 !== undefined) return last.clicks7;
  if (!end) return null;
  const days = Math.max(
    0,
    Math.round(
      (Date.parse(`${end.slice(0, 10)}T00:00:00Z`) -
        Date.parse(`${last.at.slice(0, 10)}T00:00:00Z`)) /
        DAY,
    ),
  );
  if (days < WEEKS * 7) return a.weeks[Math.floor(days / 7)];
  const m = MONTH_STARTS.findIndex(
    (s, j) => j < MONTHS && days >= s && days < MONTH_STARTS[j + 1],
  );
  return m < 0
    ? null
    : Math.round((a.months[m] * 7) / (MONTH_STARTS[m + 1] - MONTH_STARTS[m]));
}

/**
 * Whether an article is recommended, and how its clicks moved since it was last adapted (a ratio, null when unknown).
 * One never adapted is recommended for any reason. One adapted in the last COOL_DAYS days is not. After that, a rising
 * or new one comes back when its clicks rose since, or an AI answer started citing it; a steady one STEADY_COOL_DAYS
 * after it was adapted.
 */
export function recommendation(
  a: ArticleFigures,
  reasons: ArticleReason[],
  last: Adaptation | undefined,
  { now, end }: { now: number; end: string | null },
): { show: boolean; since: number | null } {
  if (!reasons.length) return { show: false, since: null };
  if (!last) return { show: true, since: null };
  const days = (now - Date.parse(last.at)) / DAY;
  if (!(days >= COOL_DAYS)) return { show: false, since: null };
  const timely = reasons.includes('rising') || reasons.includes('new'),
    base = clicksAt(a, last, end),
    clicks = a.weeks[0],
    rose = base !== null && clicks > base,
    cited = last.cited !== undefined && a.cited > last.cited;
  return {
    show:
      (timely && (rose || cited)) ||
      (reasons.includes('steady') && days >= STEADY_COOL_DAYS),
    since: timely && base ? (clicks - base) / base : null,
  };
}

const REASON_RANK: Record<ArticleReason, number> = {
  rising: 0,
  new: 1,
  steady: 2,
};
/** The order of the recommended: clicks rising (most clicks first), new (newest first), steady (most clicks first). */
export function articleOrder(
  a: ArticleFigures & { reasons: ArticleReason[]; title: string },
  b: ArticleFigures & { reasons: ArticleReason[]; title: string },
): number {
  const ra = a.reasons[0],
    rb = b.reasons[0],
    year = (x: ClickSeries) => x.months.reduce((s, c) => s + c, 0);
  return (
    REASON_RANK[ra] - REASON_RANK[rb] ||
    (ra === 'rising'
      ? b.weeks[0] - a.weeks[0]
      : ra === 'new'
        ? String(b.published || '').localeCompare(String(a.published || ''))
        : year(b) - year(a)) ||
    a.title.localeCompare(b.title)
  );
}

// --- Trending now -------------------------------------------------------------------------------------------------

/**
 * An opportunity of the Trending now category that is still live: refreshed by an analysis in the last 14 days (the
 * batch rowsFor keeps it from, as Opportunities expires its pending ones), and neither ignored, replaced by a later
 * one, nor closed (every task handed off from it closed). One already handed off stays: short posts sit beside the
 * page or article its task writes.
 */
export function isHot(
  row: Row,
  state: StrategyState,
  standing: (taskId: number) => TaskStanding | undefined,
): boolean {
  if (row.card.resultSource || categoryOf(row.card) !== 'trending')
    return false;
  if (
    opportunityState({ ...row, taskId: undefined }, state).state !== 'pending'
  )
    return false;
  return !(
    row.tasks.length && row.tasks.every((t) => standing(t.taskId) === 'closed')
  );
}
/** The live Trending now opportunities, in Opportunities' order. */
export function hotRows(
  state: StrategyState,
  standing: (taskId: number) => TaskStanding | undefined,
): Row[] {
  return rowsFor(state)
    .filter((r) => isHot(r, state, standing))
    .sort(pendingOrder);
}

const SUBJECT_KEYS = [
  'keyword-rising:',
  'github-topic:',
  'github-new-repo:',
  'gsc-new-query:',
];
/**
 * What a trending opportunity is about: the growth's subject (a keyword, a topic or a repository), else a topic of a
 * discussion growth, else the one the signal it cites names in its key, else the page it changes, by its title when
 * `pageTitle` knows it.
 */
export function hotSubject(
  card: Opportunity,
  signals: Signal[],
  pageTitle?: (url: string) => string | undefined,
): string {
  const g = growthOf(card.growth);
  if (g?.subject) return g.subject;
  // A discussion growth (2026-11-10 step 2b) names its followed topic.
  const topic = (g as { topic?: { name?: unknown } } | undefined)?.topic?.name;
  if (typeof topic === 'string' && topic) return topic;
  for (const s of signals)
    for (const p of SUBJECT_KEYS)
      if (s.key.startsWith(p) && s.key.length > p.length)
        return s.key.slice(p.length);
  if (g?.kind === 'new-query' && card.target)
    try {
      return pageTitle?.(card.target) || new URL(card.target).pathname;
    } catch {
      return '';
    }
  return '';
}

const count = (n: number) => Math.round(n).toLocaleString('en-US');
const times = (r: number) => String(Number(r.toFixed(1)));
const percent = (r: number) => `${Math.round(r * 100)}%`;
const figureOf = (g: Growth, label: string) =>
  g.figures.find((f) => f.label.key === `growth.figure.${label}`);
const numberOf = (g: Growth, label: string) => {
  const v = figureOf(g, label)?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
/** A repository by its name ("openboard"), as people say it. */
const repoName = (repo: string) =>
  repo.split('/').filter(Boolean).at(-1) || repo;

/** A discussion growth's weekly totals, the oldest first (shared/growth.ts `weeks`, Opportunities' weekly chart). */
export function weeklyDiscussions(growth: unknown): number[] {
  const weeks = (growth as { weeks?: unknown } | undefined)?.weeks;
  if (!Array.isArray(weeks)) return [];
  type Week = { week: string; counts: Record<string, unknown> };
  return (weeks as unknown[])
    .filter((w): w is Week => {
      const x = w as Partial<Week> | null;
      return Boolean(x) && typeof x?.week === 'string' && Boolean(x.counts);
    })
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((w) =>
      Object.values(w.counts).reduce<number>(
        (s, c) => s + (typeof c === 'number' && Number.isFinite(c) ? c : 0),
        0,
      ),
    );
}

/**
 * What is hot, in words built from the growth the server computed ("Searches for “ai project management” up 126% in
 * 3 months"), or null when the growth names no subject or lacks the numbers: the card then shows the opportunity's
 * title. Numbers are written out here, so a task's title reads the same in every language's number style.
 */
export function hotHeadline(
  card: Opportunity,
  signals: Signal[],
  pageTitle?: (url: string) => string | undefined,
): GrowthText | null {
  const g = growthOf(card.growth);
  if (!g) return null;
  const subject = hotSubject(card, signals, pageTitle);
  const weekly = weeklyDiscussions(g);
  if (subject && weekly.length >= 8) {
    const last = weekly.slice(-4).reduce((s, c) => s + c, 0),
      before = weekly.slice(-8, -4).reduce((s, c) => s + c, 0);
    if (last > 0)
      return before > 0
        ? {
            key: 'workshop.hot.discussionsTimes',
            params: { 0: subject, 1: times(last / before) },
          }
        : {
            key: 'workshop.hot.discussionsNew',
            params: { 0: subject, 1: count(last) },
          };
  }
  if (g.kind === 'rising') {
    const change = numberOf(g, 'threeMonthChange');
    if (subject && change !== null)
      return {
        key: 'workshop.hot.searchRise',
        params: { 0: subject, 1: percent(change) },
      };
    const rising = numberOf(g, 'risingSearches'),
      rows = g.evidence?.columns.some((c) => c.key === 'query')
        ? g.evidence.rows
        : [],
      top = [...rows].sort(
        (a, b) => (Number(b.rise) || 0) - (Number(a.rise) || 0),
      )[0];
    if (rising !== null && typeof top?.query === 'string')
      return {
        key: 'workshop.hot.relatedRise',
        params: { 0: top.query, 1: count(rising) },
      };
    return null;
  }
  if (g.kind === 'new-query') {
    const queries = numberOf(g, 'newQueries');
    return subject && queries !== null
      ? {
          key: 'workshop.hot.newQueries',
          params: { 0: subject, 1: count(queries) },
        }
      : null;
  }
  if (g.kind === 'topic-heat') {
    const week = numberOf(g, 'newRepositoriesWeek'),
      before = numberOf(g, 'newRepositoriesBefore');
    return subject && week !== null && before
      ? {
          key: 'workshop.hot.topicRepos',
          params: { 0: subject, 1: count(week), 2: times(week / before) },
        }
      : null;
  }
  if (g.kind === 'new-repo') {
    const stars = numberOf(g, 'starsWeek');
    return subject && stars !== null
      ? {
          key: 'workshop.hot.repoStars',
          params: { 0: repoName(subject), 1: count(stars) },
        }
      : null;
  }
  return null;
}

/** A discussion a trending opportunity rests on, from its growth's rows (a discussion growth's, 2026-11-10 step 2b). */
export type HotDiscussion = {
  title: string;
  url?: string;
  /** SourceLogo's name: reddit, hackernews, youtube, github. */
  logo: string;
  /** Where: "r/projectmanagement", "Hacker News", a YouTube channel. */
  place: string;
  subreddit?: string;
  /** Votes and comments, views or stars; none for Reddit, whose threads are read through Google without them. */
  heat?: GrowthText;
  date?: string;
};
export function hotDiscussions(growth: unknown): HotDiscussion[] {
  const g = growthOf(growth);
  const keys = new Set(g?.evidence?.columns.map((c) => c.key) || []);
  if (!g?.evidence || !keys.has('discussion') || !keys.has('source')) return [];
  return g.evidence.rows.flatMap((r): HotDiscussion[] => {
    const title = typeof r.discussion === 'string' ? r.discussion : '',
      source = typeof r.source === 'string' ? r.source : '';
    if (!title || !source) return [];
    const [name, where = ''] = source.split(' · '),
      logo = /^reddit$/i.test(name)
        ? 'reddit'
        : /^hacker news$/i.test(name)
          ? 'hackernews'
          : /^youtube$/i.test(name)
            ? 'youtube'
            : /^github$/i.test(name)
              ? 'github'
              : 'community',
      subreddit =
        logo === 'reddit' && /^r\/\w+$/.test(where)
          ? where.slice(2)
          : undefined,
      heat = r.heat as unknown as GrowthText | null | undefined;
    return [
      {
        title,
        ...(typeof r.url === 'string' && r.url ? { url: r.url } : {}),
        logo,
        place: where || name,
        ...(subreddit ? { subreddit } : {}),
        ...(logo !== 'reddit' && heat && typeof heat.key === 'string'
          ? { heat }
          : {}),
        ...(typeof r.date === 'string' && r.date ? { date: r.date } : {}),
      },
    ];
  });
}

/** The cited signals of a row, for hotSubject and hotHeadline. */
export const hotSignals = (row: Row): Signal[] => citedSignals(row);
