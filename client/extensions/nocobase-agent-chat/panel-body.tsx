import { $t } from '#i18n';
import { Maximize2Icon, Minimize2Icon, XIcon } from 'lucide-react';
import { useChatPanel } from '@nocobase/app-plugin-agents/client/chat';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { cn } from 'cn';
import { OnlineChatView } from '../../online-agent/chat.js';
import { OnlineChatAction } from '../../online-agent/controls.js';
import { useOnlineChat } from '../../online-agent/context.js';
import { ConversationView } from './conversation-view.js';
import { PanelHeader } from './panel-header.js';
import { HistoryList } from './history-list.js';

export default function PanelBody({
  compact,
}: {
  compact: boolean;
}): ReactElement {
  const panel = useChatPanel();
  const chat = useOnlineChat();
  const [runnerMounted, setRunnerMounted] = useState(chat.mode === 'runner');
  if (chat.mode === 'runner' && !runnerMounted) setRunnerMounted(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (panel.open)
      bodyRef.current
        ?.querySelector<HTMLElement>('[data-active-chat="true"] textarea')
        ?.focus();
  }, [chat.mode, panel.open]);
  const expanded = panel.mode === 'expanded';
  return (
    <div
      ref={bodyRef}
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        expanded && 'mx-auto w-full max-w-3xl',
      )}
    >
      <div
        hidden={chat.mode !== 'online'}
        inert={chat.mode !== 'online'}
        data-active-chat={chat.mode === 'online'}
        className='flex min-h-0 flex-1 flex-col p-3'
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
      {runnerMounted && (
        <div
          hidden={chat.mode !== 'runner'}
          inert={chat.mode !== 'runner'}
          data-active-chat={chat.mode === 'runner'}
          className='flex min-h-0 flex-1 flex-col'
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
      )}
    </div>
  );
}
