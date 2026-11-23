import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
// 域名概览: ported from every-app/open-seo db8bde1 src/client/features/domain/ (DomainOverviewPage, DomainSearchCard,
// KeywordsTab, PagesTab, DomainKeywordsTable, DomainPagesTable; MIT). Changes: backlinks on a page of their own (Search &
// market › Backlinks, opened from View backlinks), one
// paid query per tab through NocoReach's DataForSEO layer (查询 reads the ranking keywords, which also carry the
// traffic and position counts; pages only on request), 本站点击 next to an estimate when the site is your own,
// saving keywords to 关键词, Chinese copy, CSV export only.
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { HandOffBar } from "./hand-off-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { Download, Globe, History, Link2, Save, Search } from "lucide-react";
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
import { rankBatches } from "./domain-rank-batches";
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
import { refreshNavSources } from '#components/app-shell/nav-badges';

type Item = { id: string; keyword: string; url: string; volume: number | null; difficulty: number | null; intent: string | null; position: number | null; traffic: number | null; keywords: number | null; cpc: number | null };
type Spec = { kind: "domain"; view: "keywords" | "pages"; target: string; locationCode: number; language: string; offset?: number; sort?: string };
// reused: a query returned the saved lookup of the last 30 days instead of asking DataForSEO again.
type Run = { id: number | string; status: string; spec: Spec; result?: { items: Item[]; totalCount: number | null; summary?: { traffic: number; keywords: number; top3: number; top10: number } | null }; errorCode?: string; createdAt: string; completedAt?: string; reused?: boolean; pages?: Run[] };
type Recent = { id: string; status: string; spec: Spec; createdAt: string; completedAt: string | null; count: number | null; summary: Run["result"] extends infer R ? R extends { summary?: infer S } ? S : null : null };
const call = <T,>(action: string, body: object = {}) => api.action<T>("nrDomains", action, { method: "POST", body: { projectId: String(currentProjectId()), ...body }, unwrap: "data" });
const requestKey = () => crypto.randomUUID().replace(/-/g, "");
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const fmtTime = (v?: string | null) => formatDateTime(v);
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
// A bare host: no scheme, www or path (Backlinks uses it too).
export const bare = (d?: string) => String(d || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

export default function DomainOverview({ embedded = false }: { embedded?: boolean } = {}) {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
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
  const query = async (view: "keywords" | "pages", target = form.target, m = form.market, forceRefresh = false) => {
    setBusy(view); setError("");
    try {
      const r = await call<Run>("run", { view, target, locationCode: m.locationCode, language: m.language, requestKey: requestKey(), ...(forceRefresh ? { forceRefresh: true } : {}) });
      setRuns((s) => (view === "keywords" ? { keywords: r } : { ...s, pages: r }));
      const p = new URLSearchParams(params);
      p.set("d", r.spec.target); p.set("loc", String(r.spec.locationCode)); p.set("lang", r.spec.language); p.set(view === "keywords" ? "k" : "p", String(r.id)); if (view === "keywords") { p.delete("p"); p.delete("tab"); } else p.set("tab", "pages");
      setParams(p, { replace: true }); void loadRecent();
    } catch (e) { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('common.lookupNotCompleteTryAgain'))); }
    finally { setBusy(""); }
  };
  const shown = runs.keywords;
  const isOwn = Boolean(shown && own.includes(bare(shown.spec.target)));
  const marketOf = (spec: Spec) => getMarkets().find((m) => m.locationCode === spec.locationCode && m.language === spec.language) ?? form.market;
  // The lookup on screen, when a query just returned a saved one: said so, with Check again (as on Keywords).
  const visible = tab === "pages" && runs.pages && shown && runs.pages.spec.target === shown.spec.target ? runs.pages : shown;
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
            <InfoTip label={$t('common.info')}><p>{$t('domainOverview.organicRankingsDomainIncludingSubdomains')}</p><p>{$t('domainOverview.keywordsBilling')}</p></InfoTip>
          </form>
          {error ? <p role="alert" className="nr-error">{error}</p> : null}
        </Card>
      )}
      {shown ? (
        shown.status !== "completed" ? <EmptyState icon={<Globe />} title={$t('common.lookupNotComplete')} description={shown.errorCode || $t('common.notRunSameLookupAgain')} /> : (
          <>
            {visible?.reused && visible.status === "completed" ? (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-domain-reused="">{$tj('keywordResearch.resultNoNewCharge', { 0: fmtTime(visible.completedAt || visible.createdAt) })}<InfoTip>{$t('domainOverview.sameLookupLast30')}</InfoTip><Button variant="link" size="sm" className="h-auto p-0" disabled={Boolean(busy)} onClick={() => void query(visible.spec.view, visible.spec.target, marketOf(visible.spec), true)}>{$t('common.queryAgain')}</Button></p>
            ) : null}
            <Summary run={shown} onBacklinks={() => navigate(`/backlinks?t=${encodeURIComponent(shown.spec.target)}`)} />
            <Card className="gap-0 py-0">
              <DataTableTabs value={tab} onValueChange={setTab}>
                <TabsTrigger value="keywords">{$tj('domainOverview.keywords',{0:shown.result?.totalCount ?? shown.result?.items.length ?? 0})}</TabsTrigger>
                <TabsTrigger value="pages">{$tj('domainOverview.pages',{0:runs.pages?.result ? ` ${runs.pages.result.items.length}` : ""})}</TabsTrigger>
              </DataTableTabs>
              {tab === "keywords" ? <KeywordsTable key={shown.id} run={shown} own={isOwn} /> : runs.pages && runs.pages.spec.target === shown.spec.target ? <PagesTable own={isOwn} run={runs.pages} /> : (
                <div className="space-y-2 p-6 text-sm">
                  <p className="text-muted-foreground">{$tj('domainOverview.seeWhichPagesBringMost',{0:shown.spec.target})}</p>
                  <Button variant="outline" disabled={Boolean(busy)} onClick={() => void query("pages", shown.spec.target, marketOf(shown.spec))}>{busy === "pages" ? $t('common.querying') : $t('domainOverview.lookUpTopPages')}</Button>
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

function Summary({ run, onBacklinks }: { run: Run; onBacklinks?: () => void }) {
  const s = run.result?.summary;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[[$t('domainOverview.estimatedOrganicTrafficMonth'), s?.traffic], [$t('common.rankingKeywords'), s?.keywords], [$t('domainOverview.top3'), s?.top3], [$t('domainOverview.top10'), s?.top10]].map(([label, v]) => (
          <Card key={String(label)} className="gap-0 p-4" data-metric={label}><StatTile label={String(label)} help={help(String(label))} value={v == null ? "—" : formatCount(Math.round(Number(v)))} /></Card>
        ))}
      </div>
      <p className="nr-footnote flex flex-wrap items-center gap-x-2">{run.spec.target} · {marketLabel(run.spec)} · {fmtTime(run.completedAt || run.createdAt)}{onBacklinks ? <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onBacklinks}><Link2 data-icon="inline-start" />{$t('domainOverview.viewBacklinks')}</Button> : null}</p>
    </div>
  );
}

type Row = Item & { siteClicks?: number; runId: string; rowId: string };
const kHelper = createColumnHelper<Row>();
// Keyword pages: DataForSEO is asked for one page of PAGE keywords at a time, when the person opens it, in the sort the
// table shows; each page is a lookup of its own, so one opened again within 30 days is not charged again.
const PAGE = 100;
const DEFAULT_SORT = "traffic:desc";
// The furthest page DataForSEO Labs reads (offset 10,000); the count below the table still says how many there are.
const MAX_OFFSET = 10000;
const SORTABLE = ["traffic", "volume", "position", "difficulty"];
// A sort's pages by offset: the first page and the later ones the server found already read.
type Book = Record<number, Run>;
const bookOf = (r: Run): Book => Object.fromEntries<Run>([[0, r], ...(r.pages ?? []).filter((p) => p.spec.offset).map((p): [number, Run] => [p.spec.offset ?? 0, p])]);
const toRows = (r: Run): Row[] => (r.result?.items ?? []).map((i) => ({ ...i, runId: String(r.id), rowId: `${r.id}:${i.id}` }));
function KeywordsTable({ run, own }: { run: Run; own: boolean }) {
  const { project } = useProject();
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [books, setBooks] = useState<Record<string, Book>>(() => ({ [DEFAULT_SORT]: bookOf(run) }));
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useMessageState("");
  const latestRef = useRef(0);
  const book = useMemo(() => books[sort] ?? {}, [books, sort]);
  const total = book[0]?.result?.totalCount ?? run.result?.totalCount ?? run.result?.items.length ?? 0;
  const loaded = useMemo(() => Object.keys(book).map(Number).sort((a, b) => a - b).map((o) => book[o]).filter((r) => r.status === "completed"), [book]);
  const allItems = useMemo(() => loaded.flatMap(toRows), [loaded]);
  const current = book[page * PAGE];
  const [ranks, setRanks] = useState<Ranks>();
  const rankedRef = useRef(new Set<string>());
  const [filter, setFilter] = useState({ include: "", exclude: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [filterPage, setFilterPage] = useState(0);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const anchorRef = useSelectionAnchor();
  // Your site's Search Console clicks on the loaded keywords: on your own site for the clicks column, on a competitor's
  // for the hand-off (ownClicks). Pages not asked about yet go in batches the server reads whole (up to 1,000 keywords);
  // a page counts as asked once its batch answered, so a failed batch is asked again when another page loads.
  useEffect(() => {
    if (!project) return;
    const fresh = loaded.filter((r) => !rankedRef.current.has(String(r.id)));
    for (const batch of rankBatches(fresh)) {
      batch.forEach((r) => rankedRef.current.add(String(r.id)));
      void rankRequest(project.id, batch.flatMap((r) => (r.result?.items ?? []).map((i) => i.keyword)))
        .then((r) => setRanks((s) => ({ ...r, ranks: { ...s?.ranks, ...r.ranks } })))
        .catch(() => batch.forEach((r) => rankedRef.current.delete(String(r.id))));
    }
  }, [loaded, project]);
  // Reads one page in one sort (the person opened it or changed the sort); only the latest request is shown.
  const load = async (offset: number, by: string) => {
    const seq = ++latestRef.current;
    setLoading(true); setLoadError("");
    try {
      const r = await call<Run>("run", { view: "keywords", target: run.spec.target, locationCode: run.spec.locationCode, language: run.spec.language, requestKey: requestKey(), ...(offset ? { offset } : {}), ...(by === DEFAULT_SORT ? {} : { sort: by }) });
      setBooks((b) => ({ ...b, [by]: offset ? { ...b[by], [offset]: r } : bookOf(r) }));
    } catch (e) { if (seq === latestRef.current) setLoadError(() => (e instanceof Error ? $legacyText(e.message) : $t('common.lookupNotCompleteTryAgain'))); }
    finally { if (seq === latestRef.current) setLoading(false); }
  };
  const openPage = (p: number) => { setPage(p); setLoadError(""); if (!book[p * PAGE]) void load(p * PAGE, sort); };
  const sorting = useMemo<SortingState>(() => { const [id, dir] = sort.split(":"); return [{ id, desc: dir === "desc" }]; }, [sort]);
  // A new sort starts again from its first page, read from DataForSEO unless it was read in this view already.
  const onSortingChange = (u: SortingState | ((s: SortingState) => SortingState)) => {
    const next = (typeof u === "function" ? u(sorting) : u)[0];
    const by = next && SORTABLE.includes(next.id) ? `${next.id}:${next.desc ? "desc" : "asc"}` : DEFAULT_SORT;
    if (by === sort) return;
    setSort(by); setPage(0); setFilterPage(0); setLoadError("");
    if (!books[by]?.[0]) void load(0, by);
  };
  const terms = (s: string) => s.split(/[,，]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const active = Number(Boolean(filter.include)) + Number(Boolean(filter.exclude));
  // Filters look through every page loaded so far; without them the table shows the page opened.
  const rows = useMemo(() => {
    const inc = terms(filter.include), exc = terms(filter.exclude);
    const list = active ? allItems.filter((r) => { const k = r.keyword.toLowerCase(); return inc.every((t) => k.includes(t)) && !exc.some((t) => k.includes(t)); }) : current?.status === "completed" ? toRows(current) : [];
    return list.map((r) => ({ ...r, siteClicks: rankOf(ranks, r.keyword)?.clicks }));
  }, [allItems, current, filter, ranks, active]);
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    makeSelectionColumn<Row>(anchorRef),
    kHelper.accessor("keyword", { enableSorting: false, header: () => $t('common.keywords'), cell: ({ getValue }) => <span className="block max-w-xs truncate font-medium" title={getValue()}>{getValue()}</span> }) as ColumnDef<Row>,
    kHelper.accessor("position", { header: ({ column }) => <SortableHeader column={column} label={$t('common.position')} align="right" />, cell: ({ getValue }) => metric(getValue()), meta: right }) as ColumnDef<Row>,
    kHelper.accessor("volume", { header: ({ column }) => <SortableHeader column={column} label={$t('common.monthlyVolume')} align="right" />, cell: ({ getValue }) => metric(getValue()), meta: right }) as ColumnDef<Row>,
    kHelper.accessor("traffic", { header: ({ column }) => <SortableHeader column={column} label={$t('domainOverview.estimatedTraffic')} align="right" />, cell: ({ getValue }) => (getValue() == null ? "—" : Math.round(getValue()!).toLocaleString(getCurrentLocale())), meta: right }) as ColumnDef<Row>,
    kHelper.accessor("url", { enableSorting: false, header: () => $t('common.rankingPage'), cell: ({ getValue }) => (safeLink(getValue()) ? <a className="block max-w-56 truncate text-primary hover:underline" href={safeLink(getValue())} target="_blank" rel="noreferrer" title={getValue()}>{pathOf(getValue())}</a> : <span className="block max-w-56 truncate">{getValue()}</span>) }) as ColumnDef<Row>,
    kHelper.accessor("difficulty", { header: ({ column }) => <SortableHeader column={column} label={$t('common.difficulty')} align="right" />, cell: ({ getValue }) => <ScoreBadge value={getValue()} />, meta: right }) as ColumnDef<Row>,
    kHelper.accessor("intent", { enableSorting: false, header: () => <WithInfo help={help($t('common.intent'))}>{$t('common.intent')}</WithInfo>, cell: ({ getValue }) => <IntentBadge intent={getValue()} /> }) as ColumnDef<Row>,
    ...(own ? [kHelper.accessor("siteClicks", { enableSorting: false, header: () => <span className="block text-right">{$t('domainOverview.clicks')}</span>, cell: ({ getValue }) => (getValue() == null ? "—" : getValue()!.toLocaleString(getCurrentLocale())), meta: right }) as ColumnDef<Row>] : []),
  ], [anchorRef, own]);
  // DataForSEO sorts; the table only shows which sort it asked for. Pages come from the server unless filters are on.
  const table = useDataTable({ data: rows, columns, manualSorting: true, enableSortingRemoval: false, withPagination: active > 0, enableRowSelection: true, state: { rowSelection, sorting, ...(active ? { pagination: { pageIndex: filterPage, pageSize: PAGE } } : {}) }, onRowSelectionChange: setRowSelection, onSortingChange, getRowId: (r) => r.rowId });
  // Selected rows on every loaded page, not only the one on screen.
  const selected = allItems.filter((r) => rowSelection[r.rowId]).map((r) => ({ ...r, siteClicks: rankOf(ranks, r.keyword)?.clicks }));
  // 交给 Agent: on your own site the words go to the keyword hand-off; a competitor's become “catch up on these words”.
  const [handing, setHanding] = useState<{ own: HandOffKeyword[] } | { draft: TaskDraft }>();
  const [handed, setHanded] = useState<HandOffResult>();
  const market = marketLabel(run.spec);
  const handOff = () => setHanding(own
    ? { own: selected.map((r) => ({ keyword: r.keyword, market: { locationCode: run.spec.locationCode, language: run.spec.language }, volume: r.volume, difficulty: r.difficulty, intent: r.intent, rank: rankOf(ranks, r.keyword) })) }
    : { draft: competitorKeywordsDraft(run.spec.target, market, selected.map((r) => ({ keyword: r.keyword, position: r.position, volume: r.volume, traffic: r.traffic, url: r.url, difficulty: r.difficulty, intent: r.intent, ownClicks: rankOf(ranks, r.keyword)?.clicks ?? null }))) });
  useHandOffSource("domain-keywords", project ? { count: selected.length, open: handOff, noun: $t('common.keywordsSelected'), actions: <> <TableBulkActionButton icon={<Save className="size-3.5" />} onClick={() => void save()}>{$t('common.saveKeywords')}</TableBulkActionButton> <TableBulkActionButton icon={<Download className="size-3.5" />} onClick={() => csv(selected)}>{$t('common.export')}</TableBulkActionButton> </>, clear: () => setRowSelection({}) } : null);
  const csv = (list: Row[]) => downloadCsv($t('domainOverview.competitorKeywords',{0:run.spec.target}), [$t('common.keywords'), $t('common.position'), $t('common.monthlyVolume'), $t('domainOverview.estimatedTraffic'), $t('common.rankingPage'), $t('common.difficulty'), $t('common.intent'), ...(own ? [$t('domainOverview.clicks')] : [])], list.map((r): CsvValue[] => [r.keyword, r.position, r.volume, r.traffic, r.url, r.difficulty, getIntentLabels()[toIntent(r.intent)], ...(own ? [r.siteClicks ?? ""] : [])])) || toast.error(() => ($t('common.noKeywordsExport')));
  // Saved from the lookup each keyword came from: one request per page.
  const save = async () => {
    try {
      const byRun = new Map<string, string[]>();
      for (const s of selected) byRun.set(s.runId, [...(byRun.get(s.runId) ?? []), s.id]);
      let saved = 0, skipped = 0;
      for (const [runId, itemIds] of byRun) { const r = await keywordRequest<{ saved: number; skipped: number }>("saveFromRun", { runId, itemIds }); saved += r.saved; skipped += r.skipped; }
      toast.success(() => ($t('common.keywordsSaved',{0:saved,1:skipped ? $t('common.alreadySaved',{0:skipped}) : ""}))); refreshNavSources(); setRowSelection({});
    }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.saveFailed'))); }
  };
  const failed = !loading && (loadError || (current && current.status !== "completed" ? current.errorCode || $t('common.notRunSameLookupAgain') : undefined));
  const loadedCount = allItems.length;
  return (
    <>
      <DataTable table={table} isLoading={loading && !active} isFiltered={active > 0} onClearFilters={() => setFilter({ include: "", exclude: "" })}
        empty={failed ? { title: $t('common.lookupNotComplete'), description: failed, action: <Button variant="outline" size="sm" onClick={() => void load(page * PAGE, sort)}>{$t('common.queryAgain')}</Button> } : { title: $t('domainOverview.noRankingKeywordsFound'), description: $t('domainOverview.websiteMayNoOrganicRankings') }}
        toolbar={<>
          <DataTableToolbar actions={<Button variant="outline" size="sm" onClick={() => csv(rows)}><Download data-icon="inline-start" />{$t('common.exportCsv')}</Button>}>
            <DataTableFilterToggle open={showFilters} activeCount={active} onToggle={() => setShowFilters((v) => !v)} />
          </DataTableToolbar>
          {showFilters ? <DataTableFilterPanel activeCount={active} onReset={() => setFilter({ include: "", exclude: "" })}><div className="grid gap-2 sm:grid-cols-2"><DataTableFilterGroup label={$t('common.include')}><Input aria-label={$t('common.include')} className="h-7" placeholder={$t('common.containCommaSeparated')} value={filter.include} onChange={(e) => { setFilterPage(0); setFilter((f) => ({ ...f, include: e.target.value })); }} /></DataTableFilterGroup><DataTableFilterGroup label={$t('common.exclude')}><Input aria-label={$t('common.exclude')} className="h-7" placeholder={$t('common.excludeAny')} value={filter.exclude} onChange={(e) => { setFilterPage(0); setFilter((f) => ({ ...f, exclude: e.target.value })); }} /></DataTableFilterGroup></div></DataTableFilterPanel> : null}
        </>}
        footer={<>
          {active ? (rows.length > 0 ? <TablePagination page={filterPage + 1} pageSize={PAGE} totalCount={rows.length} onPageChange={(p) => setFilterPage(p - 1)} /> : null)
            : <TablePagination page={page + 1} pageSize={PAGE} totalCount={Math.min(total, MAX_OFFSET + PAGE)} onPageChange={(p) => { if (!loading) openPage(p - 1); }} />}
          <p className="flex items-center gap-1 border-t border-border px-4 py-2 text-xs text-muted-foreground tabular-nums" data-domain-loaded="">{$t('domainOverview.loadedOfTotal',{0:loadedCount.toLocaleString(getCurrentLocale()),1:Math.max(total, loadedCount).toLocaleString(getCurrentLocale())})}<InfoTip label={$t('common.info')}>{$t('domainOverview.keywordsBilling')}</InfoTip></p>
        </>} />
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
