import { googleLocalFreshness, googleCacheExpiry } from '../../../shared/google-cache.js';
import { $t, $tj, $legacyText } from "#i18n";
import { usePageTab } from '#hooks/use-page-tab';
// 搜索表现: ported from every-app/open-seo db8bde1 src/client/features/search-performance/ (SearchPerformancePage,
// SearchPerformanceParts, SearchPerformanceColumns, SearchPerformanceTextFilters; MIT). Changes: data from the daily
// sync (nrDataViews:search) instead of live Search Console calls, NocoReach's time range picker, a daily trend chart,
// Chinese copy, CSV export only; no device filter (not wanted). A country is read live from Search Console, since the
// synced rows do not keep countries.
// Beyond the totals (more.tsx): the four figures picking the daily line, the country, device and search appearance
// breakdowns, Rising, Falling and New, and a query's or page's detail. Web search only; Search Console itself has the
// other search types (2026-10-22 user decision).
// Selected striking-distance queries can be saved to 关键词.
// Sub-pages (?view=, as on GitHub): 效果 (this report), 索引 (indexing.tsx) and 站点地图 (sitemaps.tsx).
import { HandOffBar } from "../hand-off-bar";
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Copy, Download, Save, SearchCheck } from "lucide-react";
import { toast } from "#lib/toast";
import { cn } from "#lib/utils";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, LoadError, ListSkeleton } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "#components/ui/tabs";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableFilterPanel, DataTableFilterToggle, DataTableTabs, DataTableToolbar } from "#components/seo/data-table-toolbar";
import { TablePagination } from "#components/seo/table-pagination";
import { TableBulkActionButton } from "#components/seo/table-bulk-action-bar";
import { SortableHeader } from "#components/seo/sortable-header";
import { StatTile } from "#components/seo/stat-tile";
import { InfoTip, NotesTip } from "#components/reach/info-tip";
import { help } from "../glossary";
import { downloadCsv, normalizeExportValue, type CsvValue } from "#components/seo/csv";
import { useProject } from "../reach-data";
import { useFreshData } from "../workspace-cache";
import { SearchHistory, coverageNotes, type CoveragePeriod } from './history';
import { RangePicker } from '../range-picker';
import { validRange, useRange } from '../range-state';
import { safeLink } from "../analytics";
import { keywordRequest, rankRequest } from "../keyword-api";
import { DraftHandOffDialog, type TaskDraft } from "../keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "../strategy/hand-off";
import { queryDraft, pageDraft, mainPage, type Period } from "../seo-hand-off";
import { countryName } from "../countries";
import { IndexingView } from "./indexing";
import { SitemapsView } from "./sitemaps";
import { BreakdownCards, METRIC_LABEL, MoversTable, RowDrawer, Segmented, SliceTable, showMetric, slices, useBreakdown, type Metric, type MoverRow, type Movers, type Scope } from "./more";
import "../reach-workspace.css";
import "../data-views.css";
import { formatCount, formatDate, formatPercent } from '#lib/format';

type Totals = { clicks: number; impressions: number; ctr: number; position: number };
type Filter = { operator: "contains" | "equals"; expression: string };
type DimensionRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };
type StrikingRow = { query: string; page: string; clicks: number; impressions: number; position: number };
type TrendPoint = { date: string; clicks: number | null; impressions: number | null; ctr?: number | null; position?: number | null; previousDate: string; previousClicks: number | null; previousImpressions: number | null; previousCtr?: number | null; previousPosition?: number | null };
export type SearchReport = {
  connected: boolean;
  coverage?: { earliest?: string; current: CoveragePeriod; previous: CoveragePeriod | null };
  history?: { jobs: { id: string; status: string; startDate: string; endDate: string }[]; scheduleEnabled: boolean };
  cutoff?: string | null;
  window?: { all?: boolean; start: string; end: string; days: number; previousStart: string; previousEnd: string };
  filtered?: boolean;
  complete?: boolean;
  previousComplete?: boolean;
  totals?: Totals;
  previous?: Totals | null;
  trend?: TrendPoint[];
  striking?: StrikingRow[];
  queries?: { rows: DimensionRow[]; total: number } | null;
  pages?: { rows: DimensionRow[]; total: number };
  movers?: { query: Movers | null; page: Movers } | null;
  pairDays?: number;
  country?: string | null;
  live?: boolean;
  preliminary?: { date: string; clicks: number; impressions: number; position: number }[];
};

const VIEWS = ["performance", "index", "sitemaps"] as const;
type View = (typeof VIEWS)[number];
const TABS = ["striking", "queries", "pages", "rising", "falling", "fresh", "slices"] as const;
type Tab = (typeof TABS)[number];
const MOVER_TABS = ["rising", "falling", "fresh"] as const;
const METRICS: Metric[] = ["clicks", "impressions", "ctr", "position"];
const SLICES = ["country", "device", "appearance", "date"] as const;
const PAGE_SIZES = [25, 50, 100] as const;
const count = (v: number) => formatCount(Math.round(v));
const ctr = (v: number) => formatPercent(v);
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
  const view: View = VIEWS.find((v) => v === params.get("view")) ?? "performance";
  usePageTab($t(view === 'index' ? 'searchPerformance.viewIndex' : view === 'sitemaps' ? 'searchPerformance.viewSitemaps' : 'searchPerformance.viewPerformance'));
  // A sub-page keeps only the time range; each one's own choices start over.
  const chooseView = (v: string) => {
    const next = new URLSearchParams();
    for (const k of ["days", "from", "to"]) if (params.get(k)) next.set(k, params.get(k)!);
    if (v !== "performance") next.set("view", v);
    setParams(next, { replace: true });
  };
  const tab: Tab = TABS.find((t) => t === params.get("tab")) ?? "striking";
  const metric: Metric = METRICS.find((m) => m === params.get("metric")) ?? "clicks";
  const by: "query" | "page" = params.get("by") === "page" ? "page" : "query";
  const slice = SLICES.find((x) => x === params.get("slice")) ?? "country";
  const filters = useMemo(() => ({ queryFilter: readFilter(params, "q", "qm"), pageFilter: readFilter(params, "pg", "pm") }), [params]);
  const country = /^[a-z]{3}$/.test(params.get("country") ?? "") ? params.get("country")! : undefined;
  const activeFilters = Number(Boolean(filters.queryFilter)) + Number(Boolean(filters.pageFilter));
  const [showFilters, setShowFilters] = useState(activeFilters > 0);
  const [open, setOpen] = useState<{ dimension: "query" | "page"; key: string; figures?: { clicks: number; impressions: number; ctr: number; position: number | null } } | null>(null);
  const update = (values: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(values)) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  };

  const custom = !validRange(range);
  const { data: report, error, reload } = useFreshData<SearchReport>(
    project && !custom && view === 'performance' ? `data-view:search:v4:${project.id}:${JSON.stringify([project.searchConsoleProperty, range, filters, country])}` : null,
    () => api.action<SearchReport>("nrDataViews", "search", { method: "POST", body: { projectId: project!.id, ...range, ...filters, ...(country ? { country } : {}) }, unwrap: "data" }),
    { ...googleLocalFreshness, expiresAt: googleCacheExpiry },
  );
  // The query, page and breakdown details load with the page (UI review 2026-10-21) instead of behind a button; they are
  // still their own request, so the figures and chart show first.
  const selectedDetailsKey = JSON.stringify([project?.id, project?.searchConsoleProperty, range, filters, country]);
  const showDetails = true;
  const { data: details, error: detailsError } = useFreshData<SearchReport>(
    project && !custom && view === 'performance' && showDetails ? `data-view:search-details:${selectedDetailsKey}` : null,
    () => api.action<SearchReport>('nrDataViews', 'search', { method: 'POST', body: { projectId: project!.id, ...range, ...filters, country, details: true }, unwrap: 'data' }),
    { ...googleLocalFreshness, expiresAt: googleCacheExpiry },
  );
  const tableReport = showDetails ? details : undefined;
  const w = report?.window;
  // 国家/地区, 设备 and 搜索结果呈现 come on their own (live Search Console queries), so the report never waits for them;
  // the countries also fill the country menu.
  const scope: Scope | null = project && !custom && view === 'performance' && showDetails && w && report?.cutoff ? { projectId: project.id, property: project.searchConsoleProperty, compare: Boolean(report.complete && report.previousComplete), window: { all: w.all, start: w.start, end: w.end, previousStart: w.previousStart, previousEnd: w.previousEnd }, country, filters } : null;
  const { data: breakdown, error: breakdownError } = useBreakdown(scope);
  const countries = (breakdown?.countries ?? []).map((c) => ({ key: c.key, clicks: c.clicks }));
  const loadError = projectError || (error ? (error instanceof Error ? error.message : $t('searchPerformance.notLoadSearchDataTry')) : "");
  const openRow = useCallback((dimension: "query" | "page", key: string, figures?: { clicks: number; impressions: number; ctr: number; position: number | null }) => setOpen({ dimension, key, figures }), []);
  const moverRows = report?.complete && report.previousComplete && tableReport?.movers ? (by === "page" ? tableReport.movers.page : tableReport.movers.query)?.[tab === "falling" ? "falling" : tab === "fresh" ? "fresh" : "rising"] ?? [] : [];
  const sliceRows = slice === "date"
    ? (report?.trend ?? []).map((p) => ({ key: p.date, name: p.date, clicks: p.clicks, impressions: p.impressions, ctr: p.ctr ?? null, position: p.position ?? null, previousClicks: p.previousClicks }))
    : slices(slice, slice === "country" ? breakdown?.countries : slice === "device" ? breakdown?.devices : breakdown?.appearances);
  const sliceLabel = { country: $t('searchPerformance.countryRegion'), device: $t('searchPerformance.device'), appearance: $t('searchPerformance.appearance'), date: $t('searchPerformance.date') }[slice];

  const exportTab = () => {
    if (!report?.connected || !w) return;
    const stamp = $t('searchPerformance.dateRange',{0:formatDate(w.start),1:formatDate(w.end)});
    const metricsHead = [$t('common.clicks'), $t('common.impressions'), $t('common.ctr'), $t('common.position')];
    const ok =
      tab === "striking"
        ? downloadCsv($t('searchPerformance.searchPerformanceClosePageOne',{0:stamp}), [$t('common.query'), $t('common.page'), $t('common.impressions'), $t('common.clicks'), $t('common.position')], (tableReport?.striking ?? []).map((r): CsvValue[] => [r.query, r.page, r.impressions, r.clicks, r.position]))
        : tab === "slices"
          ? downloadCsv($t('searchPerformance.searchPerformance',{0:sliceLabel,1:stamp}), [sliceLabel, ...metricsHead], sliceRows.map((r): CsvValue[] => [r.name, r.clicks, r.impressions, r.ctr, r.position]))
          : (MOVER_TABS as readonly string[]).includes(tab)
            ? downloadCsv($t('searchPerformance.searchPerformance',{0:by === "page" ? $t('common.page') : $t('common.query'),1:stamp}), [by === "page" ? $t('common.page') : $t('common.query'), $t('common.clicks'), $t('searchPerformance.previousClicks'), $t('common.impressions'), $t('searchPerformance.previousImpressions'), $t('common.position')], moverRows.map((r): CsvValue[] => [r.key, r.clicks, r.previousClicks, r.impressions, r.previousImpressions, r.position]))
            : downloadCsv(
                $t('searchPerformance.searchPerformance',{0:tab === "pages" ? $t('common.page') : $t('common.query'),1:stamp}),
                [tab === "pages" ? $t('common.page') : $t('common.query'), ...metricsHead],
                ((tab === "pages" ? tableReport?.pages : tableReport?.queries)?.rows ?? []).map((r): CsvValue[] => [r.key, r.clicks, r.impressions, r.ctr, r.position]),
              );
    if (!ok) toast.error(() => ($t('searchPerformance.noDataExport')));
  };
  const handOffMovers = async (rows: MoverRow[]) => {
    if (!project || !w || !rows.length) return;
    const list = rows.map((r) => ({ key: r.key, clicks: r.clicks, impressions: r.impressions, ctr: r.impressions ? r.clicks / r.impressions : 0, position: r.position ?? 0 }));
    if (by === "page") { const p = list.map((r) => ({ page: r.key, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })); setHanding({ draft: pageDraft(p, w), page: p.length === 1 ? p[0].page : undefined }); return; }
    const ranks = await rankRequest(project.id, list.map((r) => r.key)).catch(() => undefined);
    const q = list.map((r) => ({ query: r.key, page: ranks?.ranks?.[r.key.toLowerCase().trim()]?.page ?? null, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
    setHanding({ draft: queryDraft(q, w), page: mainPage(q) });
  };
  const [handing, setHanding] = useState<{ draft: TaskDraft; page?: string }>();

  // No nr-page class: its legacy table and input rules are unlayered and would override the ported table.
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={view === "performance" && report?.totals ? <NotesTip notes={[...notesOf(report), ...coverageNotes(report), ...(w ? [$t('searchHistory.detailsScope', { 0: formatDate(w.start), 1: formatDate(w.end) })] : [])]} /> : undefined} title={$t('common.searchPerformance')} description={view === "index" ? $t('searchIndex.pageDescription') : view === "sitemaps" ? $t('searchSitemaps.pageDescription') : $t('searchPerformance.clicksImpressionsCtrPositionGoogle')} />
      <Tabs value={view} onValueChange={(v) => chooseView(String(v))}>
        <TabsList variant="line" className="h-auto! justify-start">
          <TabsTrigger value="performance">{$t('searchPerformance.viewPerformance')}</TabsTrigger>
          <TabsTrigger value="index">{$t('searchPerformance.viewIndex')}</TabsTrigger>
          <TabsTrigger value="sitemaps">{$t('searchPerformance.viewSitemaps')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === "index" ? (project ? <IndexingView property={project.searchConsoleProperty} projectId={project.id} tab={params.get("list")} reason={params.get("reason")} onPick={(v) => update({ list: v.list, reason: v.reason })} /> : null)
        : view === "sitemaps" ? (project ? <SitemapsView property={project.searchConsoleProperty} projectId={project.id} tab={params.get("list")} onTab={(t) => update({ list: t })} /> : null)
        : <>
      <RangePicker value={range} onChange={setRange} summary={w ? ('all' in w && w.all ? $t('rangePicker.availableRange',{0:formatDate(w.start),1:formatDate(w.end)}) : report?.complete && report.previousComplete ? $t('common.comparedPreviousDaysDataThrough',{0:formatDate(w.start),1:formatDate(w.end),2:w.days,3:formatDate(report?.cutoff)}) : $t('searchHistory.rangeSummary',{0:formatDate(w.start),1:formatDate(w.end),2:formatDate(report?.cutoff)})) : undefined} />
      {loadError ? <LoadError title={$t('searchPerformance.notLoadSearchData')} message={loadError} onRetry={() => window.location.reload()} /> : null}
      {!report && !loadError ? <ListSkeleton rows={6} /> : null}
      {report && !report.connected ? (
        <EmptyState
          icon={<SearchCheck />}
          title={$t('searchPerformance.onceSearchConsoleConnectedSearch')}
          description={$t('common.authorizationReadsDataSyncsAutomatically')}
          action={<Button onClick={() => navigate("/connections?source=gsc")}>{$t('searchPerformance.connectSearchConsole')}</Button>}
        />
      ) : null}
      {report?.connected && !report.cutoff ? <EmptyState icon={<SearchCheck />} title={$t('searchPerformance.searchConsoleConnected')} description={$t('searchPerformance.dataShowsUpHereAfter')} /> : null}
      {report?.connected && report.cutoff && report.totals && w ? (
        <>
          {project ? <SearchHistory key={String(project.id)} projectId={project.id} property={project.searchConsoleProperty} report={report} reload={reload} /> : null}
          <TotalsCards report={report} metric={metric} onMetric={(m) => update({ metric: m === "clicks" ? undefined : m })} />
          <TrendCard report={report} metric={metric} />
          {showDetails && !tableReport && !detailsError ? <ListSkeleton rows={4} /> : null}
          {showDetails && detailsError ? <LoadError title={$t('searchHistory.detailsFailed')} message={$t('searchHistory.detailsFailed')} onRetry={() => window.location.reload()} /> : null}
          {showDetails && tableReport ? <>
          <BreakdownCards data={breakdown} error={breakdownError} onCountry={(c) => update({ country: c })} />
          <Card className="gap-0 py-0" data-report="">
            <DataTableTabs
              value={tab}
              onValueChange={(v) => update({ tab: v === "striking" ? undefined : v })}
              info={tab === "striking" ? <InfoTip label={$t('searchPerformance.whatClosePageOneMeans')}>{help($t('searchPerformance.closePageOne'))}</InfoTip> : (MOVER_TABS as readonly string[]).includes(tab) ? <InfoTip label={$t('searchPerformance.howMoversCounted')}>{$t('searchPerformance.moversInfo')}</InfoTip> : undefined}
              actions={
                <Button variant="outline" size="sm" onClick={exportTab}>
                  <Download data-icon="inline-start" />
                  {$t('common.exportCsv')}</Button>
              }
            >
              <TabsTrigger value="striking">{$tj('searchPerformance.closePageOneValue',{0:tableReport.striking?.length ?? 0})}</TabsTrigger>
              <TabsTrigger value="queries">{$t('common.query')}</TabsTrigger>
              <TabsTrigger value="pages">{$t('common.page')}</TabsTrigger>
              <TabsTrigger value="rising">{$t('searchPerformance.rising')}</TabsTrigger>
              <TabsTrigger value="falling">{$t('searchPerformance.falling')}</TabsTrigger>
              <TabsTrigger value="fresh">{$t('searchPerformance.fresh')}</TabsTrigger>
              <TabsTrigger value="slices">{$t('searchPerformance.slices')}</TabsTrigger>
            </DataTableTabs>
            <DataTableToolbar actions={countries.length || country ? <CountrySelect value={country} countries={countries} onChange={(c) => update({ country: c })} /> : undefined}>
              <DataTableFilterToggle open={showFilters} activeCount={activeFilters} onToggle={() => setShowFilters((v) => !v)} />
              {(MOVER_TABS as readonly string[]).includes(tab) ? <Segmented label={$t('searchPerformance.moversBy')} options={[{ id: "query", label: $t('common.query') }, { id: "page", label: $t('common.page') }]} value={by} onChange={(v) => update({ by: v === "page" ? "page" : undefined })} /> : null}
              {tab === "slices" ? <Segmented label={$t('searchPerformance.slices')} options={SLICES.map((x) => ({ id: x, label: { country: $t('searchPerformance.countryRegion'), device: $t('searchPerformance.device'), appearance: $t('searchPerformance.appearance'), date: $t('searchPerformance.date') }[x] }))} value={slice} onChange={(v) => update({ slice: v === "country" ? undefined : v })} /> : null}
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
              <StrikingTable key={JSON.stringify(filters)} projectId={project?.id} period={report.window!} rows={tableReport?.striking ?? []} isFiltered={activeFilters > 0} onClearFilters={() => update({ q: undefined, qm: undefined, pg: undefined, pm: undefined })} onOpen={(r) => openRow("query", r.query, { clicks: r.clicks, impressions: r.impressions, ctr: r.impressions ? r.clicks / r.impressions : 0, position: r.position })} />
            ) : tab === "queries" || tab === "pages" ? (
              <DimensionTable
                key={tab + JSON.stringify(filters)}
                projectId={project?.id}
                period={report.window!}
                data={(tab === "pages" ? tableReport?.pages : tableReport?.queries) ?? { rows: [], total: 0 }}
                dimension={tab === "pages" ? "pages" : "queries"}
                isFiltered={activeFilters > 0}
                onClearFilters={() => update({ q: undefined, qm: undefined, pg: undefined, pm: undefined })}
                onOpen={(r) => openRow(tab === "pages" ? "page" : "query", r.key, r)}
              />
            ) : tab === "slices" ? (
              breakdownError && slice !== "date" ? <p className="px-4 py-6 text-sm text-muted-foreground">{breakdownError instanceof Error ? breakdownError.message : $t('common.tryAgainLater')}</p>
                : !breakdown && slice !== "date" ? <div className="px-4 py-6"><ListSkeleton rows={3} /></div>
                : <SliceTable key={slice} rows={sliceRows} label={sliceLabel} sort={slice === "date" ? "name" : "clicks"} onPick={slice === "country" ? (c) => update({ country: c }) : undefined} />
            ) : (
              <MoversTable key={`${tab}:${by}:${JSON.stringify(filters)}`} rows={moverRows} dimension={by} emptyNote={tableReport.movers ? $t('searchPerformance.noMovers') : $t('searchPerformance.moversNeedPrevious')}
                onOpen={(key) => { const r = moverRows.find((x) => x.key === key); openRow(by, key, r ? { clicks: r.clicks, impressions: r.impressions, ctr: r.impressions ? r.clicks / r.impressions : 0, position: r.position } : undefined); }}
                onHandOff={(rows) => void handOffMovers(rows)} />
            )}
          </Card>
          </> : null}
          {open && scope ? <RowDrawer scope={scope} dimension={open.dimension} rowKey={open.key} figures={open.figures} metric={metric} onClose={() => setOpen(null)} /> : null}
          {handing && project ? <HandOff projectId={project.id} draft={handing.draft} page={handing.page} onClose={() => setHanding(undefined)} /> : null}
        </>
      ) : null}
      </>}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

// Countries with clicks in the window, most first; a country chosen from a link stays listed even without clicks.
function CountrySelect({ value, countries, onChange }: { value?: string; countries: { key: string; clicks: number }[]; onChange: (c?: string) => void }) {
  const items = [...countries, ...(value && !countries.some((c) => c.key === value) ? [{ key: value, clicks: 0 }] : [])];
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(!v || v === "all" ? undefined : String(v))}>
      <SelectTrigger size="sm" className="w-44" aria-label={$t('searchPerformance.country')}>
        <SelectValue>{(v: string) => (v === "all" ? $t('searchPerformance.countries') : countryName(v))}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{$t('searchPerformance.countries')}</SelectItem>
        {items.map((c) => (
          <SelectItem key={c.key} value={c.key}>
            {countryName(c.key)}
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">{$tj('searchPerformance.clicks',{0:formatCount(c.clicks)})}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// The four figures, each with its change; the whole tile picks the line below (as on 访问).
function TotalsCards({ report, metric, onMetric }: { report: SearchReport; metric: Metric; onMetric: (m: Metric) => void }) {
  const { totals, previous } = report;
  const comparable = report.complete && previous;
  const pct = (cur: number, prev: number) => (comparable && prev > 0 ? { change: (cur - prev) / prev, better: cur >= prev } : null);
  // Position falls as rankings improve, so the change is inverted.
  const rank = comparable && previous.position > 0 && totals!.position > 0 ? { change: previous.position - totals!.position, better: previous.position >= totals!.position, points: true } : null;
  const tiles: { key: Metric; label: string; value: string; delta: { change: number; better: boolean; points?: boolean } | null | false | undefined; hint?: string }[] = [
    { key: "clicks", label: $t('common.clicks'), value: report.coverage?.current.recordedDays === 0 ? "—" : count(totals!.clicks), delta: previous && pct(totals!.clicks, previous.clicks) },
    { key: "impressions", label: $t('common.impressions'), value: report.coverage?.current.recordedDays === 0 ? "—" : count(totals!.impressions), delta: previous && pct(totals!.impressions, previous.impressions) },
    { key: "ctr", label: $t('common.ctr'), value: report.coverage?.current.recordedDays === 0 ? "—" : ctr(totals!.ctr), delta: previous && pct(totals!.ctr, previous.ctr) },
    { key: "position", label: $t('common.averagePosition'), value: totals!.impressions ? position(totals!.position) : "—", delta: rank },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label={$t('searchPerformance.figures')}>
        {tiles.map((t) => (
          <div key={t.key} data-metric={t.key} className={cn("relative rounded-xl", metric === t.key && "ring-2 ring-primary")}>
            <button type="button" aria-pressed={metric === t.key} aria-label={t.label} onClick={() => onMetric(t.key)} className="absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default" />
            <Card className="pointer-events-none relative h-full gap-0 p-4 [&_[data-info-tip]]:pointer-events-auto">
              <StatTile label={t.label} value={t.value} delta={t.delta || null} help={help(t.label)} hint={t.hint} />
            </Card>
          </div>
        ))}
      </div>
      {!comparable ? <p className="flex items-center gap-1 text-xs text-muted-foreground" data-not-comparable>{$t('searchPerformance.changesNotCompared')}<InfoTip label={$t('searchPerformance.whyNotCompared')}>{report.complete ? $t('searchPerformance.dataPreviousEqualPeriodIncomplete') : $t('searchPerformance.someDaysSelectedPeriodNo')}</InfoTip></p> : null}
    </div>
  );
}

function TrendCard({ report, metric }: { report: SearchReport; metric: Metric }) {
  const label = METRIC_LABEL[metric]();
  const prevKey = `previous${metric[0].toUpperCase()}${metric.slice(1)}` as keyof TrendPoint;
  // 初步 days after the cutoff continue the line dashed (joined at the last final day) and are never summed; only for
  // clicks and impressions, the figures Google's fresh data gives per day.
  const fresh = metric === "clicks" || metric === "impressions" ? report.preliminary || [] : [];
  const trend = (report.trend || []).map((p) => ({ ...p, value: p[metric] ?? null, previous: p[prevKey] ?? null }));
  const data = fresh.length
    ? [...trend.map((p) => (p.date === report.cutoff ? { ...p, fresh: p.value } : p)), ...fresh.map((r) => ({ date: r.date, fresh: r[metric as "clicks" | "impressions"], value: null, previous: null }))]
    : trend;
  return (
    <Card className="gap-3 px-4" data-trend={metric}>
      <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{$tj('searchPerformance.daily',{0:label})}</h2><InfoTip label={$t('common.howReadChart')}>{$tj('searchPerformance.solidLineSelectedPeriodDashed',{0:fresh.length ? $t('searchPerformance.preliminaryDataDottedLineGoogle',{0:formatDate(fresh[0].date),1:fresh.length > 1 ? $t('searchPerformance.rangeEnd',{0:formatDate(fresh.at(-1)!.date)}) : ""}) : ""})}{" "}{$t('searchPerformance.clickFigureToSwitch')}</InfoTip></div>
      <div className="nr-chart-box">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
            <YAxis allowDecimals={metric === "ctr" || metric === "position"} reversed={metric === "position"} fontSize={11} width={48} tickFormatter={(v: number) => (metric === "ctr" ? `${(v * 100).toFixed(0)}%` : String(v))} />
            <Tooltip formatter={(v) => showMetric(metric, Number(v))} labelFormatter={(d, p) => (p?.[0]?.payload?.previousDate ? $t('searchPerformance.previous',{0:d,1:p[0].payload.previousDate}) : $t('searchPerformance.preliminaryMetric',{0:d}))} />
            <Area isAnimationActive={false} type="linear" dataKey="value" name={$t('searchPerformance.period',{0:label})} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.1} />
            <Area isAnimationActive={false} type="linear" dataKey="previous" name={$t('searchPerformance.previousPeriod',{0:label})} stroke="var(--muted-foreground)" strokeDasharray="5 4" fill="none" />
            {fresh.length ? <Area isAnimationActive={false} type="linear" dataKey="fresh" name={$t('searchPerformance.preliminaryPrefix',{0:label})} stroke="var(--chart-3)" strokeDasharray="2 3" fill="var(--chart-3)" fillOpacity={0.04} connectNulls={false} /> : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
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
        <SelectTrigger size="sm" className="w-24" aria-label={$t('searchPerformance.matchType',{0:label})}>
          <SelectValue>{(v: string) => (v === "equals" ? $t('searchPerformance.equals') : $t('common.include'))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="contains">{$t('common.include')}</SelectItem>
          <SelectItem value="equals">{$t('searchPerformance.equals')}</SelectItem>
        </SelectContent>
      </Select>
      <Input
        className="h-7 min-w-0 flex-1 sm:max-w-sm"
        aria-label={$t('searchPerformance.filter',{0:label})}
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
        {row($t('common.query'), "q", "qm", $t('searchPerformance.crm'))}
        {row($t('common.page'), "pg", "pm", $t('searchPerformance.docs'))}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={apply}>
          {$t('searchPerformance.applyFilters')}</Button>
        <span className="text-xs text-muted-foreground">{$t('searchPerformance.filtersApplyBothMetricsTrend')}</span>
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
// 交给 Agent for the selected rows: one task, its brief built from the rows, started with the chosen 做法.
function HandOff({ projectId, draft, page, onClose }: { projectId: number; draft: TaskDraft; page?: string; onClose: () => void }) {
  const [result, setResult] = useState<HandOffResult>();
  return <><HandOffNotice result={result} />{result ? null : <DraftHandOffDialog projectId={projectId} draft={draft} playbookId="optimize-page" page={page} description={$t('searchPerformance.selectedRowsBecomeOneTask')} onClose={onClose} onDone={setResult} />}</>;
}

function StrikingTable({ projectId, period, rows, isFiltered, onClearFilters, onOpen }: { projectId?: number; period: Period; rows: StrikingRow[]; isFiltered: boolean; onClearFilters: () => void; onOpen: (r: StrikingRow) => void }) {
  const anchorRef = useSelectionAnchor();
  const [rowSelection, setRowSelection] = useState({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const columns = useMemo<ColumnDef<StrikingRow>[]>(
    () => [
      makeSelectionColumn<StrikingRow>(anchorRef),
      strikingHelper.accessor("query", { enableSorting: false, header: () => $t('common.query'), cell: ({ row, getValue }) => <button type="button" className="block max-w-xs truncate text-left text-primary underline-offset-4 hover:underline" title={getValue()} onClick={() => onOpen(row.original)}>{getValue()}</button> }) as ColumnDef<StrikingRow>,
      strikingHelper.accessor("page", { enableSorting: false, header: () => $t('common.page'), cell: ({ getValue }) => <PageLink url={getValue()} /> }) as ColumnDef<StrikingRow>,
      strikingHelper.accessor("impressions", { header: ({ column }) => <SortableHeader column={column} label={$t('common.impressions')} align="right" />, cell: ({ getValue }) => count(getValue()), meta: right }) as ColumnDef<StrikingRow>,
      strikingHelper.accessor("clicks", { header: ({ column }) => <SortableHeader column={column} label={$t('common.clicks')} align="right" />, cell: ({ getValue }) => count(getValue()), meta: right }) as ColumnDef<StrikingRow>,
      strikingHelper.accessor("position", { header: ({ column }) => <SortableHeader column={column} label={$t('common.position')} align="right" />, cell: ({ getValue }) => position(getValue()), meta: right }) as ColumnDef<StrikingRow>,
    ],
    [anchorRef, onOpen],
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
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const selected = selectedRows.map((r) => r.query);
  const [handing, setHanding] = useState<StrikingRow[]>();
  useHandOffSource("search-striking", projectId ? { count: selected.length, open: () => setHanding(selectedRows), noun: $t('searchPerformance.queriesSelected'), actions: <> <TableBulkActionButton icon={<Save className="size-3.5" />} onClick={() => void save()}> {$t('common.saveKeywords')}</TableBulkActionButton> <TableBulkActionButton icon={<Copy className="size-3.5" />} onClick={() => void copy()}> {$t('searchPerformance.copyKeywords')}</TableBulkActionButton> </>, clear: () => setRowSelection({}) } : null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(selected.map((q) => normalizeExportValue(q)).join("\n"));
      toast.success(() => ($t('common.keywordsCopied',{0:selected.length})));
    } catch {
      toast.error(() => ($t('common.notCopyClipboard')));
    }
  };
  // Saved without a market estimate; 关键词 shows them with their 本站排名.
  const save = async () => {
    try {
      const r = await keywordRequest<{ saved: number; skipped: number }>("saveQueries", { keywords: selected });
      toast.success(() => ($t('common.keywordsSaved',{0:r.saved,1:r.skipped ? $t('common.alreadySaved',{0:r.skipped}) : ""})));
      setRowSelection({});
    } catch (e) {
      toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.saveFailed')));
    }
  };
  return (
    <>
      <p className="px-4 pt-3 text-sm text-muted-foreground">{$t('searchPerformance.queriesRanking520Best')}</p>
      <DataTable
        table={table}
        isFiltered={isFiltered}
        onClearFilters={onClearFilters}
        empty={{ title: $t('searchPerformance.noQueriesClosePageOne'), description: $t('searchPerformance.noQueriesRanking520') }}
        onRowClick={(row, e) => { if (!(e.target as HTMLElement).closest("button,a,[role=checkbox]")) onOpen(row.original); }}
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
      {handing && projectId ? <HandOff projectId={projectId} draft={queryDraft(handing, period)} page={mainPage(handing)} onClose={() => setHanding(undefined)} /> : null}
    </>
  );
}

const dimensionHelper = createColumnHelper<DimensionRow>();
function DimensionTable({ projectId, period, data, dimension, isFiltered, onClearFilters, onOpen }: { projectId?: number; period: Period; data: { rows: DimensionRow[]; total: number }; dimension: "pages" | "queries"; isFiltered: boolean; onClearFilters: () => void; onOpen: (r: DimensionRow) => void }) {
  const keyLabel = dimension === "pages" ? $t('common.page') : $t('common.query');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [rowSelection, setRowSelection] = useState({});
  const [handing, setHanding] = useState<{ draft: TaskDraft; page?: string }>();
  const anchorRef = useSelectionAnchor();
  const columns = useMemo<ColumnDef<DimensionRow>[]>(
    () => [
      makeSelectionColumn<DimensionRow>(anchorRef),
      dimensionHelper.accessor("key", {
        enableSorting: false,
        header: () => keyLabel,
        cell: ({ row, getValue }) => <button type="button" className="block max-w-xl truncate text-left text-primary underline-offset-4 hover:underline" title={getValue()} onClick={() => onOpen(row.original)}>{getValue()}</button>,
      }) as ColumnDef<DimensionRow>,
      dimensionHelper.accessor("clicks", { header: ({ column }) => <SortableHeader column={column} label={$t('common.clicks')} align="right" />, cell: ({ getValue }) => count(getValue()), meta: right }) as ColumnDef<DimensionRow>,
      dimensionHelper.accessor("impressions", { header: ({ column }) => <SortableHeader column={column} label={$t('common.impressions')} align="right" />, cell: ({ getValue }) => count(getValue()), meta: right }) as ColumnDef<DimensionRow>,
      dimensionHelper.accessor("ctr", { header: ({ column }) => <SortableHeader column={column} label={$t('common.ctr')} align="right" />, cell: ({ getValue }) => ctr(getValue()), meta: right }) as ColumnDef<DimensionRow>,
      dimensionHelper.accessor("position", { header: ({ column }) => <SortableHeader column={column} label={$t('common.position')} align="right" />, cell: ({ getValue }) => position(getValue()), meta: right }) as ColumnDef<DimensionRow>,
    ],
    [keyLabel, anchorRef, onOpen],
  );
  const table = useDataTable({
    data: data.rows,
    columns,
    withSorting: true,
    withPagination: true,
    enableRowSelection: true,
    state: { pagination, rowSelection },
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.key,
    initialState: { sorting: [{ id: "clicks", desc: true }] },
  });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  // Pages hand over as they are; queries first look up the page that ranks for them (synced Search Console rows).
  const handOff = async () => {
    if (!projectId || !selected.length) return;
    if (dimension === "pages") { const rows = selected.map((r) => ({ page: r.key, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })); setHanding({ draft: pageDraft(rows, period), page: rows.length === 1 ? rows[0].page : undefined }); return; }
    const ranks = await rankRequest(projectId, selected.map((r) => r.key)).catch(() => undefined);
    const rows = selected.map((r) => ({ query: r.key, page: ranks?.ranks?.[r.key.toLowerCase().trim()]?.page ?? null, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
    setHanding({ draft: queryDraft(rows, period), page: mainPage(rows) });
  };
  useHandOffSource("search-table", projectId ? { count: selected.length, open: () => void handOff(), noun: dimension === "pages" ? $t('common.pagesSelected') : $t('searchPerformance.queriesSelected'), clear: () => setRowSelection({}) } : null);
  return (
    <>
      {data.total > data.rows.length ? (
        <p className="px-4 pt-3 text-sm text-muted-foreground">
          {$tj('searchPerformance.totalMostClicksListedHere',{0:formatCount(data.total),1:keyLabel,2:formatCount(data.rows.length)})}</p>
      ) : null}
      <DataTable
        table={table}
        isFiltered={isFiltered}
        onClearFilters={onClearFilters}
        empty={{ title: $t('searchPerformance.noSearchConsoleDataSelected'), description: $t('searchPerformance.googleDataUsuallyArrives2') }}
        onRowClick={(row, e) => { if (!(e.target as HTMLElement).closest("button,a,[role=checkbox]")) onOpen(row.original); }}
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
      {handing && projectId ? <HandOff projectId={projectId} draft={handing.draft} page={handing.page} onClose={() => setHanding(undefined)} /> : null}
    </>
  );
}

// How the numbers on this page are counted, in the ⓘ beside the title.
function notesOf(report: SearchReport): string[] {
  const w = report.window!;
  return [
    $t('searchPerformance.searchConsoleWebSearchSynced',{0:formatDate(report.cutoff)}),
    ...(report.pairDays !== undefined && report.pairDays < w.days ? [$t('searchPerformance.queryPageDetailsCoverDays',{0:report.pairDays})] : []),
    ...(report.country ? [$t('searchPerformance.readDirectlySearchConsoleSame',{0:countryName(report.country)})] : report.filtered ? [$t('searchPerformance.filteredMetricsAddUpQuery')] : []),
    $t('searchPerformance.breakdownReadLive'),
  ];
}
