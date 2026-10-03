import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center overflow-hidden",
        className
      )}
    >
      <ReachMark className="size-8" />
    </span>
  );
}

// The NocoReach mark: a point (your product) with waves reaching out — the same drawing as public/reach-mark.svg.
export function ReachMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="NocoReach">
      <rect width="64" height="64" rx="16" fill="#4338ca" />
      <circle cx="18" cy="32" r="5.5" fill="#fff" />
      <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round">
        <path d="M25.7 22.8a12 12 0 0 1 0 18.4" />
        <path d="M31.5 15.9a21 21 0 0 1 0 32.2" />
        <path d="M37.3 9a30 30 0 0 1 0 46" opacity=".55" />
      </g>
    </svg>
  );
}

export function BrandWordmark({ className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 text-lg font-semibold tracking-[-0.035em] text-foreground",
        className
      )}
    >
      <ReachMark className="size-7" />
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
    <div className={cn("flex min-w-0 items-center", className)}>
      {showText ? (
        <BrandWordmark className={logoClassName} />
      ) : (
        <BrandLogo className={logoClassName} />
      )}
    </div>
  );
}
