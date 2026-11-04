import type { ReactElement } from 'react';
import { TooltipProvider } from '#components/ui/tooltip';
import { UserMenu } from './user-menu.js';
import { InboxHeaderButton } from '#components/inbox-header-button';

/** NocoReach keeps its unread shortcut as an application-owned header action. */
export function HeaderActions(): ReactElement {
  return (
    <TooltipProvider>
      <div className='flex shrink-0 items-center gap-1 xl:gap-2'>
        <InboxHeaderButton />
        <UserMenu />
      </div>
    </TooltipProvider>
  );
}
