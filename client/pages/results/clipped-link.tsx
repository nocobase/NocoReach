import { useRef, useState } from 'react';
import { Link, type To } from 'react-router';
import { cn } from '#lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';

// A one-line link that ends in an ellipsis when it does not fit, and shows its whole text on hover or focus only
// then (T1.11), as ClippedText does on the proxy profiles page.
export function ClippedLink({
  to,
  text,
  className,
}: {
  to: To;
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [clipped, setClipped] = useState(false);
  const check = () => {
    const el = ref.current;
    setClipped(!!el && el.scrollWidth > el.clientWidth);
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            ref={ref}
            to={to}
            className={cn('nr-link block truncate', className)}
            onMouseEnter={check}
            onFocus={check}
          />
        }
      >
        {text}
      </TooltipTrigger>
      {clipped && <TooltipContent className='max-w-xs'>{text}</TooltipContent>}
    </Tooltip>
  );
}
