import { $t, $tj, $legacyText, getCurrentLocale } from '#i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Check, ChevronDown, ChevronUp, Minus } from 'lucide-react';
import { cn } from '#lib/utils';
import { Tag, type Tone } from '#components/reach/tag';
import { ActorAvatar } from '#components/reach/actor';
import { Button, buttonVariants } from '#components/ui/button';
import { healthText, loadHealth, type HealthItem } from '../data-health';
import { WAITING_TASKS_URL } from '../task-waiting';
import type { Work } from '../task-execution-types';
import { percent, type MetricItem } from './insights-view';
import { oppNo, reasonLine, taskNo, type Row } from './board';
import { dayOf, type Day, type Feed, type Line } from './feed';
import type { TaskStanding } from './task-standing';
import { handOffLabel } from './hand-off';
import {
  DayConversation,
  InPanelNote,
  QuoteOpportunity,
  questionCount,
  useInsightChat,
} from './threads';
import { recentlyEnded } from './watch';
import type { StrategyState, WatchRecord } from './model';

// Insights as a conversation with the daily analysis (2026-10-21 user decision). Each day's analysis reads as a briefing
// (2026-10-22 user-approved design, after Linear Pulse): the day as its title, a lead sentence from the day's numbers,
// then sections, each a small grey label with a hairline: Analysis notes, Opportunities, Watches ended, and at the
// bottom what waits for you. Only four text styles: the title, an item's title, body text and grey text. Earlier
// days fold into one line each, and Ask AI continues in the chat.

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

/** "October 22" in the reader's language, as a briefing's title. */
const analysisTitle = (day: string) =>
  $t('strategy.analysisOfDay', {
    0: new Date(`${day}T00:00:00`).toLocaleDateString(getCurrentLocale(), {
      month: 'long',
      day: 'numeric',
    }),
  });
/** Today, Yesterday or the date, before the time in the message's header. */
function relativeDay(day: string, now: Date) {
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );
  if (day === localDay(now)) return $t('strategy.dayToday');
  if (day === localDay(yesterday)) return $t('strategy.dayYesterday');
  return new Date(`${day}T00:00:00`).toLocaleDateString(getCurrentLocale(), {
    month: 'numeric',
    day: 'numeric',
  });
}

/** A day's analysis as a briefing card: its title, a lead sentence, then its sections. */
function Briefing({
  title,
  label,
  lead,
  children,
}: {
  title: string;
  label?: string;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article
      aria-label={label ?? title}
      className='rounded-xl border bg-card px-5 py-5 text-card-foreground sm:px-7 sm:py-6'
    >
      <h3 className='text-xl leading-snug font-semibold'>{title}</h3>
      {lead && <p className='mt-1.5 text-sm leading-relaxed'>{lead}</p>}
      {children}
    </article>
  );
}
/** A section of a briefing: a small grey label with a hairline to its right, then its items. */
function BriefSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className='mt-6'>
      <h4 className='mb-1 flex items-center gap-3 text-xs font-normal text-muted-foreground after:h-px after:flex-1 after:bg-border'>
        {label}
      </h4>
      <ul>{children}</ul>
    </section>
  );
}
/** One item: an icon, its title in medium weight, one grey line, and at the right what it links to or offers. */
function BriefItem({
  icon,
  title,
  line,
  end,
  dim,
  label,
  ...data
}: {
  icon: ReactNode;
  title: ReactNode;
  line?: ReactNode;
  end?: ReactNode;
  dim?: boolean;
  /** The item's name when its title is more than text (an opportunity's title is a link with its number). */
  label?: string;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <li
      aria-label={label}
      className={cn(
        'grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 py-2 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto]',
        dim && 'opacity-60',
      )}
      {...data}
    >
      <span className='mt-px flex'>{icon}</span>
      <div className='min-w-0'>
        <div className='text-sm font-medium'>{title}</div>
        {line && <div className='text-sm text-muted-foreground'>{line}</div>}
      </div>
      {/* At the right on wider screens; under the title on a phone, so the title keeps its width. */}
      {end && (
        <div className='col-start-2 mt-1 flex items-center gap-1.5 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:pt-px'>
          {end}
        </div>
      )}
    </li>
  );
}
/** A fold inside a section: "3 more" or "3 dismissed", lined up with the items' titles. */
function FoldToggle({
  open,
  label,
  onToggle,
}: {
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <li className='py-1 pl-8'>
      <button
        type='button'
        aria-expanded={open}
        className='inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground'
        onClick={onToggle}
      >
        {open ? $t('common.collapse') : label}
        <Chevron open={open} />
      </button>
    </li>
  );
}

/**
 * Where an item stands, as one small icon in the one hue of its state (the shared task states of task-standing.ts):
 * waiting for your decision amber, handed off and not started a dashed blue ring, in progress blue, waiting for your
 * review violet, done green, closed, dismissed or expired grey. The grey line under the item says the same in words.
 */
type IconKind = TaskStanding | 'pending' | 'dismissed';
function StatusIcon({ kind }: { kind: IconKind }) {
  const ring = (colour: string) => (
    <span
      aria-hidden='true'
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
        colour,
      )}
    >
      <span className='size-1.5 rounded-full bg-current' />
    </span>
  );
  if (kind === 'done')
    return (
      <span
        aria-hidden='true'
        className='flex size-5 shrink-0 items-center justify-center rounded-full bg-nr-ink-green text-background'
      >
        <Check className='size-3' strokeWidth={3} />
      </span>
    );
  if (kind === 'doing') return ring('border-nr-ink-blue text-nr-ink-blue');
  if (kind === 'review') return ring('border-nr-ink-violet text-nr-ink-violet');
  if (kind === 'pending') return ring('border-nr-ink-amber text-nr-ink-amber');
  if (kind === 'todo')
    return (
      <span
        aria-hidden='true'
        className='size-5 shrink-0 rounded-full border-2 border-dashed border-nr-ink-blue'
      />
    );
  return (
    <span
      aria-hidden='true'
      className='flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'
    >
      <Minus className='size-3' />
    </span>
  );
}
/** A numbered grey circle, for the analysis notes. */
const NumberIcon = ({ n }: { n: number }) => (
  <span
    aria-hidden='true'
    className='flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] text-muted-foreground tabular-nums'
  >
    {n}
  </span>
);
/** An exclamation in a tinted circle, for what waits for you at the bottom of the briefing. */
const AlertIcon = ({ tone }: { tone: 'violet' | 'amber' }) => (
  <span
    aria-hidden='true'
    className={cn(
      'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
      tone === 'violet'
        ? 'bg-nr-tint-violet text-nr-ink-violet'
        : 'bg-nr-tint-amber text-nr-ink-amber',
    )}
  >
    !
  </span>
);

/** A label ending in a Latin letter or digit (New stars in Chinese ends in "Star") gets a space before Chinese or Japanese text. */
const spaced = (label: string) =>
  /[A-Za-z0-9]$/.test(label) && /^(zh|ja)/.test(getCurrentLocale())
    ? `${label} `
    : label;
/**
 * The lead sentence, from the day's own numbers and no new AI text: what waits for a decision, then the two key numbers
 * that moved most (5% or more) against the previous period, and how many changes are being watched.
 */
function leadOf(
  pending: number,
  metrics: MetricItem[],
  watching: number,
  days: number,
) {
  const first = pending
      ? $t('strategy.briefHeadline', { 0: pending })
      : $t('strategy.briefHeadlineNone'),
    moved = metrics
      .filter((i) => i.value != null)
      .slice(0, 5)
      .filter((i) => Math.abs(i.change ?? 0) >= 0.05)
      .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))
      .slice(0, 2),
    clauses = moved.map((i, k) =>
      k === 0
        ? $t(
            i.change! > 0 ? 'strategy.leadFirstUp' : 'strategy.leadFirstDown',
            { 0: spaced(i.label), 1: days, 2: percent(i.change!) },
          )
        : $t(i.change! > 0 ? 'strategy.leadNextUp' : 'strategy.leadNextDown', {
            0: spaced(i.label),
            1: percent(i.change!),
          }),
    );
  if (watching) clauses.push($t('strategy.leadWatching', { 0: watching }));
  return clauses.length
    ? $t('strategy.leadTwo', {
        0: first,
        1: clauses.join($t('strategy.clauseSep')),
      })
    : $t('strategy.leadOne', { 0: first });
}

/** A note's first sentence as its title, the rest as its grey line. */
function splitNote(text: string): [string, string] {
  const m = /^(.+?(?:[。！？]|[.!?](?=\s|$)))\s*([\s\S]+)$/.exec(text);
  return m ? [m[1], m[2]] : [text, ''];
}
/** Analysis notes: what the analysis observed, numbered, shown in full. */
function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <BriefSection label={$t('strategy.sectionNotes')}>
      {notes.map((o, k) => {
        const [head, rest] = splitNote(o);
        return (
          <BriefItem
            key={o}
            icon={<NumberIcon n={k + 1} />}
            title={head}
            line={rest || undefined}
          />
        );
      })}
    </BriefSection>
  );
}

const itemLink = (row: Row) =>
  `/opportunities?item=${encodeURIComponent(row.card.id)}`;
type Decide = {
  busy: boolean;
  onGive: (r: Row) => void;
  onIgnore: (r: Row) => void;
};
const TASK_LINE: Record<TaskStanding, string> = {
  todo: 'strategy.lineTodo',
  doing: 'strategy.lineDoing',
  review: 'strategy.lineReview',
  done: 'strategy.lineDone',
  closed: 'strategy.lineClosed',
};
/** One opportunity: its state's icon, "O-43 title", one grey line, and its task or the decision at the right. */
function OpportunityItem({
  line,
  decide,
}: {
  line: Line;
  decide?: Partial<Decide>;
}) {
  const { row, st, task = 'todo', observing } = line,
    name = row.taskNo ? taskNo(row.taskNo) : $t('strategy.theTask'),
    title = (
      <Link to={itemLink(row)} className='hover:underline'>
        {row.card.no ? `${oppNo(row.card)} ` : ''}
        {row.card.title}
      </Link>
    );
  if (st.state === 'pending')
    return (
      <BriefItem
        label={row.card.title}
        data-opportunity-id={row.card.id}
        icon={<StatusIcon kind='pending' />}
        title={title}
        line={<span className='line-clamp-1'>{reasonLine(row)}</span>}
        end={
          <>
            <QuoteOpportunity row={row} />
            {decide?.onGive && (
              <Button
                size='xs'
                variant='outline'
                disabled={decide.busy}
                onClick={() => decide.onGive!(row)}
              >
                {handOffLabel()}
              </Button>
            )}
            {decide?.onIgnore && (
              <Button
                size='xs'
                variant='ghost'
                disabled={decide.busy}
                onClick={() => decide.onIgnore!(row)}
              >
                {$t('common.ignore')}
              </Button>
            )}
          </>
        }
      />
    );
  if (st.state === 'task')
    return (
      <BriefItem
        label={row.card.title}
        data-opportunity-id={row.card.id}
        icon={<StatusIcon kind={task} />}
        title={title}
        line={$t(
          task === 'done' && observing
            ? 'strategy.lineObserving'
            : TASK_LINE[task],
          { 0: name },
        )}
        end={
          <>
            <QuoteOpportunity row={row} />
            <Link
              className='nr-link text-xs tabular-nums'
              to={`/actions/${row.taskId}`}
            >
              {row.taskNo ? taskNo(row.taskNo) : $t('strategy.viewTask')}
            </Link>
          </>
        }
      />
    );
  return (
    <BriefItem
      dim
      label={row.card.title}
      data-opportunity-id={row.card.id}
      icon={<StatusIcon kind='dismissed' />}
      title={title}
      line={
        st.reason === 'ignored'
          ? $t('strategy.dismissed')
          : $t('strategy.expired')
      }
      end={<QuoteOpportunity row={row} />}
    />
  );
}
/**
 * Opportunities: those waiting for a decision (most important first) with Hand off to agent and Ignore, then those
 * handed off with where their task stands; five shown and the rest folded. Dismissed and expired fold into one line.
 */
function Opportunities({
  pending,
  decided,
  decide,
}: {
  pending: Row[];
  decided: Line[];
  decide?: Partial<Decide>;
}) {
  const [more, setMore] = useState(false),
    [dropped, setDropped] = useState(false),
    active: Line[] = [
      ...pending.map((row): Line => ({ row, st: { state: 'pending' } })),
      ...decided.filter((l) => l.st.state === 'task'),
    ],
    rest = decided.filter((l) => l.st.state !== 'task'),
    shown = more ? active : active.slice(0, 5),
    ignored = rest.filter((l) => l.st.reason === 'ignored').length,
    expired = rest.length - ignored;
  if (!active.length && !rest.length) return null;
  return (
    <BriefSection label={$t('strategy.sectionOpportunities')}>
      {shown.map((line) => (
        <OpportunityItem key={line.row.card.id} line={line} decide={decide} />
      ))}
      {active.length > 5 && (
        <FoldToggle
          open={more}
          label={$t('strategy.moreToDecide', { 0: active.length - 5 })}
          onToggle={() => setMore((m) => !m)}
        />
      )}
      {rest.length > 0 && (
        <FoldToggle
          open={dropped}
          label={[
            ignored ? $t('strategy.foldDismissed', { 0: ignored }) : '',
            expired ? $t('strategy.foldExpired', { 0: expired }) : '',
          ]
            .filter(Boolean)
            .join($t('strategy.clauseSep'))}
          onToggle={() => setDropped((o) => !o)}
        />
      )}
      {dropped &&
        rest.map((line) => (
          <OpportunityItem key={line.row.card.id} line={line} />
        ))}
      <li className='flex justify-end pt-1'>
        <Link className='nr-link text-xs' to='/opportunities'>
          {$t('strategy.evidenceOnOpportunities')}
        </Link>
      </li>
    </BriefSection>
  );
}

const OUTCOME: Record<string, [IconKind, () => string]> = {
  normal: ['done', () => $t('strategy.backNormal')],
  opportunity: ['pending', () => $t('strategy.becameOpportunity')],
  ignored: ['dismissed', () => $t('strategy.ignored')],
};
/** Watches that ended: what was watched, how and why it ended, and the opportunity it became. */
function EndedWatches({
  watches,
  rows,
}: {
  watches: WatchRecord[];
  rows: Row[];
}) {
  if (!watches.length) return null;
  return (
    <BriefSection label={$t('strategy.sectionEnded')}>
      {watches.map((w) => {
        const e = w.ended!,
          [kind, text] = OUTCOME[e.outcome] || [
            'dismissed',
            () => $t('common.noActionNeeded'),
          ],
          row = e.opportunityId
            ? rows.find((r) => r.card.id === e.opportunityId)
            : undefined;
        return (
          <BriefItem
            key={w.key}
            data-watch-ended={e.outcome}
            icon={<StatusIcon kind={kind} />}
            title={$legacyText(w.startTitle)}
            line={[text(), e.reason].filter(Boolean).join(' · ')}
            end={
              e.outcome === 'opportunity' && row ? (
                <Link className='nr-link text-xs' to={itemLink(row)}>
                  {oppNo(row.card) || row.card.title}
                </Link>
              ) : undefined
            }
          />
        );
      })}
    </BriefSection>
  );
}

type WaitingTask = {
  id: number;
  title: string;
  evidence?: { work?: Work };
};
/** Tasks waiting for you, at the bottom of today's briefing: each with what it waits for and a button to go there. */
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
    <div data-briefing-row='' className='flex w-full flex-col gap-2'>
      {tasks.slice(0, 3).map((t) => (
        <div key={t.id} className='flex items-center gap-3'>
          <AlertIcon tone='violet' />
          <button
            type='button'
            className='min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline'
            onClick={() => void navigate(`/actions/${t.id}`)}
          >
            {t.title} · {label(t.evidence?.work)}
          </button>
          <Button size='sm' onClick={() => void navigate(`/actions/${t.id}`)}>
            {t.evidence?.work?.flow
              ? $t('strategy.goReview')
              : $t('strategy.goStart')}
          </Button>
        </div>
      ))}
      {tasks.length > 3 && (
        <button
          type='button'
          className='nr-link self-end text-xs'
          onClick={() => void navigate(WAITING_TASKS_URL)}
        >
          {$t('strategy.moreWaiting', { 0: tasks.length - 3 })} →
        </button>
      )}
    </div>
  );
}

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
    <div data-briefing-row='' className='flex items-center gap-3'>
      <AlertIcon tone='amber' />
      <p className='min-w-0 flex-1 text-sm'>
        {$tj('dataHealth.failedSyncOverDayOpportunities', {
          0: items.map((i) => healthText(i.name, i.nameText)).join('、'),
        })}
      </p>
      <Link
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
        to='/connections?tab=health'
      >
        {$t('dataHealth.fix')}
      </Link>
    </div>
  );
}

/**
 * Today in the conversation: the latest analysis as a briefing, then what else needs you at its bottom (tasks waiting
 * for you, data that failed to sync). `tasks` is the waiting-task read with its own loading and failure.
 */
export function Today({
  state,
  rows,
  feed,
  metrics,
  days,
  generating,
  projectId,
  tasks,
  situation,
  ...decide
}: {
  state: StrategyState;
  rows: Row[];
  feed: Feed;
  metrics: MetricItem[];
  /** The key numbers' period, for the lead sentence. */
  days: number;
  generating: boolean;
  projectId: number;
  tasks: ReactNode;
  /** Above the message: the current situation folded to a line while the side panel is open. */
  situation?: ReactNode;
} & Decide) {
  const [now] = useState(() => new Date()),
    docked = useInsightChat()?.docked;
  const batch = state.insights,
    day = dayOf(batch?.generatedAt) || localDay(now),
    watching = Object.values(state.watch || {}).filter((w) => !w.ended).length;
  return (
    <>
      {situation}
      <AgentMessage
        meta={
          <>
            {$t('strategy.dailyAnalysisName')}
            <span aria-hidden='true'>·</span>
            {generating
              ? $t('strategy.analyzing')
              : batch
                ? `${relativeDay(day, now)} ${clock(batch.generatedAt)}`
                : null}
          </>
        }
      >
        <Briefing
          label={$t('strategy.todayBrief')}
          title={batch ? analysisTitle(day) : $t('strategy.noAnalysisTitle')}
          lead={
            batch
              ? leadOf(feed.pending.length, metrics, watching, days)
              : $t('strategy.noAnalysisYetClickUpdate')
          }
        >
          <Notes
            notes={(batch?.observations || []).map((o) => $legacyText(o))}
          />
          <Opportunities
            pending={feed.pending}
            decided={feed.decided}
            decide={decide}
          />
          <EndedWatches watches={recentlyEnded(state, 1)} rows={rows} />
          <div className='mt-5 hidden flex-col gap-3 border-t pt-4 has-[[data-briefing-row]]:flex has-[[role=alert]]:flex'>
            {tasks}
            <HealthNote projectId={projectId} />
          </div>
        </Briefing>
      </AgentMessage>
      {docked ? (
        <InPanelNote />
      ) : (
        <DayConversation day={dayOf(batch?.generatedAt)} folded />
      )}
    </>
  );
}

/** An earlier day, folded to one line: what was suggested and where each went; opens to that day's briefing. */
function PastDay({ day, rows, now }: { day: Day; rows: Row[]; now: Date }) {
  const [open, setOpen] = useState(false),
    asked = questionCount(useInsightChat()?.threads || [], day.day),
    notes = (day.notes || []).map((o) => $legacyText(o));
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
              {(day.items.length > 0 ||
                day.ended.length > 0 ||
                notes.length > 0) && (
                <Briefing title={analysisTitle(day.day)}>
                  <Notes notes={notes} />
                  <Opportunities pending={[]} decided={day.items} />
                  <EndedWatches watches={day.ended} rows={rows} />
                </Briefing>
              )}
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
