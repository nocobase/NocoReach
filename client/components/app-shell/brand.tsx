import { cn } from '#lib/utils';

type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center overflow-hidden',
        className
      )}
    >
      <ReachMark className='size-8' />
    </span>
  );
}

// The NocoReach mark: three blocks in NocoBase's isometric style rising like a growth chart, the tallest topped in
// violet — the same drawing as public/nocoreach-mark.svg. The faint edge keeps the square visible on a dark sidebar.
const BARS = [
  { x: 18, top: 42 },
  { x: 32, top: 33 },
  { x: 46, top: 21 },
];

export function ReachMark({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 64 64' className={className} role='img' aria-label='NocoReach'>
      <rect x='.5' y='.5' width='63' height='63' rx='14.5' fill='#0B0B0F' stroke='#fff' strokeOpacity='.12' />
      {BARS.map(({ x, top }, i) => (
        <g key={x}>
          <path d={`M${x - 7} ${top - 4}L${x} ${top}V52L${x - 7} 48Z`} fill='#fff' />
          <path d={`M${x} ${top}L${x + 7} ${top - 4}V48L${x} 52Z`} fill='#fff' fillOpacity='.72' />
          <path d={`M${x - 7} ${top - 4}L${x} ${top - 8}L${x + 7} ${top - 4}L${x} ${top}Z`} fill={i === BARS.length - 1 ? '#7C6CFF' : '#fff'} fillOpacity={i === BARS.length - 1 ? 1 : 0.45} />
        </g>
      ))}
    </svg>
  );
}

export function BrandWordmark({ className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-2 text-lg font-semibold tracking-[-0.035em] text-foreground',
        className
      )}
    >
      <ReachMark className='size-7' />
      NocoReach
    </span>
  );
}
type BrandProps = {
  className?: string;
  logoClassName?: string;
  showText?: boolean;
};

export function Brand({
  className,
  logoClassName,
  showText = true,
}: BrandProps) {
  return (
    <div className={cn('flex min-w-0 items-center', className)}>
      {showText ? (
        <BrandWordmark className={logoClassName} />
      ) : (
        <BrandLogo className={logoClassName} />
      )}
    </div>
  );
}
