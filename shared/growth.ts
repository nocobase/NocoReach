// Growth opportunities (2026-11-10 user decision): Opportunities lists growth points only, found in data already
// collected — keywords (SEO), AI search (GEO), GitHub and competitors — rather than in what dropped or broke, which stays
// in Insights › Needs attention. Each growth change carries the size of the growth and the rows behind it, both computed
// by the server from the data (server/nocoreach/growth-signals.ts); the model never writes these numbers. An opportunity
// takes them from the first growth change it cites (server/nocoreach/strategy-service.ts saveInsights).

/** Where a growth point comes from, as the opportunity's first tag says. */
export type GrowthArea = 'keywords' | 'ai-search' | 'github' | 'competitors';

/** The kind of growth point, as the opportunity's second tag says. */
export const GROWTH_KINDS = {
  'demand-gap': 'keywords',
  'competitor-gap': 'keywords',
  'near-first': 'keywords',
  'low-ctr': 'keywords',
  rising: 'keywords',
  'new-query': 'keywords',
  'not-mentioned': 'ai-search',
  'cited-sources': 'ai-search',
  uncited: 'ai-search',
  'topic-heat': 'github',
  'new-repo': 'github',
  'competitor-launch': 'competitors',
} as const satisfies Record<string, GrowthArea>;
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
 * reads "+180%"), a day, an AI platform (chat_gpt, google), lists, and message keys (`label`).
 */
export type EvidenceFormat =
  | 'text'
  | 'label'
  | 'count'
  | 'percent'
  | 'position'
  | 'difficulty'
  | 'change'
  | 'date'
  | 'platform'
  | 'list';
export type EvidenceColumn = {
  key: string;
  label: string;
  format: EvidenceFormat;
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
  area: GrowthArea;
  figures: GrowthFigure[];
  evidence?: EvidenceTable;
};

/** A stored growth as the pages may trust it: a known kind and between one and four figures. */
export function growthOf(value: unknown): Growth | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const g = value as Partial<Growth>;
  if (!isGrowthKind(g.kind) || !Array.isArray(g.figures) || !g.figures.length)
    return undefined;
  return { ...(g as Growth), area: GROWTH_KINDS[g.kind] };
}

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
