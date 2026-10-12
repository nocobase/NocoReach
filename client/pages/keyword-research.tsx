import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
// 关键词研究: ported from every-app/open-seo db8bde1 src/client/features/keywords/ (KeywordResearchPage, SearchBar,
// Results, Table, filters, OverviewStats, AreaTrendChart, SerpAnalysisCard; MIT). Changes: one keyword and one market
// per search (no search tabs, cities, clickstream or grouping), the blended "auto" mode left out, results and search
// results from NocoReach's DataForSEO layer (runs kept as 最近的研究, the same query reused for 30 days, no per-query
// cost prompt), a 本站排名 column from the synced Search Console data, details in a drawer instead of a side panel,
// Chinese copy and CSV export only.
import { HandOffBar } from "./hand-off-bar";
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { createColumnHelper, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, History, Save, Search } from "lucide-react";
import { toast } from "#lib/toast";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#components/ui/select";
import { Toggle } from "#components/ui/toggle";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableFilterGroup, DataTableFilterPanel, DataTableFilterToggle, DataTableRangeFilter, DataTableToolbar } from "#components/seo/data-table-toolbar";
import { TablePagination } from "#components/seo/table-pagination";
import { TableBulkActionButton } from "#components/seo/table-bulk-action-bar";
import { SortableHeader } from "#components/seo/sortable-header";
import { ScoreBadge } from "#components/seo/score-badge";
import { IntentBadge, getIntentLabels, INTENT_ORDER, toIntent, type KeywordIntent } from "#components/seo/intent-badge";
import { downloadCsv, type CsvValue } from "#components/seo/csv";
import { DetailDrawer } from "./detail-drawer";
import { KeywordHandOffDialog, type HandOffKeyword } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { useProject } from "./reach-data";
import { safeLink } from "./analytics";
import {
  keywordRequest, getMarkets, marketLabel, metric, rankOf, rankRequest, getResearchViews,
  type KeywordConnectionState, type KeywordItem, type Ranks, type RecentRun, type ResearchRun,
} from "./keyword-api";
import "./reach-workspace.css";
import "./data-views.css";
import { InfoTip, WithInfo } from "#components/reach/info-tip";
import { help } from "./glossary";

type View = keyof ReturnType<typeof getResearchViews>;
const VIEWS = Object.keys(getResearchViews()) as View[];
const PAGE_SIZES = [50, 100] as const;
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const getStatusText = (): Record<string, string> => ({ running: $t('keywordResearch.queryingRefreshMoment'), unknown: $t('common.resultUncertainMayChargedRepeat'), failed: $t('keywordResearch.queryFailed') });
export const getMonths = () => ([$t('keywordResearch.jan'), $t('keywordResearch.feb'), $t('keywordResearch.mar'), $t('keywordResearch.apr'), $t('keywordResearch.may'), $t('keywordResearch.jun'), $t('keywordResearch.jul'), $t('keywordResearch.aug'), $t('keywordResearch.sep'), $t('keywordResearch.oct'), $t('keywordResearch.nov'), $t('keywordResearch.dec')]);
const fmtTime = (v?: string | null) => (v ? new Date(v).toLocaleString(getCurrentLocale(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const requestKey = () => crypto.randomUUID().replace(/-/g, "");

/** The last 12 months of search volume, oldest first. */
export function lastTwelve(trend: KeywordItem["monthlySearches"]) {
  return [...(trend || [])].sort((a, b) => a.year - b.year || a.month - b.month).slice(-12);
}
export function AreaTrendChart({ trend, height = 180 }: { trend: KeywordItem["monthlySearches"]; height?: number }) {
  const data = lastTwelve(trend).map((m) => ({ month: $t('keywordResearch.monthYear',{0:String(m.year).slice(2),1:getMonths()[m.month - 1]}), value: m.search_volume }));
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
function applyFilters(rows: KeywordItem[], f: Filters) {
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
  const [run, setRun] = useState<ResearchRun>();
  const [ranks, setRanks] = useState<Ranks>();
  const [reused, setReused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState("");
  const market = getMarkets().find((m) => String(m.locationCode) === params.get("loc") && m.language === params.get("lang")) ?? getMarkets()[0];
  const [form, setForm] = useState({ target: params.get("q") ?? "", view: (VIEWS.find((v) => v === params.get("view")) ?? "suggestions") as View, market });
  const runId = params.get("run");

  const loadRecent = () => keywordRequest<RecentRun[]>("list").then(setRecent).catch(() => setRecent([]));
  useEffect(() => {
    void keywordRequest<KeywordConnectionState>("status").then(setConnection).catch(() => setConnection({ configured: false, verifiedAt: null, monthlyBudgetUsd: 5 }));
    void loadRecent();
  }, []);
  // The open run lives in the URL, so a reload or a link reopens it without a new query.
  useEffect(() => {
    if (!runId) { setRun(undefined); return; }
    if (String(run?.id) === runId) return;
    void keywordRequest<ResearchRun>("getRun", { runId }).then(setRun).catch((e) => setError(() => (e instanceof Error ? $legacyText(e.message) : $t('keywordResearch.notLoadResearchHistory'))));
  }, [runId]);
  useEffect(() => {
    setRanks(undefined);
    const items = run?.result?.items;
    if (project && items?.length) void rankRequest(project.id, items.map((i) => i.keyword)).then(setRanks).catch(() => undefined);
  }, [run?.id, project?.id]);

  const open = (r: ResearchRun, wasReused = false) => {
    setRun(r);
    setReused(wasReused);
    const p = new URLSearchParams(params);
    p.set("run", String(r.id)); p.set("q", r.spec.target); p.set("view", String(r.spec.view)); p.set("loc", String(r.spec.locationCode)); p.set("lang", r.spec.language);
    setParams(p, { replace: true });
  };
  const search = async (forceRefresh = false) => {
    const target = form.target.trim();
    if (target.length < 2) { setError(() => ($t('keywordResearch.enterKeywordLeast2Characters'))); return; }
    setBusy(true); setError("");
    const started = Date.now();
    try {
      const r = await keywordRequest<ResearchRun>("run", { target, view: form.view, locationCode: form.market.locationCode, language: form.market.language, limit: 100, requestKey: requestKey(), ...(forceRefresh ? { forceRefresh: true } : {}) });
      open(r, Date.parse(r.createdAt) < started - 5000);
      void loadRecent();
    } catch (e) {
      setError(() => (e instanceof Error ? $legacyText(e.message) : $t('common.lookupNotCompleteTryAgain')));
    } finally { setBusy(false); }
  };
  const showRecent = () => { const p = new URLSearchParams(params); p.delete("run"); setParams(p, { replace: true }); };

  const notConnected = connection && !connection.verifiedAt;
  const recentButton = run ? <Button variant="outline" size="sm" onClick={showRecent}><History data-icon="inline-start" />{$t('keywordResearch.recentResearch')}</Button> : undefined;
  const body = (
    <>
      {embedded && recentButton ? <div className="flex justify-end">{recentButton}</div> : null}
      {notConnected ? (
        <EmptyState icon={<Search />} title={$t('common.connectDataforseoFirst')} description={$t('keywordResearch.findKeywordsUsesDataforseoData')} action={<Button onClick={() => navigate("/connections?source=keywords")}>{$t('common.goDataSources')}</Button>} />
      ) : (
        <Card className="px-4">
          <form className="flex flex-col gap-2 lg:flex-row lg:items-center" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" aria-label={$t('common.keywords')} placeholder={$t('keywordResearch.enterKeywordExampleOpenSource')} maxLength={100} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:flex">
              <Select value={`${form.market.locationCode}:${form.market.language}`} onValueChange={(v) => { const m = getMarkets().find((x) => `${x.locationCode}:${x.language}` === v); if (m) setForm((f) => ({ ...f, market: m })); }}>
                <SelectTrigger className="w-full lg:w-44" aria-label={$t('common.market')}><SelectValue>{(v: string) => getMarkets().find((x) => `${x.locationCode}:${x.language}` === v)?.label}</SelectValue></SelectTrigger>
                <SelectContent>{getMarkets().map((m) => <SelectItem key={`${m.locationCode}:${m.language}`} value={`${m.locationCode}:${m.language}`}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.view} onValueChange={(v) => v && setForm((f) => ({ ...f, view: v as View }))}>
                <SelectTrigger className="w-full lg:w-36" aria-label={$t('keywordResearch.method')}><SelectValue>{(v: string) => getResearchViews()[v as View]}</SelectValue></SelectTrigger>
                <SelectContent>{VIEWS.map((v) => <SelectItem key={v} value={v}>{getResearchViews()[v]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={busy} className="lg:px-6">{busy ? $t('common.querying') : $t('common.query')}</Button>
          </form>
          <p className="text-xs text-muted-foreground">{$t('keywordResearch.searchModesHelp')}</p>
          {error ? <p role="alert" className="nr-error">{error}</p> : null}
        </Card>
      )}
      {run ? (
        <Results run={run} ranks={ranks} reused={reused} busy={busy} onRefresh={() => void search(true)} projectId={project?.id} />
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
            <span className="text-xs text-muted-foreground">{getResearchViews()[r.spec.view as View] ?? r.spec.view} · {marketLabel(r.spec)}</span>
            <span className="w-24 text-xs text-muted-foreground tabular-nums">{r.status === "completed" ? $t('keywordResearch.keywords',{0:r.count ?? 0}) : getStatusText()[r.status] ?? r.status}</span>
            <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">{fmtTime(r.completedAt || r.createdAt)}</span>
          </button>
        ))}
      </Card>
    </section>
  );
}

const helper = createColumnHelper<KeywordItem>();
function Results({ run, ranks, reused, busy, onRefresh, projectId }: { run: ResearchRun; ranks?: Ranks; reused: boolean; busy: boolean; onRefresh: () => void; projectId?: number }) {
  const items = run.result?.items ?? [];
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "volume", desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [rowSelection, setRowSelection] = useState({});
  const [detail, setDetail] = useState<KeywordItem>();
  const anchorRef = useSelectionAnchor();
  const rows = useMemo(() => applyFilters(items, filters), [items, filters]);
  useEffect(() => { setRowSelection({}); setPagination((p) => ({ ...p, pageIndex: 0 })); }, [run.id, filters]);
  const seed = items.find((i) => i.keyword.toLowerCase() === run.spec.target.toLowerCase());
  const columns = useMemo<ColumnDef<KeywordItem>[]>(
    () => [
      makeSelectionColumn<KeywordItem>(anchorRef),
      helper.accessor("keyword", { header: ({ column }) => <SortableHeader column={column} label={$t('common.keywords')} />, cell: ({ getValue }) => <span className="block max-w-sm truncate font-medium" title={getValue()}>{getValue()}</span> }) as ColumnDef<KeywordItem>,
      helper.accessor("volume", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.monthlyVolume')} align="right" />, cell: ({ getValue }) => metric(getValue()), meta: right }) as ColumnDef<KeywordItem>,
      helper.accessor("cpc", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="CPC" align="right" />, cell: ({ getValue }) => (getValue() == null ? "—" : `$${getValue()!.toFixed(2)}`), meta: right }) as ColumnDef<KeywordItem>,
      helper.accessor("competition", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('keywordResearch.competition')} align="right" />, cell: ({ getValue }) => (getValue() == null ? "—" : getValue()!.toFixed(2)), meta: right }) as ColumnDef<KeywordItem>,
      helper.accessor("difficulty", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.difficulty')} align="right" />, cell: ({ getValue }) => <ScoreBadge value={getValue()} />, meta: right }) as ColumnDef<KeywordItem>,
      helper.accessor("intent", { enableSorting: false, header: () => <WithInfo help={help($t('common.intent'))}>{$t('common.intent')}</WithInfo>, cell: ({ getValue }) => <IntentBadge intent={getValue()} /> }) as ColumnDef<KeywordItem>,
      helper.display({ id: "rank", header: () => <span title={$t('keywordResearch.averageGooglePositionOverLast')}>{$t('common.sitePosition')}</span>, cell: ({ row }) => { const r = rankOf(ranks, row.original.keyword); return r ? r.position.toFixed(1) : "—"; }, meta: right }) as ColumnDef<KeywordItem>,
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
  const handOffRows = (items: KeywordItem[]): HandOffKeyword[] => items.map((i) => ({ keyword: i.keyword, market: { locationCode: run.spec.locationCode, language: run.spec.language }, volume: i.volume, difficulty: i.difficulty, intent: i.intent, rank: rankOf(ranks, i.keyword) }));
  const csv = (list: KeywordItem[]) =>
    downloadCsv($t('keywordResearch.keywordResearch',{0:run.spec.target,1:marketLabel(run.spec)}), [$t('common.keywords'), $t('common.monthlyVolume'), "CPC", $t('keywordResearch.competition'), $t('common.difficulty'), $t('common.intent'), $t('common.sitePosition')], list.map((r): CsvValue[] => [r.keyword, r.volume, r.cpc, r.competition, r.difficulty, getIntentLabels()[toIntent(r.intent)], rankOf(ranks, r.keyword)?.position ?? ""])) || toast.error(() => ($t('common.noKeywordsExport')));
  const save = async () => {
    try {
      const r = await keywordRequest<{ saved: number; skipped: number }>("saveFromRun", { runId: String(run.id), itemIds: selected.map((s) => s.id) });
      toast.success(() => ($t('common.keywordsSaved',{0:r.saved,1:r.skipped ? $t('common.alreadySaved',{0:r.skipped}) : ""})));
      setRowSelection({});
    } catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.saveFailed'))); }
  };
  if (run.status !== "completed") {
    return <EmptyState icon={<Search />} title={getStatusText()[run.status] ?? $t('common.lookupNotComplete')} description={run.errorCode || $t('common.notRunSameLookupAgain')} />;
  }
  return (
    <div className="space-y-4">
      {reused ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{$tj('keywordResearch.resultNoNewCharge',{0:fmtTime(run.completedAt || run.createdAt)})}<InfoTip>{$t('keywordResearch.sameCriteriaCheckedLast30')}</InfoTip><Button variant="link" size="sm" className="h-auto p-0" disabled={busy} onClick={onRefresh}>{$t('common.queryAgain')}</Button></p>
      ) : null}
      {seed ? <OverviewStats item={seed} rank={rankOf(ranks, seed.keyword)} /> : null}
      <Card className="gap-0 py-0">
        <DataTable
          table={table}
          isFiltered={activeCount(filters) > 0}
          onClearFilters={() => setFilters(EMPTY)}
          onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,[role=checkbox],a")) return; setDetail(row.original); }}
          empty={{ title: $t('keywordResearch.noKeywordsFound'), description: $t('keywordResearch.tryAnotherKeywordMethod') }}
          toolbar={
            <>
              <DataTableToolbar actions={<Button variant="outline" size="sm" onClick={() => csv(rows)}><Download data-icon="inline-start" />{$t('common.exportCsv')}</Button>}>
                <DataTableFilterToggle open={showFilters} activeCount={activeCount(filters)} onToggle={() => setShowFilters((v) => !v)} />
                <span className="text-xs text-muted-foreground">
                  {activeCount(filters) ? $t('common.showing',{0:rows.length,1:items.length}) : $t('common.keywordsTotal',{0:items.length})} · {getResearchViews()[run.spec.view as View] ?? run.spec.view} · {marketLabel(run.spec)} · {fmtTime(run.completedAt || run.createdAt)}
                </span>
              </DataTableToolbar>
              {showFilters ? <KeywordFilters value={filters} onChange={setFilters} /> : null}
            </>
          }
          footer={rows.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null}
        />
      </Card>
      {detail ? <KeywordDetail item={detail} market={run.spec} rank={rankOf(ranks, detail.keyword)} onClose={() => setDetail(undefined)} projectId={projectId} /> : null}
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

// Details of one keyword: its numbers, 12-month trend, where the site ranks, and (on request) the top search results.
export function KeywordDetail({ item, market, rank, onClose }: { item: Pick<KeywordItem, "keyword" | "volume" | "difficulty" | "cpc" | "competition" | "intent" | "monthlySearches">; market: { locationCode: number; language: string } | null; rank?: { position: number; clicks: number; impressions: number; page: string }; onClose: () => void; projectId?: number }) {
  const [serp, setSerp] = useState<ResearchRun>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState("");
  const load = async () => {
    if (!market) return;
    setBusy(true); setError("");
    try { setSerp(await keywordRequest<ResearchRun>("run", { target: item.keyword, view: "serp", locationCode: market.locationCode, language: market.language, limit: 20, requestKey: requestKey() })); }
    catch (e) { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('keywordResearch.notLoadSearchResults'))); }
    finally { setBusy(false); }
  };
  const results = (serp?.result?.items ?? []).slice(0, 10);
  return (
    <DetailDrawer open onClose={onClose} title={item.keyword} description={market ? $t('keywordResearch.dataforseoMarketEstimate',{0:marketLabel(market)}) : $t('keywordResearch.savedSearchPerformanceNoMarket')}>
      <div className="space-y-5 text-sm">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">{$t('common.monthlyVolume')}</p><p className="text-lg font-semibold tabular-nums">{metric(item.volume)}</p></div>
          <div><p className="text-xs text-muted-foreground">{$t('common.difficulty')}</p><ScoreBadge value={item.difficulty} /></div>
          <div><p className="text-xs text-muted-foreground">CPC</p><p className="text-lg font-semibold tabular-nums">{item.cpc == null ? "—" : `$${item.cpc.toFixed(2)}`}</p></div>
          <div><p className="text-xs text-muted-foreground">{$t('common.intent')}</p><IntentBadge intent={item.intent} /></div>
        </div>
        <section className="space-y-2"><h3 className="text-sm font-semibold">{$t('keywordResearch.value12MonthSearchVolume')}</h3><AreaTrendChart trend={item.monthlySearches} /></section>
        <section className="space-y-1"><h3 className="text-sm font-semibold">{$t('common.sitePosition')}</h3>
          {rank ? <p>{$tj('keywordResearch.averagePositionOverLast28',{0:rank.position.toFixed(1),1:rank.clicks.toLocaleString(getCurrentLocale()),2:rank.impressions.toLocaleString(getCurrentLocale())})} {safeLink(rank.page) ? <a className="nr-link" href={safeLink(rank.page)} target="_blank" rel="noreferrer">{rank.page}</a> : rank.page}</p> : <p className="text-muted-foreground">{$t('keywordResearch.noImpressionsKeywordSearchConsole')}</p>}
        </section>
        <section className="space-y-2"><h3 className="text-sm font-semibold">{$t('keywordResearch.searchResults')}</h3>
          {!market ? <p className="text-muted-foreground">{$t('keywordResearch.noMarketInfoSearchResults')}</p> : !serp ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>{busy ? $t('common.loadingLoading') : $t('keywordResearch.viewTop10Results')}</Button>
            : serp.status !== "completed" ? <p className="text-muted-foreground">{getStatusText()[serp.status] ?? $t('keywordResearch.noSearchResultsRead')}</p>
            : <ol className="space-y-2">{results.map((r, i) => <li key={r.id || i} className="flex gap-2"><span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{r.position ?? i + 1}</span><span className="min-w-0"><span className="block truncate font-medium">{r.title || r.url}</span>{safeLink(r.url) ? <a className="block truncate text-xs text-primary hover:underline" href={safeLink(r.url)} target="_blank" rel="noreferrer">{r.url}</a> : <span className="block truncate text-xs">{r.url}</span>}</span></li>)}{!results.length ? <li className="text-muted-foreground">{$t('keywordResearch.noOrganicSearchResults')}</li> : null}</ol>}
          {serp?.status === "completed" ? <p className="text-xs text-muted-foreground">{$tj('keywordResearch.readViewingAgainWithin30',{0:fmtTime(serp.completedAt || serp.createdAt)})}</p> : null}
          {error ? <p role="alert" className="nr-error">{error}</p> : null}
        </section>
      </div>
    </DetailDrawer>
  );
}
