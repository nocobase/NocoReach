// 搜索表现: ported from every-app/open-seo db8bde1 src/client/features/search-performance/ (SearchPerformancePage,
// SearchPerformanceParts, SearchPerformanceColumns, SearchPerformanceTextFilters; MIT). Changes: data from the daily
// sync (nrDataViews:search) instead of live Search Console calls, NocoReach's time range picker, a daily trend chart,
// Chinese copy, CSV export only; no device filter (not wanted). A country is read live from Search Console, since the
// synced rows do not keep countries.
// Selected striking-distance queries can be saved to 关键词.
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Copy, Download, Save, SearchCheck } from "lucide-react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, LoadError, ListSkeleton } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabsTrigger } from "@/components/ui/tabs";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "@/components/seo/data-table";
import { DataTableFilterPanel, DataTableFilterToggle, DataTableTabs, DataTableToolbar } from "@/components/seo/data-table-toolbar";
import { TablePagination } from "@/components/seo/table-pagination";
import { TableBulkActionBar, TableBulkActionButton } from "@/components/seo/table-bulk-action-bar";
import { SortableHeader } from "@/components/seo/sortable-header";
import { StatTile } from "@/components/seo/stat-tile";
import { downloadCsv, normalizeExportValue, type CsvValue } from "@/components/seo/csv";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker, useRange } from "./range-picker";
import { safeLink } from "./analytics";
import { keywordRequest } from "./keyword-api";
import { countryName } from "./countries";
import "./reach-workspace.css";
import "./data-views.css";

type Totals = { clicks: number; impressions: number; ctr: number; position: number };
type Filter = { operator: "contains" | "equals"; expression: string };
type DimensionRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };
type StrikingRow = { query: string; page: string; clicks: number; impressions: number; position: number };
type TrendPoint = { date: string; clicks: number | null; impressions: number | null; previousDate: string; previousClicks: number | null; previousImpressions: number | null };
export type SearchReport = {
  connected: boolean;
  cutoff?: string | null;
  window?: { start: string; end: string; days: number; previousStart: string; previousEnd: string };
  filtered?: boolean;
  complete?: boolean;
  previousComplete?: boolean;
  totals?: Totals;
  previous?: Totals | null;
  trend?: TrendPoint[];
  striking?: StrikingRow[];
  queries?: { rows: DimensionRow[]; total: number };
  pages?: { rows: DimensionRow[]; total: number };
  pairDays?: number;
  country?: string | null;
  countries?: { key: string; clicks: number; impressions: number }[];
  live?: boolean;
  preliminary?: { date: string; clicks: number; impressions: number; position: number }[];
};

const TABS = ["striking", "queries", "pages"] as const;
type Tab = (typeof TABS)[number];
const PAGE_SIZES = [25, 50, 100] as const;
const count = (v: number) => Math.round(v).toLocaleString();
const ctr = (v: number) => `${(v * 100).toFixed(1)}%`;
const position = (v: number) => v.toFixed(1);
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;

function readFilter(params: URLSearchParams, text: string, match: string): Filter | undefined {
  const expression = params.get(text)?.trim();
  return expression ? { operator: params.get(match) === "equals" ? "equals" : "contains", expression } : undefined;
}

export default function SearchPerformancePage() {
  const { project, error: projectError } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t === params.get("tab")) ?? "striking";
  const metric = params.get("metric") === "impressions" ? "impressions" : "clicks";
  const filters = useMemo(() => ({ queryFilter: readFilter(params, "q", "qm"), pageFilter: readFilter(params, "pg", "pm") }), [params]);
  const country = /^[a-z]{3}$/.test(params.get("country") ?? "") ? params.get("country")! : undefined;
  const activeFilters = Number(Boolean(filters.queryFilter)) + Number(Boolean(filters.pageFilter));
  const [showFilters, setShowFilters] = useState(activeFilters > 0);
  const update = (values: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(values)) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  };

  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: report, error } = useFreshData<SearchReport>(
    project && !custom ? `data-view:search:${project.id}:${JSON.stringify([range, filters, country])}` : null,
    () => api.action<SearchReport>("nrDataViews", "search", { method: "POST", body: { projectId: project!.id, ...range, ...filters, ...(country ? { country } : {}) }, unwrap: "data" }),
  );
  const w = report?.window;
  const loadError = projectError || (error ? (error instanceof Error ? error.message : "读取搜索数据失败，请重试。") : "");

  const exportTab = () => {
    if (!report?.connected || !w) return;
    const stamp = `${w.start}至${w.end}`;
    const ok =
      tab === "striking"
        ? downloadCsv(`搜索表现-接近首页-${stamp}`, ["查询", "页面", "曝光", "点击", "排名"], (report.striking ?? []).map((r): CsvValue[] => [r.query, r.page, r.impressions, r.clicks, r.position]))
        : downloadCsv(
            `搜索表现-${tab === "pages" ? "页面" : "查询"}-${stamp}`,
            [tab === "pages" ? "页面" : "查询", "点击", "曝光", "点击率", "排名"],
            ((tab === "pages" ? report.pages : report.queries)?.rows ?? []).map((r): CsvValue[] => [r.key, r.clicks, r.impressions, r.ctr, r.position]),
          );
    if (!ok) toast.error("没有可以导出的数据");
  };

  // No nr-page class: its legacy table and input rules are unlayered and would override the ported table.
  return (
    <PageContainer className="nr-data-page">
      <PageHeader title="搜索表现" description="Google 搜索里的点击、曝光、点击率和排名。" />
      <RangePicker value={range} onChange={setRange} summary={w ? `${w.start} 至 ${w.end} · 对比前 ${w.days} 天 · 数据截至 ${report?.cutoff}` : undefined} />
      {loadError ? <LoadError title="搜索数据没有读出来" message={loadError} onRetry={() => window.location.reload()} /> : null}
      {!report && !loadError ? <ListSkeleton rows={6} /> : null}
      {report && !report.connected ? (
        <EmptyState
          icon={<SearchCheck />}
          title="接入 Search Console 后，这里显示搜索点击、曝光和排名"
          description="授权只读取数据，每天自动同步一次。"
          action={<Button onClick={() => navigate("/connections?source=gsc")}>接入 Search Console</Button>}
        />
      ) : null}
      {report?.connected && !report.cutoff ? <EmptyState icon={<SearchCheck />} title="Search Console 已接入" description="第一次同步完成后，这里会显示数据。" /> : null}
      {report?.connected && report.cutoff && report.totals && w ? (
        <>
          <TotalsCards report={report} />
          <TrendCard report={report} metric={metric} onMetric={(m) => update({ metric: m === "clicks" ? undefined : m })} />
          <Card className="gap-0 py-0">
            <DataTableTabs
              value={tab}
              onValueChange={(v) => update({ tab: v === "striking" ? undefined : v })}
              actions={
                <Button variant="outline" size="sm" onClick={exportTab}>
                  <Download data-icon="inline-start" />
                  导出 CSV
                </Button>
              }
            >
              <TabsTrigger value="striking">接近首页 ({report.striking?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="queries">查询</TabsTrigger>
              <TabsTrigger value="pages">页面</TabsTrigger>
            </DataTableTabs>
            <DataTableToolbar actions={report.countries?.length || country ? <CountrySelect value={country} countries={report.countries ?? []} onChange={(c) => update({ country: c })} /> : undefined}>
              <DataTableFilterToggle open={showFilters} activeCount={activeFilters} onToggle={() => setShowFilters((v) => !v)} />
            </DataTableToolbar>
            {showFilters ? (
              <TextFilters
                // Remount on URL changes (back/forward) so the draft matches.
                key={JSON.stringify(filters)}
                value={filters}
                activeCount={activeFilters}
                onApply={(f) => update({ q: f.queryFilter?.expression, qm: f.queryFilter?.operator === "equals" ? "equals" : undefined, pg: f.pageFilter?.expression, pm: f.pageFilter?.operator === "equals" ? "equals" : undefined })}
              />
            ) : null}
            {tab === "striking" ? (
              <StrikingTable key={JSON.stringify(filters)} rows={report.striking ?? []} isFiltered={activeFilters > 0} onClearFilters={() => update({ q: undefined, qm: undefined, pg: undefined, pm: undefined })} />
            ) : (
              <DimensionTable
                key={tab + JSON.stringify(filters)}
                data={(tab === "pages" ? report.pages : report.queries) ?? { rows: [], total: 0 }}
                keyLabel={tab === "pages" ? "页面" : "查询"}
                isFiltered={activeFilters > 0}
                onClearFilters={() => update({ q: undefined, qm: undefined, pg: undefined, pm: undefined })}
              />
            )}
          </Card>
          <Footnotes report={report} />
        </>
      ) : null}
    </PageContainer>
  );
}

// Countries with clicks in the window, most first; a country chosen from a link stays listed even without clicks.
function CountrySelect({ value, countries, onChange }: { value?: string; countries: { key: string; clicks: number }[]; onChange: (c?: string) => void }) {
  const items = [...countries, ...(value && !countries.some((c) => c.key === value) ? [{ key: value, clicks: 0 }] : [])];
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(!v || v === "all" ? undefined : String(v))}>
      <SelectTrigger size="sm" className="w-44" aria-label="国家">
        <SelectValue>{(v: string) => (v === "all" ? "全部国家" : countryName(v))}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">全部国家</SelectItem>
        {items.map((c) => (
          <SelectItem key={c.key} value={c.key}>
            {countryName(c.key)}
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">{c.clicks.toLocaleString()} 次点击</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TotalsCards({ report }: { report: SearchReport }) {
  const { totals, previous } = report;
  const comparable = report.complete && previous;
  const pct = (cur: number, prev: number) => (comparable && prev > 0 ? { change: (cur - prev) / prev, better: cur >= prev } : null);
  // Position falls as rankings improve, so the change is inverted.
  const rank = comparable && previous.position > 0 && totals!.position > 0 ? { change: previous.position - totals!.position, better: previous.position >= totals!.position, points: true } : null;
  const tiles = [
    { label: "点击", value: count(totals!.clicks), delta: previous && pct(totals!.clicks, previous.clicks) },
    { label: "曝光", value: count(totals!.impressions), delta: previous && pct(totals!.impressions, previous.impressions) },
    { label: "点击率", value: ctr(totals!.ctr), delta: previous && pct(totals!.ctr, previous.ctr) },
    { label: "平均排名", value: totals!.impressions ? position(totals!.position) : "—", delta: rank },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="gap-0 p-4" data-metric={t.label}>
            <StatTile label={t.label} value={t.value} delta={t.delta || null} />
          </Card>
        ))}
      </div>
      {!comparable ? <p className="nr-data-note">{report.complete ? "上一个等长周期的数据不完整，暂不比较变化。" : "所选时间里有些天还没有数据，暂不比较变化；缺的天不算作 0。"}</p> : null}
    </div>
  );
}

function TrendCard({ report, metric, onMetric }: { report: SearchReport; metric: "clicks" | "impressions"; onMetric: (m: "clicks" | "impressions") => void }) {
  const label = metric === "clicks" ? "点击" : "曝光";
  const prevKey = metric === "clicks" ? "previousClicks" : "previousImpressions";
  // 初步 days after the cutoff continue the line dashed (joined at the last final day) and are never summed.
  const fresh = report.preliminary || [];
  const data = fresh.length
    ? [...(report.trend || []).map((p) => (p.date === report.cutoff ? { ...p, fresh: p[metric] } : p)), ...fresh.map((r) => ({ date: r.date, fresh: r[metric], clicks: null, impressions: null }))]
    : report.trend;
  return (
    <Card className="gap-3 px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">每日{label}</h2>
        <div className="nr-range !m-0" role="group" aria-label="趋势指标">
          {(["clicks", "impressions"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={metric === m} onClick={() => onMetric(m)}>
              {m === "clicks" ? "点击" : "曝光"}
            </button>
          ))}
        </div>
      </div>
      <div className="nr-chart-box">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} width={48} />
            <Tooltip labelFormatter={(d, p) => (p?.[0]?.payload?.previousDate ? `${d}（上期 ${p[0].payload.previousDate}）` : `${d}（初步数据）`)} />
            <Area isAnimationActive={false} type="linear" dataKey={metric} name={`本期${label}`} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.1} />
            <Area isAnimationActive={false} type="linear" dataKey={prevKey} name={`上期${label}`} stroke="var(--muted-foreground)" strokeDasharray="5 4" fill="none" />
            {fresh.length ? <Area isAnimationActive={false} type="linear" dataKey="fresh" name={`初步${label}`} stroke="var(--chart-3)" strokeDasharray="2 3" fill="var(--chart-3)" fillOpacity={0.04} connectNulls={false} /> : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="nr-footnote">实线为所选时间，虚线为前一个等长周期；没有数据的日子留空。</p>
      {fresh.length ? <p className="nr-footnote" data-preliminary={fresh.length}>{fresh[0].date.slice(5)}{fresh.length > 1 ? ` 至 ${fresh.at(-1)!.date.slice(5)}` : ""} 是初步数据（点线）：Google 还在更新，不计入合计和对比。</p> : null}
    </Card>
  );
}

function TextFilters({ value, activeCount, onApply }: { value: { queryFilter?: Filter; pageFilter?: Filter }; activeCount: number; onApply: (f: { queryFilter?: Filter; pageFilter?: Filter }) => void }) {
  const [draft, setDraft] = useState({
    q: value.queryFilter?.expression ?? "",
    qm: value.queryFilter?.operator ?? "contains",
    pg: value.pageFilter?.expression ?? "",
    pm: value.pageFilter?.operator ?? "contains",
  });
  const apply = () =>
    onApply({
      queryFilter: draft.q.trim() ? { operator: draft.qm as Filter["operator"], expression: draft.q.trim() } : undefined,
      pageFilter: draft.pg.trim() ? { operator: draft.pm as Filter["operator"], expression: draft.pg.trim() } : undefined,
    });
  const row = (label: string, text: "q" | "pg", match: "qm" | "pm", placeholder: string) => (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="w-10 shrink-0 text-sm text-muted-foreground">{label}</span>
      <Select value={draft[match]} onValueChange={(v) => v && setDraft((d) => ({ ...d, [match]: String(v) }))}>
        <SelectTrigger size="sm" className="w-24" aria-label={`${label}匹配方式`}>
          <SelectValue>{(v: string) => (v === "equals" ? "等于" : "包含")}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="contains">包含</SelectItem>
          <SelectItem value="equals">等于</SelectItem>
        </SelectContent>
      </Select>
      <Input
        className="h-7 min-w-0 flex-1 sm:max-w-sm"
        aria-label={`${label}筛选`}
        placeholder={placeholder}
        value={draft[text]}
        maxLength={4096}
        onChange={(e) => setDraft((d) => ({ ...d, [text]: e.target.value }))}
        onKeyDown={(e) => e.key === "Enter" && apply()}
      />
    </div>
  );
  return (
    <DataTableFilterPanel activeCount={activeCount} onReset={() => onApply({})}>
      <div className="grid gap-2 lg:grid-cols-2">
        {row("查询", "q", "qm", "例如 crm")}
        {row("页面", "pg", "pm", "例如 /docs/")}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={apply}>
          应用筛选
        </Button>
        <span className="text-xs text-muted-foreground">筛选同时作用于上面的指标和趋势。</span>
      </div>
    </DataTableFilterPanel>
  );
}

function PageLink({ url }: { url: string }) {
  const href = safeLink(url);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="block max-w-sm truncate text-primary underline-offset-4 hover:underline" title={url}>
      {url}
    </a>
  ) : (
    <span className="block max-w-sm truncate" title={url}>
      {url}
    </span>
  );
}

const strikingHelper = createColumnHelper<StrikingRow>();
function StrikingTable({ rows, isFiltered, onClearFilters }: { rows: StrikingRow[]; isFiltered: boolean; onClearFilters: () => void }) {
  const anchorRef = useSelectionAnchor();
  const [rowSelection, setRowSelection] = useState({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const columns = useMemo<ColumnDef<StrikingRow>[]>(
    () => [
      makeSelectionColumn<StrikingRow>(anchorRef),
      strikingHelper.accessor("query", { enableSorting: false, header: () => "查询", cell: ({ getValue }) => <span className="block max-w-xs truncate" title={getValue()}>{getValue()}</span> }) as ColumnDef<StrikingRow>,
      strikingHelper.accessor("page", { enableSorting: false, header: () => "页面", cell: ({ getValue }) => <PageLink url={getValue()} /> }) as ColumnDef<StrikingRow>,
      strikingHelper.accessor("impressions", { header: ({ column }) => <SortableHeader column={column} label="曝光" align="right" />, cell: ({ getValue }) => count(getValue()), meta: right }) as ColumnDef<StrikingRow>,
      strikingHelper.accessor("clicks", { header: ({ column }) => <SortableHeader column={column} label="点击" align="right" />, cell: ({ getValue }) => count(getValue()), meta: right }) as ColumnDef<StrikingRow>,
      strikingHelper.accessor("position", { header: ({ column }) => <SortableHeader column={column} label="排名" align="right" />, cell: ({ getValue }) => position(getValue()), meta: right }) as ColumnDef<StrikingRow>,
    ],
    [anchorRef],
  );
  const table = useDataTable({
    data: rows,
    columns,
    withSorting: true,
    withPagination: true,
    enableRowSelection: true,
    state: { rowSelection, pagination },
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    // Each query appears once (collapsed to its best page).
    getRowId: (row) => row.query,
    initialState: { sorting: [{ id: "impressions", desc: true }] },
  });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original.query);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(selected.map((q) => normalizeExportValue(q)).join("\n"));
      toast.success(`已复制 ${selected.length} 个关键词`);
    } catch {
      toast.error("没能复制到剪贴板");
    }
  };
  // Saved without a market estimate; 关键词 shows them with their 本站排名.
  const save = async () => {
    try {
      const r = await keywordRequest<{ saved: number; skipped: number }>("saveQueries", { keywords: selected });
      toast.success(`已保存 ${r.saved} 个关键词${r.skipped ? `，${r.skipped} 个之前已保存` : ""}`);
      setRowSelection({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "没有保存成功");
    }
  };
  return (
    <>
      <p className="px-4 pt-3 text-sm text-muted-foreground">排名在 5–20 位的查询（取排得最好的页面），按曝光排序。改进对应页面，最有希望进入前几名。</p>
      <DataTable
        table={table}
        isFiltered={isFiltered}
        onClearFilters={onClearFilters}
        empty={{ title: "没有接近首页的查询", description: "排名在 5–20 位的查询会出现在这里。" }}
        footer={
          rows.length > 0 ? (
            <TablePagination
              page={pagination.pageIndex + 1}
              pageSize={pagination.pageSize}
              pageSizes={PAGE_SIZES}
              totalCount={rows.length}
              onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))}
              onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })}
            />
          ) : null
        }
      />
      <TableBulkActionBar
        selectedCount={selected.length}
        selectedLabel="个查询已选"
        onClear={() => setRowSelection({})}
        actions={
          <>
            <TableBulkActionButton icon={<Save className="size-3.5" />} onClick={() => void save()}>
              保存为关键词
            </TableBulkActionButton>
            <TableBulkActionButton icon={<Copy className="size-3.5" />} onClick={() => void copy()}>
              复制关键词
            </TableBulkActionButton>
          </>
        }
      />
    </>
  );
}

const dimensionHelper = createColumnHelper<DimensionRow>();
function DimensionTable({ data, keyLabel, isFiltered, onClearFilters }: { data: { rows: DimensionRow[]; total: number }; keyLabel: string; isFiltered: boolean; onClearFilters: () => void }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const columns = useMemo<ColumnDef<DimensionRow>[]>(
    () => [
      dimensionHelper.accessor("key", {
        enableSorting: false,
        header: () => keyLabel,
        cell: ({ getValue }) => (keyLabel === "页面" ? <PageLink url={getValue()} /> : <span className="block max-w-xl truncate" title={getValue()}>{getValue()}</span>),
      }) as ColumnDef<DimensionRow>,
      dimensionHelper.accessor("clicks", { header: ({ column }) => <SortableHeader column={column} label="点击" align="right" />, cell: ({ getValue }) => count(getValue()), meta: right }) as ColumnDef<DimensionRow>,
      dimensionHelper.accessor("impressions", { header: ({ column }) => <SortableHeader column={column} label="曝光" align="right" />, cell: ({ getValue }) => count(getValue()), meta: right }) as ColumnDef<DimensionRow>,
      dimensionHelper.accessor("ctr", { header: ({ column }) => <SortableHeader column={column} label="点击率" align="right" />, cell: ({ getValue }) => ctr(getValue()), meta: right }) as ColumnDef<DimensionRow>,
      dimensionHelper.accessor("position", { header: ({ column }) => <SortableHeader column={column} label="排名" align="right" />, cell: ({ getValue }) => position(getValue()), meta: right }) as ColumnDef<DimensionRow>,
    ],
    [keyLabel],
  );
  const table = useDataTable({
    data: data.rows,
    columns,
    withSorting: true,
    withPagination: true,
    state: { pagination },
    onPaginationChange: setPagination,
    initialState: { sorting: [{ id: "clicks", desc: true }] },
  });
  return (
    <>
      {data.total > data.rows.length ? (
        <p className="px-4 pt-3 text-sm text-muted-foreground">
          共 {data.total.toLocaleString()} 个{keyLabel}，这里列出点击最多的 {data.rows.length.toLocaleString()} 个。
        </p>
      ) : null}
      <DataTable
        table={table}
        isFiltered={isFiltered}
        onClearFilters={onClearFilters}
        empty={{ title: "所选时间里还没有 Search Console 数据", description: "Google 的数据通常晚 2–3 天出现。" }}
        footer={
          data.rows.length > 0 ? (
            <TablePagination
              page={pagination.pageIndex + 1}
              pageSize={pagination.pageSize}
              pageSizes={PAGE_SIZES}
              totalCount={data.rows.length}
              onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))}
              onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })}
            />
          ) : null
        }
      />
    </>
  );
}

function Footnotes({ report }: { report: SearchReport }) {
  const w = report.window!;
  return (
    <div className="space-y-1">
      {report.pairDays !== undefined && report.pairDays < w.days ? <p className="nr-data-note">查询和页面明细只有所选时间里的 {report.pairDays} 天，表格按这些天统计。</p> : null}
      {report.country ? <p className="nr-footnote">只看{countryName(report.country)}：直接从 Search Console 读取（时间范围和上面一样），表格不含 Google 匿名处理的查询。</p> : report.filtered ? <p className="nr-footnote">筛选后的指标按查询明细汇总，不含 Google 匿名处理的查询，所以比不筛选时少。</p> : null}
      <p className="nr-footnote">数据来自每天同步的 Search Console（网页搜索），截至 {report.cutoff}。点击率和平均排名按曝光加权。</p>
    </div>
  );
}
