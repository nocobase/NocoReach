/* eslint-disable react-refresh/only-export-components -- the conversation context and its hook live with their views */
import { $t, getCurrentLocale } from '#i18n';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useEffectEvent,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowUp,
  ChevronDown,
  CornerDownRight,
  MessageCircle,
  X,
} from 'lucide-react';
import { resolveAppBase } from '@nocobase/app-client';
import {
  appUIMessageText,
  chatIsRunning,
  useChatPanel,
  useChatStream,
  useConversation,
  useConversationMessages,
  useSendMessage,
} from '@nocobase/app-plugin-agents/client/chat';
import type { AppUIMessage } from '@nocobase/app-plugin-agents/shared/online-agent';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import { ActorAvatar } from '#components/reach/actor';
import { Button } from '#components/ui/button';
import { MarkdownView } from '#components/markdown-view';
import { useOptionalOnlineChat } from '../../online-agent/context';
import { onlineError, useOnlineApi } from '../../online-agent/api';
import { OnlineConfirm, OnlineError } from '../../online-agent/controls';
import { parseQuote } from '../../online-agent/quote';
import { useFreshData } from '../workspace-cache';
import {
  INSIGHTS_SOURCE,
  ONLINE_AGENT_ID,
  type OnlineThread,
} from '../../../shared/online-agent.js';
import { oppNo, type Row } from './board';

// One conversation a day on Insights (2026-10-22 user decision, after the questions under each opportunity and in the
// side panel read as scattered): what is asked from Insights joins the day's conversation, shown under the day's
// analysis with its own input. When the side panel opens, the same conversation moves there and the page keeps one line
// pointing to it, so there is only ever one place to type. Only the owner's own conversations are read; the Agents
// plugin keeps them, and NocoReach's index says which project and day each is about.

type Reference = { id: string; label: string };
type InsightChat = {
  threads: OnlineThread[];
  /** The latest analysis day: new questions join its conversation. */
  day: string;
  projectId: number;
  /** The side panel is open, so the day's conversation is there. */
  docked: boolean;
  reference: Reference | null;
  quote: (row: Row) => void;
  clearReference: () => void;
  /** Counts the questions sent since the page opened, here or in the side panel. */
  version: number;
  /** Starts the day's conversation, bound to the project, and lists it. */
  start: () => Promise<string>;
  sent: () => void;
  openInPanel: () => void;
  /** Opens one of the day's conversations in the side panel, as when a tool call there waits for approval. */
  openThread: (id: string) => void;
};
const Context = createContext<InsightChat | null>(null);
export const useInsightChat = () => useContext(Context);

const appBase = () => {
  try {
    return resolveAppBase();
  } catch {
    return '/';
  }
};
// A quoted opportunity travels in the message as a link on its own first line, which the agent can follow and the page
// shows as a quote above the question.
const referenceText = (r: Reference) =>
  `[${r.label}](${appBase()}opportunities?item=${encodeURIComponent(r.id)})\n`;
const byTime = (a: OnlineThread, b: OnlineThread) =>
  a.updatedAt.localeCompare(b.updatedAt);
export const threadsOf = (threads: OnlineThread[], day: string) =>
  threads.filter((t) => t.subject.day === day).sort(byTime);

/** Reads the owner's Insights conversations for the project, and moves the day's one into the side panel when it opens. */
export function InsightChatProvider({
  projectId,
  day,
  children,
}: {
  projectId: number;
  day: string;
  children: ReactNode;
}) {
  const api = useOnlineApi(),
    chat = useOptionalOnlineChat(),
    panel = useChatPanel();
  const view = useFreshData(`insight-threads:${projectId}`, () =>
    api<OnlineThread[]>(`threads?projectId=${projectId}`),
  );
  const { reload } = view;
  const [sends, setSends] = useState(0),
    [reference, setReference] = useState<Reference | null>(null);
  const threads = useMemo(() => view.data || [], [view.data]),
    current = threadsOf(threads, day).at(-1),
    docked = panel.open;
  // Messages sent here or in the side panel: the list is read again.
  const activity = chat?.activity ?? 0,
    version = sends + activity;
  useEffect(() => {
    if (activity) reload();
  }, [activity, reload]);
  // A question is listed only once the server has it, after `sent`'s read: read again as the day's reply starts and ends.
  const replying = chatIsRunning(
      useConversation(current?.id ?? null).data ?? null,
    ),
    replyingRef = useRef(replying);
  useEffect(() => {
    if (replyingRef.current === replying) return;
    replyingRef.current = replying;
    reload();
  }, [replying, reload]);
  // Only another day's conversation still answering is polled, and slowly: the day's own reply is followed above, and
  // each read lists the owner's Insights conversations again on the server.
  const answeringElsewhere = threads.some(
    (t) => t.running && t.id !== current?.id,
  );
  useEffect(() => {
    if (!answeringElsewhere) return;
    const timer = setTimeout(reload, 15000);
    return () => clearTimeout(timer);
  }, [answeringElsewhere, view.data, reload]);
  const startRef = useRef<Promise<string> | null>(null);
  const start = () => {
    // One conversation a day, even when two questions start it at once.
    startRef.current ??= api<{ id: string }>('threads', {
      projectId: String(projectId),
      day,
    })
      .then(({ id }) => {
        reload();
        return id;
      })
      .finally(() => {
        startRef.current = null;
      });
    return startRef.current;
  };
  const [pending, setPending] = useState<(() => void) | null>(null);
  const openInPanel = (draft?: string, create = false, id = current?.id) => {
    if (!chat || !day) return;
    const open = (conversationId: string) => {
      // Text typed in the panel is kept: a quote goes in only while the composer is empty, and moving to another
      // conversation asks first.
      if (!chat.dirty) panel.openChat({ conversationId, draft, view: 'chat' });
      else if (panel.conversationId === conversationId)
        panel.openChat({ conversationId, view: 'chat' });
      else
        setPending(
          () => () => panel.openChat({ conversationId, draft, view: 'chat' }),
        );
    };
    if (id) open(id);
    else if (create)
      // Not opened on a blank chat: a question sent there would start a conversation outside the day.
      void start().then(open, (error: unknown) => {
        toast.error(() => onlineError(error));
        chat.refresh();
      });
  };
  // Opening the side panel here moves the day's conversation into it; a day without one starts it with the first question.
  const wasDockedRef = useRef(docked),
    openRef = useRef(openInPanel);
  useEffect(() => {
    openRef.current = openInPanel;
  });
  useEffect(() => {
    if (docked && !wasDockedRef.current) openRef.current();
    wasDockedRef.current = docked;
  }, [docked]);
  const value: InsightChat = {
    threads,
    day,
    projectId,
    docked,
    reference,
    quote: (row) => {
      const r = {
        id: row.card.id,
        label: [oppNo(row.card), row.card.title].filter(Boolean).join(' '),
      };
      if (docked) openInPanel(referenceText(r), true);
      else setReference(r);
    },
    clearReference: () => setReference(null),
    version,
    start,
    sent: () => {
      reload();
      setSends((n) => n + 1);
    },
    openInPanel: () => openInPanel(undefined, true),
    openThread: (id) => openInPanel(undefined, false, id),
  };
  return (
    <Context.Provider value={value}>
      {children}
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
    </Context.Provider>
  );
}

/** Ask AI about an opportunity: it is quoted in the day's conversation, wherever that conversation is. */
export function QuoteOpportunity({ row }: { row: Row }) {
  const chat = useInsightChat();
  if (!chat?.day) return null;
  const label = $t('strategy.askAi');
  return (
    <Button
      size='icon-xs'
      variant='outline'
      aria-label={label}
      title={label}
      onClick={() => chat.quote(row)}
    >
      <MessageCircle aria-hidden='true' />
    </Button>
  );
}

const clock = (iso: string | undefined) =>
  iso
    ? new Date(iso).toLocaleTimeString(getCurrentLocale(), {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
const toolName = (name: string) =>
  name === 'project_data'
    ? $t('onlineAgent.readProject')
    : name === 'read_page'
      ? $t('onlineAgent.readPage')
      : name === 'daily_analysis'
        ? $t('strategy.toolDailyAnalysis')
        : name === 'task_list' || name === 'task_get'
          ? $t('strategy.toolTasks')
          : name === 'task_execute'
            ? $t('onlineAgent.executeTask')
            : name;
type ToolPart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
};
const toolParts = (message: AppUIMessage) =>
  (message.parts as ToolPart[]).flatMap((part) =>
    part.type === 'dynamic-tool' || part.type.startsWith('tool-')
      ? [
          {
            id: part.toolCallId ?? '',
            name: part.toolName ?? part.type.slice(5),
            state: part.state,
          },
        ]
      : [],
  );
type TurnView = {
  id: string;
  question: AppUIMessage;
  answers: AppUIMessage[];
};
/** A question and the agent's messages after it. */
const turnsOf = (messages: readonly AppUIMessage[]) =>
  messages.reduce<TurnView[]>((turns, message) => {
    if (message.role === 'user')
      turns.push({ id: message.id, question: message, answers: [] });
    else if (message.role === 'assistant') turns.at(-1)?.answers.push(message);
    return turns;
  }, []);

/** One question and its answer: the quote above the question, the answer as Markdown, the data it read folded. */
function Turn({
  turn,
  active,
  approve,
}: {
  turn: TurnView;
  active: boolean;
  approve: () => void;
}) {
  const [open, setOpen] = useState(false),
    { quote, question } = parseQuote(appUIMessageText(turn.question)),
    tools = turn.answers.flatMap(toolParts),
    output = turn.answers.map(appUIMessageText).filter(Boolean).join('\n\n'),
    waiting = tools.some((tool) => tool.state === 'approval-requested');
  return (
    <div className='flex flex-col gap-2' data-turn={turn.id}>
      <div className='flex justify-end'>
        <div className='max-w-[75%] rounded-xl rounded-tr-sm bg-primary/10 px-3.5 py-2 text-sm'>
          {quote && (
            <p className='mb-0.5 flex items-center gap-1 text-xs text-muted-foreground'>
              <CornerDownRight className='size-3 shrink-0' aria-hidden='true' />
              {quote}
            </p>
          )}
          <p className='whitespace-pre-wrap wrap-anywhere'>{question}</p>
        </div>
      </div>
      <div className='flex gap-2.5'>
        <ActorAvatar type='agent' size='default' />
        <div className='flex min-w-0 flex-1 flex-col gap-2'>
          <p className='flex h-8 items-center gap-1.5 text-xs text-muted-foreground'>
            {$t('common.onlineAgent')} ·{' '}
            {clock(turn.question.metadata?.createdAt)}
            {tools.length > 0 && (
              <button
                type='button'
                aria-expanded={open}
                className='inline-flex items-center gap-0.5 hover:text-foreground'
                onClick={() => setOpen((o) => !o)}
              >
                · {$t('strategy.toolsUsed', { 0: tools.length })}
                <ChevronDown
                  className={cn('size-3.5', open && 'rotate-180')}
                  aria-hidden='true'
                />
              </button>
            )}
          </p>
          {open && (
            <ul className='flex flex-wrap gap-x-3 text-xs text-muted-foreground'>
              {tools.map((t) => (
                <li key={t.id}>{toolName(t.name)}</li>
              ))}
            </ul>
          )}
          <div className='w-full rounded-xl rounded-tl-sm border bg-card px-3.5 py-2.5 text-sm leading-relaxed text-card-foreground'>
            {output ? (
              <MarkdownView content={output} />
            ) : (
              <p className='text-muted-foreground'>
                {active
                  ? $t('strategy.threadAnswering')
                  : $t('strategy.threadNoAnswer')}
              </p>
            )}
            {waiting && (
              // Running a task is approved in the side panel, which shows what will run.
              <button
                type='button'
                className='nr-link mt-1 text-xs'
                onClick={approve}
              >
                {$t('strategy.approveInPanel')} ›
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A day's conversation, every turn in order. */
export function DayConversation({
  day,
  folded = false,
}: {
  day: string;
  /** Starts folded to its one line (today's, so the analysis is what shows). */
  folded?: boolean;
}) {
  const chat = useInsightChat();
  // Outside the provider (no chat mounted) there is nothing to read, and no chat client to read it with.
  return chat ? <DayTurns chat={chat} day={day} startFolded={folded} /> : null;
}
function DayTurns({
  chat,
  day,
  startFolded,
}: {
  chat: InsightChat;
  day: string;
  startFolded: boolean;
}) {
  const threads = threadsOf(chat.threads, day),
    count = questionCount(chat.threads, day);
  // Today's starts folded to one line, so the day's analysis is what shows when Insights opens (2026-10-22 user
  // feedback); a question sent since then opens it.
  const [folded, setFolded] = useState(startFolded),
    endRef = useRef<HTMLDivElement>(null),
    openedAtRef = useRef(chat.version);
  useEffect(() => {
    if (chat.version === openedAtRef.current) return;
    setFolded(false);
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [chat.version]);
  // A conversation not counted yet (a long one, on its first read) may hold questions: it is not hidden.
  const counted = threads.every((t) => t.turns !== null);
  if (!threads.length || (!count && counted && folded)) return null;
  return (
    <div className='flex flex-col gap-4' data-day-conversation={day}>
      <button
        type='button'
        aria-expanded={!folded}
        className='flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border hover:text-foreground'
        onClick={() => setFolded((f) => !f)}
      >
        <span className='inline-flex items-center gap-0.5'>
          {$t('strategy.conversationTurns', { 0: count })}
          <ChevronDown
            className={cn('size-3.5', !folded && 'rotate-180')}
            aria-hidden='true'
          />
        </span>
      </button>
      {!folded &&
        threads.map((thread) => (
          <ThreadTurns
            key={thread.id}
            id={thread.id}
            approve={() => chat.openThread(thread.id)}
          />
        ))}
      <div ref={endRef} />
    </div>
  );
}
function ThreadTurns({ id, approve }: { id: string; approve: () => void }) {
  const detail = useConversation(id).data ?? null,
    stream = useChatStream(detail?.execution ? id : null),
    messages = useConversationMessages(id),
    running =
      chatIsRunning(detail) ||
      stream?.status === 'submitted' ||
      stream?.status === 'streaming',
    turns = turnsOf(messages.items);
  return turns.map((turn, index) => (
    <Turn
      key={turn.id}
      turn={turn}
      active={running && index === turns.length - 1}
      approve={approve}
    />
  ));
}

/** How many questions a day's conversation holds. */
export const questionCount = (threads: OnlineThread[], day: string) =>
  threadsOf(threads, day).reduce((n, t) => n + (t.turns ?? 0), 0);

/** The input for the day's conversation: the quoted opportunity above it, Enter to send. */
export function Composer() {
  const chat = useInsightChat(),
    online = useOptionalOnlineChat();
  if (!chat || !chat.day || chat.docked) return null;
  if (online?.error)
    return <OnlineError error={online.error} retry={online.refresh} />;
  // Off in Chat panel › Settings: the day's conversation stays readable, and the page says why there is no input.
  if (online?.settings && !online.enabled)
    return (
      <p className='self-center text-xs text-muted-foreground'>
        {$t('onlineAgent.chatDisabled')}
      </p>
    );
  if (!online?.enabled) return null;
  return <ComposerInput chat={chat} />;
}
function ComposerInput({ chat }: { chat: InsightChat }) {
  const panel = useChatPanel(),
    online = useOptionalOnlineChat();
  const [text, setText] = useState(''),
    [starting, setStarting] = useState<{ body: string; id?: string }>(),
    [started, setStarted] = useState<{ day: string; id: string }>(),
    [error, setError] = useState<unknown>(),
    inputRef = useRef<HTMLTextAreaElement>(null);
  const reference = chat.reference;
  useEffect(() => {
    if (reference) inputRef.current?.focus();
  }, [reference]);
  // The conversation started here stays this input's, even when the reloaded list's latest for the day is another.
  const conversationId =
    (started?.day === chat.day ? started.id : undefined) ??
    threadsOf(chat.threads, chat.day).at(-1)?.id ??
    null;
  const detail = useConversation(conversationId).data ?? null,
    stream = useChatStream(detail?.execution ? conversationId : null),
    messages = useConversationMessages(conversationId),
    answering =
      chatIsRunning(detail) ||
      stream?.status === 'submitted' ||
      stream?.status === 'streaming' ||
      messages.pending.some((m) => m.status === 'sending');
  const failed = messages.pending.find((m) => m.status !== 'sending');
  // This page's copy of Chat panel › Settings may be older than an administrator's change. The server's guard refuses
  // a message while it is off; read the settings again, so the page says so.
  const refreshOnline = useEffectEvent(() => online?.refresh());
  useEffect(() => {
    if (failed) refreshOnline();
  }, [failed]);
  const sendMessage = useSendMessage({
    conversationId,
    agentId: ONLINE_AGENT_ID,
    source: INSIGHTS_SOURCE,
    dispatch: messages.dispatch,
    // The conversation is started before its first message, so the plugin never creates one here.
    onCreated: () => {},
  });
  const deliver = (body: string) => {
    if (!sendMessage({ content: body, context: undefined })) return false;
    setText('');
    chat.clearReference();
    chat.sent();
    return true;
  };
  // The day's first question starts the conversation, then is sent once this input holds it.
  // Sent once, as the side panel does for its own new conversations.
  const deliveredRef = useRef<string | null>(null);
  const deliverStarted = useEffectEvent((body: string) => deliver(body));
  useEffect(() => {
    if (
      !starting?.id ||
      conversationId !== starting.id ||
      deliveredRef.current === starting.id
    )
      return;
    deliveredRef.current = starting.id;
    setStarting(undefined);
    deliverStarted(starting.body);
  }, [starting, conversationId]);
  const busy = !!starting || answering;
  const send = () => {
    const question = text.trim();
    if (!question || busy) return;
    const body = (reference ? referenceText(reference) : '') + question;
    setError(undefined);
    if (conversationId) {
      deliver(body);
      return;
    }
    setStarting({ body });
    const day = chat.day;
    chat.start().then(
      (id) => {
        setStarted({ day, id });
        setStarting({ body, id });
      },
      (failure: unknown) => {
        setStarting(undefined);
        setError(failure);
        online?.refresh();
      },
    );
  };
  return (
    <div className='sticky bottom-3 z-10 flex flex-col gap-2 rounded-xl border bg-background p-2 shadow-sm focus-within:border-ring'>
      {reference && (
        <span className='inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2 text-xs text-primary'>
          <CornerDownRight className='size-3 shrink-0' aria-hidden='true' />
          <span className='truncate'>{reference.label}</span>
          <button
            type='button'
            aria-label={$t('strategy.removeReference')}
            className='rounded-full p-0.5 hover:bg-primary/10'
            onClick={chat.clearReference}
          >
            <X className='size-3' aria-hidden='true' />
          </button>
        </span>
      )}
      <div className='flex items-end gap-2'>
        <textarea
          ref={inputRef}
          aria-label={$t('strategy.composerLabel')}
          placeholder={$t('strategy.composerPlaceholder')}
          rows={1}
          maxLength={20000}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send();
            }
          }}
          className='field-sizing-content max-h-40 flex-1 resize-none !min-h-9 !rounded-none !border-0 !bg-transparent !px-1.5 !py-1.5 !shadow-none outline-none'
        />
        <Button
          size='icon-sm'
          aria-label={$t('strategy.send')}
          disabled={!text.trim() || busy}
          onClick={send}
        >
          <ArrowUp aria-hidden='true' />
        </Button>
      </div>
      {error !== undefined && <OnlineError error={error} />}
      {failed && (
        // A message the server did not take stays in the side panel, where it can be sent again.
        <button
          type='button'
          className='nr-link self-start text-xs'
          onClick={() => panel.openChat({ conversationId, view: 'chat' })}
        >
          {$t('strategy.sendFailed')} ›
        </button>
      )}
    </div>
  );
}

/** While the side panel is open, the page points to the day's conversation there. */
export function InPanelNote() {
  const chat = useInsightChat();
  if (!chat?.docked || !chat.day) return null;
  return (
    <button
      type='button'
      className='nr-link self-center text-xs'
      onClick={chat.openInPanel}
    >
      {$t('strategy.conversationInPanel')} ›
    </button>
  );
}
