import { googleHistoryFreshness } from '../../../shared/google-cache.js';
import { $t } from "#i18n";
// Search performance › Performance, the parts beyond the totals: Country / region, Device and Search appearance (read
// from Search Console when the page asks), Rising, Falling and New (Search Console Insights' trending queries and pages),
// the breakdown tables, and one query's or page's detail: its days against the period before and the pages it shows
// with (or the queries a page shows for). Web search only (2026-10-22): the other search types were dropped.
import { useMemo, useState } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { cn } from "#lib/utils";
import { Card } from "#components/ui/card";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { TablePagination } from "#components/seo/table-pagination";
import { SortableHeader } from "#components/seo/sortable-header";
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { InfoTip } from "#components/reach/info-tip";
import { InlineError, ListSkeleton } from "#components/reach/states";
import { safeLink } from "../analytics";
import { DetailDrawer } from "../detail-drawer";
import { countryName } from "../countries";
import { useFreshData } from "../workspace-cache";
import { Segmented } from "../data-github/segmented";
import { formatCount, formatDate, formatPercent, formatSigned } from '#lib/format';
import { Delta } from '#components/reach/delta';

export type Metric = "clicks" | "impressions" | "ctr" | "position";
export type Window = { all?: boolean; start: string; end: string; previousStart: string; previousEnd: string };
export type BreakdownRow = { key: string; clicks: number; impressions: number; ctr: number; position: number; previousClicks: number | null; previousImpressions: number | null };
export type Breakdown = { connected: boolean; countries: BreakdownRow[] | null; devices: BreakdownRow[] | null; appearances: BreakdownRow[] | null };
export type MoverRow = { key: string; clicks: number; previousClicks: number; change: number; impressions: number; previousImpressions: number; position: number | null; previousPosition: number | null };
export type Movers = { rising: MoverRow[]; falling: MoverRow[]; fresh: MoverRow[] };
type TrendPoint = { date: string; clicks: number | null; impressions: number | null; ctr: number | null; position: number | null; previousDate: string; previousClicks: number | null; previousImpressions: number | null; previousCtr: number | null; previousPosition: number | null };
type RowDetail = { connected: boolean; trend: TrendPoint[]; related: { key: string; clicks: number; impressions: number; ctr: number; position: number }[] };
// What the page knows about the report it shows, for the requests it makes on its own.
export type Scope = { projectId: number; property?: string; compare?: boolean; window: Window; country?: string; filters: Record<string, unknown> };

export const count = (v: number | null | undefined) => formatCount(v == null ? v : Math.round(v));
export const ctr = (v: number | null | undefined) => formatPercent(v);
export const position = (v: number | null | undefined) => (v == null || !v ? "—" : v.toFixed(1));
export const METRIC_LABEL: Record<Metric, () => string> = { clicks: () => $t('common.clicks'), impressions: () => $t('common.impressions'), ctr: () => $t('common.ctr'), position: () => $t('common.averagePosition') };
export const showMetric = (m: Metric, v: number | null | undefined) => (m === "ctr" ? ctr(v) : m === "position" ? position(v) : count(v));
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const PAGE_SIZES = [25, 50, 100] as const;
const DEVICE: Record<string, () => string> = { DESKTOP: () => $t('searchPerformance.deviceDesktop'), MOBILE: () => $t('searchPerformance.deviceMobile'), TABLET: () => $t('searchPerformance.deviceTablet') };
// Search Console's appearance codes, as its report names them (unknown ones stay as they come).
const APPEARANCE: Record<string, () => string> = {
  WEB_LIGHT_RESULT: () => $t('searchPerformance.appearanceWebLight'), VIDEO: () => $t('searchPerformance.appearanceVideo'), AMP_BLUE_LINK: () => "AMP", AMP_TOP_STORIES: () => $t('searchPerformance.appearanceTopStories'),
  RICHCARD: () => $t('searchPerformance.appearanceRichResult'), FAQ_RICH_RESULT: () => "FAQ", HOWTO_RICH_RESULT: () => "How-to", REVIEW_SNIPPET: () => $t('searchPerformance.appearanceReview'), PRODUCT_SNIPPETS: () => $t('searchPerformance.appearanceProduct'),
  MERCHANT_LISTINGS: () => $t('searchPerformance.appearanceMerchant'), TRANSLATED_RESULT: () => $t('searchPerformance.appearanceTranslated'), JOB_LISTING: () => $t('searchPerformance.appearanceJob'), EVENT: () => $t('searchPerformance.appearanceEvent'),
  FORUMS: () => $t('searchPerformance.appearanceForums'), TPF_QA: () => $t('searchPerformance.appearanceQa'),
};
export const breakdownName = (kind: "country" | "device" | "appearance", key: string) => (kind === "country" ? countryName(key) : kind === "device" ? (DEVICE[key] ?? (() => key))() : (APPEARANCE[key.toUpperCase()] ?? (() => $t('searchPerformance.appearanceOther', { 0: key.replaceAll("_", " ").toLowerCase() })))());
const changeText = (now: number, before: number | null) => (before == null || !before ? (now && before === 0 ? $t('searchPerformance.newRow') : "—") : <Delta value={(now - before) / before} />);
const scopeBody = (s: Scope) => ({ projectId: s.projectId, compare: s.compare, ...s.window, ...(s.country ? { country: s.country } : {}), ...s.filters });

export function useBreakdown(scope: Scope | null) {
  return useFreshData<Breakdown>(scope ? `data-view:search-breakdown:${scope.projectId}:${JSON.stringify([scope.property,scopeBody(scope)])}` : null, () => api.action<Breakdown>("nrDataViews", "searchBreakdown", { method: "POST", body: scopeBody(scope!), unwrap: "data" }), googleHistoryFreshness);
}

// Shares of clicks (of impressions where nothing was clicked), which add up across one dimension's rows.
function Bars({ rows, kind, onPick }: { rows: BreakdownRow[]; kind: "country" | "device" | "appearance"; onPick?: (key: string) => void }) {
  const byClicks = rows.some((r) => r.clicks), total = rows.reduce((n, r) => n + (byClicks ? r.clicks : r.impressions), 0);
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.slice(0, 6).map((r) => {
        const share = total ? (byClicks ? r.clicks : r.impressions) / total : 0, name = breakdownName(kind, r.key);
        const label = <span className="truncate" title={name}>{name}</span>;
        return (
          <li key={r.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-sm" data-bar={r.key}>
            {onPick ? <button type="button" className="truncate text-left text-primary underline-offset-4 hover:underline" title={$t('searchPerformance.filterByCountry', { 0: name })} onClick={() => onPick(r.key)}>{name}</button> : label}
            <span className="h-2 overflow-hidden rounded-sm bg-muted"><span className="block h-full rounded-sm bg-primary/70" style={{ width: `${Math.max(share * 100, share ? 1 : 0)}%` }} /></span>
            <span className="text-right tabular-nums text-muted-foreground">{ctr(share)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function BreakdownCards({ data, error, onCountry }: { data?: Breakdown; error?: unknown; onCountry: (key: string) => void }) {
  const cards: { kind: "country" | "device" | "appearance"; title: string; info: string; rows: BreakdownRow[] | null | undefined }[] = [
    { kind: "country", title: $t('searchPerformance.countryRegion'), info: $t('searchPerformance.countryCardInfo'), rows: data?.countries },
    { kind: "device", title: $t('searchPerformance.device'), info: $t('searchPerformance.deviceCardInfo'), rows: data?.devices },
    { kind: "appearance", title: $t('searchPerformance.appearance'), info: $t('searchPerformance.appearanceCardInfo'), rows: data?.appearances },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-3" data-breakdown="">
      {cards.map((c) => (
        <Card key={c.kind} className="gap-3 px-4" data-breakdown-card={c.kind}>
          <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{c.title}</h2><InfoTip label={$t('common.aboutData')}>{c.info}</InfoTip></div>
          {error ? <InlineError>{error instanceof Error ? error.message : $t('common.tryAgainLater')}</InlineError>
            : !data ? <ListSkeleton rows={3} />
            : c.rows?.length ? <Bars rows={c.rows} kind={c.kind} onPick={c.kind === "country" ? onCountry : undefined} />
            : <p className="text-sm text-muted-foreground">{c.rows === null ? $t('searchPerformance.notForThisType') : $t('searchPerformance.noSearchConsoleDataSelected')}</p>}
        </Card>
      ))}
    </div>
  );
}

// 上升最快 / 下降最快 / 新出现: by clicks against the period before; ticked rows go to the Agent like 查询 and 网页.
const moverHelper = createColumnHelper<MoverRow>();
export function MoversTable({ rows, dimension, onOpen, onHandOff, emptyNote }: { rows: MoverRow[]; dimension: "query" | "page"; onOpen: (key: string) => void; onHandOff: (rows: MoverRow[]) => void; emptyNote: string }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [rowSelection, setRowSelection] = useState({});
  const anchorRef = useSelectionAnchor();
  const columns = useMemo<ColumnDef<MoverRow>[]>(() => [
    makeSelectionColumn<MoverRow>(anchorRef),
    moverHelper.accessor("key", { enableSorting: false, header: () => (dimension === "page" ? $t('common.page') : $t('common.query')), cell: ({ getValue }) => <button type="button" className="block max-w-xl truncate text-left text-primary underline-offset-4 hover:underline" title={getValue()} onClick={() => onOpen(getValue())}>{getValue()}</button> }) as ColumnDef<MoverRow>,
    moverHelper.accessor("clicks", { header: ({ column }) => <SortableHeader column={column} label={$t('common.clicks')} align="right" />, cell: ({ getValue }) => count(getValue()), meta: right }) as ColumnDef<MoverRow>,
    moverHelper.accessor("previousClicks", { header: ({ column }) => <SortableHeader column={column} label={$t('searchPerformance.previousClicks')} align="right" help={false} />, cell: ({ getValue }) => count(getValue()), meta: right }) as ColumnDef<MoverRow>,
    moverHelper.accessor("change", { header: ({ column }) => <SortableHeader column={column} label={$t('searchPerformance.clickChange')} align="right" help={false} />, cell: ({ getValue }) => <span className={cn(getValue() > 0 ? "nr-up" : getValue() < 0 ? "nr-down" : "")}>{formatSigned(getValue())}</span>, meta: right }) as ColumnDef<MoverRow>,
    moverHelper.accessor("impressions", { header: ({ column }) => <SortableHeader column={column} label={$t('common.impressions')} align="right" />, cell: ({ row }) => <span title={$t('searchPerformance.previousValue', { 0: count(row.original.previousImpressions) })}>{count(row.original.impressions)}</span>, meta: right }) as ColumnDef<MoverRow>,
    moverHelper.accessor((r) => r.position ?? undefined, { id: "position", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.position')} align="right" />, cell: ({ row }) => <span>{position(row.original.position)}<span className="ml-1.5 text-xs text-muted-foreground">{row.original.previousPosition != null ? `← ${position(row.original.previousPosition)}` : ""}</span></span>, meta: right }) as ColumnDef<MoverRow>,
  ], [anchorRef, dimension, onOpen]);
  const table = useDataTable({ data: rows, columns, withSorting: true, withPagination: true, enableRowSelection: true, state: { pagination, rowSelection }, onPaginationChange: setPagination, onRowSelectionChange: setRowSelection, getRowId: (r) => r.key });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  useHandOffSource("search-movers", { count: selected.length, open: () => onHandOff(selected), noun: dimension === "page" ? $t('common.pagesSelected') : $t('searchPerformance.queriesSelected'), clear: () => setRowSelection({}) });
  return (
    <DataTable table={table} empty={{ title: $t('searchPerformance.noSearchConsoleDataSelected'), description: emptyNote }}
      onRowClick={(row, e) => { if (!(e.target as HTMLElement).closest("button,a,[role=checkbox]")) onOpen(row.original.key); }}
      footer={rows.length ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null} />
  );
}

// 细分: a country, device, appearance or day with its figures and the clicks of the period before.
type Slice = { key: string; name: string; clicks: number | null; impressions: number | null; ctr: number | null; position: number | null; previousClicks: number | null };
const sliceHelper = createColumnHelper<Slice>();
export function SliceTable({ rows, label, sort = "clicks", onPick }: { rows: Slice[]; label: string; sort?: string; onPick?: (key: string) => void }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const columns = useMemo<ColumnDef<Slice>[]>(() => [
    sliceHelper.accessor("name", { header: ({ column }) => <SortableHeader column={column} label={label} help={false} />, cell: ({ row }) => (onPick ? <button type="button" className="text-left text-primary underline-offset-4 hover:underline" onClick={() => onPick(row.original.key)}>{row.original.name}</button> : row.original.name) }) as ColumnDef<Slice>,
    ...(["clicks", "impressions", "ctr", "position"] as const).map((m) => sliceHelper.accessor((r) => r[m] ?? undefined, { id: m, sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={METRIC_LABEL[m]()} align="right" />, cell: ({ row }) => showMetric(m, row.original[m]), meta: right }) as ColumnDef<Slice>),
    sliceHelper.accessor((r) => (r.previousClicks ? ((r.clicks ?? 0) - r.previousClicks) / r.previousClicks : undefined), { id: "change", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('searchPerformance.clicksVsPrevious')} align="right" help={false} />, cell: ({ row }) => changeText(row.original.clicks ?? 0, row.original.previousClicks), meta: right }) as ColumnDef<Slice>,
  ], [label, onPick]);
  const table = useDataTable({ data: rows, columns, withSorting: true, withPagination: true, state: { pagination }, onPaginationChange: setPagination, getRowId: (r) => r.key, initialState: { sorting: [{ id: sort, desc: true }] } });
  return (
    <DataTable table={table} empty={{ title: $t('searchPerformance.noSearchConsoleDataSelected') }}
      footer={rows.length ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null} />
  );
}
export const slices = (kind: "country" | "device" | "appearance", rows: BreakdownRow[] | null | undefined): Slice[] => (rows ?? []).map((r) => ({ key: r.key, name: breakdownName(kind, r.key), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position || null, previousClicks: r.previousClicks }));

// One query or page: the period's figures, its days (the chosen figure) against the period before, and the pages it shows
// with (the queries a page shows for).
export function RowDrawer({ scope, dimension, rowKey, figures, metric, onClose }: { scope: Scope; dimension: "query" | "page"; rowKey: string; figures?: { clicks: number; impressions: number; ctr: number; position: number | null }; metric: Metric; onClose: () => void }) {
  const body = { ...scopeBody(scope), dimension, key: rowKey };
  const { data, error } = useFreshData<RowDetail>(`data-view:search-row:${scope.projectId}:${JSON.stringify([scope.property,body])}`, () => api.action<RowDetail>("nrDataViews", "searchRow", { method: "POST", body, unwrap: "data" }), googleHistoryFreshness);
  const m: Metric = metric;
  const prevKey = `previous${m[0].toUpperCase()}${m.slice(1)}` as keyof TrendPoint;
  const points = (data?.trend ?? []).map((p) => ({ date: p.date, value: p[m], previous: p[prevKey] }));
  const page = dimension === "page" && safeLink(rowKey) ? safeLink(rowKey)! : null;
  return (
    <DetailDrawer open onClose={onClose} title={`${dimension === "page" ? $t('common.page') : $t('common.query')} · ${rowKey}`} description={$t('common.range', { 0: formatDate(scope.window.start), 1: formatDate(scope.window.end) })}>
      {page ? <a className="nr-link mb-3 inline-flex items-center gap-1 break-all" href={page} target="_blank" rel="noreferrer">{rowKey}<ArrowUpRight className="size-3.5" /></a> : null}
      {figures ? (
        <table className="w-full text-sm" data-row-figures="">
          <tbody>{(["clicks", "impressions", "ctr", "position"] as const).map((k) => <tr key={k} className="border-t border-border first:border-0"><td className="py-1.5">{METRIC_LABEL[k]()}</td><td className="py-1.5 text-right tabular-nums">{showMetric(k, figures[k])}</td></tr>)}</tbody>
        </table>
      ) : null}
      <h3 className="mt-5 mb-1 text-sm font-semibold">{$t('searchPerformance.daily', { 0: METRIC_LABEL[m]() })}</h3>
      {error ? <InlineError>{error instanceof Error ? error.message : $t('common.tryAgainLater')}</InlineError> : !data ? <ListSkeleton rows={3} /> : (
        <div className="nr-chart-box" data-row-line="">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={points} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={28} fontSize={11} />
              <YAxis fontSize={11} width={48} reversed={m === "position"} allowDecimals={m !== "clicks" && m !== "impressions"} tickFormatter={(v: number) => (m === "ctr" ? `${Math.round(v * 100)}%` : String(v))} />
              <Tooltip formatter={(v) => showMetric(m, Number(v))} />
              <Area isAnimationActive={false} type="linear" dataKey="value" name={METRIC_LABEL[m]()} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.1} connectNulls={false} />
              <Line isAnimationActive={false} type="linear" dataKey="previous" name={$t('searchPerformance.previousPeriodShort')} stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {data ? (
        <>
          <h3 className="mt-5 mb-1 text-sm font-semibold">{dimension === "query" ? $t('searchPerformance.pagesForQuery') : $t('searchPerformance.queriesForPage')}</h3>
          {data.related.length ? (
            <table className="w-full text-sm" data-related="">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">{dimension === "query" ? $t('common.page') : $t('common.query')}</th><th className="py-1 text-right font-medium">{$t('common.clicks')}</th><th className="py-1 text-right font-medium">{$t('common.impressions')}</th><th className="py-1 text-right font-medium">{$t('common.position')}</th></tr></thead>
              <tbody>{data.related.slice(0, 50).map((r) => <tr key={r.key} className="border-t border-border"><td className="max-w-xs truncate py-1.5 pr-2" title={r.key}>{r.key}</td><td className="py-1.5 text-right tabular-nums">{count(r.clicks)}</td><td className="py-1.5 text-right tabular-nums">{count(r.impressions)}</td><td className="py-1.5 text-right tabular-nums">{position(r.position)}</td></tr>)}</tbody>
            </table>
          ) : <p className="text-sm text-muted-foreground">{$t('searchPerformance.noSearchConsoleDataSelected')}</p>}
        </>
      ) : null}
    </DetailDrawer>
  );
}

export { Segmented };
