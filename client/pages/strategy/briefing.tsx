import { $t, $tj, $legacyText, getCurrentLocale } from '#i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { cn } from '#lib/utils';
import { Tag, type Tone } from '#components/reach/tag';
import { ActorAvatar, AiMark } from '#components/reach/actor';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { useOptionalOnlineChat } from '../../online-agent/context';
import { DetailDrawer } from '../detail-drawer';
import { healthText, loadHealth, type HealthItem } from '../data-health';
import { WAITING_TASKS_URL } from '../task-waiting';
import type { Work } from '../task-execution-types';
import { RequestBlock, type RequestState } from './request-block';
import {
  AreaList,
  Sparkline,
  chipOf,
  percent,
  type Area,
  type MetricItem,
} from './insights-view';
import {
  citedSignals,
  oppNo,
  opportunityState,
  taskNo,
  type Row,
} from './board';
import { handOffLabel } from './hand-off';
import { recentlyEnded } from './watch';
import type { InsightBatch, StrategyState, WatchRecord } from './model';
type Standing = ReturnType<typeof opportunityState>;

// Insights as a conversation with the daily analysis (2026-10-21 user decision: the brief of sections read like
// Opportunities and was all text). The numbers stay as tiles with their trend; below, the analysis speaks once a day:
// what matters, the opportunities to decide on as one line each, watches that ended, tasks and data that need you.
// Earlier days fold into one line each, and Ask AI continues in the chat.

// The data pages, by the menu group they live in.
const DATA_PAGES: [string, [string, string][]][] = [
  [
    'site',
    [
      ['traffic', '/website'],
      ['pages', '/content'],
      ['audit', '/audit'],
      ['github', '/data/github'],
      ['downloads', '/data/downloads'],
    ],
  ],
  [
    'search',
    [
      ['searchPerformance', '/seo-opportunities'],
      ['keywords', '/keywords'],
      ['trends', '/trends'],
      ['competitors', '/research/domain'],
      ['aiSearch', '/ai-search'],
    ],
  ],
  [
    'community',
    [
      ['forum', '/data/community'],
      ['hackerNews', '/data/hackernews'],
      ['reddit', '/data/reddit'],
      ['x', '/data/x'],
      ['discord', '/data/discord'],
      ['slack', '/data/slack'],
    ],
  ],
];
function AllDataMenu() {
  const { t } = useTranslation(),
    navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type='button'
            className='nr-link inline-flex items-center gap-0.5'
          />
        }
      >
        {$t('strategy.allData')}
        <ChevronDown className='size-3' aria-hidden='true' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {DATA_PAGES.map(([group, pages], i) => (
          <DropdownMenuGroup key={group}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{t(`nocoreach.nav.${group}`)}</DropdownMenuLabel>
            {pages.map(([name, to]) => (
              <DropdownMenuItem key={to} onClick={() => void navigate(to)}>
                {t(`nocoreach.nav.${name}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const number = (i: MetricItem) =>
  `${i.signed && i.value! > 0 ? '+' : ''}${i.value!.toLocaleString(getCurrentLocale())}`;
const arrow = (change: number) =>
  `${change >= 0 ? '↑' : '↓'} ${percent(change)}`;

/**
 * The numbers as tiles (at most five, only those with a value), each with its trend and opening its data page; then
 * the standing facts (Status, a drawer) and every data page (All data). The numbers and the facts are separate reads,
 * each with its own loading, failure and retry.
 */
export function MetricTiles({
  metrics,
  overview,
  summary,
  projectId,
}: {
  metrics: MetricItem[];
  overview: RequestState;
  summary: RequestState & { data?: { areas?: Area[] } };
  projectId: number;
}) {
  const [open, setOpen] = useState(false);
  const items = metrics.filter((i) => i.value != null).slice(0, 5),
    areas = summary.data?.areas || [],
    facts = areas.reduce((n, a) => n + a.items.length, 0);
  return (
    <div className='flex flex-col gap-1.5'>
      <RequestBlock
        compact
        corner
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
                  {i.series && (
                    <Sparkline points={i.series} change={i.change} />
                  )}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </RequestBlock>
      <div className='flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs'>
        <RequestBlock
          compact
          title={$t('strategy.currentSituation')}
          request={summary}
          empty={!facts}
          emptyText={$t('strategy.noCurrentSituation')}
        >
          <button
            type='button'
            className='nr-link'
            onClick={() => setOpen(true)}
          >
            {$t('strategy.situationCount', { 0: facts })}
            <ChevronRight className='inline size-3' aria-hidden='true' />
          </button>
        </RequestBlock>
        <AllDataMenu />
      </div>
      <DetailDrawer
        open={open && facts > 0}
        onClose={() => setOpen(false)}
        title={$t('strategy.situation')}
        description={$t('strategy.situationHelp')}
      >
        <AreaList areas={areas} projectId={projectId} />
      </DetailDrawer>
    </div>
  );
}

// Days as yyyy-mm-dd, the way the analysis and the watch records date them.
const dayOf = (iso?: string) => String(iso || '').slice(0, 10);
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
            className='mt-1.5 text-xs text-muted-foreground hover:text-foreground'
            onClick={() => setOpen((o) => !o)}
          >
            {$t('strategy.analysisNotes', { 0: notes.length })}{' '}
            {open ? '▴' : '▾'}
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

/**
 * The opportunities waiting for a decision, the same ones as Opportunities' To do, most important first: one line
 * each with the number behind it, five shown and the rest folded; the evidence stays on Opportunities.
 */
function Decisions({ rows, busy, onGive, onIgnore }: { rows: Row[] } & Decide) {
  const [more, setMore] = useState(false),
    shown = more ? rows : rows.slice(0, 5),
    rest = rows.length - 5;
  return (
    <Bubble
      label={$t('strategy.decideCount', { 0: rows.length })}
      className='py-1'
    >
      <ul className='divide-y divide-border/70'>
        {shown.map((r, i) => {
          const c = lead(r);
          return (
            <li
              key={r.card.id}
              aria-label={r.card.title}
              data-opportunity-id={r.card.id}
              className='flex items-center gap-2 py-1.5'
            >
              {c && <Tag tone={c.tone}>{c.text}</Tag>}
              <Link
                to={itemLink(r)}
                title={r.card.title}
                className='min-w-0 flex-1 truncate hover:underline'
              >
                <No row={r} />
                {r.card.title}
              </Link>
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
            </li>
          );
        })}
      </ul>
      <div className='flex items-center justify-between gap-3 border-t border-border/70 py-1.5 text-xs'>
        {rest > 0 ? (
          <button
            type='button'
            aria-expanded={more}
            className='nr-link'
            onClick={() => setMore((m) => !m)}
          >
            {more
              ? `${$t('common.collapse')} ▴`
              : `${$t('strategy.moreToDecide', { 0: rest })} ▾`}
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
  pending,
  metrics,
  generating,
  projectId,
  tasks,
  ...decide
}: {
  state: StrategyState;
  rows: Row[];
  pending: Row[];
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
          pending={pending.length}
          metrics={metrics}
          watching={watching}
        />
        {pending.length > 0 && <Decisions rows={pending} {...decide} />}
        {recentlyEnded(state, 1).map((w) => (
          <Ended key={w.key} w={w} rows={rows} />
        ))}
        {tasks}
        <HealthNote projectId={projectId} />
      </AgentMessage>
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
type Day = {
  day: string;
  items: { row: Row; st: Standing }[];
  ended: WatchRecord[];
};
/** An earlier day, folded to one line: what was suggested and where each went; opens to the list. */
function PastDay({ day, rows, now }: { day: Day; rows: Row[]; now: Date }) {
  const [open, setOpen] = useState(false),
    count = (f: (x: Day['items'][number]) => boolean) =>
      day.items.filter(f).length,
    tags: [Tone, string, number][] = [
      ['blue', 'strategy.handedCount', count((x) => x.st.state === 'task')],
      [
        'amber',
        'strategy.pendingCount',
        count((x) => x.st.state === 'pending'),
      ],
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
            {tags
              .filter(([, , n]) => n > 0)
              .map(([tone, key, n]) => (
                <Tag key={key} tone={tone}>
                  {$t(key, { 0: n })}
                </Tag>
              ))}
            <span className='nr-link ml-auto text-xs'>
              {open
                ? `${$t('common.collapse')} ▴`
                : `${$t('strategy.expandDay')} ▾`}
            </span>
          </button>
          {open && (
            <>
              {day.items.length > 0 && (
                <Bubble className='py-1'>
                  <ul className='divide-y divide-border/70'>
                    {day.items.map(({ row, st }) => (
                      <li
                        key={row.card.id}
                        data-opportunity-id={row.card.id}
                        className='flex items-center gap-2 py-1.5'
                      >
                        <Link
                          to={itemLink(row)}
                          title={row.card.title}
                          className='min-w-0 flex-1 truncate hover:underline'
                        >
                          <No row={row} />
                          {row.card.title}
                        </Link>
                        <StatusTag row={row} st={st} />
                      </li>
                    ))}
                  </ul>
                </Bubble>
              )}
              {day.ended.map((w) => (
                <Ended key={w.key} w={w} rows={rows} />
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
/**
 * The days before the latest analysis, newest first: each opportunity on the day it was first raised (merged
 * duplicates left out) and each watch on the day it ended. A week at a time.
 */
export function History({
  state,
  rows,
}: {
  state: StrategyState;
  rows: Row[];
}) {
  const [limit, setLimit] = useState(7);
  const [now] = useState(() => new Date());
  const today = dayOf(state.insights?.generatedAt) || localDay(now),
    days = new Map<string, Day>(),
    at = (day: string) => {
      if (!days.has(day)) days.set(day, { day, items: [], ended: [] });
      return days.get(day)!;
    };
  for (const row of rows) {
    const st = opportunityState(row, state),
      day = dayOf(row.firstSeenAt);
    if (st.reason === 'replaced' || !day || day >= today) continue;
    at(day).items.push({ row, st });
  }
  for (const w of Object.values(state.watch || {})) {
    const day = dayOf(w.ended?.at);
    if (day && day < today) at(day).ended.push(w);
  }
  const list = [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
  if (!list.length) return null;
  return (
    <>
      {list.slice(0, limit).map((d) => (
        <PastDay key={d.day} day={d} rows={rows} now={now} />
      ))}
      {list.length > limit && (
        <button
          type='button'
          className='nr-link self-center text-xs'
          onClick={() => setLimit((n) => n + 7)}
        >
          {$t('strategy.earlierDays')} ▾
        </button>
      )}
    </>
  );
}

/** Ask AI: the chat opens with the day's analysis named, so the question continues from it. */
export function AskBar({ projectId, day }: { projectId: number; day: string }) {
  const chat = useOptionalOnlineChat();
  if (!chat) return null;
  return (
    <button
      type='button'
      className='sticky bottom-3 z-10 flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2.5 text-left text-sm text-muted-foreground shadow-sm transition-colors hover:border-ring'
      onClick={() =>
        chat.open({
          draft: $t('strategy.askDraft', { 0: day }),
          projectId: String(projectId),
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
