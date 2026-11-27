import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
// 关键词研究: ported from every-app/open-seo db8bde1 src/client/features/keywords/ (KeywordResearchPage, SearchBar,
// Results, Table, filters, OverviewStats, AreaTrendChart, SerpAnalysisCard; MIT). Changes: one keyword and one market
// per search (no search tabs, cities, clickstream or grouping), the blended "auto" mode left out, results and search
// results from NocoReach's DataForSEO layer (runs kept as 最近的研究, the same query reused for 30 days, no per-query
// cost prompt), a 本站排名 column from the synced Search Console data, details in a drawer instead of a side panel,
// Chinese copy and CSV export only. Since 2026-11-25 a search may use several ways at once, one query each, merged into
// one list whose rows say which ways found them, in any market DataForSEO has keyword data for.
import { HandOffBar } from "./hand-off-bar";
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { createColumnHelper, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, Download, History, Save, Search } from "lucide-react";
import { toast } from "#lib/toast";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "#components/ui/dropdown-menu";
import { Toggle } from "#components/ui/toggle";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableFilterGroup, DataTableFilterPanel, DataTableFilterToggle, DataTableRangeFilter, DataTableToolbar } from "#components/seo/data-table-toolbar";
import { TablePagination } from "#components/seo/table-pagination";
import { TableBulkActionButton } from "#components/seo/table-bulk-action-bar";
import { SortableHeader } from "#components/seo/sortable-header";
import { ScoreBadge } from "#components/seo/score-badge";
import { IntentBadge, getIntentLabels, INTENT_ORDER, toIntent, type KeywordIntent } from "#components/seo/intent-badge";
import { downloadCsv, type CsvValue } from "#components/seo/csv";
import { KeywordHandOffDialog, type HandOffKeyword } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { useProject } from "./reach-data";
import {
  keywordRequest, marketLabel, metric, monthVolume, rankOf, rankRequest, getResearchViews, useOpenKeyword, researchRunError, usdUpTo, mergeRuns,
  type KeywordConnectionState, type KeywordItem, type Ranks, type RecentRun, type ResearchRun, type ResearchRow as Row,
} from "./keyword-api";
import "./reach-workspace.css";
import "./data-views.css";
import { InfoTip, WithInfo } from "#components/reach/info-tip";
import { help } from "./glossary";
import { formatDateTime, joinList } from '#lib/format';
import { MarketPicker } from "./keyword-market-picker";
import { isKeywordMarket } from "../../shared/keyword-markets.js";
import { RESEARCH_LIMIT, researchQueryUsd } from "../../shared/keyword-research.js";
import { refreshNavSources } from '#components/app-shell/nav-badges';

type View = keyof ReturnType<typeof getResearchViews>;
const VIEWS = Object.keys(getResearchViews()) as View[];
const PAGE_SIZES = [50, 100] as const;
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const getStatusText = (): Record<string, string> => ({ running: $t('keywordResearch.queryingRefreshMoment'), unknown: $t('common.resultUncertainMayChargedRepeat'), failed: $t('keywordResearch.queryFailed') });
export const getMonths = () => ([$t('keywordResearch.jan'), $t('keywordResearch.feb'), $t('keywordResearch.mar'), $t('keywordResearch.apr'), $t('keywordResearch.may'), $t('keywordResearch.jun'), $t('keywordResearch.jul'), $t('keywordResearch.aug'), $t('keywordResearch.sep'), $t('keywordResearch.oct'), $t('keywordResearch.nov'), $t('keywordResearch.dec')]);
const fmtTime = (v?: string | null) => formatDateTime(v);
const requestKey = () => crypto.randomUUID().replace(/-/g, "");
const viewName = (v: string) => getResearchViews()[v as View] ?? v;
/** What one search looks up: the keyword, the market and the ways, one query each. */
type Plan = { target: string; market: { locationCode: number; language: string }; views: View[] };
/** "Queries this time: 2 · up to $0.05" for a plan's ways, on the same list price the server stores. */
const planText = (views: View[]) => $t('keywordResearch.queryPlan', { 0: views.length, 1: usdUpTo(views.reduce((n, v) => n + researchQueryUsd(v, RESEARCH_LIMIT), 0)) });
/** The ways in the URL's view (one or several, comma separated), in the page's order; Contains the term when none. */
const viewsOf = (value: string | null) => { const want = (value ?? "").split(","); const views = VIEWS.filter((v) => want.includes(v)); return views.length ? views : (["suggestions"] as View[]); };

/** The last 12 months of search volume, oldest first. */
export function lastTwelve(trend: KeywordItem["monthlySearches"]) {
  return [...(trend || [])].sort((a, b) => a.year - b.year || a.month - b.month).slice(-12);
}
export function AreaTrendChart({ trend, height = 180 }: { trend: KeywordItem["monthlySearches"]; height?: number }) {
  const data = lastTwelve(trend).map((m) => ({ month: $t('keywordResearch.monthYear',{0:String(m.year).slice(2),1:getMonths()[m.month - 1]}), value: monthVolume(m) }));
  if (data.length < 2) return <p className="text-sm text-muted-foreground">{$t('keywordResearch.noMonthlySearchVolume')}</p>;
  return (
    <div className="nr-chart-box" role="img" aria-label={$t('keywordResearch.value12MonthSearchVolumeTrend')}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" fontSize={11} minTickGap={8} />
          <YAxis fontSize={11} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(v))} />
          <Tooltip formatter={(v) => [Number(v).toLocaleString(getCurrentLocale()), $t('common.monthlyVolume')]} />
          <Area isAnimationActive={false} type="monotone" dataKey="value" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.12} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type Filters = { include: string; exclude: string; minVol: string; maxVol: string; minKd: string; maxKd: string; intents: KeywordIntent[] };
const EMPTY: Filters = { include: "", exclude: "", minVol: "", maxVol: "", minKd: "", maxKd: "", intents: [] };
const activeCount = (f: Filters) => [f.include, f.exclude, f.minVol || f.maxVol, f.minKd || f.maxKd, f.intents.length ? "x" : ""].filter(Boolean).length;
function applyFilters<T extends KeywordItem>(rows: T[], f: Filters) {
  const terms = (s: string) => s.split(/[,，]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const inc = terms(f.include), exc = terms(f.exclude), num = (s: string) => (s.trim() === "" ? null : Number(s));
  const [minV, maxV, minK, maxK] = [num(f.minVol), num(f.maxVol), num(f.minKd), num(f.maxKd)];
  return rows.filter((r) => {
    const k = r.keyword.toLowerCase();
    if (inc.length && !inc.every((t) => k.includes(t))) return false;
    if (exc.some((t) => k.includes(t))) return false;
    if (minV !== null && (r.volume == null || r.volume < minV)) return false;
    if (maxV !== null && (r.volume == null || r.volume > maxV)) return false;
    if (minK !== null && (r.difficulty == null || r.difficulty < minK)) return false;
    if (maxK !== null && (r.difficulty == null || r.difficulty > maxK)) return false;
    if (f.intents.length && !f.intents.includes(toIntent(r.intent))) return false;
    return true;
  });
}

// 找新词 on 关键词 (embedded: no page frame or title of its own; 最近的研究 sits above the results).
export default function KeywordResearch({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const [connection, setConnection] = useState<KeywordConnectionState>();
  const [recent, setRecent] = useState<RecentRun[]>();
  const [runs, setRuns] = useState<ResearchRun[]>();
  const [ranks, setRanks] = useState<Ranks>();
  const [reused, setReused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState("");
  const market = isKeywordMarket(params.get("loc"), params.get("lang")) ? { locationCode: Number(params.get("loc")), language: String(params.get("lang")) } : { locationCode: 2840, language: "en" };
  const [form, setForm] = useState({ target: params.get("q") ?? "", views: viewsOf(params.get("view")), market });
  const runId = params.get("run");
  const openIds = runs?.map((r) => String(r.id)).join(",");

  const loadRecent = () => keywordRequest<RecentRun[]>("list").then(setRecent).catch(() => setRecent([]));
  useEffect(() => {
    void keywordRequest<KeywordConnectionState>("status").then(setConnection).catch(() => setConnection({ configured: false, verifiedAt: null, monthlyBudgetUsd: 5 }));
    void loadRecent();
  }, []);
  // The open runs live in the URL (one id per way), so a reload or a link reopens them without a new query.
  useEffect(() => {
    if (!runId) { setRuns(undefined); return; }
    if (openIds === runId) return;
    void Promise.all(runId.split(",").map((id) => keywordRequest<ResearchRun>("getRun", { runId: id }))).then((list) => { setRuns(list); setReused(false); }).catch((e) => setError(() => (e instanceof Error ? $legacyText(e.message) : $t('keywordResearch.notLoadResearchHistory'))));
  }, [runId]);
  useEffect(() => {
    setRanks(undefined);
    const keywords = runs ? mergeRuns(runs).map((i) => i.keyword) : [];
    if (project && keywords.length) void rankRequest(project.id, keywords).then(setRanks).catch(() => undefined);
  }, [openIds, project?.id]);

  const open = (list: ResearchRun[]) => {
    setRuns(list);
    setReused(list.every((r) => r.reused));
    const p = new URLSearchParams(params), spec = list[0].spec;
    p.set("run", list.map((r) => String(r.id)).join(",")); p.set("q", spec.target); p.set("view", list.map((r) => r.spec.view).join(",")); p.set("loc", String(spec.locationCode)); p.set("lang", spec.language);
    setParams(p, { replace: true });
  };
  // One query for each way of the plan, each billed and reused (30 days) on its own; only a click starts them. The
  // plan is the form for Query and the shown result for Query again, so what is sent is what the button said.
  const search = async (plan: Plan, forceRefresh = false) => {
    const target = plan.target.trim(), { market: m, views } = plan;
    if (target.length < 2) { setError(() => ($t('keywordResearch.enterKeywordLeast2Characters'))); return; }
    setBusy(true); setError("");
    try {
      const settled = await Promise.allSettled(views.map((view) => keywordRequest<ResearchRun>("run", { target, view, locationCode: m.locationCode, language: m.language, limit: RESEARCH_LIMIT, requestKey: requestKey(), ...(forceRefresh ? { forceRefresh: true } : {}) })));
      const done = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const failed = settled.flatMap((r, i) => (r.status === "rejected" ? [{ view: views[i], reason: r.reason as unknown }] : []));
      const message = (e: unknown) => (e instanceof Error ? $legacyText(e.message) : $t('common.lookupNotCompleteTryAgain'));
      if (done.length) open(done);
      if (failed.length) setError(() => (done.length ? $t('keywordResearch.methodNotComplete', { 0: joinList(failed.map((f) => viewName(f.view))), 1: message(failed[0].reason) }) : message(failed[0].reason)));
      void loadRecent();
    } finally { setBusy(false); }
  };
  const showRecent = () => { const p = new URLSearchParams(params); p.delete("run"); setParams(p, { replace: true }); };

  const notConnected = connection && !connection.verifiedAt;
  const recentButton = runs ? <Button variant="outline" size="sm" onClick={showRecent}><History data-icon="inline-start" />{$t('keywordResearch.recentResearch')}</Button> : undefined;
  const body = (
    <>
      {embedded && recentButton ? <div className="flex justify-end">{recentButton}</div> : null}
      {notConnected ? (
        <EmptyState icon={<Search />} title={$t('common.connectDataforseoFirst')} description={$t('keywordResearch.findKeywordsUsesDataforseoData')} action={<Button onClick={() => navigate("/connections?source=keywords")}>{$t('common.goDataSources')}</Button>} />
      ) : (
        <Card className="px-4">
          <form className="flex flex-col gap-2 lg:flex-row lg:items-center" onSubmit={(e) => { e.preventDefault(); void search(form); }}>
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" aria-label={$t('common.keywords')} placeholder={$t('keywordResearch.enterKeywordExampleOpenSource')} maxLength={100} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:flex">
              <MarketPicker className="lg:w-80" value={form.market} onChange={(m) => setForm((f) => ({ ...f, market: m }))} />
              <MethodPicker value={form.views} onChange={(views) => setForm((f) => ({ ...f, views }))} />
            </div>
            <Button type="submit" disabled={busy} className="lg:px-6">{busy ? $t('common.querying') : $t('common.query')}</Button>
            <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground" data-query-plan>
              {planText(form.views)}
              <InfoTip label={$t('keywordResearch.method')}>{$t('keywordResearch.searchModesHelp')} {$t('keywordResearch.queryCostHelp', { 0: usdUpTo(researchQueryUsd("suggestions", RESEARCH_LIMIT)), 1: RESEARCH_LIMIT })}</InfoTip>
            </span>
          </form>
          {error ? <p role="alert" className="nr-error">{error}</p> : null}
        </Card>
      )}
      {runs ? (
        <Results runs={runs} ranks={ranks} reused={reused} busy={busy} onRefresh={(plan) => void search(plan, true)} projectId={project?.id} />
      ) : !notConnected ? (
        <RecentList recent={recent} onOpen={(id) => { const p = new URLSearchParams(params); p.set("run", id); setParams(p, { replace: true }); }} />
      ) : null}
    </>
  );
  if (embedded) return body;
  return (
    <PageContainer className="nr-data-page">
      <PageHeader title={$t('common.findKeywords')} description={$t('keywordResearch.lookUpSearchVolumeDifficulty')} actions={recentButton} />
      {body}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

function RecentList({ recent, onOpen }: { recent?: RecentRun[]; onOpen: (id: string) => void }) {
  if (!recent) return <ListSkeleton rows={4} />;
  const research = recent.filter((r) => r.spec.view !== "serp");
  if (!research.length) return <EmptyState icon={<History />} title={$t('keywordResearch.noKeywordResearchYet')} description={$t('keywordResearch.enterTermRelatedProductAbove')} />;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{$t('keywordResearch.recentResearch')}</h2>
      <Card className="gap-0 py-0">
        {research.map((r) => (
          <button key={r.id} type="button" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 text-left text-sm last:border-0 hover:bg-muted/50" onClick={() => onOpen(r.id)}>
            <span className="min-w-0 flex-1 truncate font-medium">{r.spec.target}</span>
            <span className="text-xs text-muted-foreground">{viewName(r.spec.view)} · {marketLabel(r.spec)}</span>
            <span className="w-24 text-xs text-muted-foreground tabular-nums">{r.status === "completed" ? $t('keywordResearch.keywords',{0:r.count ?? 0}) : getStatusText()[r.status] ?? r.status}</span>
            <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">{fmtTime(r.completedAt || r.createdAt)}</span>
          </button>
        ))}
      </Card>
    </section>
  );
}

/** The ways a search used, as the page lists them ("Contains the term, Related searches"). */
function MethodPicker({ value, onChange }: { value: View[]; onChange: (views: View[]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between font-normal lg:w-auto lg:max-w-72" aria-label={$t('keywordResearch.method')} />}>
        <span className="truncate">{joinList(value.map(viewName))}</span>
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-48">
        {VIEWS.map((v) => (
          // At least one way stays chosen.
          <DropdownMenuCheckboxItem key={v} checked={value.includes(v)} disabled={value.length === 1 && value.includes(v)} closeOnClick={false}
            onCheckedChange={(on) => onChange(VIEWS.filter((x) => (x === v ? on : value.includes(x))))}>
            {viewName(v)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const helper = createColumnHelper<Row>();
function Results({ runs, ranks, reused, busy, onRefresh, projectId }: { runs: ResearchRun[]; ranks?: Ranks; reused: boolean; busy: boolean; onRefresh: (plan: Plan) => void; projectId?: number }) {
  const done = runs.filter((r) => r.status === "completed"), unfinished = runs.filter((r) => r.status !== "completed");
  const run = done[0] ?? runs[0];
  // Query again looks up exactly the result shown: its keyword, market and ways, whatever the form says now.
  const again: Plan = { target: run.spec.target, market: { locationCode: run.spec.locationCode, language: run.spec.language }, views: runs.map((r) => r.spec.view as View) };
  const items = useMemo(() => mergeRuns(runs), [runs]);
  const views = joinList(runs.map((r) => viewName(r.spec.view)));
  const latest = done.map((r) => r.completedAt || r.createdAt).sort().at(-1);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "volume", desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [rowSelection, setRowSelection] = useState({});
  const openKeyword = useOpenKeyword();
  const anchorRef = useSelectionAnchor();
  const rows = useMemo(() => applyFilters(items, filters), [items, filters]);
  const runIds = runs.map((r) => String(r.id)).join(",");
  useEffect(() => { setRowSelection({}); setPagination((p) => ({ ...p, pageIndex: 0 })); }, [runIds, filters]);
  const seed = items.find((i) => i.keyword.toLowerCase() === run.spec.target.toLowerCase());
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      makeSelectionColumn<Row>(anchorRef),
      helper.accessor("keyword", { header: ({ column }) => <SortableHeader column={column} label={$t('common.keywords')} />, cell: ({ getValue }) => <span className="block max-w-sm truncate font-medium" title={getValue()}>{getValue()}</span> }) as ColumnDef<Row>,
      helper.accessor("volume", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.monthlyVolume')} align="right" />, cell: ({ getValue }) => metric(getValue()), meta: right }) as ColumnDef<Row>,
      helper.accessor("cpc", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="CPC" align="right" />, cell: ({ getValue }) => (getValue() == null ? "—" : `$${getValue()!.toFixed(2)}`), meta: right }) as ColumnDef<Row>,
      helper.accessor("competition", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('keywordResearch.competition')} align="right" />, cell: ({ getValue }) => (getValue() == null ? "—" : getValue()!.toFixed(2)), meta: right }) as ColumnDef<Row>,
      helper.accessor("difficulty", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.difficulty')} align="right" />, cell: ({ getValue }) => <ScoreBadge value={getValue()} />, meta: right }) as ColumnDef<Row>,
      helper.accessor("intent", { enableSorting: false, header: () => <WithInfo help={help($t('common.intent'))}>{$t('common.intent')}</WithInfo>, cell: ({ getValue }) => <IntentBadge intent={getValue()} /> }) as ColumnDef<Row>,
      helper.display({ id: "rank", header: () => <span title={$t('keywordResearch.averageGooglePositionOverLast')}>{$t('common.sitePosition')}</span>, cell: ({ row }) => { const r = rankOf(ranks, row.original.keyword); return r ? r.position.toFixed(1) : "—"; }, meta: right }) as ColumnDef<Row>,
      // Which ways found the keyword, for one way as for several.
      helper.display({ id: "views", header: () => $t('keywordResearch.foundBy'), cell: ({ row }) => <span className="flex flex-wrap gap-1" data-found-by={row.original.views.join(",")}>{row.original.views.map((v) => <span key={v} className="rounded-md bg-muted px-1.5 py-0.5 text-xs whitespace-nowrap text-muted-foreground">{viewName(v)}</span>)}</span> }) as ColumnDef<Row>,
    ],
    [anchorRef, ranks],
  );
  const table = useDataTable({
    data: rows, columns, withSorting: true, withPagination: true, enableRowSelection: true,
    state: { rowSelection, pagination, sorting }, onRowSelectionChange: setRowSelection, onPaginationChange: setPagination, onSortingChange: setSorting,
    getRowId: (r) => r.id,
  });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  // 交给 Agent: the chosen words with their market numbers and 本站排名 become one task.
  const [handing, setHanding] = useState<HandOffKeyword[]>();
  useHandOffSource("keyword-research", projectId ? { count: table.getSelectedRowModel().rows.length, open: () => setHanding(handOffRows(table.getSelectedRowModel().rows.map((r) => r.original))), noun: $t('common.keywordsSelected'), actions: <> <TableBulkActionButton icon={<Save className="size-3.5" />} onClick={() => void save()}>{$t('common.saveKeywords')}</TableBulkActionButton> <TableBulkActionButton icon={<Download className="size-3.5" />} onClick={() => csv(selected)}>{$t('common.export')}</TableBulkActionButton> </>, clear: () => setRowSelection({}) } : null);
  const [handed, setHanded] = useState<HandOffResult>();
  const handOffRows = (items: Row[]): HandOffKeyword[] => items.map((i) => ({ keyword: i.keyword, market: { locationCode: run.spec.locationCode, language: run.spec.language }, volume: i.volume, difficulty: i.difficulty, intent: i.intent, rank: rankOf(ranks, i.keyword) }));
  const csv = (list: Row[]) =>
    downloadCsv($t('keywordResearch.keywordResearch',{0:run.spec.target,1:marketLabel(run.spec)}), [$t('common.keywords'), $t('common.monthlyVolume'), "CPC", $t('keywordResearch.competition'), $t('common.difficulty'), $t('common.intent'), $t('common.sitePosition'), $t('keywordResearch.foundBy')], list.map((r): CsvValue[] => [r.keyword, r.volume, r.cpc, r.competition, r.difficulty, getIntentLabels()[toIntent(r.intent)], rankOf(ranks, r.keyword)?.position ?? "", joinList(r.views.map(viewName))])) || toast.error(() => ($t('common.noKeywordsExport')));
  // Each keyword is saved from the first run that found it, one request per run.
  const save = async () => {
    try {
      const byRun = new Map<string, string[]>();
      for (const row of selected) byRun.set(row.refs[0].runId, [...(byRun.get(row.refs[0].runId) ?? []), row.refs[0].itemId]);
      const results = await Promise.all([...byRun].map(([runId, itemIds]) => keywordRequest<{ saved: number; skipped: number }>("saveFromRun", { runId, itemIds })));
      const r = results.reduce((n, x) => ({ saved: n.saved + x.saved, skipped: n.skipped + x.skipped }), { saved: 0, skipped: 0 });
      toast.success(() => ($t('common.keywordsSaved',{0:r.saved,1:r.skipped ? $t('common.alreadySaved',{0:r.skipped}) : ""})));
      refreshNavSources();
      setRowSelection({});
    } catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.saveFailed'))); }
  };
  if (!done.length) {
    return <EmptyState icon={<Search />} title={getStatusText()[run.status] ?? $t('common.lookupNotComplete')} description={researchRunError(run.errorCode)} />;
  }
  return (
    <div className="space-y-4">
      {reused ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{$tj('keywordResearch.resultNoNewCharge',{0:fmtTime(latest)})}<InfoTip>{$t('keywordResearch.sameCriteriaCheckedLast30')}</InfoTip><Button variant="link" size="sm" className="h-auto p-0" disabled={busy} onClick={() => onRefresh(again)}>{$t('common.queryAgain')}</Button><span data-refresh-plan>{planText(again.views)}</span></p>
      ) : null}
      {unfinished.map((r) => <p key={r.id} role="status" className="text-xs text-muted-foreground" data-unfinished={r.spec.view}>{$t('keywordResearch.methodNotComplete', { 0: viewName(r.spec.view), 1: getStatusText()[r.status] ?? researchRunError(r.errorCode) })}</p>)}
      {seed ? <OverviewStats item={seed} rank={rankOf(ranks, seed.keyword)} /> : null}
      <Card className="gap-0 py-0">
        <DataTable
          table={table}
          isFiltered={activeCount(filters) > 0}
          onClearFilters={() => setFilters(EMPTY)}
          onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,[role=checkbox],a")) return; openKeyword(row.original.keyword, run.spec); }}
          empty={{ title: $t('keywordResearch.noKeywordsFound'), description: $t('keywordResearch.tryAnotherKeywordMethod') }}
          toolbar={
            <>
              <DataTableToolbar actions={<Button variant="outline" size="sm" onClick={() => csv(rows)}><Download data-icon="inline-start" />{$t('common.exportCsv')}</Button>}>
                <DataTableFilterToggle open={showFilters} activeCount={activeCount(filters)} onToggle={() => setShowFilters((v) => !v)} />
                <span className="text-xs text-muted-foreground">
                  {activeCount(filters) ? $t('common.showing',{0:rows.length,1:items.length}) : $t('common.keywordsTotal',{0:items.length})} · {views} · {marketLabel(run.spec)} · {fmtTime(latest)}
                </span>
              </DataTableToolbar>
              {showFilters ? <KeywordFilters value={filters} onChange={setFilters} /> : null}
            </>
          }
          footer={rows.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null}
        />
      </Card>
      <HandOffNotice result={handed} />
      {handing && projectId ? <KeywordHandOffDialog projectId={projectId} rows={handing} onClose={() => setHanding(undefined)} onDone={(r) => { setHanding(undefined); setRowSelection({}); setHanded({ ok: true, text: r.title, taskId: r.taskId }); }} /> : null}
    </div>
  );
}

export function OverviewStats({ item, rank }: { item: Pick<KeywordItem, "keyword" | "volume" | "difficulty" | "cpc" | "competition" | "intent" | "monthlySearches">; rank?: { position: number; page: string } }) {
  const tiles: [string, ReactNode][] = [
    [$t('common.monthlyVolume'), metric(item.volume)],
    [$t('common.difficulty'), <ScoreBadge key="d" value={item.difficulty} />],
    ["CPC", item.cpc == null ? "—" : `$${item.cpc.toFixed(2)}`],
    [$t('common.intent'), <IntentBadge key="i" intent={item.intent} />],
    [$t('common.sitePosition'), rank ? rank.position.toFixed(1) : "—"],
  ];
  return (
    <Card className="gap-3 px-4" data-overview={item.keyword}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
        <h2 className="text-base font-semibold">{item.keyword}</h2>
        {tiles.map(([label, value]) => (
          <div key={label} className="flex items-center gap-1.5 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{value}</span></div>
        ))}
      </div>
      {item.monthlySearches?.length ? <AreaTrendChart trend={item.monthlySearches} height={140} /> : null}
    </Card>
  );
}

function KeywordFilters({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  return (
    <DataTableFilterPanel activeCount={activeCount(value)} onReset={() => onChange(EMPTY)}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <DataTableFilterGroup label={$t('common.include')}><Input aria-label={$t('common.include')} className="h-7" placeholder={$t('common.containCommaSeparated')} value={value.include} onChange={(e) => set({ include: e.target.value })} /></DataTableFilterGroup>
        <DataTableFilterGroup label={$t('common.exclude')}><Input aria-label={$t('common.exclude')} className="h-7" placeholder={$t('common.excludeAny')} value={value.exclude} onChange={(e) => set({ exclude: e.target.value })} /></DataTableFilterGroup>
        <DataTableRangeFilter label={$t('common.monthlyVolume')} min={value.minVol} max={value.maxVol} onChange={(minVol, maxVol) => set({ minVol, maxVol })} />
        <DataTableRangeFilter label={$t('common.difficulty')} min={value.minKd} max={value.maxKd} onChange={(minKd, maxKd) => set({ minKd, maxKd })} />
        <DataTableFilterGroup label={$t('common.intent')}>
          <div className="flex flex-wrap gap-1.5">
            {INTENT_ORDER.map((i) => (
              <Toggle key={i} variant="outline" size="sm" pressed={value.intents.includes(i)} onPressedChange={() => set({ intents: value.intents.includes(i) ? value.intents.filter((x) => x !== i) : [...value.intents, i] })}>{getIntentLabels()[i]}</Toggle>
            ))}
          </div>
        </DataTableFilterGroup>
      </div>
    </DataTableFilterPanel>
  );
}

