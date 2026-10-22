import type { ReactNode } from 'react';
import { cn } from '#lib/utils';

export type SegmentedOption = {
  id: string;
  label: ReactNode;
  /** Shown on hover; also the accessible name when `label` is only an icon. */
  title?: string;
  disabled?: boolean;
};

/**
 * One look for every "pick one of a few" control (UI review 2026-10-22, decision D1): square corners, a thin border,
 * the chosen one on a muted ground. Date ranges, chart metrics, periods and checkpoints all use it; tab bars are
 * line tabs instead (`lineTabClass`). `size='sm'` is for narrow side cards.
 */
export function Segmented({
  label,
  options,
  value,
  onChange,
  size = 'default',
  className,
}: {
  label: string;
  options: SegmentedOption[];
  value: string;
  onChange: (id: string) => void;
  size?: 'default' | 'sm';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex shrink-0 flex-wrap overflow-hidden rounded-md border',
        className,
      )}
      role='group'
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type='button'
          aria-pressed={o.id === value}
          aria-label={typeof o.label === 'string' ? undefined : o.title}
          title={o.title}
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
          className={cn(
            'inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground tabular-nums transition-colors hover:text-foreground focus-visible:relative focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground',
            size === 'sm' ? 'h-6 px-2 text-xs' : 'h-8 px-3 text-sm',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
