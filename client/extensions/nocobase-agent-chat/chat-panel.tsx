import { $t, prepareBusinessLocale } from '#i18n';
import { XIcon } from 'lucide-react';
import { useMe } from '../../pages/me.js';
import {
  CHAT_DOCK_QUERY,
  CHAT_MOBILE_QUERY,
  CHAT_PANEL_ATTRIBUTE,
  CHAT_PANEL_ID,
  useChatPanel,
} from '@nocobase/app-plugin-agents/client/chat';
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';

import { Dialog, DialogContent, DialogTitle } from '#components/ui/dialog';
import { cn } from 'cn';

import { useMediaQuery } from '#hooks/use-media-query';

// Keep conversations, Markdown and run history outside the application's startup graph.
const PanelBody = lazy(() =>
  prepareBusinessLocale().then(() => import('./panel-body.js')),
);

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
            {$t('onlineAgent.chat')}
          </DialogTitle>
          <DeferredPanelBody compact />
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
        'flex min-h-0 flex-col bg-background',
        expanded
          ? 'absolute inset-0 z-30'
          : wide
            ? 'relative w-[22rem] shrink-0 border-l 2xl:w-[26.25rem]'
            : 'absolute inset-y-0 right-0 z-30 w-[22rem] max-w-full border-l shadow-xl',
      )}
    >
      <DeferredPanelBody compact={false} />
    </aside>
  );
}

function DeferredPanelBody({ compact }: { compact: boolean }) {
  return (
    <ErrorBoundary fallback={<PanelLoading failed />}>
      <Suspense fallback={<PanelLoading />}>
        <PanelBody compact={compact} />
      </Suspense>
    </ErrorBoundary>
  );
}

function PanelLoading({ failed = false }: { failed?: boolean }) {
  const panel = useChatPanel();
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3 p-3'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-sm font-medium'>{$t('onlineAgent.chat')}</span>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={$t('onlineAgent.close')}
          onClick={panel.closeChat}
        >
          <XIcon />
        </Button>
      </div>
      {failed ? (
        <div role='alert' className='flex flex-col gap-3'>
          <p>{$t('common.operationFailedRetry')}</p>
          <Button variant='outline' onClick={() => window.location.reload()}>
            {$t('common.reload')}
          </Button>
        </div>
      ) : (
        <div
          role='status'
          className='flex items-center gap-2 text-sm text-muted-foreground'
        >
          <Spinner aria-hidden='true' />
          {$t('common.loading')}
        </div>
      )}
    </div>
  );
}
