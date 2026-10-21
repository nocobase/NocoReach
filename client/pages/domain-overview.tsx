import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
// 域名概览: ported from every-app/open-seo db8bde1 src/client/features/domain/ (DomainOverviewPage, DomainSearchCard,
// KeywordsTab, PagesTab, DomainKeywordsTable, DomainPagesTable; MIT). Changes: backlinks left out (user decision), one
// paid query per tab through NocoReach's DataForSEO layer (查询 reads the ranking keywords, which also carry the
// traffic and position counts; pages only on request), 本站点击 next to an estimate when the site is your own,
// saving keywords to 关键词, Chinese copy, CSV export only.
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { HandOffBar } from "./hand-off-bar";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { Download, Globe, History, Save, Search } from "lucide-react";
import { toast } from "#lib/toast";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#components/ui/select";
import { TabsTrigger } from "#components/ui/tabs";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableFilterGroup, DataTableFilterPanel, DataTableFilterToggle, DataTableTabs, DataTableToolbar } from "#components/seo/data-table-toolbar";
import { TablePagination } from "#components/seo/table-pagination";
import { TableBulkActionButton } from "#components/seo/table-bulk-action-bar";
import { SortableHeader } from "#components/seo/sortable-header";
import { StatTile } from "#components/seo/stat-tile";
import { ScoreBadge } from "#components/seo/score-badge";
import { IntentBadge, getIntentLabels, toIntent } from "#components/seo/intent-badge";
import { downloadCsv, type CsvValue } from "#components/seo/csv";
import { useProject } from "./reach-data";
import { currentProjectId } from "./current-project";
import { safeLink } from "./analytics";
import { keywordRequest, getMarkets, marketLabel, metric, rankOf, rankRequest, type KeywordConnectionState, type Ranks } from "./keyword-api";
import { DraftHandOffDialog, KeywordHandOffDialog, type HandOffKeyword, type TaskDraft } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { competitorKeywordsDraft, competitorPagesDraft, ownPagesDraft } from "./seo-hand-off";
import "./reach-workspace.css";
import "./data-views.css";
import { InfoTip, WithInfo } from "#components/reach/info-tip";
import { help } from "./glossary";
import { formatCount, formatDateTime } from '#lib/format';

type Item = { id: string; keyword: string; url: string; volume: number | null; difficulty: number | null; intent: string | null; position: number | null; traffic: number | null; keywords: number | null; cpc: number | null };
type Spec = { kind: "domain"; view: "keywords" | "pages"; target: string; locationCode: number; language: string };
type Run = { id: number | string; status: string; spec: Spec; result?: { items: Item[]; totalCount: number | null; summary?: { traffic: number; keywords: number; top3: number; top10: number } | null }; errorCode?: string; createdAt: string; completedAt?: string };
type Recent = { id: string; status: string; spec: Spec; createdAt: string; completedAt: string | null; count: number | null; summary: Run["result"] extends infer R ? R extends { summary?: infer S } ? S : null : null };
const call = <T,>(action: string, body: object = {}) => api.action<T>("nrDomains", action, { method: "POST", body: { projectId: String(currentProjectId()), ...body }, unwrap: "data" });
const requestKey = () => crypto.randomUUID().replace(/-/g, "");
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const fmtTime = (v?: string | null) => formatDateTime(v);
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const bare = (d?: string) => String(d || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

export default function DomainOverview({ embedded = false }: { embedded?: boolean } = {}) {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const own = (project?.domains ?? []).map(bare);
  const [connection, setConnection] = useState<KeywordConnectionState>();
  const [recent, setRecent] = useState<Recent[]>();
  const [runs, setRuns] = useState<{ keywords?: Run; pages?: Run }>({});
  const [busy, setBusy] = useState<"" | "keywords" | "pages">("");
  const [error, setError] = useMessageState("");
  const market = getMarkets().find((m) => String(m.locationCode) === params.get("loc") && m.language === params.get("lang")) ?? getMarkets()[0];
  const [form, setForm] = useState({ target: params.get("d") ?? "", market });
  const tab = params.get("tab") === "pages" ? "pages" : "keywords";
  useEffect(() => { if (!form.target && own[0]) setForm((f) => ({ ...f, target: own[0] })); }, [own[0]]);
  const loadRecent = () => call<Recent[]>("list").then(setRecent).catch(() => setRecent([]));
  useEffect(() => {
    void keywordRequest<KeywordConnectionState>("status").then(setConnection).catch(() => setConnection({ configured: false, verifiedAt: null, monthlyBudgetUsd: 5 }));
    void loadRecent();
  }, []);
  // Opened runs live in the URL (k = keywords run, p = pages run), so a reload reopens them without a new query.
  useEffect(() => {
    for (const [key, view] of [["k", "keywords"], ["p", "pages"]] as const) {
      const id = params.get(key);
      if (id && String(runs[view]?.id) !== id) void call<Run>("getRun", { runId: id }).then((r) => setRuns((s) => ({ ...s, [view]: r }))).catch(() => undefined);
      if (!id && runs[view]) setRuns((s) => ({ ...s, [view]: undefined }));
    }
  }, [params.get("k"), params.get("p")]);
  const query = async (view: "keywords" | "pages", target = form.target, m = form.market) => {
    setBusy(view); setError("");
    try {
      const r = await call<Run>("run", { view, target, locationCode: m.locationCode, language: m.language, requestKey: requestKey() });
      setRuns((s) => (view === "keywords" ? { keywords: r } : { ...s, pages: r }));
      const p = new URLSearchParams(params);
      p.set("d", r.spec.target); p.set("loc", String(r.spec.locationCode)); p.set("lang", r.spec.language); p.set(view === "keywords" ? "k" : "p", String(r.id)); if (view === "keywords") { p.delete("p"); p.delete("tab"); } else p.set("tab", "pages");
      setParams(p, { replace: true }); void loadRecent();
    } catch (e) { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('common.lookupNotCompleteTryAgain'))); }
    finally { setBusy(""); }
  };
  const shown = runs.keywords;
  const isOwn = Boolean(shown && own.includes(bare(shown.spec.target)));
  const setTab = (v: string) => { const p = new URLSearchParams(params); v === "pages" ? p.set("tab", "pages") : p.delete("tab"); setParams(p, { replace: true }); };
  const actions = shown ? <Button variant="outline" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}><History data-icon="inline-start" />{$t('domainOverview.recentLookups')}</Button> : undefined;
  const body = (
    <>
      {connection && !connection.verifiedAt ? (
        <EmptyState icon={<Globe />} title={$t('common.connectDataforseoFirst')} description={$t('domainOverview.competitorAnalysisUsesDataforseoData')} />
      ) : (
        <Card className="px-4">
          <form className="flex flex-col gap-2 lg:flex-row lg:items-center" onSubmit={(e) => { e.preventDefault(); void query("keywords"); }}>
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" aria-label={$t('domainOverview.domain')} placeholder={$t('domainOverview.exampleCom')} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
            </div>
            <Select value={`${form.market.locationCode}:${form.market.language}`} onValueChange={(v) => { const m = getMarkets().find((x) => `${x.locationCode}:${x.language}` === v); if (m) setForm((f) => ({ ...f, market: m })); }}>
              <SelectTrigger className="w-full lg:w-44" aria-label={$t('common.market')}><SelectValue>{(v: string) => $t(getMarkets().find((x) => `${x.locationCode}:${x.language}` === v)?.label ?? "")}</SelectValue></SelectTrigger>
              <SelectContent className="w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal">{getMarkets().map((m) => <SelectItem key={`${m.locationCode}:${m.language}`} value={`${m.locationCode}:${m.language}`}>{$t(m.label)}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="submit" disabled={Boolean(busy) || !form.target.trim()} className="lg:px-6">{busy === "keywords" ? $t('common.querying') : $t('common.query')}</Button>
            <InfoTip label={$t('common.info')}><p>{$t('domainOverview.organicRankingsDomainIncludingSubdomains')}</p><p>{$t('competitorsPage.lookupBilling')}</p></InfoTip>
          </form>
          {error ? <p role="alert" className="nr-error">{error}</p> : null}
        </Card>
      )}
      {shown ? (
        shown.status !== "completed" ? <EmptyState icon={<Globe />} title={$t('common.lookupNotComplete')} description={shown.errorCode || $t('common.notRunSameLookupAgain')} /> : (
          <>
            <Summary run={shown} />
            <Card className="gap-0 py-0">
              <DataTableTabs value={tab} onValueChange={setTab}>
                <TabsTrigger value="keywords">{$tj('domainOverview.keywords',{0:shown.result?.items.length ?? 0})}</TabsTrigger>
                <TabsTrigger value="pages">{$tj('domainOverview.pages',{0:runs.pages?.result ? ` ${runs.pages.result.items.length}` : ""})}</TabsTrigger>
              </DataTableTabs>
              {tab === "keywords" ? <KeywordsTable run={shown} own={isOwn} /> : runs.pages && runs.pages.spec.target === shown.spec.target ? <PagesTable own={isOwn} run={runs.pages} /> : (
                <div className="space-y-2 p-6 text-sm">
                  <p className="text-muted-foreground">{$tj('domainOverview.seeWhichPagesBringMost',{0:shown.spec.target})}</p>
                  <Button variant="outline" disabled={Boolean(busy)} onClick={() => void query("pages", shown.spec.target, getMarkets().find((m) => m.locationCode === shown.spec.locationCode && m.language === shown.spec.language) ?? form.market)}>{busy === "pages" ? $t('common.querying') : $t('domainOverview.lookUpTopPages')}</Button>
                </div>
              )}
            </Card>
          </>
        )
      ) : connection?.verifiedAt ? <RecentList recent={recent} onOpen={(r) => {
        // A site's row reopens its keywords query and, if it was asked for, the pages query of the same site and market.
        const same = (x: Recent) => x.spec.target === r.spec.target && x.spec.locationCode === r.spec.locationCode && x.spec.language === r.spec.language && x.status === "completed";
        const pages = recent?.find((x) => x.spec.view === "pages" && same(x));
        const p = new URLSearchParams(); p.set("d", r.spec.target); p.set("loc", String(r.spec.locationCode)); p.set("lang", r.spec.language); p.set("k", r.id); if (pages) p.set("p", pages.id);
        setParams(p, { replace: true });
      }} /> : null}
    </>
  );
  // On 竞品's 查域名 tab (embedded) the page frame and title belong to 竞品.
  if (embedded) return <>{actions ? <div className="flex justify-end">{actions}</div> : null}{body}</>;
  return (
    <PageContainer className="nr-data-page">
      <PageHeader title={$t('common.competitor')} description={$t('domainOverview.lookUpKeywordsTopPages')} actions={actions} />
      {body}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

function Summary({ run }: { run: Run }) {
  const s = run.result?.summary;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[[$t('domainOverview.estimatedOrganicTrafficMonth'), s?.traffic], [$t('common.rankingKeywords'), s?.keywords], [$t('domainOverview.top3'), s?.top3], [$t('domainOverview.top10'), s?.top10]].map(([label, v]) => (
          <Card key={String(label)} className="gap-0 p-4" data-metric={label}><StatTile label={String(label)} help={help(String(label))} value={v == null ? "—" : formatCount(Math.round(Number(v)))} /></Card>
        ))}
      </div>
      <p className="nr-footnote">{run.spec.target} · {marketLabel(run.spec)} · {fmtTime(run.completedAt || run.createdAt)}</p>
    </div>
  );
}

type Row = Item & { siteClicks?: number };
const kHelper = createColumnHelper<Row>();
function KeywordsTable({ run, own }: { run: Run; own: boolean }) {
  const { project } = useProject();
  const items = run.result?.items ?? [];
  const [ranks, setRanks] = useState<Ranks>();
  const [filter, setFilter] = useState({ include: "", exclude: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "traffic", desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [rowSelection, setRowSelection] = useState({});
  const anchorRef = useSelectionAnchor();
  useEffect(() => { if (project && items.length) void rankRequest(project.id, items.map((i) => i.keyword)).then(setRanks).catch(() => undefined); }, [run.id, project?.id]);
  const terms = (s: string) => s.split(/[,，]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const rows = useMemo(() => { const inc = terms(filter.include), exc = terms(filter.exclude); return items.filter((r) => { const k = r.keyword.toLowerCase(); return inc.every((t) => k.includes(t)) && !exc.some((t) => k.includes(t)); }).map((r) => ({ ...r, siteClicks: rankOf(ranks, r.keyword)?.clicks })); }, [items, filter, ranks]);
  const active = Number(Boolean(filter.include)) + Number(Boolean(filter.exclude));
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    makeSelectionColumn<Row>(anchorRef),
    kHelper.accessor("keyword", { header: ({ column }) => <SortableHeader column={column} label={$t('common.keywords')} />, cell: ({ getValue }) => <span className="block max-w-xs truncate font-medium" title={getValue()}>{getValue()}</span> }) as ColumnDef<Row>,
    kHelper.accessor("position", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.position')} align="right" />, cell: ({ getValue }) => metric(getValue()), meta: right }) as ColumnDef<Row>,
    kHelper.accessor("volume", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.monthlyVolume')} align="right" />, cell: ({ getValue }) => metric(getValue()), meta: right }) as ColumnDef<Row>,
    kHelper.accessor("traffic", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('domainOverview.estimatedTraffic')} align="right" />, cell: ({ getValue }) => (getValue() == null ? "—" : Math.round(getValue()!).toLocaleString(getCurrentLocale())), meta: right }) as ColumnDef<Row>,
    kHelper.accessor("url", { enableSorting: false, header: () => $t('common.rankingPage'), cell: ({ getValue }) => (safeLink(getValue()) ? <a className="block max-w-56 truncate text-primary hover:underline" href={safeLink(getValue())} target="_blank" rel="noreferrer" title={getValue()}>{pathOf(getValue())}</a> : <span className="block max-w-56 truncate">{getValue()}</span>) }) as ColumnDef<Row>,
    kHelper.accessor("difficulty", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.difficulty')} align="right" />, cell: ({ getValue }) => <ScoreBadge value={getValue()} />, meta: right }) as ColumnDef<Row>,
    kHelper.accessor("intent", { enableSorting: false, header: () => <WithInfo help={help($t('common.intent'))}>{$t('common.intent')}</WithInfo>, cell: ({ getValue }) => <IntentBadge intent={getValue()} /> }) as ColumnDef<Row>,
    ...(own ? [kHelper.accessor("siteClicks", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('domainOverview.clicks')} align="right" />, cell: ({ getValue }) => (getValue() == null ? "—" : getValue()!.toLocaleString(getCurrentLocale())), meta: right }) as ColumnDef<Row>] : []),
  ], [anchorRef, own]);
  const table = useDataTable({ data: rows, columns, withSorting: true, withPagination: true, enableRowSelection: true, state: { rowSelection, pagination, sorting }, onRowSelectionChange: setRowSelection, onPaginationChange: setPagination, onSortingChange: setSorting, getRowId: (r) => r.id });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  // 交给 Agent: on your own site the words go to the keyword hand-off; a competitor's become “catch up on these words”.
  const [handing, setHanding] = useState<{ own: HandOffKeyword[] } | { draft: TaskDraft }>();
  const [handed, setHanded] = useState<HandOffResult>();
  const market = marketLabel(run.spec);
  const handOff = () => setHanding(own
    ? { own: selected.map((r) => ({ keyword: r.keyword, market: { locationCode: run.spec.locationCode, language: run.spec.language }, volume: r.volume, difficulty: r.difficulty, intent: r.intent, rank: rankOf(ranks, r.keyword) })) }
    : { draft: competitorKeywordsDraft(run.spec.target, market, selected.map((r) => ({ keyword: r.keyword, position: r.position, volume: r.volume, traffic: r.traffic, url: r.url, difficulty: r.difficulty, intent: r.intent, ownClicks: rankOf(ranks, r.keyword)?.clicks ?? null }))) });
  useHandOffSource("domain-keywords", project ? { count: selected.length, open: handOff, noun: $t('common.keywordsSelected'), actions: <> <TableBulkActionButton icon={<Save className="size-3.5" />} onClick={() => void save()}>{$t('common.saveKeywords')}</TableBulkActionButton> <TableBulkActionButton icon={<Download className="size-3.5" />} onClick={() => csv(selected)}>{$t('common.export')}</TableBulkActionButton> </>, clear: () => setRowSelection({}) } : null);
  const csv = (list: (Row)[]) => downloadCsv($t('domainOverview.competitorKeywords',{0:run.spec.target}), [$t('common.keywords'), $t('common.position'), $t('common.monthlyVolume'), $t('domainOverview.estimatedTraffic'), $t('common.rankingPage'), $t('common.difficulty'), $t('common.intent'), ...(own ? [$t('domainOverview.clicks')] : [])], list.map((r): CsvValue[] => [r.keyword, r.position, r.volume, r.traffic, r.url, r.difficulty, getIntentLabels()[toIntent(r.intent)], ...(own ? [r.siteClicks ?? ""] : [])])) || toast.error(() => ($t('common.noKeywordsExport')));
  const save = async () => {
    try { const r = await keywordRequest<{ saved: number; skipped: number }>("saveFromRun", { runId: String(run.id), itemIds: selected.map((s) => s.id) }); toast.success(() => ($t('common.keywordsSaved',{0:r.saved,1:r.skipped ? $t('common.alreadySaved',{0:r.skipped}) : ""}))); setRowSelection({}); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.saveFailed'))); }
  };
  return (
    <>
      <DataTable table={table} isFiltered={active > 0} onClearFilters={() => setFilter({ include: "", exclude: "" })} empty={{ title: $t('domainOverview.noRankingKeywordsFound'), description: $t('domainOverview.websiteMayNoOrganicRankings') }}
        toolbar={<>
          <DataTableToolbar actions={<Button variant="outline" size="sm" onClick={() => csv(rows)}><Download data-icon="inline-start" />{$t('common.exportCsv')}</Button>}>
            <DataTableFilterToggle open={showFilters} activeCount={active} onToggle={() => setShowFilters((v) => !v)} />
            <span className="text-xs text-muted-foreground">{run.result?.totalCount ? $t('domainOverview.totalMostEstimatedTrafficListed',{0:run.result.totalCount.toLocaleString(getCurrentLocale()),1:items.length}) : $t('common.total',{0:items.length})}</span>
          </DataTableToolbar>
          {showFilters ? <DataTableFilterPanel activeCount={active} onReset={() => setFilter({ include: "", exclude: "" })}><div className="grid gap-2 sm:grid-cols-2"><DataTableFilterGroup label={$t('common.include')}><Input aria-label={$t('common.include')} className="h-7" placeholder={$t('common.containCommaSeparated')} value={filter.include} onChange={(e) => setFilter((f) => ({ ...f, include: e.target.value }))} /></DataTableFilterGroup><DataTableFilterGroup label={$t('common.exclude')}><Input aria-label={$t('common.exclude')} className="h-7" placeholder={$t('common.excludeAny')} value={filter.exclude} onChange={(e) => setFilter((f) => ({ ...f, exclude: e.target.value }))} /></DataTableFilterGroup></div></DataTableFilterPanel> : null}
        </>}
        footer={rows.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={[50, 100] as const} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null} />
      {own ? <p className="px-4 pb-3 text-xs text-muted-foreground">{$t('domainOverview.siteClicksActualSearchConsole')}</p> : null}
      <HandOffNotice result={handed} />
      {handing && project ? ("own" in handing
        ? <KeywordHandOffDialog projectId={project.id} rows={handing.own} onClose={() => setHanding(undefined)} onDone={(r) => { setHanding(undefined); setRowSelection({}); setHanded({ ok: true, text: r.title, taskId: r.taskId }); }} />
        : <DraftHandOffDialog projectId={project.id} draft={handing.draft} playbookId="content-outline" description={$t('domainOverview.selectedKeywordsBecomeOneTask',{0:selected.length})} onClose={() => setHanding(undefined)} onDone={(r) => { setHanding(undefined); setRowSelection({}); setHanded(r); }} />) : null}
    </>
  );
}

const pHelper = createColumnHelper<Item>();
function PagesTable({ run, own }: { run: Run; own: boolean }) {
  const { project } = useProject();
  const items = run.result?.items ?? [];
  const [sorting, setSorting] = useState<SortingState>([{ id: "traffic", desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [rowSelection, setRowSelection] = useState({});
  const [handing, setHanding] = useState<TaskDraft>();
  const [handed, setHanded] = useState<HandOffResult>();
  const anchorRef = useSelectionAnchor();
  const columns = useMemo<ColumnDef<Item>[]>(() => [
    makeSelectionColumn<Item>(anchorRef),
    pHelper.accessor("url", { enableSorting: false, header: () => $t('common.page'), cell: ({ getValue }) => (safeLink(getValue()) ? <a className="block max-w-xl truncate text-primary hover:underline" href={safeLink(getValue())} target="_blank" rel="noreferrer" title={getValue()}>{getValue()}</a> : <span className="block max-w-xl truncate">{getValue()}</span>) }) as ColumnDef<Item>,
    pHelper.accessor("traffic", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('domainOverview.estimatedTraffic')} align="right" />, cell: ({ getValue }) => (getValue() == null ? "—" : Math.round(getValue()!).toLocaleString(getCurrentLocale())), meta: right }) as ColumnDef<Item>,
    pHelper.accessor("keywords", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.rankingKeywords')} align="right" />, cell: ({ getValue }) => metric(getValue()), meta: right }) as ColumnDef<Item>,
  ], [anchorRef]);
  const table = useDataTable({ data: items, columns, withSorting: true, withPagination: true, enableRowSelection: true, state: { pagination, sorting, rowSelection }, onPaginationChange: setPagination, onSortingChange: setSorting, onRowSelectionChange: setRowSelection, getRowId: (r) => r.id });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original), market = marketLabel(run.spec);
  const rows = selected.map((r) => ({ url: r.url, traffic: r.traffic, keywords: r.keywords }));
  useHandOffSource("domain-pages", project ? { count: selected.length, open: () => setHanding(own ? ownPagesDraft(run.spec.target, market, rows) : competitorPagesDraft(run.spec.target, market, rows)), noun: $t('common.pagesSelected'), clear: () => setRowSelection({}) } : null);
  return <><DataTable table={table} empty={{ title: $t('domainOverview.noPagesFound') }}
    toolbar={<DataTableToolbar actions={<Button variant="outline" size="sm" onClick={() => downloadCsv($t('domainOverview.competitorPages',{0:run.spec.target}), [$t('common.page'), $t('domainOverview.estimatedTraffic'), $t('common.rankingKeywords')], items.map((r): CsvValue[] => [r.url, r.traffic, r.keywords])) || toast.error(() => ($t('domainOverview.noPagesExport')))}><Download data-icon="inline-start" />{$t('common.exportCsv')}</Button>}><span className="text-xs text-muted-foreground">{marketLabel(run.spec)} · {fmtTime(run.completedAt || run.createdAt)}</span></DataTableToolbar>}
    footer={items.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={[50, 100] as const} totalCount={items.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null} />
    <HandOffNotice result={handed} />
    {handing && project ? <DraftHandOffDialog projectId={project.id} draft={handing} playbookId={own ? "optimize-page" : "competitor-compare"} page={own && rows.length === 1 ? rows[0].url : undefined} description={own ? $t('domainOverview.selectedPagesBecomeOneTask') : $t('domainOverview.selectedCompetitorPagesBecomeOne')} onClose={() => setHanding(undefined)} onDone={(r) => { setHanding(undefined); setRowSelection({}); setHanded(r); }} /> : null}
  </>;
}

function RecentList({ recent, onOpen }: { recent?: Recent[]; onOpen: (r: Recent) => void }) {
  if (!recent) return <ListSkeleton rows={4} />;
  recent = recent.filter((r) => r.spec.view === "keywords");
  if (!recent.length) return <EmptyState icon={<Globe />} title={$t('domainOverview.noWebsitesLookedUpYet')} description={$t('domainOverview.enterDomainSiteDefaultSee')} />;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{$t('domainOverview.recentLookups')}</h2>
      <Card className="gap-0 py-0">
        {recent.map((r) => (
          <button key={r.id} type="button" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 text-left text-sm last:border-0 hover:bg-muted/50" onClick={() => onOpen(r)}>
            <span className="min-w-0 flex-1 truncate font-medium">{r.spec.target}</span>
            <span className="text-xs text-muted-foreground">{marketLabel(r.spec)}{r.summary ? $t('domainOverview.estimatedTrafficMetaValue',{0:Math.round(r.summary.traffic).toLocaleString(getCurrentLocale())}) : ""}</span>
            <span className="w-24 text-xs text-muted-foreground tabular-nums">{r.status === "completed" ? $t('domainOverview.itemCount',{0:r.count ?? 0}) : $t('common.notComplete')}</span>
            <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">{fmtTime(r.completedAt || r.createdAt)}</span>
          </button>
        ))}
      </Card>
    </section>
  );
}
