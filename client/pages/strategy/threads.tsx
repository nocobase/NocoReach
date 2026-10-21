/* eslint-disable react-refresh/only-export-components -- the threads context and its hook live with their views */
import { $t, getCurrentLocale } from '#i18n';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { MessageCircle } from 'lucide-react';
import { ActorAvatar } from '#components/reach/actor';
import { Button } from '#components/ui/button';
import { MarkdownView } from '#components/markdown-view';
import { useOptionalOnlineChat } from '../../online-agent/context';
import { useOnlineApi } from '../../online-agent/api';
import { useFreshData } from '../workspace-cache';
import type { OnlineThread } from '../../../shared/online-agent.js';
import { oppNo, type Row } from './board';

// Questions asked from Insights stay with the day and the opportunity they were about (2026-10-21 user decision): the
// owner's own conversations only, read from the chat's records; Continue asking reopens the same conversation.

type Threads = {
  threads: OnlineThread[];
  /** The analysis day new questions are about. */
  day: string;
  projectId: number;
};
const Context = createContext<Threads | null>(null);
export const useThreads = () => useContext(Context);

/** Reads the owner's Insights conversations for the project, again after each message and while one is answered. */
export function ThreadsProvider({
  projectId,
  day,
  children,
}: {
  projectId: number;
  day: string;
  children: ReactNode;
}) {
  const api = useOnlineApi(),
    chat = useOptionalOnlineChat();
  const view = useFreshData(`insight-threads:${projectId}`, () =>
    api<OnlineThread[]>(`threads?projectId=${projectId}`),
  );
  const { reload } = view;
  const activity = chat?.activity ?? 0;
  useEffect(() => {
    if (activity) reload();
  }, [activity, reload]);
  const answering = (view.data || []).some(
    (t) => t.status === 'queued' || t.status === 'running',
  );
  useEffect(() => {
    if (!answering) return;
    const timer = setTimeout(reload, 3000);
    return () => clearTimeout(timer);
  }, [answering, view.data, reload]);
  const value = useMemo(
    () => ({ threads: view.data || [], day, projectId }),
    [view.data, day, projectId],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

// A preview of an answer as plain text: no Markdown marks, links as their words.
const plain = (markdown: string) =>
  markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const answering = (t: OnlineThread) =>
  t.status === 'queued' || t.status === 'running';
function Answer({ thread, lines }: { thread: OnlineThread; lines: 2 | 3 }) {
  const chat = useOptionalOnlineChat(),
    [open, setOpen] = useState(false);
  const text = answering(thread)
    ? $t('strategy.threadAnswering')
    : thread.answer
      ? plain(thread.answer)
      : $t('strategy.threadNoAnswer');
  return (
    <>
      {open && thread.answer ? (
        <MarkdownView content={thread.answer} />
      ) : (
        <p className={lines === 2 ? 'line-clamp-2' : 'line-clamp-3'}>{text}</p>
      )}
      <p className='mt-1 flex flex-wrap items-center gap-x-1.5 text-xs'>
        {thread.answer && !answering(thread) && (
          <>
            <button
              type='button'
              className='nr-link'
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? $t('common.collapse') : $t('strategy.expandAnswer')}
            </button>
            <span className='text-muted-foreground'>·</span>
          </>
        )}
        <button
          type='button'
          className='nr-link'
          onClick={() => chat?.resume(thread.id)}
        >
          {$t('strategy.continueAsking')}
        </button>
        {thread.turns > 1 && (
          <span className='text-muted-foreground'>
            · {$t('strategy.threadTurns', { 0: thread.turns })}
          </span>
        )}
      </p>
    </>
  );
}

/** The questions asked about one opportunity, under its line: the question and the start of the latest answer. */
export function OpportunityThreads({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const threads = (useThreads()?.threads || []).filter(
    (t) => t.subject.opportunityId === opportunityId,
  );
  if (!threads.length) return null;
  return (
    <ul className='mb-1.5 ml-1.5 flex flex-col gap-1.5'>
      {threads.map((t) => (
        <li
          key={t.id}
          data-thread-id={t.id}
          className='rounded-lg bg-background px-3 py-1.5 text-xs leading-relaxed'
        >
          <p>
            <span className='text-muted-foreground'>
              {$t('strategy.threadYou')}
            </span>
            {t.question}
          </p>
          <div className='flex gap-1'>
            <span className='shrink-0 text-muted-foreground'>
              {$t('strategy.threadAi')}
            </span>
            <div className='min-w-0 flex-1'>
              <Answer thread={t} lines={2} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(getCurrentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
/** The questions asked about a day's analysis as a whole, as the conversation that followed it. */
export function DayThreads({ day }: { day: string }) {
  const threads = (useThreads()?.threads || [])
    .filter((t) => t.subject.day === day && !t.subject.opportunityId)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  if (!threads.length) return null;
  return (
    <>
      {threads.map((t) => (
        <div key={t.id} data-thread-id={t.id} className='flex flex-col gap-2'>
          <div className='flex justify-end'>
            <p className='max-w-[70%] rounded-xl rounded-tr-sm bg-primary/10 px-3 py-2 text-sm'>
              {t.question}
            </p>
          </div>
          <div className='flex gap-2.5'>
            <ActorAvatar type='agent' size='sm' className='mt-0.5' />
            <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
              <p className='text-xs text-muted-foreground'>
                {$t('strategy.threadAiAnswer')} · {clock(t.updatedAt)}
              </p>
              <div className='rounded-xl rounded-tl-sm bg-muted/60 px-3 py-2 text-sm leading-relaxed'>
                <Answer thread={t} lines={3} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** How many questions were asked from a day's analysis, whichever they were about. */
export const threadCount = (threads: OnlineThread[], day: string) =>
  threads.filter((t) => t.subject.day === day).length;

/** Ask AI about one opportunity: the chat opens on a new conversation about it, linked to the day's analysis. */
export function AskAboutOpportunity({ row }: { row: Row }) {
  const chat = useOptionalOnlineChat(),
    threads = useThreads();
  if (!chat || !threads?.day) return null;
  const label = $t('strategy.askAi');
  return (
    <Button
      size='icon-xs'
      variant='outline'
      aria-label={label}
      title={label}
      onClick={() =>
        chat.open({
          draft: $t('strategy.askAboutOpportunity', {
            0: [oppNo(row.card), row.card.title].filter(Boolean).join(' '),
          }),
          projectId: String(threads.projectId),
          subject: {
            kind: 'insights',
            day: threads.day,
            opportunityId: row.card.id,
          },
        })
      }
    >
      <MessageCircle aria-hidden='true' />
    </Button>
  );
}
