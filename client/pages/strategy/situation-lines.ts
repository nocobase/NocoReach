import type { Area } from './insights-view';

export const isZero = (v: string) => /^[↑↓+\-\s]*0+(\.0+)?\s*%?$/.test(v);

// The lines Current situation shows, with which of them need attention; also its count where it folds beside the side
// panel, and whether it has anything to say. A line whose numbers are all zero is left out (2026-10-24 user decision:
// no queries close to page one, no competitor updates and no ranking moves only took room), which also keeps "0
// critical audit issues", flagged amber for the audit's warnings, from reading as something to deal with. A line
// without numbers (AI search has not been asked yet) stays.
export const situationLines = (areas?: Area[]) =>
  (areas || []).flatMap((a) =>
    a.items
      .filter((i) => !(i.values.length > 0 && i.values.every(isZero)))
      .map((i) => ({
        ...i,
        area: a.id,
        attention: i.tone === 'amber' || i.tone === 'red',
      })),
  );
