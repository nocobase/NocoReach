import {
  useChatAgents,
  useChatPanel,
  useConversation,
} from '@nocobase/app-plugin-agents/client/chat';
import { useMemo, useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { $t } from '#i18n';
import { AgentIdentity, AgentPicker } from '#components/agent-picker';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '#components/ui/dropdown-menu';
import { useOnlineChat } from '../../online-agent/context.js';
import { OnlineApiError } from '../../online-agent/api.js';
import { OnlineConfirm, OnlineError } from '../../online-agent/controls.js';
import { useAgentPickerLabels } from './chat-i18n.js';
import {
  chatAgents,
  isOnlineAgent,
  newChatAgent,
  useChatAgentName,
} from './chat-agents.js';

/**
 * One composer menu: the online assistant (the plugin's native agent with NocoReach's tools) above the Runner agents,
 * each group saying what its agents can do (2026-10-20 user decision).
 */
export function ChatAgentChoice({ disabled }: { disabled?: boolean }) {
  const chat = useOnlineChat();
  const panel = useChatPanel();
  const directory = useChatAgents(panel.open);
  const conversation = useConversation(panel.conversationId);
  const nameOf = useChatAgentName();
  const labels = useAgentPickerLabels();
  const [pending, setPending] = useState<(() => void) | null>(null);
  const agents = useMemo(
    () => chatAgents(directory.data, chat.enabled),
    [directory.data, chat.enabled],
  );
  const online = agents.find((agent) => isOnlineAgent(agent));
  const runners = agents.filter((agent) => !isOnlineAgent(agent));
  const current = panel.conversationId
    ? conversation.data?.agent
    : newChatAgent(agents, panel.newAgentId);
  function select(id: string) {
    const changed = current?.id !== id;
    const apply = () => {
      // On a new conversation, another agent keeps the draft and pinned context; leaving one starts fresh.
      if (!panel.conversationId)
        panel.selectConversation(null, id, { preserveComposer: true });
      else if (changed) panel.selectConversation(null, id);
      panel.setView('chat');
    };
    if (changed && panel.conversationId && chat.dirty) setPending(() => apply);
    else apply();
  }
  return (
    <>
      <AgentPicker
        agents={runners}
        value={current && !isOnlineAgent(current) ? current.id : null}
        shown={
          current
            ? {
                name: nameOf(current),
                availability:
                  panel.conversationId && conversation.data
                    ? conversation.data.availability
                    : 'availability' in current
                      ? current.availability
                      : null,
                mode: isOnlineAgent(current) ? 'online' : 'runner',
              }
            : undefined
        }
        onSelect={select}
        agentName={(item) => nameOf(item)}
        labels={labels}
        showMode={false}
        showHint={false}
        disabled={disabled}
        appearance='toolbar'
        className='h-7 shrink px-1.5 text-sm @md:px-2'
        data-testid='chat-agent-picker'
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {$t('common.onlineAgent')}
            <span className='block text-xs font-normal text-muted-foreground'>
              {$t('agentChoice.onlineHint')}
            </span>
          </DropdownMenuLabel>
          {online ? (
            <DropdownMenuItem onClick={() => select(online.id)}>
              <AgentIdentity
                name={$t('common.onlineAgent')}
                availability={online.availability}
                labels={labels}
                nameClassName='whitespace-normal break-words'
              />
              {isOnlineAgent(current) && <CheckIcon />}
            </DropdownMenuItem>
          ) : chat.error ? (
            // Chat panel › Settings could not be read: whether the assistant is on is unknown until a retry.
            <OnlineError error={chat.error} retry={chat.refresh} />
          ) : (
            directory.isSuccess && (
              <DropdownMenuItem disabled>
                {$t(
                  chat.settings && !chat.settings.enabled
                    ? 'onlineAgent.chatDisabled'
                    : 'onlineAgent.unavailable',
                )}
              </DropdownMenuItem>
            )
          )}
          <DropdownMenuLabel>
            {$t('common.runnerAgent')}
            <span className='block text-xs font-normal text-muted-foreground'>
              {$t('agentChoice.runnerHint')}
            </span>
          </DropdownMenuLabel>
          {directory.isSuccess && runners.length === 0 && (
            <DropdownMenuItem disabled>{labels.empty}</DropdownMenuItem>
          )}
          {directory.isLoading && (
            <DropdownMenuItem disabled>{$t('common.loading')}</DropdownMenuItem>
          )}
          {directory.isError && (
            <OnlineError
              error={
                directory.error instanceof Error && 'status' in directory.error
                  ? new OnlineApiError(
                      Number(directory.error.status),
                      'requestFailed',
                    )
                  : directory.error
              }
              retry={() => void directory.refetch()}
            />
          )}
        </DropdownMenuGroup>
      </AgentPicker>
      <OnlineConfirm
        open={!!pending}
        onClose={() => setPending(null)}
        title={$t('onlineAgent.discardDraftTitle')}
        description={$t('onlineAgent.discardDraftDescription')}
        action={$t('onlineAgent.discard')}
        busy={false}
        confirm={() => {
          pending?.();
          setPending(null);
        }}
      />
    </>
  );
}
