import { cn } from '#lib/utils';

// One look for every tab bar (UI reviews 2026-10-21 and 2026-10-22): the look styles.css gives `TabsList variant='line'`
// — a thin rule under the row, tabs flush with the page title and 20px apart, the open one in the foreground over a
// 2px line. Tabs that are links or plain buttons — a route per tab, or a tab kept in the URL — take this class, marked
// as current with `aria-current='page'`, `aria-selected` or `aria-pressed`. Put them in a `nav` or `role='tablist'`
// with `lineTabListClass`.
export const lineTabListClass = 'flex flex-wrap gap-x-5 border-b';

export const lineTabClass = cn(
  'relative -mb-px inline-flex h-10 items-center gap-1.5 rounded-sm text-sm font-medium whitespace-nowrap text-muted-foreground tabular-nums transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
  'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground after:opacity-0 after:transition-opacity',
  'aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100 aria-selected:text-foreground aria-selected:after:opacity-100 aria-pressed:text-foreground aria-pressed:after:opacity-100',
);
