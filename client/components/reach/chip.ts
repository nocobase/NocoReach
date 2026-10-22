import { cn } from '#lib/utils';

// One look for the small rounded chips a page lists its terms in (UI review 2026-10-22): Trends' compared products,
// AI search's topics and the keywords offered to watch. A chip that can be clicked adds `chipButtonClass`.
export const chipClass =
  'inline-flex h-6 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs whitespace-nowrap';

export const chipButtonClass = cn(
  'cursor-pointer transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50',
);
