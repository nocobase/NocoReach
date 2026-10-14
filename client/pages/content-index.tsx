import { getCurrentLocale, $t, $tj } from "#i18n";
// 页面 (网站与产品): every page 网站内容 lists, with visits and search for the chosen period and the tasks working on it;
// a row opens its details (chart, tasks, 交给 Agent). Same table, tabs and toolbar as the other data pages (2026-10-04).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Files, Search } from "lucide-react";
import { PageContainer, PageHeader } from "#components/reach/page";
import { InfoTip } from '#components/reach/info-tip';
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { TabsTrigger } from "#components/ui/tabs";
import { DataTable, useDataTable } from "#components/seo/data-table";
import { DataTableTabs, DataTableToolbar } from "#components/seo/data-table-toolbar";
import { TablePagination } from "#components/seo/table-pagination";
import { SortableHeader } from "#components/seo/sortable-header";
import { taskRecords, useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { getTypeLabels, type SiteSummary } from "./site-content-connect";
import { RangePicker, useRange, getRanges } from "./range-picker";
import { ContentDetail, activeTasks, tasksForPage, type ContentTask } from "./content-detail";
import "./data-views.css";
export type ContentEntry = { id: string; title: string; url: string; repository: string; paths: string[]; revision: number };

type SitePage = { url: string; type: string; outsideSitemap?: boolean; lastmod?: string | null; title?: string; words?: number; internalLinks?: number; fetchError?: string; views: number | null; clicks: number | null; impressions: number | null };
type SiteList = { range?: string; cutoff?: string | null; pages: SitePage[]; summary: SiteSummary; limitations?: string[] };
type Row = SitePage & { path: string; tasks: ContentTask[] };
const CONTENT_RANGES = ["7", "28", "90", "3m", "12m"];
const PAGE_SIZES = [25, 50, 100] as const;
const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString(getCurrentLocale()));
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
const helper = createColumnHelper<Row>();
// The four sortable columns go newest or largest first on the first click and then only flip (no unsorted third state);
// a page without a date or a number stays at the bottom either way (2026-10-14 user report).
const sortable = { sortDescFirst: true, sortUndefined: "last" } as const;

export default function ContentPage() {
  const { project, error: projectError } = useProject();
  const navigate = useNavigate();
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [rangeValue, setRange] = useRange();
  const range = CONTENT_RANGES.includes(rangeValue.range) ? rangeValue.range : "28";
  const rangeLabel = getRanges().find(([k]) => k === range)?.[1] || $t('common.last28Days');
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
      header: () => $t('common.page'),
      cell: ({ row }) => (
        <div className="min-w-0 max-w-md">
          <button type="button" className="block max-w-full truncate text-left text-primary underline-offset-4 hover:underline" title={row.original.url} onClick={() => setDetail(row.original)}>{row.original.title || row.original.path}</button>
          {row.original.title ? <span className="block truncate text-xs text-muted-foreground">{row.original.path}</span> : null}
          {row.original.outsideSitemap ? <span className='mt-0.5 inline-flex items-center gap-1 text-xs text-nr-ink-amber' data-outside-sitemap=''>{$t('contentIndex.outsideSitemap')}<InfoTip label={$t('contentIndex.outsideSitemap')}>{$t('contentIndex.outsideSitemapHelp')}</InfoTip></span> : null}
        </div>
      ),
    }) as ColumnDef<Row>,
    helper.accessor("type", { enableSorting: false, header: () => $t('common.type'), cell: ({ getValue }) => getTypeLabels()[getValue()] || getValue() }) as ColumnDef<Row>,
    helper.accessor((r) => r.lastmod?.slice(0, 10) || undefined, { id: "lastmod", ...sortable, header: ({ column }) => <SortableHeader column={column} label={$t('contentIndex.updated')} />, cell: ({ getValue }) => <span className="tabular-nums">{getValue() || "—"}</span> }) as ColumnDef<Row>,
    helper.accessor((r) => r.views ?? undefined, { id: "views", ...sortable, header: ({ column }) => <SortableHeader column={column} label={$t('contentIndex.traffic',{0:rangeLabel})} align="right" help={sampleHelp($t('contentIndex.pageViewsSelectedPeriodGa'))} />, cell: ({ getValue }) => fmt(getValue() ?? null), meta: right }) as ColumnDef<Row>,
    helper.accessor((r) => r.clicks ?? undefined, { id: "clicks", ...sortable, header: ({ column }) => <SortableHeader column={column} label={$t('common.searchClicks')} align="right" help={sampleHelp($t('contentIndex.clicksPageGotGoogleSearch'))} />, cell: ({ getValue }) => fmt(getValue() ?? null), meta: right }) as ColumnDef<Row>,
    helper.accessor((r) => r.impressions ?? undefined, { id: "impressions", ...sortable, header: ({ column }) => <SortableHeader column={column} label={$t('common.searchImpressions')} align="right" help={sampleHelp($t('contentIndex.timesPageAppearedGoogleSearch'))} />, cell: ({ getValue }) => fmt(getValue() ?? null), meta: right }) as ColumnDef<Row>,
    helper.accessor("tasks", {
      enableSorting: false,
      header: () => $t('contentIndex.tasksProgress'),
      cell: ({ row }) => {
        const active = row.original.tasks;
        return active.length ? <button type="button" className="max-w-48 truncate text-left text-primary underline-offset-4 hover:underline" onClick={() => setDetail(row.original)}>{active[0].evidence?.no ? `T-${active[0].evidence.no} ` : ""}{active[0].title.slice(0, 16)}{active.length > 1 ? $t('common.moreSuffixValue',{0:active.length}) : ""}</button> : <span className="text-muted-foreground">—</span>;
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
    enableSortingRemoval: false,
    initialState: { sorting: [{ id: "views", desc: true }] },
  });
  const types = Object.keys(data?.summary.types || {});
  const choose = (next: { type?: string; query?: string }) => { if (next.type !== undefined) setType(next.type); if (next.query !== undefined) setQuery(next.query); setPagination((p) => ({ ...p, pageIndex: 0 })); };

  return (
    <PageContainer className="nr-data-page">
      <PageHeader title={$t('common.page')} description={data?.summary.pages ? $t('contentIndex.pagesDetailsReadPages',{0:data.summary.origin,1:data.summary.pages,2:data.summary.enriched || 0}) : $t('contentIndex.pagesListedWebsiteContentSource')} />
      <RangePicker value={{ range }} onChange={setRange} options={CONTENT_RANGES} summary={data?.cutoff ? $t('contentIndex.pageDataThrough',{0:data.cutoff}) : undefined} />
      {projectError || loadError ? <LoadError title={$t('contentIndex.notLoadWebsiteContent')} message={projectError || $t('contentIndex.notLoadWebsiteContentTry')} /> : null}
      {!data && !loadError ? <ListSkeleton rows={6} /> : null}
      {data && !data.summary.pages ? <EmptyState icon={<Files />} title={$t('contentIndex.onceWebsiteContentConnectedPages')} description={$t('contentIndex.giveAiWebsiteAddressReads')} action={<Button onClick={() => navigate("/connections?source=site")}>{$t('common.connectWebsiteContent')}</Button>} /> : null}
      {data && data.summary.pages > 0 ? (
        <>
          <Card className="gap-0 py-0">
            <DataTableTabs value={type} onValueChange={(v) => choose({ type: v })}>
              <TabsTrigger value="all">{$tj('common.allCount',{0:data.summary.pages})}</TabsTrigger>
              {types.map((t) => <TabsTrigger key={t} value={t}>{getTypeLabels()[t] || t} ({data.summary.types?.[t]})</TabsTrigger>)}
            </DataTableTabs>
            <DataTableToolbar>
              <label className="relative flex items-center"><Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" /><Input aria-label={$t('common.searchPages')} className="h-8 w-64 pl-8" placeholder={$t('contentIndex.searchTitleUrl')} value={query} onChange={(e) => choose({ query: e.target.value })} /></label>
            </DataTableToolbar>
            <DataTable
              table={table}
              isFiltered={Boolean(query) || type !== "all"}
              onClearFilters={() => choose({ type: "all", query: "" })}
              empty={{ title: $t('contentIndex.noPages') }}
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
