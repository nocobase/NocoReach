import {
  CHAT_PANEL_ID,
  modifierKeyLabel,
  useChatPanel,
} from '@nocobase/app-plugin-agents/client/chat';
import { BotMessageSquareIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { Kbd } from '#components/ui/kbd';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { $t } from '#i18n';

import { useMe } from '../../pages/me.js';

/** The header button: opens and closes the panel. */
export function ChatHeaderButton(): ReactElement | null {
  const panel = useChatPanel();
  const { me } = useMe();
  return panel.available && me?.role ? <HeaderButton /> : null;
}

function HeaderButton(): ReactElement {
  const panel = useChatPanel();
  const label = $t('common.onlineAgent');
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='outline'
              size='icon'
              className='relative size-10 rounded-xl border-border/70 bg-background/60 text-foreground aria-expanded:border-foreground/40 aria-expanded:bg-accent dark:border-border/70'
              aria-label={label}
              aria-expanded={panel.open}
              aria-controls={CHAT_PANEL_ID}
              aria-keyshortcuts='Meta+J Control+J'
              onClick={panel.toggleChat}
              data-testid='chat-header-button'
            />
          }
        >
          <BotMessageSquareIcon className='size-5' />
        </TooltipTrigger>
        <TooltipContent side='bottom'>
          {label}
          <Kbd className='ml-1.5'>{`${modifierKeyLabel()} J`}</Kbd>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
