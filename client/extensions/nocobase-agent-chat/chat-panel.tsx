import { $t } from '#i18n';
import { Maximize2Icon, Minimize2Icon, XIcon } from 'lucide-react';
import { useMe } from '../../pages/me.js';
import { OnlineChatView } from '../../online-agent/chat.js';
import { OnlineChatAction } from '../../online-agent/controls.js';
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

import { useMediaQuery } from './use-media-query.js';

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
          className='flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 rounded-none p-0 sm:max-w-none'
          data-testid='chat-panel'
          data-mode='mobile'
        >
          <DialogTitle className='sr-only'>
            {$t('common.onlineAgent')}
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
      aria-label={$t('common.onlineAgent')}
      hidden={!open}
      data-mode={expanded ? 'expanded' : wide ? 'docked' : 'floating'}
      data-testid='chat-panel'
      className={cn(
        'flex min-h-0 flex-col bg-background',
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
  const expanded = panel.mode === 'expanded';
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col p-3',
        expanded && 'mx-auto w-full max-w-3xl',
      )}
    >
      <OnlineChatView
        actions={
          <>
            {!compact && (
              <OnlineChatAction
                label={$t(
                  panel.mode === 'expanded'
                    ? 'onlineAgent.collapse'
                    : 'onlineAgent.expand',
                )}
                onClick={() =>
                  panel.setMode(
                    panel.mode === 'expanded' ? 'docked' : 'expanded',
                  )
                }
              >
                {panel.mode === 'expanded' ? (
                  <Minimize2Icon />
                ) : (
                  <Maximize2Icon />
                )}
              </OnlineChatAction>
            )}
            <OnlineChatAction
              label={$t('onlineAgent.close')}
              onClick={panel.closeChat}
            >
              <XIcon />
            </OnlineChatAction>
          </>
        }
      />
    </div>
  );
}
