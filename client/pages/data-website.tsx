import { $t, $tj } from "#i18n";
// 访问 (网站与产品, GA4): totals for the period against the one before, the daily line (with the 初步 days dotted), and
// the sources and pages tables (visits from Reddit are not singled out, 2026-10-08 user request; the Reddit page has them); a row opens its details. Ticked sources or pages go to the Agent from
// the bar at the bottom (2026-10-08), one page also from its details.
// Rebuilt 2026-10-04 on the same parts as the other data pages; the server builds the report once per synced data.
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, BarChart3, Search } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { TabsTrigger } from "#components/ui/tabs";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableTabs, DataTableToolbar } from "#components/seo/data-table-toolbar";
import { TablePagination } from "#components/seo/table-pagination";
import { SortableHeader } from "#components/seo/sortable-header";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker, useRange } from "./range-picker";
import { MetricTile, type Metric } from "./data-parts";
import { safeLink } from "./analytics";
import { DetailDrawer } from "./detail-drawer";
import { SectionHandOff } from "./section-hand-off";
import { visitPageDraft, visitPagesDraft, visitSourcesDraft } from "./seo-hand-off";
import { HandOffBar } from "./hand-off-bar";
import { useHandOffSource } from "#components/reach/hand-off-slot";
import "./data-views.css";
import { NotesTip, InfoTip } from "#components/reach/info-tip";

type Query = { keyword: string; clicks: number; impressions: number; position: number };
type SourceRow = { source: string; medium: string; views: number; sessions: number; conversions: number; share: number | null };
type PageRow = { page: string; views: number; conversions: number; share: number | null; queries: Query[] };
type Report = {
  connected: boolean; cutoff?: string | null; window?: { start: string; end: string; days: number; previousStart: string; previousEnd: string }; complete?: boolean;
  kpis?: Metric[]; trend?: { date: string; views: number | null; uv: number | null; previousDate: string; previousViews: number | null }[];
  sources?: SourceRow[]; pages?: PageRow[]; reddit?: { sessions: number; views: number; conversions: number; previous: number | null } | null; notes?: string[];
  preliminary?: { date: string; views?: number; uv?: number }[];
};
const RANGES = ["7", "28", "90", "3m", "12m"];
const PAGE_SIZES = [25, 50, 100] as const;
const n = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString());
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const sourceHelper = createColumnHelper<SourceRow>();
const pageHelper = createColumnHelper<PageRow>();
const linkClass = "block max-w-md truncate text-left text-primary underline-offset-4 hover:underline";

export default function DataWebsite() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useRange();
  const r = RANGES.includes(range.range) ? range.range : "28";
  const tab = params.get("tab") === "pages" ? "pages" : "sources";
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<{ source?: SourceRow; page?: PageRow }>({});
  const { data: report, error } = useFreshData<Report>(project ? `data-view:website:${project.id}:${r}` : null, () => api.action<Report>("nrDataViews", "website", { method: "POST", body: { projectId: project!.id, range: r }, unwrap: "data" }));
  const w = report?.window;
  const setTab = (v: string) => { const p = new URLSearchParams(params); if (v === "pages") p.set("tab", "pages"); else p.delete("tab"); setParams(p, { replace: true }); setQuery(""); };
  const pageUrl = (page: string) => (page.startsWith("http") ? page : `https://${project?.domains?.[0] ?? ""}${page}`);

  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={report?.notes} />} title={$t("访问")} description={$t("网站的浏览、会话和关键事件，从哪些来源来、看了哪些页面（GA4）。")} />
      <RangePicker value={{ range: r }} onChange={setRange} options={RANGES} summary={w ? $t("{0} 至 {1} · 对比前 {2} 天 · 数据截至 {3}",{0:w.start,1:w.end,2:w.days,3:report?.cutoff}) : undefined} />
      {error ? <LoadError title={$t("访问数据没有读出来")} message={error instanceof Error ? error.message : $t("请稍后再试")} /> : null}
      {!report && !error ? <ListSkeleton rows={6} /> : null}
      {report && (!report.connected || !report.cutoff) ? <EmptyState icon={<BarChart3 />} title={$t("接入 GA4 后，这里显示网站的访问、来源和页面")} description={$t("授权只读取数据，每天自动同步一次。")} action={<Button onClick={() => navigate("/connections?source=ga4")}>{$t("接入 GA4")}</Button>} /> : null}
      {report?.connected && report.cutoff ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{report.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          
          <TrendCard report={report} />
          <Card className="gap-0 py-0">
            <DataTableTabs value={tab} onValueChange={setTab}>
              <TabsTrigger value="sources">{$tj("来源 ({0})",{0:report.sources!.length})}</TabsTrigger>
              <TabsTrigger value="pages">{$tj("页面 ({0})",{0:report.pages!.length})}</TabsTrigger>
            </DataTableTabs>
            <DataTableToolbar>
              <label className="relative flex items-center"><Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" /><Input aria-label={tab === "pages" ? $t("搜索页面") : $t("搜索来源")} className="h-8 w-64 pl-8" placeholder={tab === "pages" ? $t("搜索页面路径") : $t("搜索来源或媒介")} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            </DataTableToolbar>
            {tab === "pages"
              ? <PagesTable key="pages" toUrl={pageUrl} rows={report.pages!.filter((p) => p.page.toLowerCase().includes(query.toLowerCase()))} filtered={Boolean(query)} onClear={() => setQuery("")} period={w ? $t("{0} 至 {1}",{0:w.start,1:w.end}) : ""} projectId={project?.id} onOpen={(page) => setDetail({ page })} />
              : <SourcesTable key="sources" rows={report.sources!.filter((s) => `${s.source} ${s.medium}`.toLowerCase().includes(query.toLowerCase()))} filtered={Boolean(query)} onClear={() => setQuery("")} period={w ? $t("{0} 至 {1}",{0:w.start,1:w.end}) : ""} projectId={project?.id} onOpen={(source) => setDetail({ source })} />}
          </Card>
          
        </>
      ) : null}
      {detail.source && w ? (
        <DetailDrawer open onClose={() => setDetail({})} title={$t("来源 · {0}",{0:detail.source.source})} description={$t("{0} 至 {1} · GA4",{0:w.start,1:w.end})}>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{$t("媒介")}</dt><dd>{detail.source.medium || "—"}</dd>
            <dt className="text-muted-foreground">{$t("浏览量")}</dt><dd>{$tj("{0}（占全站 {1}）",{0:n(detail.source.views),1:pct(detail.source.share)})}</dd>
            <dt className="text-muted-foreground">{$t("会话")}</dt><dd>{n(detail.source.sessions)}</dd>
            <dt className="text-muted-foreground">{$t("关键事件")}</dt><dd>{n(detail.source.conversions)}</dd>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{$t("关键事件按 GA4 里的定义记录，不代表成交。")}</p>
        </DetailDrawer>
      ) : null}
      {detail.page && w && project ? (
        <DetailDrawer open onClose={() => setDetail({})} title={$t("页面")} description={$t("{0} 至 {1} · GA4 与 Search Console",{0:w.start,1:w.end})} actions={<SectionHandOff projectId={project.id} playbookId="optimize-page" page={pageUrl(detail.page.page)} description={$t("这个页面的访问、关键事件和搜索查询写进任务说明，确认后立即开始。")} draft={() => visitPageDraft(pageUrl(detail.page!.page), $t("{0} 至 {1}",{0:w.start,1:w.end}), detail.page!.views, detail.page!.conversions, pct(detail.page!.share), detail.page!.queries)} />}>
          <div className="mb-3 flex items-center justify-between gap-2">
            {safeLink(pageUrl(detail.page.page)) ? <a className="nr-link inline-flex items-center gap-1 break-all" href={safeLink(pageUrl(detail.page.page))!} target="_blank" rel="noreferrer">{detail.page.page || "/"}<ArrowUpRight className="size-3.5" /></a> : <span>{detail.page.page}</span>}
          </div>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{$t("浏览量")}</dt><dd>{$tj("{0}（占全站 {1}）",{0:n(detail.page.views),1:pct(detail.page.share)})}</dd>
            <dt className="text-muted-foreground">{$t("关键事件")}</dt><dd>{n(detail.page.conversions)}</dd>
          </dl>
          <h3 className="mt-4 mb-1 text-sm font-semibold">{$t("关联的搜索查询")}</h3>
          {detail.page.queries.length ? (
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">{$t("查询")}</th><th className="py-1 text-right font-medium">{$t("点击")}</th><th className="py-1 text-right font-medium">{$t("曝光")}</th><th className="py-1 text-right font-medium">{$t("排名")}</th></tr></thead>
              <tbody>{detail.page.queries.map((q) => <tr key={q.keyword} className="border-t"><td className="py-1.5 pr-2">{q.keyword}</td><td className="py-1.5 text-right tabular-nums">{n(q.clicks)}</td><td className="py-1.5 text-right tabular-nums">{n(q.impressions)}</td><td className="py-1.5 text-right tabular-nums">{q.position ? q.position.toFixed(1) : "—"}</td></tr>)}</tbody></table>
          ) : <p className="text-sm text-muted-foreground">{$t("所选时间内没有带来曝光较多的查询。")}</p>}
          <p className="mt-3 text-xs text-muted-foreground">{$t("页面浏览量不等于这个页面作为落地页带来的访问。")}</p>
        </DetailDrawer>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

// Views per day against the same day of the period before; daily visitors as a line; 初步 days dotted after the cutoff.
function TrendCard({ report }: { report: Report }) {
  const fresh = (report.preliminary ?? []).filter((p) => p.date > report.cutoff!);
  const points = [...report.trend!.map((p) => ({ ...p, fresh: p.date === report.cutoff && fresh.length ? p.views : null as number | null })), ...fresh.map((p) => ({ date: p.date, views: null, uv: null, previousDate: "", previousViews: null, fresh: p.views ?? null }))];
  if (points.filter((p) => p.views !== null).length < 2) return null;
  return (
    <Card className="gap-3 px-4">
      <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{$t("每天的浏览量")}</h2><InfoTip label={$t("图怎么看")}>{$tj("访客是每天的去重人数，不能跨天相加{0}。",{0:fresh.length ? $t("；点线是最近还没定稿的初步数据，不算进上面的数字") : ""})}</InfoTip></div>
      <div className="nr-chart-box" data-website-chart>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={points} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} width={52} />
            <Tooltip labelFormatter={(d, p) => `${d}${p?.[0]?.payload?.previousDate ? $t(" · 前一期 {0}",{0:p[0].payload.previousDate}) : $t("（初步数据）")}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area isAnimationActive={false} type="linear" dataKey="views" name={$t("浏览量")} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.1} />
            <Line isAnimationActive={false} type="linear" dataKey="uv" name={$t("访客")} stroke="var(--chart-2)" dot={false} />
            <Line isAnimationActive={false} type="linear" dataKey="previousViews" name={$t("前一期浏览量")} stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
            {fresh.length ? <Line isAnimationActive={false} type="linear" dataKey="fresh" name={$t("初步数据")} stroke="var(--chart-3)" strokeDasharray="2 3" dot={false} connectNulls /> : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function SourcesTable({ rows, filtered, onClear, onOpen, period, projectId }: { rows: SourceRow[]; filtered: boolean; onClear: () => void; onOpen: (r: SourceRow) => void; period: string; projectId?: number }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const anchorRef = useSelectionAnchor();
  const columns = useMemo<ColumnDef<SourceRow>[]>(() => [
    makeSelectionColumn<SourceRow>(anchorRef),
    sourceHelper.accessor("source", { enableSorting: false, header: () => $t("来源 / 媒介"), cell: ({ row }) => <div className="min-w-0"><button type="button" className={linkClass} onClick={() => onOpen(row.original)}>{row.original.source}</button><span className="block text-xs text-muted-foreground">{row.original.medium || "—"}</span></div> }) as ColumnDef<SourceRow>,
    sourceHelper.accessor("views", { header: ({ column }) => <SortableHeader column={column} label={$t("浏览量")} align="right" />, cell: ({ getValue }) => n(getValue()), meta: right }) as ColumnDef<SourceRow>,
    sourceHelper.accessor((x) => x.share ?? 0, { id: "share", header: ({ column }) => <SortableHeader column={column} label={$t("占全站")} align="right" />, cell: ({ row }) => pct(row.original.share), meta: right }) as ColumnDef<SourceRow>,
    sourceHelper.accessor("sessions", { header: ({ column }) => <SortableHeader column={column} label={$t("会话")} align="right" />, cell: ({ getValue }) => n(getValue()), meta: right }) as ColumnDef<SourceRow>,
    sourceHelper.accessor("conversions", { header: ({ column }) => <SortableHeader column={column} label={$t("关键事件")} align="right" />, cell: ({ getValue }) => n(getValue()), meta: right }) as ColumnDef<SourceRow>,
  ], [onOpen, anchorRef]);
  const table = useDataTable({ data: rows, columns, withSorting: true, withPagination: true, enableRowSelection: true, state: { pagination, rowSelection }, onPaginationChange: setPagination, onRowSelectionChange: setRowSelection, getRowId: (x) => `${x.source}|${x.medium}`, initialState: { sorting: [{ id: "views", desc: true }] } });
  const ticked = table.getSelectedRowModel().rows.map((r) => r.original);
  useHandOffSource("visit-sources", projectId ? { count: ticked.length, noun: $t("个来源已选"), playbookId: "change-research", description: $t("勾选的来源合成一个任务，让 Agent 弄清这些访客想找什么、该补什么，确认后立即开始。"), draft: () => visitSourcesDraft(ticked.map((r) => ({ ...r, share: pct(r.share) })), period), clear: () => setRowSelection({}) } : null);
  return <DataTable table={table} isFiltered={filtered} onClearFilters={onClear} empty={{ title: $t("所选时间内没有来源数据") }} onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,a")) return; onOpen(row.original); }}
    footer={rows.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize as (typeof PAGE_SIZES)[number]} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null} />;
}

function PagesTable({ rows, filtered, onClear, onOpen, period, projectId, toUrl }: { rows: PageRow[]; filtered: boolean; onClear: () => void; onOpen: (r: PageRow) => void; period: string; projectId?: number; toUrl: (page: string) => string }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const anchorRef = useSelectionAnchor();
  const columns = useMemo<ColumnDef<PageRow>[]>(() => [
    makeSelectionColumn<PageRow>(anchorRef),
    pageHelper.accessor("page", { enableSorting: false, header: () => $t("页面"), cell: ({ row }) => <button type="button" className={linkClass} title={row.original.page} onClick={() => onOpen(row.original)}>{row.original.page || $t("（没有路径）")}</button> }) as ColumnDef<PageRow>,
    pageHelper.accessor("views", { header: ({ column }) => <SortableHeader column={column} label={$t("浏览量")} align="right" />, cell: ({ getValue }) => n(getValue()), meta: right }) as ColumnDef<PageRow>,
    pageHelper.accessor((x) => x.share ?? 0, { id: "share", header: ({ column }) => <SortableHeader column={column} label={$t("占全站")} align="right" />, cell: ({ row }) => pct(row.original.share), meta: right }) as ColumnDef<PageRow>,
    pageHelper.accessor("conversions", { header: ({ column }) => <SortableHeader column={column} label={$t("关键事件")} align="right" />, cell: ({ getValue }) => n(getValue()), meta: right }) as ColumnDef<PageRow>,
    pageHelper.accessor((x) => x.queries.length, { id: "queries", header: ({ column }) => <SortableHeader column={column} label={$t("搜索查询")} align="right" />, cell: ({ getValue }) => n(getValue() as number), meta: right }) as ColumnDef<PageRow>,
  ], [onOpen, anchorRef]);
  const table = useDataTable({ data: rows, columns, withSorting: true, withPagination: true, enableRowSelection: true, state: { pagination, rowSelection }, onPaginationChange: setPagination, onRowSelectionChange: setRowSelection, getRowId: (x) => x.page, initialState: { sorting: [{ id: "views", desc: true }] } });
  const ticked = table.getSelectedRowModel().rows.map((r) => r.original);
  useHandOffSource("visit-pages", projectId ? { count: ticked.length, noun: $t("个页面已选"), playbookId: "optimize-page", page: ticked.length === 1 ? toUrl(ticked[0].page) : undefined, description: $t("勾选的页面合成一个任务，确认后立即开始。"), draft: () => visitPagesDraft(ticked.map((r) => ({ page: toUrl(r.page), views: r.views, conversions: r.conversions, share: pct(r.share), queries: r.queries.length })), period), clear: () => setRowSelection({}) } : null);
  return <DataTable table={table} isFiltered={filtered} onClearFilters={onClear} empty={{ title: $t("所选时间内没有页面数据") }} onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,a")) return; onOpen(row.original); }}
    footer={rows.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize as (typeof PAGE_SIZES)[number]} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null} />;
}
