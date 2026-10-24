import type { Area, AreaItem } from './insights-view';

export const isZero = (v: string) => /^[↑↓+\-\s]*0+(\.0+)?\s*%?$/.test(v);

// The order of the groups (server: insight-summary.ts): getting worse, to handle, opportunities, share of voice.
const GROUP_ORDER = ['worse', 'handle', 'chance', 'voice'];
const rank = (i: AreaItem) =>
  i.group
    ? GROUP_ORDER.indexOf(i.group)
    : i.tone === 'amber' || i.tone === 'red'
      ? 1
      : 3;
// A change ("↑ 12%") beside a count says how it moved, not whether there is anything: a line counts as zero by its
// count, or by its change when it has nothing else (Google interest).
const allZero = (values: string[]) => {
  const counts = values.filter((v) => !/^[↑↓]/.test(v));
  return values.length > 0 && (counts.length ? counts : values).every(isZero);
};

// The lines Current situation shows, in group order, with which of them need attention (getting worse or to handle);
// also its count where it folds beside the side panel, and whether it has anything to say. A line whose numbers are all
// zero is left out (2026-10-24 user decision: no queries close to page one or no ranking moves only took room), which
// also keeps "0 critical audit issues", flagged amber for the audit's warnings, from reading as something to deal with.
// A line without numbers (AI search has not been asked yet) stays.
export const situationLines = (areas?: Area[]) =>
  (areas || [])
    .flatMap((a) =>
      a.items
        .filter((i) => !allZero(i.values))
        .map((i) => ({ ...i, area: a.id, attention: rank(i) < 2 })),
    )
    .sort((a, b) => rank(a) - rank(b));
