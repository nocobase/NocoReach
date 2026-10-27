/* eslint-disable react-refresh/only-export-components -- context and its hook share their private token */
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useChatPanel } from '@nocobase/app-plugin-agents/client/chat';
import { $t } from '#i18n';
import {
  DEFAULT_ONLINE_AGENT,
  type OnlineSubject,
} from '../../shared/online-agent.js';
import { OnlineConfirm } from './controls.js';
/** How a page's AI entry (`PageAiEntry`) introduces the new conversation it opens. */
export type PageOpening = {
  label: string;
  description?: string;
  /** Prompts offered as chips until the first message; clicking one sends it. */
  presets: string[];
};
type Entry = {
  draft: string;
  projectId: string;
  /** What the next new conversation is about, when opened from Insights or a page's AI entry. */
  subject?: OnlineSubject | null;
  page?: PageOpening;
};
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
  subject: OnlineSubject | null;
  /** The page entry's title, description and prompts for the new conversation, when opened from one. */
  page: PageOpening | null;
  open(input: Entry): void;
  /** A conversation was started from the current page entry: opening that entry again returns to it. */
  started(conversationId: string): void;
  /** Opens the panel on an existing conversation, with a draft to continue it when given. */
  resume(id: string, draft?: string): void;
  /** Counts the messages sent here, so a page showing conversations knows to read them again. */
  activity: number;
  touch(): void;
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
  // What waits for the unsent draft to be discarded: a new conversation, or one to continue.
  const [entry, setEntry] = useState<
    Entry | { resume: string; draft?: string } | null
  >(null);
  const [subject, setSubject] = useState<OnlineSubject | null>(null);
  const [page, setPage] = useState<PageOpening | null>(null);
  const [activity, setActivity] = useState(0);
  // The conversation each page entry started in this session, so opening the entry again returns to it.
  const startedRef = useRef(new Map<string, string>());
  const entryKey = (input: Pick<Entry, 'projectId' | 'subject'>) =>
    JSON.stringify([input.projectId, input.subject]);
  function applyEntry(input: Entry | { resume: string; draft?: string }) {
    if ('resume' in input) {
      setConversationId(input.resume);
      setDraft(input.draft ?? '');
      setProjectId(null);
      setSubject(null);
      setPage(null);
    } else {
      setConversationId(null);
      setDraft(input.draft);
      setProjectId(input.projectId);
      setSubject(input.subject ?? null);
      setPage(input.page ?? null);
    }
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
          setSubject(null);
          setPage(null);
        },
        draft,
        setDraft,
        projectId,
        subject,
        page,
        open(input) {
          panel.openChat();
          setMode('online');
          if (request) return;
          // A page entry returns to the conversation it started in this session; History has the older ones.
          const known = input.page && startedRef.current.get(entryKey(input));
          if (known === conversationId) return;
          const next = known ? { resume: known } : input;
          if (draft.trim()) setEntry(next);
          else applyEntry(next);
        },
        started(id) {
          if (page && projectId)
            startedRef.current.set(entryKey({ projectId, subject }), id);
        },
        resume(id, next) {
          panel.openChat();
          setMode('online');
          if (request) return;
          // Already open on it: only a new draft (a quoted opportunity) goes into the composer.
          if (id === conversationId) {
            if (next && !draft.trim()) setDraft(next);
            return;
          }
          if (draft.trim()) setEntry({ resume: id, draft: next });
          else applyEntry({ resume: id, draft: next });
        },
        activity,
        touch() {
          setActivity((n) => n + 1);
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
