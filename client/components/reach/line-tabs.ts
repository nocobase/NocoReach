import { cn } from '#lib/utils';

// One look for every page-level tab bar (UI review 2026-10-21: Members & roles, API keys and Agent drew pill buttons
// while the data pages drew line tabs). The shadcn `TabsList variant='line'` draws these for tabs inside a page; tabs
// that are links or plain buttons — a route per tab, or a tab kept in the URL — take this class, marked as current with
// `aria-current='page'` or `aria-selected`. Put them in a `nav` or `role='tablist'` with `lineTabListClass`.
export const lineTabListClass = 'flex flex-wrap gap-1 pb-1.5';

export const lineTabClass = cn(
  'relative inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:text-muted-foreground dark:hover:text-foreground',
  'after:absolute after:inset-x-0 after:bottom-[-5px] after:h-0.5 after:bg-foreground after:opacity-0 after:transition-opacity',
  'aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100 aria-selected:text-foreground aria-selected:after:opacity-100',
);
