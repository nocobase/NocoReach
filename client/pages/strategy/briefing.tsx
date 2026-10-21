import { $t, $tj, $legacyText, getCurrentLocale } from '#i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronDown, MessageSquare } from 'lucide-react';
import { cn } from '#lib/utils';
import { Tag, type Tone } from '#components/reach/tag';
import { ActorAvatar, AiMark } from '#components/reach/actor';
import { Button } from '#components/ui/button';
import { useOptionalOnlineChat } from '../../online-agent/context';
import { healthText, loadHealth, type HealthItem } from '../data-health';
import { WAITING_TASKS_URL } from '../task-waiting';
import type { Work } from '../task-execution-types';
import { RequestBlock, type RequestState } from './request-block';
import { Sparkline, chipOf, percent, type MetricItem } from './insights-view';
import { citedSignals, oppNo, taskNo, type Row } from './board';
import { dayOf, type Day, type Feed, type Line, type Standing } from './feed';
import { handOffLabel } from './hand-off';
import {
  AskAboutOpportunity,
  DayThreads,
  OpportunityThreads,
  threadCount,
  useThreads,
} from './threads';
import { recentlyEnded } from './watch';
import type { InsightBatch, StrategyState, WatchRecord } from './model';

// Insights as a conversation with the daily analysis (2026-10-21 user decision: the brief of sections read like
// Opportunities and was all text). The numbers stay as tiles with their trend; below, the analysis speaks once a day:
// what matters, the opportunities to decide on as one line each, watches that ended, tasks and data that need you.
// Earlier days fold into one line each, and Ask AI continues in the chat.

const number = (i: MetricItem) =>
  `${i.signed && i.value! > 0 ? '+' : ''}${i.value!.toLocaleString(getCurrentLocale())}`;
const arrow = (change: number) =>
  `${change >= 0 ? '↑' : '↓'} ${percent(change)}`;
/** The fold marker of a toggle: down when closed, up when open. */
const Chevron = ({ open }: { open: boolean }) => (
  <ChevronDown
    aria-hidden='true'
    className={cn(
      'size-3.5 shrink-0 transition-transform',
      open && 'rotate-180',
    )}
  />
);

/**
 * The numbers as tiles (at most five, only those with a value), each with its trend and opening its data page. The
 * read has its own loading, failure and retry.
 */
export function MetricTiles({
  metrics,
  overview,
}: {
  metrics: MetricItem[];
  overview: RequestState;
}) {
  const items = metrics.filter((i) => i.value != null).slice(0, 5);
  return (
    <RequestBlock
      compact
      title={$t('strategy.keyMetrics')}
      request={overview}
      empty={!items.length}
      emptyText={$t('strategy.noDataYet')}
    >
      <div className='grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3'>
        {items.map((i) => (
          <Link
            key={i.label}
            to={i.to}
            className='flex flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-2 transition-colors hover:bg-muted'
          >
            <span className='text-xs text-muted-foreground'>{i.label}</span>
            <span className='text-lg font-semibold tabular-nums'>
              {number(i)}
            </span>
            <span className='flex items-center gap-2'>
              {i.change == null ? (
                <span className='text-xs text-muted-foreground'>
                  {$t('strategy.noComparisonYet')}
                </span>
              ) : (
                <Tag tone={i.change >= 0 ? 'green' : 'red'}>
                  {arrow(i.change)}
                </Tag>
              )}
              <span className='min-w-0 flex-1'>
                {i.series && <Sparkline points={i.series} change={i.change} />}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </RequestBlock>
  );
}

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function dayLabel(day: string, now: Date) {
  const date = new Date(`${day}T00:00:00`),
    locale = getCurrentLocale(),
    text = `${date.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' })} ${date.toLocaleDateString(locale, { weekday: 'short' })}`,
    yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day === localDay(now)) return `${$t('strategy.dayToday')} · ${text}`;
  if (day === localDay(yesterday))
    return `${$t('strategy.dayYesterday')} · ${text}`;
  return text;
}
const clock = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString(getCurrentLocale(), {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

/** A day in the conversation: its date between two rules. */
function DayDivider({ label }: { label: string }) {
  return (
    <h3 className='flex items-center gap-3 text-xs font-normal text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border'>
      {label}
    </h3>
  );
}
/** What the daily analysis says: its avatar, then its messages one under another. */
function AgentMessage({
  meta,
  children,
}: {
  meta: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className='flex gap-2.5'>
      <ActorAvatar type='agent' size='sm' className='mt-0.5' />
      <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
        <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
          {meta}
        </p>
        {children}
      </div>
    </div>
  );
}
function Bubble({
  label,
  className,
  children,
  ...data
}: {
  label?: string;
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={cn(
        'w-full rounded-xl rounded-tl-sm bg-muted/60 px-3 py-2 text-sm leading-relaxed',
        className,
      )}
      {...data}
    >
      {children}
    </div>
  );
}

/** The day's first message: how many decisions wait, the numbers that moved most, then the analysis notes, folded. */
function Summary({
  batch,
  pending,
  metrics,
  watching,
}: {
  batch?: InsightBatch;
  pending: number;
  metrics: MetricItem[];
  watching: number;
}) {
  const [open, setOpen] = useState(false);
  // The key numbers (the tiles) that moved by 5% or more, the largest two first.
  const notes = (batch?.observations || []).map((o) => $legacyText(o)),
    moved = metrics
      .filter((i) => i.value != null)
      .slice(0, 5)
      .filter((i) => Math.abs(i.change ?? 0) >= 0.05)
      .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))
      .slice(0, 2);
  return (
    <Bubble label={$t('strategy.todayBrief')}>
      <p className='font-medium'>
        {!batch
          ? $t('strategy.noAnalysisYetClickUpdate')
          : pending
            ? $t('strategy.briefHeadline', { 0: pending })
            : $t('strategy.briefHeadlineNone')}
      </p>
      {(moved.length > 0 || watching > 0) && (
        <div className='mt-1.5 flex flex-wrap gap-1.5'>
          {moved.map((i) => (
            <Link key={i.label} to={i.to}>
              <Tag tone={i.change! >= 0 ? 'green' : 'red'}>
                {i.label} {arrow(i.change!)}
              </Tag>
            </Link>
          ))}
          {watching > 0 && (
            <Link to='/opportunities?tab=watch'>
              <Tag tone='grey'>
                {$t('strategy.watchingChip', { 0: watching })}
              </Tag>
            </Link>
          )}
        </div>
      )}
      {notes.length > 0 && (
        <>
          <button
            type='button'
            aria-expanded={open}
            className='mt-1.5 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground'
            onClick={() => setOpen((o) => !o)}
          >
            {$t('strategy.analysisNotes', { 0: notes.length })}
            <Chevron open={open} />
          </button>
          {open && (
            <ul className='mt-1 flex list-disc flex-col gap-0.5 pl-4 text-muted-foreground'>
              {notes.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Bubble>
  );
}

const lead = (row: Row) =>
  [...citedSignals(row)]
    .sort((a, b) => b.strength - a.strength)
    .map(chipOf)
    .find(Boolean) || null;
const itemLink = (row: Row) =>
  `/opportunities?item=${encodeURIComponent(row.card.id)}`;
const No = ({ row }: { row: Row }) =>
  row.card.no ? (
    <span className='mr-1.5 font-mono text-xs text-muted-foreground tabular-nums'>
      {oppNo(row.card)}
    </span>
  ) : null;
type Decide = {
  busy: boolean;
  onGive: (r: Row) => void;
  onIgnore: (r: Row) => void;
};

/** Where a day's opportunities stand: awaiting decision, handed off, dismissed, expired (only those with any). */
function StandingTags({ lines }: { lines: Line[] }) {
  const count = (f: (x: Line) => boolean) => lines.filter(f).length,
    tags: [Tone, string, number][] = [
      [
        'amber',
        'strategy.pendingCount',
        count((x) => x.st.state === 'pending'),
      ],
      ['blue', 'strategy.handedCount', count((x) => x.st.state === 'task')],
      [
        'grey',
        'strategy.dismissedCount',
        count((x) => x.st.reason === 'ignored'),
      ],
      [
        'grey',
        'strategy.expiredCount',
        count((x) => x.st.reason === 'expired'),
      ],
    ];
  return (
    <>
      {tags
        .filter(([, , n]) => n > 0)
        .map(([tone, key, n]) => (
          <Tag key={key} tone={tone}>
            {$t(key, { 0: n })}
          </Tag>
        ))}
    </>
  );
}
/** An opportunity already decided: its title and where it went. */
function DecidedLine({ row, st }: Line) {
  return (
    <li data-opportunity-id={row.card.id} className='py-1.5'>
      <div className='flex items-center gap-2'>
        <Link
          to={itemLink(row)}
          title={row.card.title}
          className='min-w-0 flex-1 truncate text-muted-foreground hover:underline'
        >
          <No row={row} />
          {row.card.title}
        </Link>
        <AskAboutOpportunity row={row} />
        <StatusTag row={row} st={st} />
      </div>
      <OpportunityThreads opportunityId={row.card.id} />
    </li>
  );
}

/**
 * The opportunities of the day: those waiting for a decision (the same ones as Opportunities' To do, most important
 * first) with Hand off to agent and Ignore, then those decided today with where they went, one line each; five shown
 * and the rest folded. The evidence stays on Opportunities.
 */
function Decisions({
  pending,
  decided,
  busy,
  onGive,
  onIgnore,
}: { pending: Row[]; decided: Line[] } & Decide) {
  const [more, setMore] = useState(false),
    lines: Line[] = [
      ...pending.map((row): Line => ({ row, st: { state: 'pending' } })),
      ...decided,
    ],
    shown = more ? lines : lines.slice(0, 5),
    rest = lines.length - 5;
  return (
    <Bubble
      label={$t('strategy.decideCount', { 0: pending.length })}
      className='py-1'
    >
      {decided.length > 0 && (
        <div className='flex flex-wrap items-center gap-1.5 border-b border-border/70 py-1.5'>
          <StandingTags lines={lines} />
        </div>
      )}
      <ul className='divide-y divide-border/70'>
        {shown.map(({ row: r, st }, i) => {
          if (st.state !== 'pending')
            return <DecidedLine key={r.card.id} row={r} st={st} />;
          const c = lead(r);
          return (
            <li
              key={r.card.id}
              aria-label={r.card.title}
              data-opportunity-id={r.card.id}
              className='py-1.5'
            >
              <div className='flex items-center gap-2'>
                {c && <Tag tone={c.tone}>{c.text}</Tag>}
                <Link
                  to={itemLink(r)}
                  title={r.card.title}
                  className='min-w-0 flex-1 truncate hover:underline'
                >
                  <No row={r} />
                  {r.card.title}
                </Link>
                <AskAboutOpportunity row={r} />
                <Button
                  size='xs'
                  variant={i === 0 ? 'default' : 'outline'}
                  disabled={busy}
                  onClick={() => onGive(r)}
                >
                  {handOffLabel()}
                </Button>
                <Button
                  size='xs'
                  variant='ghost'
                  disabled={busy}
                  onClick={() => onIgnore(r)}
                >
                  {$t('common.ignore')}
                </Button>
              </div>
              <OpportunityThreads opportunityId={r.card.id} />
            </li>
          );
        })}
      </ul>
      <div className='flex items-center justify-between gap-3 border-t border-border/70 py-1.5 text-xs'>
        {rest > 0 ? (
          <button
            type='button'
            aria-expanded={more}
            className='nr-link inline-flex items-center gap-0.5'
            onClick={() => setMore((m) => !m)}
          >
            {more
              ? $t('common.collapse')
              : $t('strategy.moreToDecide', { 0: rest })}
            <Chevron open={more} />
          </button>
        ) : (
          <span />
        )}
        <Link className='nr-link' to='/opportunities'>
          {$t('strategy.evidenceOnOpportunities')}
        </Link>
      </div>
    </Bubble>
  );
}

const OUTCOME: Record<string, [Tone, () => string]> = {
  normal: ['green', () => $t('strategy.backNormal')],
  opportunity: ['amber', () => $t('strategy.becameOpportunity')],
  ignored: ['grey', () => $t('strategy.ignored')],
};
/** A watch that ended: how it ended, what was watched and why it ended. */
function Ended({ w, rows }: { w: WatchRecord; rows: Row[] }) {
  const e = w.ended!,
    [tone, text] = OUTCOME[e.outcome] || [
      'grey',
      () => $t('common.noActionNeeded'),
    ],
    row = e.opportunityId
      ? rows.find((r) => r.card.id === e.opportunityId)
      : undefined;
  return (
    <Bubble data-watch-ended={e.outcome}>
      <Tag tone={tone} className='mr-1.5'>
        {text()}
      </Tag>
      <span className='text-muted-foreground'>
        {$t('strategy.watchEnded')} ·{' '}
      </span>
      {$legacyText(w.startTitle)}
      {e.reason ? (
        <span className='text-muted-foreground'> · {e.reason}</span>
      ) : null}
      {e.outcome === 'opportunity' && row && (
        <Link className='nr-link ml-1.5 text-xs' to={itemLink(row)}>
          {oppNo(row.card) || row.card.title} →
        </Link>
      )}
    </Bubble>
  );
}

type WaitingTask = {
  id: number;
  title: string;
  evidence?: { work?: Work };
};
/** Tasks waiting for you: the first two by name, then the list. */
export function WaitingNote({
  tasks,
  label,
}: {
  tasks: WaitingTask[];
  label: (w?: Work) => string;
}) {
  const navigate = useNavigate();
  if (!tasks.length) return null;
  return (
    <Bubble className='flex flex-wrap items-center gap-x-3 gap-y-1'>
      <Tag tone='amber'>{$tj('strategy.thingsNeed', { 0: tasks.length })}</Tag>
      {tasks.slice(0, 2).map((t) => (
        <button
          key={t.id}
          type='button'
          className='min-w-0 max-w-[24rem] truncate underline-offset-4 hover:underline'
          onClick={() => void navigate(`/actions/${t.id}`)}
        >
          {t.title} · {label(t.evidence?.work)}
        </button>
      ))}
      <button
        type='button'
        className='nr-link ml-auto text-xs'
        onClick={() => void navigate(WAITING_TASKS_URL)}
      >
        {$t('strategy.view')} →
      </button>
    </Bubble>
  );
}

/** Data that failed to sync for over a day, so today's analysis may lack it. */
function HealthNote({ projectId }: { projectId: number }) {
  // Kept with the project it was read for, so another project's failures never show.
  const [health, setHealth] = useState<{
    projectId: number;
    items: HealthItem[];
  }>();
  useEffect(() => {
    let live = true;
    void loadHealth(projectId)
      .then((h) => {
        if (live)
          setHealth({
            projectId,
            items: h.items.filter((i) => i.state === 'failing'),
          });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectId]);
  const items = health?.projectId === projectId ? health.items : [];
  if (!items.length) return null;
  return (
    <Bubble>
      <Tag tone='amber' className='mr-1.5'>
        {$t('strategy.syncFailed')}
      </Tag>
      {$tj('dataHealth.failedSyncOverDayOpportunities', {
        0: items.map((i) => healthText(i.name, i.nameText)).join('、'),
      })}
      <Link className='nr-link ml-1.5 text-xs' to='/connections'>
        {$t('dataHealth.fix')} →
      </Link>
    </Bubble>
  );
}

/**
 * Today in the conversation: the analysis's summary, the decisions waiting, the watches that ended today, then what
 * else needs you (tasks, data). `tasks` is the waiting-task read with its own loading and failure.
 */
export function Today({
  state,
  rows,
  feed,
  metrics,
  generating,
  projectId,
  tasks,
  ...decide
}: {
  state: StrategyState;
  rows: Row[];
  feed: Feed;
  metrics: MetricItem[];
  generating: boolean;
  projectId: number;
  tasks: ReactNode;
} & Decide) {
  const [now] = useState(() => new Date());
  const batch = state.insights,
    watching = Object.values(state.watch || {}).filter((w) => !w.ended).length;
  return (
    <>
      <DayDivider
        label={dayLabel(dayOf(batch?.generatedAt) || localDay(now), now)}
      />
      <AgentMessage
        meta={
          <>
            {$t('strategy.dailyAnalysisName')}
            <AiMark />
            {generating ? $t('strategy.analyzing') : clock(batch?.generatedAt)}
          </>
        }
      >
        <Summary
          batch={batch}
          pending={feed.pending.length}
          metrics={metrics}
          watching={watching}
        />
        {(feed.pending.length > 0 || feed.decided.length > 0) && (
          <Decisions
            pending={feed.pending}
            decided={feed.decided}
            {...decide}
          />
        )}
        {recentlyEnded(state, 1).map((w) => (
          <Ended key={w.key} w={w} rows={rows} />
        ))}
        {tasks}
        <HealthNote projectId={projectId} />
      </AgentMessage>
      <DayThreads day={dayOf(batch?.generatedAt)} />
    </>
  );
}

function StatusTag({ row, st }: { row: Row; st: Standing }) {
  if (st.state === 'task')
    return (
      <Link to={`/actions/${row.taskId}`}>
        <Tag tone='blue'>
          {$t('strategy.handedOffAgent')}
          {row.taskNo ? ` · ${taskNo(row.taskNo)}` : ''}
        </Tag>
      </Link>
    );
  if (st.state === 'pending')
    return <Tag tone='amber'>{$t('strategy.awaitingDecision')}</Tag>;
  return (
    <Tag tone='grey'>
      {st.reason === 'ignored'
        ? $t('strategy.dismissed')
        : $t('strategy.expired')}
    </Tag>
  );
}
/** An earlier day, folded to one line: what was suggested and where each went; opens to the list. */
function PastDay({ day, rows, now }: { day: Day; rows: Row[]; now: Date }) {
  const [open, setOpen] = useState(false),
    asked = threadCount(useThreads()?.threads || [], day.day);
  return (
    <section
      aria-label={dayLabel(day.day, now)}
      className='flex flex-col gap-2'
    >
      <DayDivider label={dayLabel(day.day, now)} />
      <div className='flex gap-2.5'>
        <ActorAvatar type='agent' size='sm' />
        <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
          <button
            type='button'
            aria-expanded={open}
            className='flex flex-wrap items-center gap-1.5 text-left text-sm'
            onClick={() => setOpen((o) => !o)}
          >
            <span className='text-muted-foreground'>
              {[
                day.items.length
                  ? $t('strategy.daySuggested', { 0: day.items.length })
                  : '',
                day.ended.length
                  ? $t('strategy.dayWatchesEnded', { 0: day.ended.length })
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <StandingTags lines={day.items} />
            {asked > 0 && (
              <Tag tone='grey'>{$t('strategy.dayThreads', { 0: asked })}</Tag>
            )}
            <span className='nr-link ml-auto inline-flex items-center gap-0.5 text-xs'>
              {open ? $t('common.collapse') : $t('strategy.expandDay')}
              <Chevron open={open} />
            </span>
          </button>
          {open && (
            <>
              {day.items.length > 0 && (
                <Bubble className='py-1'>
                  <ul className='divide-y divide-border/70'>
                    {day.items.map((line) => (
                      <DecidedLine key={line.row.card.id} {...line} />
                    ))}
                  </ul>
                </Bubble>
              )}
              {day.ended.map((w) => (
                <Ended key={w.key} w={w} rows={rows} />
              ))}
              <DayThreads day={day.day} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
/** The days before the latest analysis, newest first, a week at a time. */
export function History({
  days: feedDays,
  today,
  rows,
}: {
  days: Day[];
  today: string;
  rows: Row[];
}) {
  const [limit, setLimit] = useState(7),
    [now] = useState(() => new Date()),
    threads = useThreads()?.threads || [];
  // A day whose analysis raised nothing but was asked about still shows, for its questions.
  const known = new Set(feedDays.map((d) => d.day)),
    asked = [...new Set(threads.map((t) => t.subject.day))].filter(
      (d) => !known.has(d) && (!today || d < today),
    ),
    days = [
      ...feedDays,
      ...asked.map((day): Day => ({ day, items: [], ended: [] })),
    ].sort((a, b) => b.day.localeCompare(a.day));
  if (!days.length) return null;
  return (
    <>
      {days.slice(0, limit).map((d) => (
        <PastDay key={d.day} day={d} rows={rows} now={now} />
      ))}
      {days.length > limit && (
        <button
          type='button'
          className='nr-link inline-flex items-center gap-0.5 self-center text-xs'
          onClick={() => setLimit((n) => n + 7)}
        >
          {$t('strategy.earlierDays')}
          <Chevron open={false} />
        </button>
      )}
    </>
  );
}

/** Ask AI: the chat opens on a new conversation about the day's analysis, which Insights then shows under that day. */
export function AskBar({ projectId, day }: { projectId: number; day: string }) {
  const chat = useOptionalOnlineChat();
  if (!chat) return null;
  const date = day
    ? new Date(`${day}T00:00:00`).toLocaleDateString(getCurrentLocale(), {
        month: 'numeric',
        day: 'numeric',
      })
    : '';
  return (
    <button
      type='button'
      className='sticky bottom-3 z-10 flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2.5 text-left text-sm text-muted-foreground shadow-sm transition-colors hover:border-ring'
      onClick={() =>
        chat.open({
          draft: date ? $t('strategy.askDraft', { 0: date }) : '',
          projectId: String(projectId),
          subject: day ? { kind: 'insights', day } : null,
        })
      }
    >
      <MessageSquare className='size-4 shrink-0' aria-hidden='true' />
      <span className='min-w-0 flex-1 truncate'>
        {$t('strategy.askPlaceholder')}
      </span>
      <span className='nr-link text-xs'>{$t('strategy.askAi')}</span>
    </button>
  );
}
