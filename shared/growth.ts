// Growth opportunities (2026-11-10 user decisions): Opportunities lists what the site can gain, in four categories that
// each answer one question a marketer asks — what people are talking about now (trending), what they keep searching
// for that we have no content on (new content), where competitors are ahead (competitor gaps), and what our existing
// pages could still win or are losing (content optimization). Each growth change carries the size of the growth and
// the rows behind it, both computed by the server from data already collected (server/nocoreach/growth-signals.ts);
// the model never writes these numbers. An opportunity takes them from the first growth change it cites
// (server/nocoreach/strategy-service.ts saveInsights). Unanswered community posts, conversion and volume figures stay
// in Insights › Current situation.

/** The four categories, in the order the filter and the counts list them. */
export const GROWTH_CATEGORIES = [
  'trending',
  'new-content',
  'competitor-gaps',
  'optimize',
] as const;
export type GrowthCategory = (typeof GROWTH_CATEGORIES)[number];
export const isGrowthCategory = (value: unknown): value is GrowthCategory =>
  typeof value === 'string' &&
  (GROWTH_CATEGORIES as readonly string[]).includes(value);

/**
 * The kind of growth point (the opportunity's second tag) and the category it belongs to. Trending looks at change and
 * new content at the total: a keyword group without a page that is also clearly rising is trending instead
 * (growth-signals.ts demandSignals), so a growth stores its own category.
 */
export const GROWTH_KINDS = {
  rising: 'trending',
  'new-query': 'trending',
  'topic-heat': 'trending',
  'new-repo': 'trending',
  'demand-gap': 'new-content',
  'competitor-gap': 'competitor-gaps',
  'not-mentioned': 'competitor-gaps',
  'cited-sources': 'competitor-gaps',
  'competitor-launch': 'competitor-gaps',
  'near-first': 'optimize',
  'low-ctr': 'optimize',
  uncited: 'optimize',
  'rank-drop': 'optimize',
  'click-drop': 'optimize',
  'stale-page': 'optimize',
  'thin-page': 'optimize',
  'ai-dropped': 'optimize',
  'page-issue': 'optimize',
} as const satisfies Record<string, GrowthCategory>;
export type GrowthKind = keyof typeof GROWTH_KINDS;
export const isGrowthKind = (value: unknown): value is GrowthKind =>
  typeof value === 'string' && Object.hasOwn(GROWTH_KINDS, value);

/** Message key and its values, read in the reader's language (shared/i18n). */
export type GrowthText = {
  key: string;
  params?: Record<string, string | number>;
};

/**
 * One number of the growth row: a label, the value and what follows it in grey ("1,100 visits"). `estimate` marks a
 * number the server estimated rather than counted, which the label already says ("Est. extra visits a month in top 3").
 */
export type GrowthFigure = {
  label: GrowthText;
  value: number | string;
  /** How a number reads; a count by default. */
  format?: 'count' | 'percent' | 'position' | 'change' | 'date';
  detail?: GrowthText;
  estimate?: boolean;
};

/**
 * An estimate to two significant figures (1,073 reads 1,100; 211 reads 210), as everywhere it is shown or quoted: the
 * growth row, the facts and what the model is told. Counted numbers (searches, impressions, stars) stay exact.
 */
export function roundEstimate(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(value))) - 1);
  return Math.round(value / step) * step;
}

/**
 * How a column's values read: counts, ratios as percentages, positions, keyword difficulty, a change (a ratio, +1.8
 * reads "+180%"), a difference of counts ("+12", "-340"), a day, an AI platform (chat_gpt, google), lists, and
 * message keys (`label`).
 */
export type EvidenceFormat =
  | 'text'
  | 'label'
  | 'count'
  | 'percent'
  | 'position'
  | 'difficulty'
  | 'change'
  | 'delta'
  | 'date'
  | 'platform'
  | 'list';
export type EvidenceColumn = {
  key: string;
  label: string;
  format: EvidenceFormat;
  /** A position's former value: the row key shown after it in grey ("11 ← 4"), as Search performance shows a move. */
  from?: string;
};
/** A cell: a number or a text, a list (joined), or an item with its rank ("Nimbus #4"); null reads as "—". */
export type EvidenceCell =
  number | string | null | (string | { name: string; rank: number })[];
export type EvidenceRow = Record<string, EvidenceCell> & {
  url?: string | null;
};
/**
 * What a growth point rests on: at most EVIDENCE_ROWS rows of `total`, with the page that lists all of them. `unit`
 * names what a row is ("keywords", "questions") for "Evidence · 14 keywords" and "View all 14 keywords →".
 */
export type EvidenceTable = {
  columns: EvidenceColumn[];
  rows: EvidenceRow[];
  total: number;
  unit: string;
  link: string;
};
export const EVIDENCE_ROWS = 10;

export type Growth = {
  kind: GrowthKind;
  category: GrowthCategory;
  figures: GrowthFigure[];
  evidence?: EvidenceTable;
};

/**
 * A stored growth as the pages may trust it: a known kind and between one and four figures. Its category is the one
 * the server gave it, else its kind's (growths stored before the categories had an `area` instead).
 */
export function growthOf(value: unknown): Growth | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const g = value as Partial<Growth> & { area?: unknown };
  if (!isGrowthKind(g.kind) || !Array.isArray(g.figures) || !g.figures.length)
    return undefined;
  const { area: _area, ...rest } = g;
  return {
    ...(rest as Growth),
    category: isGrowthCategory(g.category) ? g.category : GROWTH_KINDS[g.kind],
  };
}
/** The category of an opportunity or a change, when it carries a growth. */
export const categoryOf = (item: {
  growth?: unknown;
}): GrowthCategory | undefined => growthOf(item.growth)?.category;

/**
 * Where an opportunity that writes a new page puts it (2026-11-10 review: a new page has no address to show yet): the
 * section of the site it would go under ("/blog/") and up to three existing pages to link to it from, as paths. The
 * model writes it; a full address is read as its path, and anything else is dropped.
 */
export type NewPage = { section: string; linkFrom: string[] };

const sitePath = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  try {
    return new URL(text).pathname;
  } catch {
    return text.startsWith('/') ? text : '';
  }
};

export function newPageOf(value: unknown): NewPage | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const section = sitePath(v.section).slice(0, 200);
  if (!section) return null;
  const linkFrom = [
    ...new Set(
      (Array.isArray(v.linkFrom) ? v.linkFrom : [])
        .map(sitePath)
        .filter((path) => path && path !== section)
        .map((path) => path.slice(0, 300)),
    ),
  ].slice(0, 3);
  return { section, linkFrom };
}
