import { useEffect, useState } from 'react';
import { Segmented } from '#components/reach/segmented';
import { Skeleton } from '#components/ui/skeleton';
import { Link } from 'react-router';
import { $t } from '#i18n';
import { formatCount, formatDate } from '#lib/format';
import { cn } from '#lib/utils';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Delta } from '#components/reach/delta';
import { InfoTip } from '#components/reach/info-tip';
import { effectLine, type EffectResult } from '../effect-model';
import type { TaskData } from '../task-execution-types';

// Performance, under the task's properties (2026-10-22 user request): each page the task is about, with its numbers.
// Before the change goes live, the latest 28 days (or the 28 days before going live, once it has); from day 7 on,
// before and after for day 7 or day 28. The full comparison stays on Results.

type PageNumbers = {
  page: string;
  clicks?: number;
  position?: number;
  views?: number;
};
type Numbers = {
  range: { start: string; end: string } | null;
  pages: PageNumbers[];
  live: boolean;
  gscDays?: number;
  ga4Days?: number;
};
type Row = { page: string; before: number; after: number };

const SHOWN = 3;
const DAYS = [7, 28] as const;

const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};
// Results come about three days after the window ends (Search Console lags), as Results says.
const expected = (observeFrom: string, day: number) =>
  formatDate(
    new Date(
      Date.parse(observeFrom.slice(0, 10) + 'T00:00:00Z') +
        (day + 3) * 86400000,
    ),
  );

function PageLink({ url }: { url: string }) {
  return (
    <a
      className='nr-link min-w-0 truncate'
      href={url}
      target='_blank'
      rel='noreferrer'
      title={url}
    >
      {pathOf(url)}
    </a>
  );
}

function Rows<T>({
  items,
  render,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <>
      <ul className='m-0 flex list-none flex-col p-0'>{shown.map(render)}</ul>
      {items.length > SHOWN && (
        <button
          type='button'
          className='nr-link self-start text-xs'
          onClick={() => setAll((v) => !v)}
        >
          {all
            ? $t('common.collapse')
            : $t('taskNumbers.morePages', { 0: items.length - SHOWN })}
        </button>
      )}
    </>
  );
}

function Change({ before, after }: { before: number; after: number }) {
  return before > 0 ? (
    <Delta value={(after - before) / before} />
  ) : (
    <Delta value={after - before} kind='count' />
  );
}

export function TaskNumbers({
  data,
  projectId,
  taskId,
  className,
}: {
  data: TaskData;
  projectId: number;
  taskId: string;
  className?: string;
}) {
  const w = data.work,
    results = w.observation?.results || [];
  const [picked, setPicked] = useState<number>();
  const result =
    results.find((x) => x.day === picked) || results.at(-1) || undefined;
  // Before the first checkpoint, when it comes is a note on the title (2026-10-22 decision D5), not a grey line.
  const note = result
    ? null
    : w.observeFrom
      ? $t('taskNumbers.wentLive', {
          0: formatDate(w.observeFrom),
          1: expected(w.observeFrom, 7),
        })
      : $t('taskNumbers.comparedLater');
  return (
    <section
      aria-label={$t('taskNumbers.title')}
      className={cn('flex flex-col gap-2', className)}
    >
      <div className='flex items-center gap-2'>
        <h2 className='m-0 flex flex-1 items-center gap-1 text-sm font-medium'>
          {$t('taskNumbers.title')}
          {note ? <InfoTip label={$t('common.info')}>{note}</InfoTip> : null}
        </h2>
        {result && (
          <DaySwitch
            results={results}
            day={result.day}
            observeFrom={w.observeFrom}
            onPick={setPicked}
          />
        )}
      </div>
      {result ? (
        <Compared result={result} observeFrom={w.observeFrom} taskId={taskId} />
      ) : (
        <Current
          projectId={projectId}
          taskId={taskId}
          // Read again when the pages or going live change.
          refresh={[
            w.observeFrom,
            w.page?.url,
            ...(w.release?.pages || []),
          ].join('\n')}
        />
      )}
    </section>
  );
}

// Day 7 or day 28, on the heading line; a day without its result yet says when it is expected.
function DaySwitch({
  results,
  day,
  observeFrom,
  onPick,
}: {
  results: EffectResult[];
  day: number;
  observeFrom?: string;
  onPick: (day: number) => void;
}) {
  return (
    <Segmented
      label={$t('results.checkpoint')}
      size='sm'
      options={DAYS.map((d) => {
        const has = results.some((x) => x.day === d);
        return {
          id: String(d),
          label: $t('results.day', { 0: d }),
          disabled: !has,
          title:
            !has && observeFrom
              ? $t('taskNumbers.expected', {
                  0: d,
                  1: expected(observeFrom, d),
                })
              : undefined,
        };
      })}
      value={String(day)}
      onChange={(d) => onPick(Number(d))}
    />
  );
}

// From day 7: each page before and after, for the day picked, then all pages together.
function Compared({
  result: r,
  observeFrom,
  taskId,
}: {
  result: EffectResult;
  observeFrom?: string;
  taskId: string;
}) {
  const views = r.primary === 'views';
  const pair = (x: { clicks?: [number, number]; views?: [number, number] }) =>
    (views ? x.views : x.clicks) || [0, 0];
  const total = pair({ clicks: r.gsc?.clicks, views: r.ga4?.views });
  const rows: Row[] = r.byPage
    ? r.byPage.map((p) => {
        const [before, after] = pair(p);
        return { page: p.page, before, after };
      })
    : r.pages.slice(0, 1).map((page) => ({
        page,
        before: total[0],
        after: total[1],
      }));
  return (
    <>
      <p className='m-0 text-xs text-muted-foreground'>
        {$t('taskNumbers.window', {
          0: $t(views ? 'common.viewCount' : 'common.searchClicks'),
          1: r.day,
        })}
      </p>
      {r.primary ? null : (
        <p className='m-0 text-sm text-muted-foreground'>
          {effectLine(r, observeFrom)}
        </p>
      )}
      {r.primary && (
        <Rows
          items={rows}
          render={(row) => (
            <li
              key={row.page}
              className='flex items-baseline gap-3 border-b py-1.5 text-sm last:border-b-0'
            >
              <PageLink url={row.page} />
              <span className='ml-auto shrink-0 tabular-nums'>
                {formatCount(row.before)} → {formatCount(row.after)}{' '}
                <Change before={row.before} after={row.after} />
              </span>
            </li>
          )}
        />
      )}
      {r.primary && r.byPage && (
        <p className='m-0 flex items-baseline gap-3 border-t pt-1.5 text-sm font-medium'>
          <span className='min-w-0 flex-1'>
            {$t('taskNumbers.total', { 0: r.byPage.length })}
          </span>
          <span className='shrink-0 tabular-nums'>
            {formatCount(total[0])} → {formatCount(total[1])}{' '}
            <Change before={total[0]} after={total[1]} />
          </span>
        </p>
      )}
      <Link
        className='nr-link self-start text-sm'
        to={`/results/${taskId}?day=${r.day}`}
      >
        {$t('taskNumbers.openResults')}
      </Link>
    </>
  );
}

// Before day 7: each page's numbers over 28 days; when the comparison comes is the title's ⓘ.
function Current({
  projectId,
  taskId,
  refresh,
}: {
  projectId: number;
  taskId: string;
  refresh: string;
}) {
  const [state, setState] = useState<{
    key: string;
    numbers?: Numbers;
    failed?: boolean;
  }>();
  const key = `${projectId}\n${taskId}\n${refresh}`;
  useEffect(() => {
    const c = new AbortController();
    void Promise.resolve()
      .then(() =>
        api.action<Numbers>('nrTaskWork', 'numbers', {
          method: 'POST',
          body: { projectId: String(projectId), taskId },
          signal: c.signal,
          unwrap: 'data',
        }),
      )
      .then(
        (numbers) => {
          if (!c.signal.aborted) setState({ key, numbers });
        },
        () => {
          if (!c.signal.aborted) setState({ key, failed: true });
        },
      );
    return () => c.abort();
  }, [key, projectId, taskId]);
  const current = state?.key === key ? state : undefined;
  const n = current?.numbers;
  if (!current)
    return (
      <div
        role='status'
        aria-label={$t('common.loading')}
        className='space-y-2'
      >
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  if (current.failed || !n || !Array.isArray(n.pages))
    return (
      <p className='m-0 text-sm text-muted-foreground'>
        {$t('taskNumbers.failed')}
      </p>
    );
  if (!n.pages.length)
    return (
      <p className='m-0 text-sm text-muted-foreground'>
        {$t('taskNumbers.noPages')}
      </p>
    );
  const clicks = Boolean(n.gscDays),
    views = !clicks && Boolean(n.ga4Days);
  return (
    <>
      <p className='m-0 text-xs text-muted-foreground'>
        {!n.range || (!clicks && !views)
          ? $t('taskNumbers.noData')
          : $t(
              clicks
                ? n.live
                  ? 'taskNumbers.beforeLiveClicks'
                  : 'taskNumbers.recentClicks'
                : n.live
                  ? 'taskNumbers.beforeLiveViews'
                  : 'taskNumbers.recentViews',
            )}
      </p>
      <Rows
        items={n.pages}
        render={(p) => (
          <li
            key={p.page}
            className='flex items-baseline gap-3 border-b py-1.5 text-sm last:border-b-0'
          >
            <PageLink url={p.page} />
            <span className='ml-auto shrink-0 text-right tabular-nums'>
              {clicks
                ? `${formatCount(p.clicks)} · ${
                    p.position
                      ? $t('taskNumbers.position', {
                          0: formatCount(p.position, 1),
                        })
                      : '—'
                  }`
                : views
                  ? formatCount(p.views)
                  : '—'}
            </span>
          </li>
        )}
      />
    </>
  );
}
