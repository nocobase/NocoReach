import {
  newConversationAgent,
  useAgentText,
  useChatAgents,
  useChatPanel,
  useConversation,
} from '@nocobase/app-plugin-agents/client/chat';
import { useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { $t } from '#i18n';
import { AgentIdentity, AgentPicker } from '#components/agent-picker';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '#components/ui/dropdown-menu';
import { useOnlineChat } from '../../online-agent/context.js';
import {
  OnlineApiError,
  useOnlineResource,
  type Agent,
} from '../../online-agent/api.js';
import { OnlineConfirm, OnlineError } from '../../online-agent/controls.js';
import { useAgentPickerLabels } from './chat-i18n.js';
import { runnerAgents } from './runner-agents.js';

export function RunnerChatChoice() {
  const [refresh, setRefresh] = useState(0);
  const online = useOnlineResource<Agent[]>('definitions', refresh);
  return (
    <ChatAgentChoice
      onlineAgents={online.data || []}
      onlineLoading={online.loading}
      onlineError={online.error}
      retryOnline={() => setRefresh((value) => value + 1)}
    />
  );
}

/** One composer menu; transport-specific drafts and histories stay with their providers. */
export function ChatAgentChoice({
  onlineAgents,
  onlineAgent,
  disabled,
  onlineLoading,
  onlineError,
  retryOnline,
}: {
  onlineAgents: Agent[];
  onlineAgent?: Agent;
  disabled?: boolean;
  onlineLoading?: boolean;
  onlineError?: unknown;
  retryOnline?: () => void;
}) {
  const chat = useOnlineChat();
  const panel = useChatPanel();
  const runners = useChatAgents(panel.open);
  const conversation = useConversation(panel.conversationId);
  const text = useAgentText();
  const labels = useAgentPickerLabels();
  const [pending, setPending] = useState<(() => void) | null>(null);
  const runner = panel.conversationId
    ? conversation.data?.agent
    : newConversationAgent(runnerAgents(runners.data), panel.newAgentId);
  const currentOnline =
    onlineAgent || onlineAgents.find((item) => item.id === chat.agentId);
  function selectOnline(id: string) {
    const changed = chat.agentId !== id;
    const apply = () => {
      if (changed && chat.conversationId) {
        chat.select(null);
        chat.setDraft('');
      }
      chat.setAgentId(id);
      chat.setMode('online');
    };
    if (changed && chat.conversationId && chat.draft.trim())
      setPending(() => apply);
    else apply();
  }
  function selectRunner(id: string) {
    const changed = runner?.id !== id;
    const apply = () => {
      if (changed || !panel.conversationId) panel.selectConversation(null, id);
      panel.setView('chat');
      chat.setMode('runner');
    };
    if (changed && panel.conversationId && chat.runnerDirty)
      setPending(() => apply);
    else apply();
  }
  return (
    <>
      <AgentPicker
        agents={runnerAgents(runners.data)}
        value={chat.mode === 'online' ? null : runner?.id || null}
        shown={
          chat.mode === 'online'
            ? {
                name: currentOnline?.name || $t('common.onlineAgent'),
                availability: currentOnline?.ready
                  ? { online: true, reason: null, onlineRunners: 0 }
                  : null,
                mode: 'online',
              }
            : runner
              ? {
                  name: text.name(runner),
                  availability: panel.conversationId
                    ? conversation.data?.availability
                    : 'availability' in runner
                      ? runner.availability
                      : null,
                  mode: 'runner',
                }
              : undefined
        }
        onSelect={selectRunner}
        agentName={(item) => text.name(item)}
        labels={labels}
        showMode={false}
        showHint={false}
        disabled={disabled || !!chat.request || chat.runnerPending}
        appearance='toolbar'
        className='h-7 shrink px-1.5 text-sm @md:px-2'
        data-testid='chat-agent-picker'
      >
        <DropdownMenuGroup>
          {/* Each group says what its agents can do, so the choice is made by role (2026-10-20 user decision). */}
          <DropdownMenuLabel>
            {$t('common.onlineAgent')}
            <span className='block text-xs font-normal text-muted-foreground'>
              {$t('agentChoice.onlineHint')}
            </span>
          </DropdownMenuLabel>
          {onlineAgents.filter((item) => item.enabled).length === 0 &&
            !onlineLoading &&
            !onlineError && (
              <DropdownMenuItem disabled>
                {$t('onlineAgent.noAgents')}
              </DropdownMenuItem>
            )}
          {onlineAgents
            .filter((item) => item.enabled)
            .map((agent) => (
              <DropdownMenuItem
                key={agent.id}
                onClick={() => selectOnline(agent.id)}
              >
                <AgentIdentity
                  name={agent.name}
                  availability={
                    agent.ready
                      ? { online: true, reason: null, onlineRunners: 0 }
                      : null
                  }
                  labels={labels}
                  nameClassName='whitespace-normal break-words'
                />
                {!agent.ready && (
                  <span className='text-xs text-muted-foreground'>
                    {$t('onlineAgent.modelNotReady')}
                  </span>
                )}
                {chat.mode === 'online' && chat.agentId === agent.id && (
                  <CheckIcon />
                )}
              </DropdownMenuItem>
            ))}
          {onlineLoading && (
            <DropdownMenuItem disabled>{$t('common.loading')}</DropdownMenuItem>
          )}
          <OnlineError error={onlineError} retry={retryOnline} />
          <DropdownMenuLabel>
            {$t('common.runnerAgent')}
            <span className='block text-xs font-normal text-muted-foreground'>
              {$t('agentChoice.runnerHint')}
            </span>
          </DropdownMenuLabel>
          {runners.isSuccess && runnerAgents(runners.data).length === 0 && (
            <DropdownMenuItem disabled>{labels.empty}</DropdownMenuItem>
          )}
          {runners.isLoading && (
            <DropdownMenuItem disabled>{$t('common.loading')}</DropdownMenuItem>
          )}
          {runners.isError && (
            <OnlineError
              error={
                runners.error instanceof Error && 'status' in runners.error
                  ? new OnlineApiError(
                      Number(runners.error.status),
                      'requestFailed',
                    )
                  : runners.error
              }
              retry={() => void runners.refetch()}
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
