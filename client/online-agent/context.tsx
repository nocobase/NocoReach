/* eslint-disable react-refresh/only-export-components -- context and its hook share their private token */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useChatPanel } from '@nocobase/app-plugin-agents/client/chat';
import { $t } from '#i18n';
import { DEFAULT_ONLINE_AGENT } from '../../shared/online-agent.js';
import { OnlineConfirm } from './controls.js';
type Entry = { draft: string; projectId: string };
type Request = { path: string; body: unknown };
interface OnlineChatState {
  mode: 'online' | 'runner';
  setMode(mode: 'online' | 'runner'): void;
  runnerPending: boolean;
  setRunnerPending: (pending: boolean) => void;
  runnerDirty: boolean;
  setRunnerDirty: (dirty: boolean) => void;
  agentId: string;
  setAgentId: (id: string) => void;
  request: Request | null;
  setRequest(request: Request | null): void;
  conversationId: string | null;
  select(id: string | null): void;
  draft: string;
  setDraft(text: string): void;
  projectId: string | null;
  open(input: Entry): void;
}
const Context = createContext<OnlineChatState | null>(null);
export function OnlineChatProvider({ children }: { children: ReactNode }) {
  const panel = useChatPanel();
  const [mode, setMode] = useState<'online' | 'runner'>('online');
  const [runnerPending, setRunnerPending] = useState(false);
  const [runnerDirty, setRunnerDirty] = useState(false);
  const [request, setRequest] = useState<Request | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState(DEFAULT_ONLINE_AGENT);
  const [entry, setEntry] = useState<Entry | null>(null);
  function applyEntry(input: Entry) {
    setConversationId(null);
    setDraft(input.draft);
    setProjectId(input.projectId);
    setEntry(null);
  }
  return (
    <Context.Provider
      value={{
        runnerPending,
        setRunnerPending,
        runnerDirty,
        setRunnerDirty,
        mode,
        setMode,
        request,
        agentId,
        setAgentId,
        setRequest,
        conversationId,
        select(id) {
          setConversationId(id);
          setProjectId(null);
        },
        draft,
        setDraft,
        projectId,
        open(input) {
          panel.openChat();
          setMode('online');
          if (request) return;
          if (draft.trim()) setEntry(input);
          else applyEntry(input);
        },
      }}
    >
      {children}
      <OnlineConfirm
        open={!!entry}
        onClose={() => setEntry(null)}
        title={$t('onlineAgent.discardDraftTitle')}
        description={$t('onlineAgent.discardDraftDescription')}
        action={$t('onlineAgent.discard')}
        busy={false}
        confirm={() => {
          if (entry) applyEntry(entry);
        }}
      />
    </Context.Provider>
  );
}
export function useOnlineChat() {
  const context = useContext(Context);
  if (!context) throw new Error('OnlineChatProvider is required');
  return context;
}
/** The chat when the page sits inside the app layout, else null (pages rendered on their own, as in tests). */
export function useOptionalOnlineChat() {
  return useContext(Context);
}
