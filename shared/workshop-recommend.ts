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

// Content workshop's Trending now (2026-11-13, ui-references/content-workshop-2026-11-12/brief-v5.md), worked out by the
// server from data already collected: no AI judgement and no paid lookups. It lists the opportunities of Opportunities'
// Trending now category that are still live and were not handled in the workshop yet. The site's articles are not
// recommended: the workshop lists them all in Library, newest first (libraryOrder). Shared so the tests and the pages
// read the same rules.

const DAY = 86400000;
const day = (iso?: string) => Date.parse(String(iso || '').slice(0, 10));

/**
 * An opportunity of the Trending now category that is still live, so it can be adapted (Adapt into short posts on its
 * Opportunities detail): refreshed by an analysis in the last 14 days (the batch rowsFor keeps it from, as Opportunities
 * expires its pending ones), and neither ignored, replaced by a later one, nor closed (every task handed off from it
 * closed). One already handed off stays: short posts sit beside the page or article its task writes. The workshop
 * lists those hotAway leaves in.
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
/** The live Trending now opportunities, in Opportunities' order: those the workshop lists, and those it has left. */
export function hotRows(
  state: StrategyState,
  standing: (taskId: number) => TaskStanding | undefined,
): Row[] {
  return rowsFor(state)
    .filter((r) => isHot(r, state, standing))
    .sort(pendingOrder);
}

/** Trending now in the workshop keeps an opportunity this many days after the last analysis that found it. */
export const HOT_FRESH_DAYS = 7;
export type HotAway = 'adapted' | 'skipped' | 'stale';
/**
 * Why a live Trending now opportunity has left the workshop's Trending now (v5), or null while it is listed: a task was
 * made from it in Content workshop (Adapt now, or Adapt into short posts on Opportunities), it was skipped there, or no
 * analysis has found it for HOT_FRESH_DAYS days, counted from the latest analysis as Opportunities counts its 14. It can
 * still be adapted from its detail on Opportunities, where it is unchanged.
 */
export function hotAway(
  row: Row,
  state: StrategyState,
  { adapted, skipped }: { adapted: boolean; skipped: boolean },
): HotAway | null {
  if (adapted) return 'adapted';
  if (skipped) return 'skipped';
  const quiet =
    (day(state.insights?.generatedAt) - day(row.batch.generatedAt)) / DAY;
  return quiet >= HOT_FRESH_DAYS ? 'stale' : null;
}

/** An article as Library orders it. */
export type LibraryArticle = {
  title: string;
  /** When it went out, as a day. */
  published?: string;
  /** Search Console clicks of the last 30 days; null without Search Console. */
  clicks30: number | null;
};
/** Library's order (v5): the newest published first; articles without a known date last, the most clicked first. */
export function libraryOrder(a: LibraryArticle, b: LibraryArticle): number {
  if (Boolean(a.published) !== Boolean(b.published))
    return a.published ? -1 : 1;
  return (
    String(b.published || '').localeCompare(String(a.published || '')) ||
    (b.clicks30 ?? 0) - (a.clicks30 ?? 0) ||
    a.title.localeCompare(b.title)
  );
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
