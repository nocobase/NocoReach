import { $t } from '#i18n';
// Parts of the 小红书, Bilibili and YouTube data pages, laid out like the other 社区 pages (Reddit, Hacker News, 论坛):
// publications per day, the records of the period as a table the server sorts (the page lists 20 at a time, so sorting
// the shown rows in the browser would mislead), and where the records came from. Ticked rows go to the Agent.
import { useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef, SortingState, Updater } from '@tanstack/react-table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import {
  DataTable,
  makeSelectionColumn,
  useDataTable,
  useSelectionAnchor,
} from '#components/seo/data-table';
import {
  useHandOffSource,
  type HandOffSource,
} from '#components/reach/hand-off-slot';
import { Tag } from '#components/reach/tag';
import { InfoTip } from '#components/reach/info-tip';
import type {
  CollectorGroup,
  CollectorSort,
  CollectorTrend,
} from './collector-report';
import { countText } from './collector-columns';

/** The title link, with the outline tag of a record kept from an earlier configuration right after it. */
export function TitleLink({
  href,
  children,
  earlier,
}: {
  href: string | undefined;
  children: ReactNode;
  earlier?: boolean;
}) {
  return (
    <span className='flex flex-wrap items-center gap-x-2 gap-y-1'>
      {href ? (
        <a
          className='nr-link font-medium'
          href={href}
          target='_blank'
          rel='noreferrer'
        >
          {children}
        </a>
      ) : (
        <span className='font-medium'>{children}</span>
      )}
      {earlier ? <Tag tone='grey'>{$t('collectorPage.earlier')}</Tag> : null}
    </span>
  );
}

const trendNote = {
  day: 'collectorPage.trendDay',
  week: 'collectorPage.trendWeek',
  month: 'collectorPage.trendMonth',
} as const;
export function CollectorTrendCard({
  trend,
  matched,
}: {
  trend: CollectorTrend;
  matched: number;
}) {
  const label = (date: string) =>
    trend.unit === 'month' ? date.slice(0, 7) : date.slice(5);
  return (
    <Card className='gap-3 px-4' data-trend=''>
      <div className='flex items-center gap-1'>
        <h2 className='text-sm font-semibold'>
          {$t('collectorPage.trendTitle')}
        </h2>
        <InfoTip
          label={$t('common.what', { 0: $t('collectorPage.trendTitle') })}
        >
          {$t(trendNote[trend.unit])}
        </InfoTip>
      </div>
      {matched ? (
        <div className='nr-chart-box'>
          <ResponsiveContainer width='100%' height={200}>
            <BarChart
              data={trend.points}
              margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis
                dataKey='date'
                tickFormatter={label}
                minTickGap={32}
                fontSize={11}
              />
              <YAxis allowDecimals={false} fontSize={11} width={32} />
              <ChartTooltip />
              <Bar
                isAnimationActive={false}
                dataKey='published'
                name={$t('collectorPage.published')}
                fill='var(--chart-3)'
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {$t('collectorPage.noneInRange')}
        </p>
      )}
    </Card>
  );
}

/** Where the records of the period came from, most first, like Reddit's subreddits. */
export function CollectorGroupsCard({
  title,
  note,
  groups,
  linkOf,
  kinds = false,
}: {
  title: string;
  note?: string;
  groups: CollectorGroup[];
  linkOf?: (group: CollectorGroup) => string | undefined;
  /** Name each row's kind (search term, video), when one list mixes them. */
  kinds?: boolean;
}) {
  return (
    <Card className='gap-0 py-0' data-groups=''>
      <div className='flex items-center gap-1 border-b border-border px-4 py-3'>
        <h2 className='text-sm font-semibold'>{title}</h2>
        {note ? (
          <InfoTip label={$t('common.what', { 0: title })}>{note}</InfoTip>
        ) : null}
      </div>
      {groups.length ? (
        groups.map((group) => {
          const href = linkOf?.(group);
          const name = (
            <span className='flex min-w-0 items-center gap-2'>
              {kinds ? (
                <Tag tone='slate'>
                  {$t(
                    group.kind === 'video'
                      ? 'collectorPage.videoKind'
                      : 'collectorPage.termKind',
                  )}
                </Tag>
              ) : null}
              <span className='truncate' title={group.name}>
                {group.name}
              </span>
            </span>
          );
          const count = (
            <span className='shrink-0 tabular-nums text-muted-foreground'>
              {countText(group.count)}
            </span>
          );
          const row =
            'flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-sm last:border-0';
          return href ? (
            <a
              key={`${group.kind}:${group.name}`}
              className={`${row} hover:bg-muted/50`}
              href={href}
              target='_blank'
              rel='noreferrer'
            >
              {name}
              {count}
            </a>
          ) : (
            <div key={`${group.kind}:${group.name}`} className={row}>
              {name}
              {count}
            </div>
          );
        })
      ) : (
        <p className='px-4 py-3 text-sm text-muted-foreground'>
          {$t('collectorPage.noneInRange')}
        </p>
      )}
    </Card>
  );
}

/**
 * The records of the period. Sorting asks the server (`sort`/`order`): a count or date column sorts largest or newest
 * first, then the other way, then back to the default, newest publication first.
 */
export function CollectorTable<T>({
  id,
  title,
  rows,
  rowId,
  columns,
  sort,
  onSort,
  loading,
  more,
  onMore,
  handOff,
}: {
  id: string;
  title: string;
  rows: T[];
  rowId: (row: T) => string;
  columns: ColumnDef<T>[];
  sort: CollectorSort;
  onSort: (next: CollectorSort) => void;
  loading: boolean;
  more: boolean;
  onMore: () => void;
  handOff: (ticked: T[]) => Omit<HandOffSource, 'count' | 'clear'>;
}) {
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const anchorRef = useSelectionAnchor();
  const all = useMemo(
    () => [makeSelectionColumn<T>(anchorRef), ...columns],
    [anchorRef, columns],
  );
  const sorting: SortingState = [
    { id: sort.sort, desc: sort.order === 'desc' },
  ];
  const table = useDataTable({
    data: rows,
    columns: all,
    manualSorting: true,
    enableRowSelection: true,
    state: { sorting, rowSelection },
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      onSort(
        next[0]
          ? { sort: next[0].id, order: next[0].desc ? 'desc' : 'asc' }
          : { sort: 'published', order: 'desc' },
      );
    },
    onRowSelectionChange: setRowSelection,
    getRowId: rowId,
  });
  const ticked = table.getSelectedRowModel().rows.map((r) => r.original);
  useHandOffSource(id, {
    count: ticked.length,
    ...handOff(ticked),
    clear: () => setRowSelection({}),
  });
  return (
    <Card className='min-w-0 gap-0 py-0' data-list=''>
      <div className='flex items-center gap-2 border-b border-border px-4 py-3'>
        <h2 className='text-sm font-semibold'>{title}</h2>
        {loading ? (
          <Spinner
            className='size-4 text-muted-foreground'
            aria-label={$t('common.loading')}
          />
        ) : null}
      </div>
      <DataTable
        table={table}
        empty={{ title: $t('collectorPage.noneInRange') }}
        footer={
          more ? (
            <div className='border-t border-border px-4 py-3'>
              <Button
                variant='outline'
                size='sm'
                disabled={loading}
                onClick={onMore}
              >
                {$t('xiaohongshu.showMore')}
              </Button>
            </div>
          ) : null
        }
      />
    </Card>
  );
}

/** The list beside where its records came from, side by side on wide screens. */
export function CollectorBody({
  list,
  side,
}: {
  list: ReactNode;
  side: ReactNode;
}) {
  return (
    <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
      {list}
      {side}
    </div>
  );
}

/** The first load, shaped like the page: metric tiles, the trend card, then the list beside its sources. */
export function CollectorSkeleton() {
  return (
    <div
      role='status'
      aria-label={$t('common.loading')}
      className='flex flex-col gap-4'
    >
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className='h-24 w-full rounded-xl' />
        ))}
      </div>
      <Skeleton className='h-64 w-full rounded-xl' />
      <CollectorBody
        list={<Skeleton className='h-80 w-full rounded-xl' />}
        side={<Skeleton className='h-48 w-full rounded-xl' />}
      />
    </div>
  );
}
