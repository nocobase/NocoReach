import { formatTime, localDateKey } from '#lib/format';
import { $t, $tj, $legacyText, getCurrentLocale } from '#i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '#lib/utils';
import { formatCount } from '#lib/format';
import { Tag, type Tone } from '#components/reach/tag';
import { ActorAvatar, AiMark } from '#components/reach/actor';
import { Button } from '#components/ui/button';
import { healthText, loadHealth, type HealthItem } from '../data-health';
import { WAITING_TASKS_URL } from '../task-waiting';
import type { Work } from '../task-execution-types';
import { RequestBlock, type RequestState } from './request-block';
import {
  Sparkline,
  analysisMetrics,
  chipOf,
  percent,
  type MetricItem,
} from './insights-view';
import { citedSignals, oppNo, taskNo, type Row } from './board';
import { dayOf, type Day, type Feed, type Line } from './feed';
import { TASK_TAG } from './task-standing';
import { severalTag } from './places-model';
import { handOffLabel } from './hand-off';
import {
  DayConversation,
  InPanelNote,
  QuoteOpportunity,
  questionCount,
  useInsightChat,
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
// Below 10 in the period before, a percentage says little (1 → 3 reads ↑ 200%): the change is the count instead,
// "↑ 2" (2026-10-27 user decision).
const SMALL_BASE = 10;
const smallBase = (i: MetricItem) =>
  i.previous != null && i.previous < SMALL_BASE && i.value != null;
// A small base counts from zero too: 0 → 3 is "↑ 3", where a percentage has no answer.
const rose = (i: MetricItem) =>
  smallBase(i) ? i.value! >= i.previous! : (i.change ?? 0) >= 0;
const changeText = (i: MetricItem) =>
  smallBase(i)
    ? `${rose(i) ? '↑' : '↓'} ${formatCount(Math.abs(i.value! - i.previous!))}`
    : arrow(i.change!);
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
 * read has its own loading, failure and retry. Cards on the page surface like the messages below, the number large
 * with its change right after it (2026-10-22 visual polish).
 */
export function MetricTiles({
  metrics,
  overview,
  days,
}: {
  metrics: MetricItem[];
  overview: RequestState;
  days: number;
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
      {/* What the numbers and their changes cover, quietly above them (2026-10-22: the period left the subtitle). */}
      <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
        <p className='text-xs text-muted-foreground'>
          {$t('strategy.metricWindow', { 0: days })}
        </p>
        <div className='grid min-w-0 grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3'>
          {items.map((i) => (
            <Link
              key={i.label}
              to={i.to}
              className='flex flex-col gap-1 rounded-lg border bg-card px-3 pt-2.5 pb-2 text-card-foreground transition-colors hover:border-ring/60'
            >
              <span className='text-xs text-muted-foreground'>{i.label}</span>
              <span className='flex flex-wrap items-baseline gap-x-2'>
                <span className='text-xl leading-7 font-medium tabular-nums sm:text-[1.375rem]'>
                  {number(i)}
                </span>
                {i.change == null && !smallBase(i) ? (
                  <span className='text-xs text-muted-foreground'>
                    {$t('strategy.noComparisonYet')}
                  </span>
                ) : (
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums',
                      rose(i) ? 'text-nr-ink-green' : 'text-nr-ink-red',
                    )}
                  >
                    {changeText(i)}
                  </span>
                )}
              </span>
              {i.series && (
                <Sparkline
                  points={i.series}
                  change={smallBase(i) ? i.value! - i.previous! : i.change}
                />
              )}
            </Link>
          ))}
        </div>
      </div>
    </RequestBlock>
  );
}

const localDay = localDateKey;
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
const clock = (iso?: string) => (iso ? formatTime(iso) : '');

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
      <ActorAvatar type='agent' size='default' />
      <div className='flex min-w-0 flex-1 flex-col gap-2'>
        <p className='flex h-8 items-center gap-1.5 text-xs text-muted-foreground'>
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
        'w-full rounded-xl rounded-tl-sm border bg-card px-3.5 py-2.5 text-sm leading-relaxed text-card-foreground',
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
  watching,
}: {
  batch?: InsightBatch;
  pending: number;
  watching: number;
}) {
  const [open, setOpen] = useState(false);
  // The key numbers that moved by 5% or more over the analysis's own period, the largest two first, from the figures
  // it read (analysisMetrics), not the tiles; a number with a small base is left out, its percentage being noise.
  const days = batch?.evidence?.periodDays,
    notes = (batch?.observations || []).map((o) => $legacyText(o)),
    moved = analysisMetrics(batch?.evidence)
      .filter((i) => !smallBase(i) && Math.abs(i.change ?? 0) >= 0.05)
      .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))
      .slice(0, 2);
  return (
    <Bubble label={$t('strategy.todayBrief')}>
      <p className='text-lg leading-snug font-semibold'>
        {!batch
          ? $t('strategy.noAnalysisYetClickUpdate')
          : pending
            ? $t('strategy.briefHeadline', { 0: pending })
            : $t('strategy.briefHeadlineNone')}
      </p>
      {(moved.length > 0 || watching > 0) && (
        <div className='mt-1.5 flex flex-wrap gap-1.5'>
          {moved.map((i) => (
            <Link
              key={i.label}
              to={i.to}
              title={
                days ? $t('strategy.metricWindow', { 0: days }) : undefined
              }
            >
              <Tag tone={i.change! >= 0 ? 'green' : 'red'}>
                {i.label} {changeText(i)}
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
    <span className='mr-1.5 font-mono text-xs font-normal text-muted-foreground tabular-nums'>
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
/** The right-hand column of a line: its status or its actions, right-aligned so they read as one column. */
const END_SLOT = 'flex shrink-0 items-center justify-end gap-1 sm:min-w-36';
/**
 * An opportunity already decided: its title and where it went. One dismissed or expired is dimmed as a whole, so the
 * handed-off ones and their tasks stand out (2026-10-22 visual polish).
 */
function DecidedLine({ row, st, task, tasks }: Line) {
  return (
    <li
      data-opportunity-id={row.card.id}
      className={cn('py-1.5', st.state !== 'task' && 'opacity-60')}
    >
      <div className='flex items-center gap-2'>
        <Link
          to={itemLink(row)}
          title={row.card.title}
          className={cn(
            'min-w-0 flex-1 truncate hover:underline',
            st.state === 'task' ? 'font-medium' : 'text-muted-foreground',
          )}
        >
          <No row={row} />
          {row.card.title}
        </Link>
        <QuoteOpportunity row={row} />
        <span className={END_SLOT}>
          <StatusTag row={row} st={st} task={task} tasks={tasks} />
        </span>
      </div>
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
        {shown.map((line) => {
          const { row: r, st } = line;
          if (st.state !== 'pending')
            return <DecidedLine key={r.card.id} {...line} />;
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
                  className='min-w-0 flex-1 truncate font-medium hover:underline'
                >
                  <No row={r} />
                  {r.card.title}
                </Link>
                <QuoteOpportunity row={r} />
                <span className={END_SLOT}>
                  <Button
                    size='xs'
                    variant='outline'
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
                </span>
              </div>
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
      <Link className='nr-link ml-1.5 text-xs' to='/connections?tab=health'>
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
  generating,
  projectId,
  tasks,
  situation,
  ...decide
}: {
  state: StrategyState;
  rows: Row[];
  feed: Feed;
  generating: boolean;
  projectId: number;
  tasks: ReactNode;
  /** Under the day's date: the current situation folded to a line while the side panel is open. */
  situation?: ReactNode;
} & Decide) {
  const [now] = useState(() => new Date()),
    docked = useInsightChat()?.docked;
  const batch = state.insights,
    watching = Object.values(state.watch || {}).filter((w) => !w.ended).length;
  return (
    <>
      <DayDivider
        label={dayLabel(localDay(batch?.generatedAt) || localDay(now), now)}
      />
      {situation}
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
      {docked ? (
        <InPanelNote />
      ) : (
        <DayConversation day={dayOf(batch?.generatedAt)} folded />
      )}
    </>
  );
}

// Where a decided opportunity went; once handed off, where its task stands now (task-standing.ts).
function StatusTag({ row, st, task, tasks }: Line) {
  // Several tasks, one per place: how many and how many are done; the tag opens the opportunity with its task list.
  if (st.state === 'task' && tasks) {
    const tag = severalTag(tasks);
    return (
      <Link to={itemLink(row)}>
        <Tag tone={tag.tone}>{tag.text}</Tag>
      </Link>
    );
  }
  if (st.state === 'task') {
    const [tone, text] = TASK_TAG[task ?? 'todo'];
    return (
      <Link to={`/actions/${row.taskId}`}>
        <Tag tone={tone}>
          {text()}
          {row.taskNo ? ` · ${taskNo(row.taskNo)}` : ''}
        </Tag>
      </Link>
    );
  }
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
    threads = useInsightChat()?.threads || [],
    asked = questionCount(threads, day.day),
    displayDay = localDateKey(
      day.items[0]?.row.firstSeenAt || day.ended[0]?.ended?.at || day.day,
    );
  return (
    <section
      aria-label={dayLabel(displayDay, now)}
      className='flex flex-col gap-2'
    >
      <DayDivider label={dayLabel(displayDay, now)} />
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
              <DayConversation day={day.day} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
/** The current situation folded to one line under the day's date, opening in place (while the side panel is open). */
export function FoldedSituation({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className='flex flex-col gap-2'>
      <button
        type='button'
        aria-expanded={open}
        className='nr-link inline-flex items-center gap-0.5 self-end text-xs'
        onClick={() => setOpen((o) => !o)}
      >
        {count
          ? $t('strategy.situationAttention', { 0: count })
          : $t('strategy.currentSituation')}
        <Chevron open={open} />
      </button>
      {open && children}
    </div>
  );
}
/**
 * The days before the latest analysis, above today as in a conversation (2026-10-22 user decision): folded by default to
 * one line, then a week at a time, the oldest shown at the top so the page reads down to today and its conversation.
 */
export function History({
  days: feedDays,
  today,
  rows,
}: {
  days: Day[];
  today: string;
  rows: Row[];
}) {
  const [shown, setShown] = useState(0),
    [now] = useState(() => new Date()),
    threads = useInsightChat()?.threads || [];
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
  const hide = (
    <button
      type='button'
      className='nr-link inline-flex items-center gap-0.5 text-xs'
      onClick={() => setShown(0)}
    >
      {$t('strategy.collapseEarlier')}
      <ChevronDown className='size-3.5' aria-hidden='true' />
    </button>
  );
  return (
    <>
      <div className='flex items-center justify-center gap-3'>
        {shown < days.length && (
          <button
            type='button'
            className='nr-link inline-flex items-center gap-0.5 text-xs'
            onClick={() => setShown((n) => n + 7)}
          >
            <ChevronUp className='size-3.5' aria-hidden='true' />
            {shown
              ? $t('strategy.earlierDays')
              : $t('strategy.earlierAnalyses', { 0: days.length })}
          </button>
        )}
        {shown > 0 && hide}
      </div>
      {days
        .slice(0, shown)
        .reverse()
        .map((d) => (
          <PastDay key={d.day} day={d} rows={rows} now={now} />
        ))}
      {/* Folding again from just above today, where the reader is after scrolling through them. */}
      {shown > 0 && <div className='flex justify-center'>{hide}</div>}
    </>
  );
}
