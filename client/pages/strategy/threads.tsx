/* eslint-disable react-refresh/only-export-components -- the conversation context and its hook live with their views */
import { $t, getCurrentLocale } from '#i18n';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { useChatPanel } from '@nocobase/app-plugin-agents/client/chat';
import { cn } from '#lib/utils';
import { ActorAvatar } from '#components/reach/actor';
import { Button } from '#components/ui/button';
import { MarkdownView } from '#components/markdown-view';
import { useOptionalOnlineChat } from '../../online-agent/context';
import { useOnlineApi, type ConversationDetail } from '../../online-agent/api';
import { OnlineError } from '../../online-agent/controls';
import { OnlineCutOff } from '../../online-agent/cut-off';
import { parseQuote } from '../../online-agent/quote';
import { toolCard, toolLabel } from '../../online-agent/tool-cards';
import { useFreshData } from '../workspace-cache';
import {
  onlineRunActive,
  type OnlineRun,
  type OnlineThread,
} from '../../../shared/online-agent.js';
import { oppNo, type Row } from './board';

// One conversation a day on Insights (2026-10-22 user decision, after the questions under each opportunity and in the
// side panel read as scattered): what is asked from Insights joins the day's conversation, shown under the day's
// analysis with its own input. When the side panel opens, the same conversation moves there and the page keeps one line
// pointing to it, so there is only ever one place to type. Only the owner's own conversations are read.

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
  /** The day's latest conversation, read from the server while the page's list is still loading. */
  dayThread: () => Promise<OnlineThread | undefined>;
  /** Read the day's conversation again (after a message is sent). */
  version: number;
  sent: () => void;
  openInPanel: () => void;
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
  // Messages sent here or in the side panel: the day's conversation is read again.
  const activity = chat?.activity ?? 0,
    version = sends + activity;
  useEffect(() => {
    if (activity) reload();
  }, [activity, reload]);
  const answering = threads.some(
    (t) => t.status === 'queued' || t.status === 'running',
  );
  useEffect(() => {
    if (!answering) return;
    const timer = setTimeout(reload, 3000);
    return () => clearTimeout(timer);
  }, [answering, view.data, reload]);
  // Where a question goes depends on whether the day already has a conversation. Until the list is read (a slow
  // connection, a failed read, or a cached copy being refreshed), the page cannot tell, and acting as if there were none
  // would start a second conversation for the day: the server is asked instead.
  const known = !view.loading && view.data !== undefined;
  const dayThread = async () =>
    known
      ? current
      : threadsOf(
          await api<OnlineThread[]>(`threads?projectId=${projectId}`),
          day,
        ).at(-1);
  const openInPanel = (draft = '') => {
    if (!chat || !day) return;
    const open = (thread: OnlineThread | undefined) => {
      if (thread) chat.resume(thread.id, draft);
      else
        chat.open({
          draft,
          projectId: String(projectId),
          subject: { kind: 'insights', day },
        });
    };
    if (known) open(current);
    // A failed read leaves what the page has.
    else void dayThread().then(open, () => open(current));
  };
  // Opening the side panel here moves the day's conversation into it.
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
      if (docked) openInPanel(referenceText(r));
      else setReference(r);
    },
    clearReference: () => setReference(null),
    dayThread,
    version,
    sent: () => {
      reload();
      setSends((n) => n + 1);
    },
    openInPanel: () => openInPanel(),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
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

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(getCurrentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
/**
 * One question and its answer: the quote above the question, the answer as Markdown, the data it read folded. An answer
 * that stopped partway says why, and the latest one offers Continue, as in the side panel.
 */
function Turn({
  run,
  onContinue,
  continuing,
  continueError,
}: {
  run: OnlineRun;
  onContinue?: () => void;
  continuing?: boolean;
  continueError?: unknown;
}) {
  const [open, setOpen] = useState(false),
    { quote, question } = parseQuote(run.input),
    tools = run.events.flatMap((e) => (e.type === 'toolCall' ? [e] : [])),
    active = onlineRunActive(run);
  // What the AI proposed for confirmation (a rule change) shows here as in the side panel.
  const results = new Map(
      run.events.flatMap((e) =>
        e.type === 'toolResult' ? [[e.id, e] as const] : [],
      ),
    ),
    cards = tools.flatMap((t) => {
      const card = toolCard(t.name, results.get(t.id));
      return card ? [{ id: t.id, ...card }] : [];
    });
  return (
    <div className='flex flex-col gap-2' data-turn={run.id}>
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
            {run.agentName} · {clock(run.createdAt)}
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
                <li key={t.id}>{toolLabel(t.name)}</li>
              ))}
            </ul>
          )}
          <div className='w-full rounded-xl rounded-tl-sm border bg-card px-3.5 py-2.5 text-sm leading-relaxed text-card-foreground'>
            {run.output ? (
              <MarkdownView content={run.output} />
            ) : (
              <p className='text-muted-foreground'>
                {active
                  ? $t('strategy.threadAnswering')
                  : $t('strategy.threadNoAnswer')}
              </p>
            )}
            <OnlineCutOff run={run} onContinue={onContinue} busy={continuing} />
          </div>
          <OnlineError error={continueError} />
          {cards.map((card) => (
            <card.Card key={card.id} run={run} output={card.output} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A day's conversation, every turn in order; read again while an answer is being written. */
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
  const api = useOnlineApi();
  const key = threadsOf(chat.threads, day)
    .map((t) => t.id)
    .join(',');
  const [state, setState] = useState<{
    key: string;
    details: ConversationDetail[];
  }>();
  const version = chat.version;
  useEffect(() => {
    if (!key) return;
    let live = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const list = await Promise.all(
        key
          .split(',')
          .map((id) =>
            api<ConversationDetail>(`conversations/${id}`).catch(() => null),
          ),
      );
      if (!live) return;
      const details = list.filter((d): d is ConversationDetail => !!d);
      setState({ key, details });
      if (details.some((d) => d.runs.some(onlineRunActive)))
        timer = setTimeout(() => void load(), 1500);
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, version, api]);
  const details = state?.key === key ? state.details : [];
  const runs = details
    .flatMap((d) => d.runs)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // Only a conversation's latest turn can be continued, and not while any of the day's answers is being written.
  const latest = new Set(details.map((d) => d.conversation.activeRunId)),
    writing = runs.some(onlineRunActive);
  const [continuing, setContinuing] = useState<{
    id: string;
    error?: unknown;
  }>();
  const continueReply = async (id: string) => {
    setContinuing({ id });
    try {
      await api(`runs/${id}/continue`, {});
      setContinuing(undefined);
      chat.sent();
    } catch (error) {
      setContinuing({ id, error });
    }
  };
  // Today's starts folded to one line, so the day's analysis is what shows when Insights opens (2026-10-22 user
  // feedback); a question sent since then opens it.
  const [folded, setFolded] = useState(startFolded),
    endRef = useRef<HTMLDivElement>(null),
    countRef = useRef(0),
    openedAtRef = useRef(chat.version);
  // Only a question sent since the page opened unfolds it, not the turns read when it opens.
  useEffect(() => {
    const previous = countRef.current;
    countRef.current = runs.length;
    if (runs.length <= previous || chat.version === openedAtRef.current) return;
    setFolded(false);
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [runs.length, chat.version]);
  if (!runs.length) return null;
  return (
    <div className='flex flex-col gap-4' data-day-conversation={day}>
      <button
        type='button'
        aria-expanded={!folded}
        className='flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border hover:text-foreground'
        onClick={() => setFolded((f) => !f)}
      >
        <span className='inline-flex items-center gap-0.5'>
          {$t('strategy.conversationTurns', { 0: runs.length })}
          <ChevronDown
            className={cn('size-3.5', !folded && 'rotate-180')}
            aria-hidden='true'
          />
        </span>
      </button>
      {!folded &&
        runs.map((run) => (
          <Turn
            key={run.id}
            run={run}
            {...(latest.has(run.id) && !writing
              ? {
                  onContinue: () => void continueReply(run.id),
                  continuing: continuing?.id === run.id && !continuing.error,
                }
              : {})}
            continueError={
              continuing?.id === run.id ? continuing.error : undefined
            }
          />
        ))}
      <div ref={endRef} />
    </div>
  );
}

/** How many questions a day's conversation holds. */
export const questionCount = (threads: OnlineThread[], day: string) =>
  threadsOf(threads, day).reduce((n, t) => n + t.turns, 0);

/** The input for the day's conversation: the quoted opportunity above it, Enter to send. */
export function Composer() {
  const chat = useInsightChat(),
    online = useOptionalOnlineChat();
  if (!chat || !online || !chat.day || chat.docked) return null;
  return <ComposerInput chat={chat} agentId={online.agentId} />;
}
function ComposerInput({
  chat,
  agentId,
}: {
  chat: InsightChat;
  agentId: string;
}) {
  const api = useOnlineApi();
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    inputRef = useRef<HTMLTextAreaElement>(null);
  const reference = chat.reference;
  useEffect(() => {
    if (reference) inputRef.current?.focus();
  }, [reference]);
  const current = threadsOf(chat.threads, chat.day).at(-1),
    answering = current?.status === 'queued' || current?.status === 'running';
  const send = async () => {
    const question = text.trim();
    if (!question || busy || answering) return;
    const body = (reference ? referenceText(reference) : '') + question;
    setBusy(true);
    setError(undefined);
    try {
      const thread = await chat.dayThread();
      if (thread) {
        const detail = await api<ConversationDetail>(
          `conversations/${thread.id}`,
        );
        await api(`conversations/${thread.id}/messages`, {
          requestId: crypto.randomUUID(),
          revision: detail.conversation.revision,
          text: body,
        });
      } else
        await api('conversations', {
          requestId: crypto.randomUUID(),
          agentId,
          projectId: String(chat.projectId),
          subject: { kind: 'insights', day: chat.day },
          text: body,
        });
      setText('');
      chat.clearReference();
      chat.sent();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
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
              void send();
            }
          }}
          className='field-sizing-content max-h-40 flex-1 resize-none !min-h-9 !rounded-none !border-0 !bg-transparent !px-1.5 !py-1.5 !shadow-none outline-none'
        />
        <Button
          size='icon-sm'
          aria-label={$t('strategy.send')}
          disabled={!text.trim() || busy || answering}
          onClick={() => void send()}
        >
          <ArrowUp aria-hidden='true' />
        </Button>
      </div>
      {error !== undefined && <OnlineError error={error} />}
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
