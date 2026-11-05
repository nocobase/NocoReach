import {
  ARTICLE_FIELDS,
  type ArticleContent,
  type ArticleDraft,
} from '../../../shared/article-publishing.js';

// How many places a person changed between two versions of an article (2026-11-04, reviewing is editing): the count in
// a version's Activity line. Each language's title and summary is one place when it changed; a body is split into
// blocks on blank lines, and each run of blocks that changed, were added or were removed, between two that stayed, is
// one place.

/** The article as a version shows it: the version's own fields over the article it was written against. */
export type ArticleText = {
  slug?: string;
  status?: string;
  locales: Record<
    string,
    Partial<Record<(typeof ARTICLE_FIELDS)[number], string>>
  >;
};

/** A version's draft read over its base: fields the draft leaves out are the base's. */
export function articleText(
  draft: Pick<ArticleDraft, 'slug' | 'status' | 'locales'>,
  base: ArticleContent | null | undefined,
): ArticleText {
  const locales: ArticleText['locales'] = {};
  for (const l of new Set([
    ...Object.keys(base?.locales || {}),
    ...Object.keys(draft.locales || {}),
  ]))
    locales[l] = Object.fromEntries(
      ARTICLE_FIELDS.map((f) => [
        f,
        draft.locales?.[l]?.[f] ?? base?.locales[l]?.[f] ?? '',
      ]),
    );
  return {
    slug: draft.slug ?? base?.slug ?? '',
    status: draft.status ?? base?.status ?? '',
    locales,
  };
}

/** A body's blocks: the text between blank lines, without the spaces around it. */
export const bodyBlocks = (body: string): string[] =>
  body
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

// Beyond this many cells the middle part of two bodies that differs is counted as one place rather than compared.
const CELLS_MAX = 4_000_000;

/** How many runs of changed, added or removed blocks separate two lists of blocks, by their longest common subsequence. */
export function changedRuns(
  before: readonly string[],
  after: readonly string[],
): number {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let endB = before.length,
    endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }
  const b = before.slice(start, endB),
    a = after.slice(start, endA);
  if (!b.length && !a.length) return 0;
  if (!b.length || !a.length) return 1;
  if (b.length * a.length > CELLS_MAX) return 1;
  // lcs[i][j]: the longest common subsequence of b[i..] and a[j..], one row of (a.length + 1) per i.
  const width = a.length + 1;
  const lcs = new Uint32Array((b.length + 1) * width);
  for (let i = b.length - 1; i >= 0; i--)
    for (let j = a.length - 1; j >= 0; j--)
      lcs[i * width + j] =
        b[i] === a[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
  let runs = 0,
    inRun = false,
    i = 0,
    j = 0;
  while (i < b.length || j < a.length) {
    if (
      i < b.length &&
      j < a.length &&
      b[i] === a[j] &&
      lcs[i * width + j] === lcs[(i + 1) * width + j + 1] + 1
    ) {
      inRun = false;
      i++;
      j++;
      continue;
    }
    if (!inRun) runs++;
    inRun = true;
    if (
      j >= a.length ||
      (i < b.length && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])
    )
      i++;
    else j++;
  }
  return runs;
}

/** The places that differ between two versions of an article: slug, status, and each language's fields. */
export function editPlaces(before: ArticleText, after: ArticleText): number {
  let places = 0;
  if ((before.slug || '') !== (after.slug || '')) places++;
  if ((before.status || '') !== (after.status || '')) places++;
  for (const l of new Set([
    ...Object.keys(before.locales),
    ...Object.keys(after.locales),
  ])) {
    const was = before.locales[l] || {},
      now = after.locales[l] || {};
    for (const f of ['title', 'description'] as const)
      if ((was[f] || '').trim() !== (now[f] || '').trim()) places++;
    places += changedRuns(
      bodyBlocks(was.body || ''),
      bodyBlocks(now.body || ''),
    );
  }
  return places;
}
