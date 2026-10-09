import { $t, $tj } from "@/i18n";
// 页面 (网站与产品): every page 网站内容 lists, with visits and search for the chosen period and the tasks working on it;
// a row opens its details (chart, tasks, 交给 Agent). Same table, tabs and toolbar as the other data pages (2026-10-04).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@/lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Files, Search } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsTrigger } from "@/components/ui/tabs";
import { DataTable, useDataTable } from "@/components/seo/data-table";
import { DataTableTabs, DataTableToolbar } from "@/components/seo/data-table-toolbar";
import { TablePagination } from "@/components/seo/table-pagination";
import { SortableHeader } from "@/components/seo/sortable-header";
import { taskRecords, useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { typeLabels, type SiteSummary } from "./site-content-connect";
import { RangePicker, useRange, ranges } from "./range-picker";
import { ContentDetail, activeTasks, tasksForPage, type ContentTask } from "./content-detail";
import "./data-views.css";
export type ContentEntry = { id: string; title: string; url: string; repository: string; paths: string[]; revision: number };

type SitePage = { url: string; type: string; lastmod?: string | null; title?: string; words?: number; internalLinks?: number; fetchError?: string; views: number | null; clicks: number | null; impressions: number | null };
type SiteList = { range?: string; cutoff?: string | null; pages: SitePage[]; summary: SiteSummary; limitations?: string[] };
type Row = SitePage & { path: string; tasks: ContentTask[] };
const CONTENT_RANGES = ["7", "28", "90", "3m", "12m"];
const PAGE_SIZES = [25, 50, 100] as const;
const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString());
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
const helper = createColumnHelper<Row>();
// Missing numbers sort below any number.
const nullsLast = (a: number | null, b: number | null) => (a ?? -1) - (b ?? -1);

export default function ContentPage() {
  const { project, error: projectError } = useProject();
  const navigate = useNavigate();
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [rangeValue, setRange] = useRange();
  const range = CONTENT_RANGES.includes(rangeValue.range) ? rangeValue.range : "28";
  const rangeLabel = ranges.find(([k]) => k === range)?.[1] || $t("近 28 天");
  // Page-level metrics are pre-aggregated per period, so custom dates are not offered here.
  const { data, error: loadError } = useFreshData(project ? `site-list:${project.id}:${range}` : null, () => api.action<SiteList>("nrSiteContent", "list", { method: "POST", body: { projectId: project!.id, range }, unwrap: "data" }));
  const tasks = useFreshData<ContentTask[]>(project ? `content-tasks:${project.id}` : null, () => taskRecords<ContentTask>(project!.id)).data || [];
  const [detail, setDetail] = useState<SitePage>();
  const rows = useMemo<Row[]>(() => (data?.pages || [])
    .filter((p) => (type === "all" || p.type === type) && (!query || `${p.title || ""} ${p.url}`.toLowerCase().includes(query.toLowerCase())))
    .map((p) => ({ ...p, path: pathOf(p.url), tasks: activeTasks(tasksForPage(tasks, p.url)) })), [data, type, query, tasks]);
  // The visits and search columns come from a sample (the top pages and queries); their ⓘ says so.
  const sampleHelp = (what: string) => <><p>{what}</p>{data?.limitations?.map((l) => <p key={l} className="mt-1">{l}</p>)}</>;
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    helper.accessor("title", {
      enableSorting: false,
      header: () => $t("页面"),
      cell: ({ row }) => (
        <div className="min-w-0 max-w-md">
          <button type="button" className="block max-w-full truncate text-left text-primary underline-offset-4 hover:underline" title={row.original.url} onClick={() => setDetail(row.original)}>{row.original.title || row.original.path}</button>
          {row.original.title ? <span className="block truncate text-xs text-muted-foreground">{row.original.path}</span> : null}
        </div>
      ),
    }) as ColumnDef<Row>,
    helper.accessor("type", { enableSorting: false, header: () => $t("类型"), cell: ({ getValue }) => typeLabels[getValue()] || getValue() }) as ColumnDef<Row>,
    helper.accessor((r) => r.lastmod || "", { id: "lastmod", header: ({ column }) => <SortableHeader column={column} label={$t("更新时间")} />, cell: ({ getValue }) => <span className="tabular-nums">{String(getValue()).slice(0, 10) || "—"}</span> }) as ColumnDef<Row>,
    helper.accessor("views", { sortingFn: (a, b) => nullsLast(a.original.views, b.original.views), header: ({ column }) => <SortableHeader column={column} label={$t("访问（{0}）",{0:rangeLabel})} align="right" help={sampleHelp($t("页面在所选时间里的浏览量（GA4）。"))} />, cell: ({ getValue }) => fmt(getValue()), meta: right }) as ColumnDef<Row>,
    helper.accessor("clicks", { sortingFn: (a, b) => nullsLast(a.original.clicks, b.original.clicks), header: ({ column }) => <SortableHeader column={column} label={$t("搜索点击")} align="right" help={sampleHelp($t("页面在所选时间里从 Google 搜索得到的点击（Search Console）。"))} />, cell: ({ getValue }) => fmt(getValue()), meta: right }) as ColumnDef<Row>,
    helper.accessor("impressions", { sortingFn: (a, b) => nullsLast(a.original.impressions, b.original.impressions), header: ({ column }) => <SortableHeader column={column} label={$t("搜索曝光")} align="right" help={sampleHelp($t("页面在所选时间里出现在 Google 搜索结果的次数（Search Console）。"))} />, cell: ({ getValue }) => fmt(getValue()), meta: right }) as ColumnDef<Row>,
    helper.accessor("tasks", {
      enableSorting: false,
      header: () => $t("进行中的任务"),
      cell: ({ row }) => {
        const active = row.original.tasks;
        return active.length ? <button type="button" className="max-w-48 truncate text-left text-primary underline-offset-4 hover:underline" onClick={() => setDetail(row.original)}>{active[0].evidence?.no ? `T-${active[0].evidence.no} ` : ""}{active[0].title.slice(0, 16)}{active.length > 1 ? $t(" 等 {0} 个",{0:active.length}) : ""}</button> : <span className="text-muted-foreground">—</span>;
      },
    }) as ColumnDef<Row>,
  ], [rangeLabel, data?.limitations]);
  const table = useDataTable({
    data: rows,
    columns,
    withSorting: true,
    withPagination: true,
    state: { pagination },
    onPaginationChange: setPagination,
    getRowId: (r) => r.url,
    initialState: { sorting: [{ id: "views", desc: true }] },
  });
  const types = Object.keys(data?.summary.types || {});
  const choose = (next: { type?: string; query?: string }) => { if (next.type !== undefined) setType(next.type); if (next.query !== undefined) setQuery(next.query); setPagination((p) => ({ ...p, pageIndex: 0 })); };

  return (
    <PageContainer className="nr-data-page">
      <PageHeader title={$t("页面")} description={data?.summary.pages ? $t("{0} · {1} 页 · 已读取详情 {2} 页",{0:data.summary.origin,1:data.summary.pages,2:data.summary.enriched || 0}) : $t("网站内容数据源列出的全部页面。")} />
      <RangePicker value={{ range }} onChange={setRange} options={CONTENT_RANGES} summary={data?.cutoff ? $t("页面数据截至 {0}",{0:data.cutoff}) : undefined} />
      {projectError || loadError ? <LoadError title={$t("网站内容没有读出来")} message={projectError || $t("读取网站内容失败，请重试。")} /> : null}
      {!data && !loadError ? <ListSkeleton rows={6} /> : null}
      {data && !data.summary.pages ? <EmptyState icon={<Files />} title={$t("接入网站内容后，这里会自动列出全部页面")} description={$t("把官网地址交给 AI，它会读取 sitemap、识别博客与文档，并关联访问和搜索数据。不需要手动添加。")} action={<Button onClick={() => navigate("/connections?source=site")}>{$t("接入网站内容")}</Button>} /> : null}
      {data && data.summary.pages > 0 ? (
        <>
          <Card className="gap-0 py-0">
            <DataTableTabs value={type} onValueChange={(v) => choose({ type: v })}>
              <TabsTrigger value="all">{$tj("全部 ({0})",{0:data.summary.pages})}</TabsTrigger>
              {types.map((t) => <TabsTrigger key={t} value={t}>{typeLabels[t] || t} ({data.summary.types?.[t]})</TabsTrigger>)}
            </DataTableTabs>
            <DataTableToolbar>
              <label className="relative flex items-center"><Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" /><Input aria-label={$t("搜索页面")} className="h-8 w-64 pl-8" placeholder={$t("搜索标题或网址")} value={query} onChange={(e) => choose({ query: e.target.value })} /></label>
            </DataTableToolbar>
            <DataTable
              table={table}
              isFiltered={Boolean(query) || type !== "all"}
              onClearFilters={() => choose({ type: "all", query: "" })}
              empty={{ title: $t("没有页面") }}
              onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,a")) return; setDetail(row.original); }}
              footer={rows.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize as (typeof PAGE_SIZES)[number]} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null}
            />
          </Card>
        </>
      ) : null}
      {detail && project ? <ContentDetail projectId={project.id} page={detail} tasks={tasks} range={range} rangeLabel={rangeLabel} onClose={() => setDetail(undefined)} /> : null}
    </PageContainer>
  );
}
