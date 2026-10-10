import { useAgentText } from '@nocobase/app-plugin-agents/client/chat';
import type { OnlineModelEntry } from '@nocobase/app-plugin-agents/shared/agents';
import type { ChatAgent } from '@nocobase/app-plugin-agents/shared/conversations';
import type { ReactElement } from 'react';

import { AgentPicker } from '#components/agent-picker';

import { useAgentPickerLabels } from './chat-i18n.js';
import { ModelPicker } from './model-picker.js';

export interface NewChatChoiceProps {
  /** Every agent the viewer may chat with. */
  readonly agents: readonly ChatAgent[];
  /** The agent the conversation will go to; null while there is none. */
  readonly agent: ChatAgent | null;
  readonly onAgentChange: (agentId: string) => void;
  /** The model chosen for an online agent; null: the agent's default (its first model). */
  readonly model: OnlineModelEntry | null;
  readonly onModelChange: (model: OnlineModelEntry | null) => void;
  readonly disabled?: boolean;
}

export function NewChatChoice({
  agents,
  agent,
  onAgentChange,
  model,
  onModelChange,
  disabled,
}: NewChatChoiceProps): ReactElement {
  const labels = useAgentPickerLabels();
  const text = useAgentText();
  return (
    <>
      <AgentPicker
        agents={agents}
        value={agent?.id ?? null}
        onSelect={onAgentChange}
        agentName={(item) => text.name(item)}
        labels={labels}
        disabled={disabled ?? false}
        // Fits the composer's width; as tall as the model picker beside it, and the first to give up its width.
        appearance='toolbar'
        className='h-7 shrink px-1.5 @md:px-2'
        data-testid='chat-agent-picker'
      />
      {agent ? (
        <ModelPicker
          conversation={{
            mode: agent.type,
            models: agent.models,
            model: model ?? agent.models[0] ?? null,
          }}
          disabled={disabled ?? false}
          onChange={onModelChange}
        />
      ) : null}
    </>
  );
}
