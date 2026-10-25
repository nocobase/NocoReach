import type { Range } from '../range-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { $t, $tj } from '#i18n';
import {
  GA4_HISTORY_CACHE_MS,
  GA4_PARTIAL_CACHE_MS,
  ga4CacheExpiry,
} from '../../../shared/ga4-cache.js';
// 访问 · the report tables, after GA4's Reports (2026-10-14): 流量获取 (channel, source / medium, campaign, AI 助手),
// 着陆页, 页面, 事件, 地区 (country, city, language) and 技术 (device, browser, OS), each with GA4's columns for it. A row
// opens its detail: its days against the period before, every figure with its change, and for pages the search queries.
// Ticked sources go to the Agent as before (看懂这些访问), ticked pages and landing pages as 优化现有页面.
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight, Search } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Card } from '#components/ui/card';
import { Input } from '#components/ui/input';
import { TabsTrigger } from '#components/ui/tabs';
import {
  DataTable,
  makeSelectionColumn,
  useDataTable,
  useSelectionAnchor,
} from '#components/seo/data-table';
import { DataTableTabs } from '#components/seo/data-table-toolbar';
import { TablePagination } from '#components/seo/table-pagination';
import { SortableHeader } from '#components/seo/sortable-header';
import { useHandOffSource } from '#components/reach/hand-off-slot';
import { WithInfo } from '#components/reach/info-tip';
import { ListSkeleton, InlineError } from '#components/reach/states';
import { Tag } from '#components/reach/tag';
import { Delta } from '#components/reach/delta';
import { formatDate, formatPercent } from '#lib/format';
import { safeLink } from '../analytics';
import { DetailDrawer } from '../detail-drawer';
import { help } from '../glossary';
import { SectionHandOff } from '../section-hand-off';
import {
  visitPageDraft,
  visitPagesDraft,
  visitSourcesDraft,
} from '../seo-hand-off';
import { useFreshData } from '../workspace-cache';
import {
  change,
  channelName,
  dayLabel,
  count,
  deviceName,
  languageName,
  METRICS,
  ownDays,
  regionName,
  show,
  special,
  type MetricKey,
  type Report,
  type Row,
  type RowDetail,
  type TableName,
} from './model';

type ViewId =
  | 'channel'
  | 'sourceMedium'
  | 'campaign'
  | 'ai'
  | 'landing'
  | 'page'
  | 'event'
  | 'country'
  | 'city'
  | 'language'
  | 'device'
  | 'browser'
  | 'os';
// `label` is a translation key.
type View = {
  id: ViewId;
  label: string;
  table: TableName;
  text: (r: Row) => string;
  name?: (r: Row) => ReactNode;
};
const path = (v: string) => v || '/';
const VIEWS: Record<ViewId, View> = {
  channel: {
    id: 'channel',
    label: 'dataWebsite.channel',
    table: 'channel',
    text: (r) => channelName(r.dims.sessionDefaultChannelGroup),
  },
  sourceMedium: {
    id: 'sourceMedium',
    label: 'dataWebsite.sourceMedium',
    table: 'sourceMedium',
    text: (r) =>
      `${special(r.dims.sessionSource)} / ${special(r.dims.sessionMedium)}`,
    name: (r) => (
      <span className='flex items-center gap-1.5'>
        {special(r.dims.sessionSource)}
        <span className='text-muted-foreground'>
          / {special(r.dims.sessionMedium)}
        </span>
        {r.ai ? <Tag tone='violet'>{r.ai}</Tag> : null}
      </span>
    ),
  },
  campaign: {
    id: 'campaign',
    label: 'dataWebsite.campaign',
    table: 'campaign',
    text: (r) => special(r.dims.sessionCampaignName),
  },
  ai: {
    id: 'ai',
    label: 'dataWebsite.aiAssistants',
    table: 'sourceMedium',
    text: (r) => `${r.ai} ${r.dims.sessionSource} / ${r.dims.sessionMedium}`,
    name: (r) => (
      <span className='flex items-center gap-1.5'>
        <Tag tone='violet'>{r.ai}</Tag>
        {special(r.dims.sessionSource)}
        <span className='text-muted-foreground'>
          / {special(r.dims.sessionMedium)}
        </span>
      </span>
    ),
  },
  landing: {
    id: 'landing',
    label: 'dataWebsite.landingPage',
    table: 'landing',
    text: (r) => special(path(r.dims.landingPagePlusQueryString)),
  },
  page: {
    id: 'page',
    label: 'common.page',
    table: 'page',
    text: (r) => `${path(r.key)} ${r.title || ''}`,
    name: (r) => (
      <span className='flex min-w-0 flex-col'>
        <span className='truncate'>{path(r.key)}</span>
        {r.title ? (
          <span className='truncate text-xs text-muted-foreground'>
            {r.title}
          </span>
        ) : null}
      </span>
    ),
  },
  event: {
    id: 'event',
    label: 'dataWebsite.eventName',
    table: 'event',
    text: (r) => r.dims.eventName,
    name: (r) => (
      <span className='flex items-center gap-1.5'>
        {r.dims.eventName}
        {r.keyEvents ? <Tag tone='green'>{$t('common.keyEvents')}</Tag> : null}
      </span>
    ),
  },
  country: {
    id: 'country',
    label: 'dataWebsite.countryRegion',
    table: 'country',
    text: (r) => regionName(r.dims.countryId, r.dims.country),
  },
  city: {
    id: 'city',
    label: 'dataWebsite.city',
    table: 'city',
    text: (r) => `${special(r.dims.city)} ${regionName(r.dims.countryId, '')}`,
    name: (r) => (
      <span>
        {special(r.dims.city)}
        <span className='text-muted-foreground'>
          {' '}
          · {regionName(r.dims.countryId, '')}
        </span>
      </span>
    ),
  },
  language: {
    id: 'language',
    label: 'dataWebsite.language',
    table: 'language',
    text: (r) => languageName(r.dims.languageCode, r.dims.language),
  },
  device: {
    id: 'device',
    label: 'dataWebsite.device',
    table: 'device',
    text: (r) => deviceName(r.dims.deviceCategory),
  },
  browser: {
    id: 'browser',
    label: 'dataWebsite.browser',
    table: 'browser',
    text: (r) => special(r.dims.browser),
  },
  os: {
    id: 'os',
    label: 'dataWebsite.operatingSystem',
    table: 'os',
    text: (r) => special(r.dims.operatingSystem),
  },
};
const AUDIENCE: MetricKey[] = [
  'users',
  'newUsers',
  'sessions',
  'engagementRate',
  'engagementTime',
  'keyEvents',
];
// GA4's reports and their columns; the first metric is the one rows are sorted by and the detail's line shows.
const TABS: {
  id: string;
  label: string;
  views: ViewId[];
  columns: MetricKey[];
  queries?: boolean;
}[] = [
  {
    id: 'acquisition',
    label: 'dataWebsite.trafficAcquisition',
    views: ['channel', 'sourceMedium', 'campaign', 'ai'],
    columns: [
      'sessions',
      'users',
      'engagementRate',
      'sessionTime',
      'eventsPerSession',
      'keyEvents',
      'keyEventRate',
    ],
  },
  {
    id: 'landing',
    label: 'dataWebsite.landingPages',
    views: ['landing'],
    columns: [
      'sessions',
      'users',
      'newUsers',
      'engagementRate',
      'sessionTime',
      'keyEvents',
    ],
  },
  {
    id: 'pages',
    label: 'dataWebsite.pagesReport',
    views: ['page'],
    columns: [
      'views',
      'users',
      'viewsPerUser',
      'engagementTime',
      'events',
      'keyEvents',
    ],
    queries: true,
  },
  {
    id: 'events',
    label: 'dataWebsite.eventsReport',
    views: ['event'],
    columns: ['events', 'users', 'eventsPerUser', 'keyEvents'],
  },
  {
    id: 'geo',
    label: 'dataWebsite.geography',
    views: ['country', 'city', 'language'],
    columns: AUDIENCE,
  },
  {
    id: 'tech',
    label: 'dataWebsite.tech',
    views: ['device', 'browser', 'os'],
    columns: AUDIENCE,
  },
];
const PAGE_SIZES = [25, 50, 100] as const;
const right = {
  headerClassName: 'text-right',
  cellClassName: 'text-right tabular-nums',
} as const;
const helper = createColumnHelper<Row>();
const linkClass =
  'block max-w-md truncate text-left text-primary underline-offset-4 hover:underline';
const pct = (v: number | null) => formatPercent(v);

export function ReportCard({
  report,
  range,
  projectId,
  propertyId,
  toUrl,
}: {
  report: Report;
  range: Range;
  projectId?: number;
  propertyId?: string;
  toUrl: (page: string) => string;
}) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0];
  const view =
    VIEWS[
      (tab.views as string[]).includes(params.get('by') || '')
        ? (params.get('by') as ViewId)
        : tab.views[0]
    ];
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const set = (next: { tab?: string; by?: string }) => {
    const p = new URLSearchParams(params);
    const t = next.tab ?? tab.id;
    if (t === TABS[0].id) p.delete('tab');
    else p.set('tab', t);
    if (next.by && next.by !== TABS.find((x) => x.id === t)!.views[0])
      p.set('by', next.by);
    else p.delete('by');
    setParams(p, { replace: true });
    setQuery('');
  };
  const all = report.tables?.[view.table];
  const rows = useMemo(
    () =>
      (all ?? [])
        .filter((r) => (view.id === 'ai' ? r.ai : true))
        .filter((r) =>
          view.text(r).toLowerCase().includes(query.toLowerCase()),
        ),
    [all, view, query],
  );
  const w = report.window!;
  const period = $t('common.range', {
    0: formatDate(w.start),
    1: formatDate(w.end),
  });
  return (
    <Card className='gap-0 py-0'>
      <DataTableTabs
        value={tab.id}
        onValueChange={(v) => set({ tab: v })}
        tools={
          <>
            {/* One row of tabs; how a tab's table is broken down is a dropdown in its toolbar, not a second row of
            buttons (UI review 2026-10-22). */}
            {tab.views.length > 1 ? (
              <Select
                value={view.id}
                onValueChange={(v) => {
                  const next = tab.views.find((x) => x === v);
                  if (next) set({ by: next });
                }}
              >
                <SelectTrigger
                  size='sm'
                  className='w-40'
                  aria-label={$t('dataWebsite.breakDownBy')}
                >
                  <SelectValue>
                    {(v: string) =>
                      $t(VIEWS[v as keyof typeof VIEWS]?.label ?? view.label)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
                  {tab.views.map((v) => (
                    <SelectItem key={v} value={v}>
                      {$t(VIEWS[v].label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <label className='relative flex items-center'>
              <Search className='pointer-events-none absolute left-2.5 size-4 text-muted-foreground' />
              <Input
                aria-label={$t('dataWebsite.searchDimension', {
                  0: $t(view.label),
                })}
                className='h-8 w-64 pl-8'
                placeholder={$t('dataWebsite.searchDimension', {
                  0: $t(view.label),
                })}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </>
        }
      >
        {TABS.map((t) => (
          <TabsTrigger key={t.id} value={t.id}>
            {$t(t.label)}
          </TabsTrigger>
        ))}
      </DataTableTabs>
      {all === undefined ? (
        <div className='px-4 py-6'>
          <InlineError>{$t('dataWebsite.tableNotReturned')}</InlineError>
        </div>
      ) : (
        <ReportTable
          key={`${tab.id}:${view.id}`}
          tab={tab}
          view={view}
          rows={rows}
          report={report}
          filtered={Boolean(query)}
          onClear={() => setQuery('')}
          onOpen={setOpen}
          period={period}
          projectId={projectId}
          toUrl={toUrl}
        />
      )}
      {open ? (
        <RowDrawer
          row={open}
          view={view}
          columns={tab.columns}
          report={report}
          range={range}
          projectId={projectId}
          propertyId={propertyId}
          period={period}
          toUrl={toUrl}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </Card>
  );
}

function ReportTable({
  tab,
  view,
  rows,
  report,
  filtered,
  onClear,
  onOpen,
  period,
  projectId,
  toUrl,
}: {
  tab: (typeof TABS)[number];
  view: View;
  rows: Row[];
  report: Report;
  filtered: boolean;
  onClear: () => void;
  onOpen: (r: Row) => void;
  period: string;
  projectId?: number;
  toUrl: (page: string) => string;
}) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const anchorRef = useSelectionAnchor();
  const total = report.totals?.current;
  // Sources (流量获取) go to the Agent as 看懂这些访问; pages and landing pages as 优化现有页面.
  const handOff =
    tab.id === 'acquisition'
      ? 'sources'
      : tab.id === 'pages' || tab.id === 'landing'
        ? 'pages'
        : null;
  const pageOf = (r: Row) =>
    view.id === 'landing'
      ? r.dims.landingPagePlusQueryString.split('?')[0]
      : r.key;
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      ...(handOff ? [makeSelectionColumn<Row>(anchorRef)] : []),
      helper.display({
        id: 'name',
        header: () => $t(view.label),
        cell: ({ row }) => (
          <button
            type='button'
            className={linkClass}
            title={view.text(row.original)}
            onClick={() => onOpen(row.original)}
          >
            {view.name ? view.name(row.original) : view.text(row.original)}
          </button>
        ),
      }),
      ...tab.columns.map(
        (key) =>
          helper.accessor((r) => METRICS[key].of(r) ?? -Infinity, {
            id: key,
            header: ({ column }) => (
              <SortableHeader
                column={column}
                label={$t(METRICS[key].label)}
                align='right'
              />
            ),
            cell: ({ row }) =>
              show(METRICS[key].of(row.original), METRICS[key].format),
            meta: right,
          }) as ColumnDef<Row>,
      ),
      ...(tab.queries
        ? [
            helper.accessor((r) => r.queries?.length ?? 0, {
              id: 'queries',
              header: ({ column }) => (
                <SortableHeader
                  column={column}
                  label={$t('dataWebsite.searchQueries')}
                  align='right'
                />
              ),
              cell: ({ getValue }) => count(getValue()),
              meta: right,
            }) as ColumnDef<Row>,
          ]
        : []),
    ],
    [tab, view, onOpen, anchorRef, handOff],
  );
  const table = useDataTable({
    data: rows,
    columns,
    withSorting: true,
    withPagination: true,
    enableRowSelection: Boolean(handOff),
    state: { pagination, rowSelection },
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getRowId: (x) => x.key,
    initialState: { sorting: [{ id: tab.columns[0], desc: true }] },
  });
  const ticked = table.getSelectedRowModel().rows.map((r) => r.original);
  const share = (r: Row) =>
    total?.sessions ? (r.sessions ?? 0) / total.sessions : null;
  const viewShare = (r: Row) =>
    total?.views ? (r.views ?? 0) / total.views : null;
  useHandOffSource(
    'visit-sources',
    projectId && handOff === 'sources'
      ? {
          count: ticked.length,
          noun: $t('dataWebsite.sourcesSelected'),
          playbookId: 'change-research',
          description: $t('dataWebsite.tickedSourcesBecomeOneTask'),
          draft: () =>
            visitSourcesDraft(
              ticked.map((r) => ({
                source: view.text(r),
                medium: r.dims.sessionMedium || '',
                views: r.views ?? 0,
                sessions: r.sessions ?? 0,
                conversions: r.keyEvents ?? 0,
                share: pct(share(r)),
              })),
              period,
            ),
          clear: () => setRowSelection({}),
        }
      : null,
  );
  useHandOffSource(
    'visit-pages',
    projectId && handOff === 'pages'
      ? {
          count: ticked.length,
          noun: $t('common.pagesSelected'),
          playbookId: 'optimize-page',
          page: ticked.length === 1 ? toUrl(pageOf(ticked[0])) : undefined,
          description: $t('dataWebsite.tickedPagesBecomeOneTask'),
          draft: () =>
            visitPagesDraft(
              ticked.map((r) => ({
                page: toUrl(pageOf(r)),
                views: r.views ?? 0,
                conversions: r.keyEvents ?? 0,
                share: pct(viewShare(r)),
                queries: r.queries?.length ?? 0,
              })),
              period,
            ),
          clear: () => setRowSelection({}),
        }
      : null,
  );
  return (
    <DataTable
      table={table}
      isFiltered={filtered}
      onClearFilters={onClear}
      empty={{ title: $t('dataWebsite.noDataSelectedPeriod') }}
      onRowClick={(row, e) => {
        if ((e.target as HTMLElement).closest('button,a,[role=checkbox]'))
          return;
        onOpen(row.original);
      }}
      footer={
        rows.length > 0 ? (
          <TablePagination
            page={pagination.pageIndex + 1}
            pageSize={pagination.pageSize}
            pageSizes={PAGE_SIZES}
            totalCount={rows.length}
            onPageChange={(p) =>
              setPagination((s) => ({ ...s, pageIndex: p - 1 }))
            }
            onPageSizeChange={(size) =>
              setPagination({ pageIndex: 0, pageSize: size })
            }
          />
        ) : null
      }
    />
  );
}

// One row: every figure of its report with the period before, its days as a line, and for pages the search queries.
function RowDrawer({
  row,
  view,
  columns,
  report,
  range,
  projectId,
  propertyId,
  period,
  toUrl,
  onClose,
}: {
  row: Row;
  view: View;
  columns: MetricKey[];
  report: Report;
  range: Range;
  projectId?: number;
  propertyId?: string;
  period: string;
  toUrl: (page: string) => string;
  onClose: () => void;
}) {
  const { data, error } = useFreshData<RowDetail>(
    projectId
      ? `data-view:website-row:${projectId}:${propertyId}:${JSON.stringify(range)}:${report.cutoff}:${view.table}:${row.key}`
      : null,
    () =>
      api.action<RowDetail>('nrDataViews', 'websiteRow', {
        method: 'POST',
        body: {
          projectId,
          ...range,
          cutoff: report.cutoff,
          table: view.table,
          dims: row.dims,
        },
        unwrap: 'data',
      }),
    {
      staleTime: GA4_HISTORY_CACHE_MS,
      retryDelay: GA4_PARTIAL_CACHE_MS,
      expiresAt: ga4CacheExpiry,
    },
  );
  const isPage = view.id === 'page' || view.id === 'landing';
  const page = isPage
    ? toUrl(
        view.id === 'landing'
          ? row.dims.landingPagePlusQueryString.split('?')[0]
          : row.key,
      )
    : '';
  const main = columns[0];
  const w = report.window!;
  const now = data?.totals?.current ?? row,
    before = data?.totals?.previous ?? null;
  const days = ownDays(data?.window ?? w, data?.daily, data?.previousDaily);
  const points = days.current.map((d, i) => ({
    date: d.date,
    value: METRICS[main].of(d),
    previous: days.previous[i] ? METRICS[main].of(days.previous[i]) : null,
    previousDate: days.previous[i]?.date ?? '',
  }));
  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={`${$t(view.label)} · ${view.text(row)}`}
      description={$t('dataWebsite.ga4', {
        0: formatDate(w.start),
        1: formatDate(w.end),
      })}
      actions={
        isPage && projectId ? (
          <SectionHandOff
            projectId={projectId}
            playbookId='optimize-page'
            page={page}
            description={$t('dataWebsite.pageTrafficKeyEventsSearch')}
            draft={() =>
              visitPageDraft(
                page,
                period,
                row.views ?? 0,
                row.keyEvents ?? 0,
                pct(
                  report.totals?.current?.views
                    ? (row.views ?? 0) / report.totals.current.views
                    : null,
                ),
                row.queries ?? [],
              )
            }
          />
        ) : undefined
      }
    >
      {isPage && safeLink(page) ? (
        <a
          className='nr-link mb-3 inline-flex items-center gap-1 break-all'
          href={safeLink(page) ?? undefined}
          target='_blank'
          rel='noreferrer'
        >
          {page}
          <ArrowUpRight className='size-3.5' />
        </a>
      ) : null}
      <table className='w-full text-sm' data-row-figures=''>
        <thead>
          <tr className='text-left text-xs text-muted-foreground'>
            <th className='py-1 font-medium' />
            <th className='py-1 text-right font-medium'>{period}</th>
            <th className='py-1 text-right font-medium'>
              {$t('dataWebsite.previousPeriod')}
            </th>
            <th className='py-1 text-right font-medium'>
              {$t('common.change')}
            </th>
          </tr>
        </thead>
        <tbody>
          {columns.map((key) => {
            const m = METRICS[key],
              a = m.of(now),
              b = before ? m.of(before) : null,
              c = change(a, b);
            return (
              <tr key={key} className='border-t border-border'>
                <td className='py-1.5'>
                  <WithInfo help={help($t(m.label))}>{$t(m.label)}</WithInfo>
                </td>
                <td className='py-1.5 text-right tabular-nums'>
                  {show(a, m.format)}
                </td>
                <td className='py-1.5 text-right tabular-nums text-muted-foreground'>
                  {data ? show(b, m.format) : '…'}
                </td>
                <td className='py-1.5 text-right'>
                  {c === null ? '—' : <Delta value={c} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3 className='mt-5 mb-1 text-sm font-semibold'>
        {$tj('dataWebsite.metricPerDay', { 0: $t(METRICS[main].label) })}
      </h3>
      {error ? (
        <InlineError>
          {error instanceof Error ? error.message : $t('common.tryAgainLater')}
        </InlineError>
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : points.length < 2 ? (
        <p className='text-sm text-muted-foreground'>
          {$t('dataWebsite.rowTooFewDays')}
        </p>
      ) : (
        <div className='nr-chart-box'>
          <ResponsiveContainer width='100%' height={200}>
            <ComposedChart
              data={points}
              margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis
                dataKey='date'
                tickFormatter={(d: string) => d.slice(5)}
                minTickGap={32}
                fontSize={11}
              />
              <YAxis
                fontSize={11}
                width={52}
                tickFormatter={(v: number) =>
                  show(
                    v,
                    METRICS[main].format === 'duration'
                      ? 'count'
                      : METRICS[main].format,
                  )
                }
              />
              <Tooltip
                formatter={(v) => show(Number(v), METRICS[main].format)}
                labelFormatter={dayLabel}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                isAnimationActive={false}
                type='linear'
                dataKey='value'
                name={$t(METRICS[main].label)}
                stroke='var(--chart-3)'
                fill='var(--chart-3)'
                fillOpacity={0.1}
              />
              <Line
                isAnimationActive={false}
                type='linear'
                dataKey='previous'
                name={$t('dataWebsite.previousPeriod')}
                stroke='var(--muted-foreground)'
                strokeDasharray='4 4'
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {view.id === 'page' ? (
        <>
          <h3 className='mt-5 mb-1 text-sm font-semibold'>
            {$t('dataWebsite.relatedSearchQueries')}
          </h3>
          {row.queries?.length ? (
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-left text-xs text-muted-foreground'>
                  <th className='py-1 font-medium'>{$t('common.query')}</th>
                  <th className='py-1 text-right font-medium'>
                    {$t('common.clicks')}
                  </th>
                  <th className='py-1 text-right font-medium'>
                    {$t('common.impressions')}
                  </th>
                  <th className='py-1 text-right font-medium'>
                    {$t('common.position')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {row.queries.map((q) => (
                  <tr key={q.keyword} className='border-t'>
                    <td className='py-1.5 pr-2'>{q.keyword}</td>
                    <td className='py-1.5 text-right tabular-nums'>
                      {count(q.clicks)}
                    </td>
                    <td className='py-1.5 text-right tabular-nums'>
                      {count(q.impressions)}
                    </td>
                    <td className='py-1.5 text-right tabular-nums'>
                      {q.position ? q.position.toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {$t('dataWebsite.noQueriesManyImpressionsSelected')}
            </p>
          )}
        </>
      ) : null}
    </DetailDrawer>
  );
}
