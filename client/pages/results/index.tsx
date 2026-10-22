import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { ChartNoAxesCombined, ListChecks, RefreshCw } from 'lucide-react';
import { $t, getCurrentLocale } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState } from '#components/reach/states';
import { InfoTip } from '#components/reach/info-tip';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button, buttonVariants } from '#components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { cn } from '#lib/utils';
import { useProject } from '../reach-data.js';
import { RangePicker } from '../range-picker.js';
import { customRangeError, useRange, validRange } from '../range-state.js';
import {
  DEFAULT_RESULT_RANGE,
  RESULT_RANGES,
  denied,
  resultStatus,
  shortDate,
  signed,
  signedPercent,
} from './format.js';
import { ClippedLink } from './clipped-link.js';
import { ResultsLoadError } from './states.js';
import { ResultTag } from './status-tag.js';
import type {
  BoardChange,
  BoardTotal,
  ResultBoard,
  ResultSummary,
} from './types.js';
import { formatDate } from '#lib/format';

// 成果 (2026-10-16, user-confirmed sketch): a dashboard of the project's own work only — what went live in the period,
// whether the pages it changed moved, and the results that need a look. Site-wide figures stay on 洞察 and the data
// pages, so nothing here repeats them. "查看全部" opens the same period's full list at /results/all.
export default function ResultsPage() {
  const { project } = useProject();
  return project ? (
    <ResultsBoard key={project.id} projectId={String(project.id)} />
  ) : null;
}

function ResultsBoard({ projectId }: { projectId: string }) {
  const [range, setRange] = useRange(DEFAULT_RESULT_RANGE);
  // A period this page does not offer (another data page's 7 days) falls back to the default.
  const r = RESULT_RANGES.includes(range.range)
    ? range
    : { range: DEFAULT_RESULT_RANGE };
  const valid = validRange(r);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [reload, setReload] = useState({ count: 0, refresh: false });
  const rangeKey = JSON.stringify(r),
    key = `${rangeKey}:${reload.count}`;
  const [result, setResult] = useState<{
    key: string;
    board?: ResultBoard;
    error?: unknown;
  }>();
  useEffect(() => {
    if (!valid) return;
    let alive = true;
    const requested = `${rangeKey}:${reload.count}`;
    void api
      .action<ResultBoard>('nrTaskWork', 'board', {
        method: 'POST',
        body: { projectId, ...(JSON.parse(rangeKey) as object) },
        unwrap: 'data',
      })
      .then(
        (board) => {
          if (alive) setResult({ key: requested, board });
        },
        (error: unknown) => {
          // Keep the numbers on screen after a failed reload, unless access is gone (then nothing stays).
          if (alive)
            setResult((previous) => ({
              key: requested,
              error,
              board: denied(error) ? undefined : previous?.board,
            }));
        },
      );
    return () => {
      alive = false;
    };
  }, [projectId, rangeKey, reload.count, valid]);
  const loading = valid && result?.key !== key;
  const board = result?.board,
    error = loading ? undefined : result?.error;
  const refresh = () =>
    setReload((n) => ({ count: n.count + 1, refresh: true }));
  const retry = () => {
    refresh();
    // The Retry button goes away with the alert: keep focus on Refresh (A6).
    refreshRef.current?.focus();
  };
  const rangeError = valid ? null : customRangeError(r.from, r.to);
  let content: ReactNode;
  if (rangeError)
    content = (
      <Alert variant='destructive'>
        <AlertDescription>{$t(rangeError)}</AlertDescription>
      </Alert>
    );
  else if (error && !board)
    content = (
      <ResultsLoadError
        title={$t('results.board.loadFailed')}
        error={error}
        onRetry={retry}
      />
    );
  else if (!board) content = <BoardSkeleton />;
  else content = <BoardBody board={board} />;
  return (
    <PageContainer>
      <PageHeader
        title={$t('results.title')}
        description={$t('results.board.description')}
        info={
          <InfoTip label={$t('common.aboutData')}>
            <span className='flex flex-col gap-1'>
              <span>{$t('results.board.caveat')}</span>
              <span>{$t('results.board.utc')}</span>
            </span>
          </InfoTip>
        }
        actions={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  ref={refreshRef}
                  variant='outline'
                  size='icon'
                  aria-label={$t('results.refresh')}
                  onClick={refresh}
                />
              }
            >
              {/* Spins only for the refresh it started; a new period shows its own progress below (R4, I4). */}
              <RefreshCw
                className={
                  loading && reload.refresh ? 'animate-spin' : undefined
                }
              />
            </TooltipTrigger>
            <TooltipContent>{$t('results.refresh')}</TooltipContent>
          </Tooltip>
        }
      />
      <RangePicker
        value={r}
        onChange={(next) => {
          setReload((n) => ({ ...n, refresh: false }));
          setRange(next);
        }}
        options={RESULT_RANGES}
        summary={
          loading && board ? (
            <span className='inline-flex items-center gap-1'>
              <Spinner />
              {$t('common.loading')}
            </span>
          ) : board?.window.start ? (
            $t('results.board.window', {
              0: formatDate(board.window.start),
              1: formatDate(board.window.end),
            })
          ) : undefined
        }
      />
      {error && board ? (
        <ResultsLoadError
          title={$t('results.stale')}
          error={error}
          onRetry={retry}
        />
      ) : null}
      <div aria-busy={loading || undefined} className='flex flex-col gap-6'>
        {content}
      </div>
      <Outlet />
    </PageContainer>
  );
}

const formatNumber = (value: number) =>
  value.toLocaleString(getCurrentLocale(), { maximumFractionDigits: 1 });
const taskLabel = (item: { taskNo: number | null; title: string }) =>
  `${item.taskNo ? `T-${item.taskNo} · ` : ''}${item.title}`;
const nextCheck = (item: {
  nextDay: number | null;
  nextDate: string | null;
}) =>
  item.nextDay && item.nextDate
    ? $t('results.board.nextCheck', {
        0: shortDate(item.nextDate),
        1: item.nextDay,
      })
    : '';

function BoardBody({ board }: { board: ResultBoard }) {
  const { counts, totals } = board;
  return (
    <>
      <section
        className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
        aria-label={$t('results.board.metrics')}
      >
        <Metric
          label={$t('results.board.live')}
          value={$t('results.board.items', { 0: formatNumber(counts.live) })}
          detail={
            counts.pendingLive
              ? $t('results.board.pendingLive', { 0: counts.pendingLive })
              : $t('results.board.noPending')
          }
        />
        <Metric
          label={$t('results.board.up')}
          value={$t('results.board.items', { 0: formatNumber(counts.up) })}
          detail={$t('results.board.upDetail', {
            0: counts.down,
            1: counts.flat,
          })}
        />
        <TotalMetric label={$t('results.board.clicks')} total={totals.clicks} />
        <TotalMetric label={$t('results.board.views')} total={totals.views} />
      </section>
      <ChangesCard board={board} />
      <RecentCard items={board.attention} />
    </>
  );
}

function Metric({
  label,
  value,
  detail,
  info,
}: {
  label: string;
  value: string;
  detail: string;
  info?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className='flex items-center gap-1'>
          {label}
          {info}
        </CardDescription>
        <CardTitle className='text-3xl tabular-nums'>{value}</CardTitle>
        <p className='text-sm text-muted-foreground tabular-nums'>{detail}</p>
      </CardHeader>
    </Card>
  );
}

// The sum over live changes with complete data: the difference large, before → after and the percentage below; a
// zero "before" has no percentage.
function TotalMetric({
  label,
  total,
}: {
  label: string;
  total: BoardTotal | null;
}) {
  return (
    <Metric
      label={label}
      info={
        <InfoTip label={$t('common.what', { 0: label })}>
          {$t('results.board.totalsTip')}
        </InfoTip>
      }
      value={total ? signed(total.after - total.before) : '—'}
      detail={
        total
          ? $t('results.board.totalDetail', {
              0: formatNumber(total.before),
              1: formatNumber(total.after),
              2: total.before
                ? signedPercent(
                    ((total.after - total.before) / total.before) * 100,
                  )
                : $t('results.zeroBaseline'),
            })
          : $t('results.board.noTotals')
      }
    />
  );
}

// Each live change as a bar from a zero line: right for more, left for fewer. Its length is the percentage, capped at
// 100% (half the track); a change from zero fills its half; a small change still shows. The status word starts the
// line beside it, so the conclusion never rests on color (A2).
function ChangesCard({ board }: { board: ResultBoard }) {
  const location = useLocation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-1'>
          {$t('results.board.changes')}
          <InfoTip label={$t('common.info')}>
            {$t('results.board.changesDescription')}
            {board.counts.live > board.changes.length
              ? ` ${$t('results.board.changesMore', { 0: board.changes.length })}`
              : ''}
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {board.changes.length ? (
          <ul className='flex flex-col gap-3'>
            {board.changes.map((change) => (
              <li
                key={change.taskId}
                className='grid gap-1 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:items-center sm:gap-4'
              >
                <ClippedLink
                  text={taskLabel(change)}
                  to={{ pathname: change.taskId, search: location.search }}
                />
                <ChangeBar change={change} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className='min-h-40 p-6 md:p-6'
            icon={<ChartNoAxesCombined />}
            title={$t('results.board.noChanges')}
            description={$t('results.board.noChangesDescription')}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ChangeBar({ change }: { change: BoardChange }) {
  const measured =
    change.metric !== null && change.before !== null && change.after !== null;
  const difference = measured ? change.after! - change.before! : 0;
  const size = !difference
    ? 0
    : change.percent !== null
      ? Math.max(Math.min(Math.abs(change.percent), 100), 2)
      : 100;
  const tone =
    change.status === 'up'
      ? 'bg-nr-ink-green'
      : change.status === 'down'
        ? 'bg-nr-ink-red'
        : 'bg-muted-foreground';
  const text = [
    resultStatus(change.status),
    measured
      ? $t('results.board.changeLine', {
          0:
            change.percent !== null
              ? signedPercent(change.percent)
              : signed(difference),
          1: $t(
            change.metric === 'clicks'
              ? 'common.searchClicks'
              : 'common.viewCount',
          ),
          2: formatNumber(change.before!),
          3: formatNumber(change.after!),
          4: change.day,
        })
      : '',
    nextCheck(change),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className='flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3'>
      <div
        aria-hidden='true'
        className='relative h-2 w-full shrink-0 rounded-full bg-muted sm:w-40'
      >
        <span className='absolute inset-y-0 left-1/2 w-px bg-border' />
        {size ? (
          <span
            className={cn(
              'absolute inset-y-0 rounded-full',
              tone,
              difference < 0 ? 'right-1/2' : 'left-1/2',
            )}
            style={{ width: `${size / 2}%` }}
          />
        ) : null}
      </div>
      <span className='min-w-0 text-sm text-muted-foreground tabular-nums'>
        {text}
      </span>
    </div>
  );
}

// What comes next: the next check of live work, the state of work still to go live, nothing for the rest.
function nextStep(item: ResultSummary) {
  if (item.phase === 'live') return nextCheck(item) || '—';
  if (item.phase === 'pendingLive')
    return $t(`results.taskState.${item.taskState}`);
  return '—';
}

// A few results in a card (T5.3): plain headers, no sorting or paging; the task opens its drawer over this page.
// The table reaches the card's edges and pads its outer cells with the card's spacing, as "Table in a card" does.
function RecentCard({ items }: { items: ResultSummary[] }) {
  const location = useLocation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-1'>
          {$t('results.board.recent')}
          <InfoTip label={$t('common.info')}>
            {$t('results.board.recentDescription')}
          </InfoTip>
        </CardTitle>
        <CardAction>
          <Link
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            to={{ pathname: 'all', search: location.search }}
          >
            {$t('results.board.viewAll')}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className={items.length ? 'px-0' : undefined}>
        {items.length ? (
          <Table className='[&_td:first-child]:pl-(--card-spacing) [&_td:last-child]:pr-(--card-spacing) [&_th:first-child]:pl-(--card-spacing) [&_th:last-child]:pr-(--card-spacing)'>
            <TableHeader>
              <TableRow>
                <TableHead>{$t('results.board.task')}</TableHead>
                <TableHead>{$t('results.board.wentLive')}</TableHead>
                <TableHead>{$t('results.board.status')}</TableHead>
                <TableHead>{$t('results.board.next')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.taskId}>
                  <TableCell className='max-w-sm'>
                    <ClippedLink
                      text={taskLabel(item)}
                      to={{ pathname: item.taskId, search: location.search }}
                    />
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {item.phase === 'live' && item.occurredAt
                      ? shortDate(item.occurredAt)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <ResultTag
                      phase={item.phase}
                      status={item.status}
                      taskState={item.taskState}
                    />
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {nextStep(item)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            className='min-h-40 p-6 md:p-6'
            icon={<ListChecks />}
            title={$t('results.board.empty')}
            description={$t('results.board.emptyDescription')}
          />
        )}
      </CardContent>
    </Card>
  );
}

// Shaped like the board: four metric cards, the change card and the list card (S1).
function BoardSkeleton() {
  return (
    <div
      role='status'
      aria-label={$t('common.loading')}
      className='flex flex-col gap-6'
    >
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-8 w-16' />
              <Skeleton className='h-4 w-32' />
            </CardHeader>
          </Card>
        ))}
      </div>
      {[3, 5].map((rows) => (
        <Card key={rows}>
          <CardHeader>
            <Skeleton className='h-4 w-32' />
            <Skeleton className='h-4 w-64' />
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            {Array.from({ length: rows }, (_, index) => (
              <Skeleton key={index} className='h-5 w-full' />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
