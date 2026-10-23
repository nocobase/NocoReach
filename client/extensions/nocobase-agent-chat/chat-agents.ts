import {
  newConversationAgent,
  useAgentText,
  type AgentText,
} from '@nocobase/app-plugin-agents/client/chat';
import { useCallback } from 'react';
import { $t } from '#i18n';
import type { ChatAgent } from '@nocobase/app-plugin-agents/shared/conversations';
import { ONLINE_AGENT_ID } from '../../../shared/online-agent.js';

/** The agents the panel offers: the plugin's built-in online assistant only while Chat panel › Settings has it on. */
export function chatAgents(
  agents: readonly ChatAgent[] | undefined,
  onlineEnabled: boolean,
): ChatAgent[] {
  return (agents ?? []).filter(
    (agent) => onlineEnabled || agent.id !== ONLINE_AGENT_ID,
  );
}
export const isOnlineAgent = (
  agent: Pick<ChatAgent, 'id'> | null | undefined,
) => agent?.id === ONLINE_AGENT_ID;
/** The agent a new conversation goes to: the one picked, a default, else the online assistant when it is on. */
export function newChatAgent(
  agents: readonly ChatAgent[] | undefined,
  picked: string | null,
): ChatAgent | null {
  return (
    newConversationAgent(agents, picked) ??
    agents?.find((agent) => agent.id === ONLINE_AGENT_ID) ??
    null
  );
}
/** Agent names as the panel shows them: the online assistant under NocoReach's name, not the plugin's English one. */
export function useChatAgentName() {
  const text = useAgentText();
  return useCallback(
    <Name extends string | null>(agent: {
      readonly id: string;
      readonly name: Name;
      readonly nameText?: Parameters<AgentText['name']>[0]['nameText'];
    }): Name =>
      isOnlineAgent(agent)
        ? ($t('common.onlineAgent') as Name)
        : text.name(agent),
    [text],
  );
}
