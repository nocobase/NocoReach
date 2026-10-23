import { $t } from '#i18n';
import { useMe } from '../../pages/me.js';
import {
  CHAT_DOCK_QUERY,
  CHAT_MOBILE_QUERY,
  CHAT_PANEL_ATTRIBUTE,
  CHAT_PANEL_ID,
  useChatPanel,
} from '@nocobase/app-plugin-agents/client/chat';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Dialog, DialogContent, DialogTitle } from '#components/ui/dialog';
import { cn } from 'cn';

import { ConversationView } from './conversation-view.js';
import { PanelHeader } from './panel-header.js';
import { HistoryList } from './history-list.js';
import { useMediaQuery } from '#hooks/use-media-query';

/** The chat panel; nothing while `ChatProvider` says the panel is not available (signed out, no provider). */
export function ChatPanel(): ReactElement | null {
  const panel = useChatPanel();
  const { me } = useMe();
  return panel.available && me?.role ? <PanelFrame /> : null;
}

function PanelFrame(): ReactElement | null {
  const panel = useChatPanel();
  const mobile = useMediaQuery(CHAT_MOBILE_QUERY);
  const wide = useMediaQuery(CHAT_DOCK_QUERY, true);
  const [mounted, setMounted] = useState(panel.open);
  const asideRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  if (panel.open && !mounted) setMounted(true);

  const { mode, setMode, closeChat, open } = panel;
  useEffect(() => {
    const element = asideRef.current;
    if (!element || !open) return undefined;
    // A native listener: Escape inside a menu or a select (rendered in a portal) never reaches it.
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (mode === 'expanded') setMode('docked');
      else closeChat();
    }
    element.addEventListener('keydown', onKeyDown);
    return () => element.removeEventListener('keydown', onKeyDown);
  }, [open, mode, setMode, closeChat, mounted, mobile]);

  if (!mounted) return null;
  const marker = { [CHAT_PANEL_ATTRIBUTE]: '' };

  if (mobile)
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeChat();
        }}
      >
        <DialogContent
          ref={dialogRef}
          // Focus the dialog on opening so toolbar focus and the software keyboard do not interrupt reading.
          initialFocus={dialogRef}
          id={CHAT_PANEL_ID}
          {...marker}
          showCloseButton={false}
          className='flex h-dvh min-w-0 max-h-dvh w-full max-w-none flex-col gap-0 rounded-none p-0 sm:max-w-none'
          data-testid='chat-panel'
          data-mode='mobile'
        >
          <DialogTitle className='sr-only'>
            {$t('onlineAgent.chat')}
          </DialogTitle>
          <PanelBody compact />
        </DialogContent>
      </Dialog>
    );

  const expanded = mode === 'expanded';
  return (
    <aside
      ref={asideRef}
      id={CHAT_PANEL_ID}
      {...marker}
      aria-label={$t('onlineAgent.chat')}
      hidden={!open}
      data-mode={expanded ? 'expanded' : wide ? 'docked' : 'floating'}
      data-testid='chat-panel'
      className={cn(
        'flex min-h-0 min-w-0 flex-col bg-background',
        expanded
          ? 'absolute inset-0 z-30'
          : wide
            ? 'relative w-[22rem] shrink-0 border-l 2xl:w-[26.25rem]'
            : 'absolute inset-y-0 right-0 z-30 w-[22rem] max-w-full border-l shadow-xl',
      )}
    >
      <PanelBody compact={false} />
    </aside>
  );
}

function PanelBody({ compact }: { compact: boolean }): ReactElement {
  const panel = useChatPanel();
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (panel.open)
      bodyRef.current?.querySelector<HTMLElement>('textarea')?.focus();
  }, [panel.open]);
  const expanded = panel.mode === 'expanded';
  return (
    <div
      ref={bodyRef}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col',
        expanded && 'mx-auto w-full max-w-3xl',
      )}
    >
      <PanelHeader compact={compact} />
      {panel.view === 'history' && (
        <div className='min-h-0 flex-1 overflow-y-auto p-3'>
          <HistoryList
            activeId={panel.conversationId}
            onOpen={panel.selectConversation}
          />
        </div>
      )}
      <div
        hidden={panel.view === 'history'}
        inert={panel.view === 'history'}
        className='flex min-h-0 flex-1 flex-col p-3'
      >
        <ConversationView conversationId={panel.conversationId} />
      </div>
    </div>
  );
}
