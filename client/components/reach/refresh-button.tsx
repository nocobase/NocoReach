import type { ReactElement } from 'react';
import { RefreshCw } from 'lucide-react';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';

// A page's Refresh (guideline R4): an outline icon button named and tooltipped "Refresh", last among the header's
// actions, its icon spinning while the refresh it started runs.
export function RefreshButton({
  busy,
  disabled,
  onClick,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='outline'
            size='icon'
            aria-label={$t('common.refresh')}
            disabled={busy || disabled}
            onClick={onClick}
          />
        }
      >
        <RefreshCw className={busy ? 'animate-spin' : undefined} />
      </TooltipTrigger>
      <TooltipContent>{$t('common.refresh')}</TooltipContent>
    </Tooltip>
  );
}
