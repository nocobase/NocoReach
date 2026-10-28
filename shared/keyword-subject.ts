/**
 * What a Keywords › AI suggestions conversation was opened on, carried in the page subject's `item`: a keyword row
 * (Dig from this keyword, the keyword itself), the seed words as a whole (Adjust seed words with AI, `seeds:`) or one
 * seed word (a seed chip, `seeds:<seed>`). Search keywords never start with `seeds:`.
 */
export const SEEDS_ITEM = 'seeds:';
export const seedsItem = (seed = '') => `${SEEDS_ITEM}${seed}`;
export type KeywordsFocus =
  | { kind: 'list' }
  | { kind: 'keyword'; keyword: string }
  | { kind: 'seeds' }
  | { kind: 'seed'; seed: string };
export function keywordsFocus(item?: string): KeywordsFocus {
  if (!item) return { kind: 'list' };
  if (!item.startsWith(SEEDS_ITEM)) return { kind: 'keyword', keyword: item };
  const seed = item.slice(SEEDS_ITEM.length).trim();
  return seed ? { kind: 'seed', seed } : { kind: 'seeds' };
}
