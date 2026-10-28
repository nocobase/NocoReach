import type {
  ArticleField,
  ArticleFields,
} from '../../../shared/article-publishing.js';

// What an approved primary language changed, for updating the article's other languages in place (2026-10-28, T-53):
// the Agent applies the same edits to each language's own text instead of translating the new primary again, so the
// paragraphs the primary left alone keep their existing localized wording.

/** One changed stretch of the body: removed text (`before`), added text (`after`) and the unchanged block before it. */
export type BodyEdit = { near: string; before: string; after: string };
export type PrimaryChange =
  | { field: Exclude<ArticleField, 'body'>; before: string; after: string }
  | { field: 'body'; edits: BodyEdit[]; truncated?: true };

// Edits beyond this many characters are left out: the Agent compares the two bodies itself (`truncated`).
const MAX_EDITS = 60000;
const NEAR = 300;

/** Markdown blocks: paragraphs, headings, lists and tables as separated by blank lines. */
const blocks = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

/** The changed stretches between two bodies, block by block (longest common subsequence). */
export function bodyEdits(before: string, after: string): BodyEdit[] {
  const a = blocks(before),
    b = blocks(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++;
  const x = a.slice(head, a.length - tail),
    y = b.slice(head, b.length - tail),
    n = x.length,
    m = y.length;
  // A rewrite too large to compare block by block is one edit.
  if (n * m > 2_000_000)
    return [
      {
        near: (head ? a[head - 1] : '').slice(0, NEAR),
        before: x.join('\n\n'),
        after: y.join('\n\n'),
      },
    ];
  const lcs = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i * (m + 1) + j] =
        x[i] === y[j]
          ? lcs[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1]);
  const out: BodyEdit[] = [];
  let near = head ? a[head - 1] : '',
    removed: string[] = [],
    added: string[] = [];
  const flush = () => {
    if (removed.length || added.length)
      out.push({
        near: near.slice(0, NEAR),
        before: removed.join('\n\n'),
        after: added.join('\n\n'),
      });
    removed = [];
    added = [];
  };
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      flush();
      near = x[i];
      i++;
      j++;
    } else if (
      i < n &&
      (j >= m || lcs[(i + 1) * (m + 1) + j] >= lcs[i * (m + 1) + j + 1])
    )
      removed.push(x[i++]);
    else added.push(y[j++]);
  }
  flush();
  return out;
}

/** Each field the primary changed: the title and description before and after, the body as its edits. */
export function primaryChanges(
  was: ArticleFields | undefined,
  now: ArticleFields,
  fields: string[],
): PrimaryChange[] {
  const out: PrimaryChange[] = [];
  for (const field of ['title', 'description'] as const)
    if (fields.includes(field))
      out.push({ field, before: was?.[field] || '', after: now[field] || '' });
  if (fields.includes('body')) {
    const edits = bodyEdits(was?.body || '', now.body || ''),
      size = edits.reduce(
        (s, e) => s + e.near.length + e.before.length + e.after.length,
        0,
      );
    out.push(
      size > MAX_EDITS
        ? { field: 'body', edits: [], truncated: true }
        : { field: 'body', edits },
    );
  }
  return out;
}
