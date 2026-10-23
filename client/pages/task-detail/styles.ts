// The task page's one layout system (2026-10-22 user decision: the page looked assembled from years of iterations).
// Four text styles and nothing else: the page title, a card title, body text and grey secondary text. Labels (Source,
// Owner, Playbook) are secondary text. Every card has the same radius, padding and spacing, and holds a single level of
// boxes: its own fields and controls, never another bordered or shaded box. Every task state uses the same skeleton;
// only the content of the card for what to do now changes.
export const text = {
  title: 'font-heading text-2xl font-semibold tracking-tight',
  cardTitle: 'font-heading text-sm font-semibold',
  body: 'text-sm text-foreground',
  muted: 'text-sm text-muted-foreground',
} as const;

/** The space between cards; blocks inside a card are closer (layout.tsx). */
export const GAP = 'gap-6';
