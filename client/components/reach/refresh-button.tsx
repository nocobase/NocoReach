import type { ReactElement } from 'react';
import { RefreshCw } from 'lucide-react';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';

// Every refresh or update control is this one look (2026-10-22 user decision: icon only, the explanation on hover):
// an outline icon button named and tooltipped by `label`, last among the header's actions, its icon spinning while
// the work it started runs. The label says what happens ("Refresh", "Update now", "Update analysis").
export function RefreshButton({
  busy,
  disabled,
  label = $t('common.refresh'),
  onClick,
  className,
}: {
  busy: boolean;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
  className?: string;
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='outline'
            size='icon'
            className={className}
            aria-label={label}
            disabled={busy || disabled}
            onClick={onClick}
          />
        }
      >
        <RefreshCw className={busy ? 'animate-spin' : undefined} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
