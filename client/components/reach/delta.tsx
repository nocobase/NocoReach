import type { ReactElement } from 'react';
import { cn } from '#lib/utils';
import { ARROW, directionOf, formatChangeSize, formatCount } from '#lib/format';

// The one way to show a change on every page: an arrow, a space and the size ("↑ 12%", "↓ 9.8%", "↑ 23"), green when
// it is good news and red when it is bad. The arrow says the direction, so the colour is only an aid (guideline A2).
// Differences shown as plain numbers in a table column ("+253", "−2,578") use `formatSigned` instead.
export function Delta({
  value,
  kind = 'percent',
  good = 'up',
  suffix,
  className,
}: {
  /** A ratio for `percent` (0.12 = 12%), a difference otherwise. */
  value: number | null | undefined;
  /** `count` for whole differences (places in a ranking), `points` for differences with one decimal. */
  kind?: 'percent' | 'count' | 'points';
  /** Which way is good news; `none` when neither is (the change is shown without colour). */
  good?: 'up' | 'down' | 'none';
  /** A unit after the number, such as "/week". */
  suffix?: string;
  className?: string;
}): ReactElement | null {
  if (value == null || !Number.isFinite(value)) return null;
  const size =
    kind === 'percent'
      ? formatChangeSize(value)
      : formatCount(Math.abs(value), kind === 'points' ? 1 : 0);
  // A change too small to show ("0%", "0") is no change: no arrow, no colour.
  const direction = directionOf(
    Math.round(
      value * (kind === 'percent' ? 1000 : kind === 'points' ? 10 : 1),
    ),
  );
  const tone =
    direction === 'flat' || good === 'none'
      ? 'text-muted-foreground'
      : (direction === 'up') === (good === 'up')
        ? 'text-nr-ink-green'
        : 'text-nr-ink-red';
  return (
    <span
      data-slot='delta'
      data-direction={direction}
      className={cn('whitespace-nowrap tabular-nums', tone, className)}
    >
      {ARROW[direction] ? `${ARROW[direction]} ` : ''}
      {size}
      {suffix}
    </span>
  );
}
