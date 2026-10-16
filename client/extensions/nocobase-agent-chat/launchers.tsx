import {
  CHAT_PANEL_ID,
  modifierKeyLabel,
  useChatPanel,
  useConversation,
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
import { cn } from 'cn';

import { useMe } from '../../pages/me.js';
import { useChatTranslation } from './chat-i18n.js';

/** Whether the panel's conversation has a reply in progress: the launchers show it. */
function useReplying(): boolean {
  const { conversationId } = useChatPanel();
  return useConversation(conversationId).data?.run != null;
}

/**
 * A reply in progress: a still dot on the button's corner (`className` places it), ringed in the background so it stays
 * apart from the border.
 */
function ReplyingDot({
  className,
}: {
  readonly className: string;
}): ReactElement {
  return (
    <span
      className={cn(
        'absolute size-2.5 rounded-full bg-primary ring-2 ring-background',
        className,
      )}
      aria-hidden='true'
      data-testid='chat-launcher-replying'
    />
  );
}

/** The header button: opens and closes the panel. */
export function ChatHeaderButton(): ReactElement | null {
  const panel = useChatPanel();
  const { me } = useMe();
  return panel.available && me?.role ? <HeaderButton /> : null;
}

function HeaderButton(): ReactElement {
  const { t } = useChatTranslation();
  const panel = useChatPanel();
  const replying = useReplying();
  const label = t('chat.title');
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
          {replying ? <ReplyingDot className='-top-0.5 -right-0.5' /> : null}
        </TooltipTrigger>
        <TooltipContent side='bottom'>
          {label}
          <Kbd className='ml-1.5'>{`${modifierKeyLabel()} J`}</Kbd>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
