import { GOOGLE_PROGRESS_CACHE_MS } from '../../../shared/google-cache.js';
import { $t, $tj } from "#i18n";
// 搜索表现 · 索引 (?view=index, 2026-10-14, user request: everything Search Console's API offers, in NocoReach's own
// style). Search Console's page-indexing report is not in its API, so this is built from the URL Inspection API: the
// pages of 内容 inside the property are inspected a few at a time on the server (search-index.ts, at most 500 a day,
// least recently checked first). Four figures pick the table's tab; 每天的检查结果, 未编入索引的原因, 上次抓取 and 富媒体结果
// cards; one table; a page's detail; ticked pages go to the Agent (优化页面).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, Download, FileSearch } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { toast } from "#lib/toast";
import { cn } from "#lib/utils";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#components/ui/select";
import { TabsTrigger } from "#components/ui/tabs";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableTabs, DataTableToolbar } from "#components/seo/data-table-toolbar";
import { TablePagination } from "#components/seo/table-pagination";
import { SortableHeader } from "#components/seo/sortable-header";
import { StatTile } from "#components/seo/stat-tile";
import { downloadCsv, type CsvValue } from "#components/seo/csv";
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { InfoTip, NotesTip } from "#components/reach/info-tip";
import { EmptyState, InlineError, ListSkeleton, LoadError } from "#components/reach/states";
import { Tag, type Tone } from "#components/reach/tag";
import { safeLink } from "../analytics";
import { DetailDrawer } from "../detail-drawer";
import { useFreshData } from "../workspace-cache";
import { DraftHandOffDialog, type TaskDraft } from "../keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "../strategy/hand-off";
import { indexDraft } from "../seo-hand-off";
import { formatCount, formatDate, formatDateTime } from '#lib/format';

type Status = "indexed" | "notIndexed" | "unchecked" | "error";
export type IndexRow = { url: string; type: string; status: Status; checkedAt?: string; coverageState?: string | null; verdict?: string | null; lastCrawlTime?: string | null; crawledAs?: string | null; canonicalMismatch?: boolean; rich?: { type: string; errors: number; warnings: number }[]; error?: string | null };
export type IndexView = { connected: boolean; site?: string; hasContent?: boolean; total?: number; outside?: number; now?: string; running?: boolean; lastRunAt?: string | null; lastError?: string | null; quota?: { used: number; daily: number }; history?: { date: string; indexed: number; notIndexed: number; checked: number }[]; pages?: IndexRow[] };
type Issue = { item: string | null; message: string; severity: "ERROR" | "WARNING" };
type PageResult = { checkedAt: string; verdict: string | null; coverageState: string | null; robotsTxtState: string | null; indexingState: string | null; pageFetchState: string | null; lastCrawlTime: string | null; googleCanonical: string | null; userCanonical: string | null; crawledAs: string | null; sitemaps: string[]; referringUrls: string[]; link: string | null; richResults: { verdict: string | null; types: { type: string; items: number; issues: Issue[] }[] } | null; error?: string; indexed: boolean; canonicalMismatch: boolean };

const TABS = ["all", "indexed", "notIndexed", "canonical", "rich"] as const;
type Tab = (typeof TABS)[number];
const PAGE_SIZES = [25, 50, 100] as const;
const DAY = 86400000;
const num = (v: number) => formatCount(v);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const dateOf = (v?: string | null) => formatDate(v?.slice(0, 10));
const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname + x.search || "/"; } catch { return u; } };
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;

// Search Console's coverage states (the reasons on its page-indexing report), matched loosely; others stay as they come.
const COVERAGE: Record<string, () => string> = {
  "submitted and indexed": () => $t('searchIndex.coverageSubmittedIndexed'), "indexed, not submitted in sitemap": () => $t('searchIndex.coverageIndexedNotSubmitted'),
  "indexed, though blocked by robots.txt": () => $t('searchIndex.coverageIndexedBlocked'), "crawled - currently not indexed": () => $t('searchIndex.coverageCrawledNotIndexed'),
  "discovered - currently not indexed": () => $t('searchIndex.coverageDiscoveredNotIndexed'), "excluded by noindex tag": () => $t('searchIndex.coverageNoindex'),
  "page with redirect": () => $t('searchIndex.coverageRedirect'), "not found (404)": () => $t('searchIndex.coverageNotFound'), "soft 404": () => $t('searchIndex.coverageSoft404'),
  "blocked by robots.txt": () => $t('searchIndex.coverageBlockedRobots'), "alternate page with proper canonical tag": () => $t('searchIndex.coverageAlternate'),
  "duplicate without user-selected canonical": () => $t('searchIndex.coverageDuplicateNoCanonical'), "duplicate, google chose different canonical than user": () => $t('searchIndex.coverageDuplicateGoogleChose'),
  "server error (5xx)": () => $t('searchIndex.coverageServerError'), "redirect error": () => $t('searchIndex.coverageRedirectError'), "blocked due to unauthorized request (401)": () => $t('searchIndex.coverage401'),
  "blocked due to access forbidden (403)": () => $t('searchIndex.coverage403'), "blocked due to other 4xx issue": () => $t('searchIndex.coverage4xx'),
  "url is unknown to google": () => $t('searchIndex.coverageUnknown'), "blocked by page removal tool": () => $t('searchIndex.coverageRemoval'),
};
const coverageName = (s?: string | null) => (s ? (COVERAGE[s.toLowerCase().replace(/[‘’'"“”]/g, "").replace(/\s+/g, " ").trim()] ?? (() => s))() : "—");
const ENUM: Record<string, () => string> = {
  PASS: () => $t('searchIndex.verdictPass'), PARTIAL: () => $t('searchIndex.verdictPartial'), FAIL: () => $t('searchIndex.verdictFail'), NEUTRAL: () => $t('searchIndex.verdictNeutral'),
  ALLOWED: () => $t('searchIndex.allowed'), DISALLOWED: () => $t('searchIndex.disallowed'),
  INDEXING_ALLOWED: () => $t('searchIndex.indexingAllowed'), BLOCKED_BY_META_TAG: () => $t('searchIndex.blockedByMetaTag'), BLOCKED_BY_HTTP_HEADER: () => $t('searchIndex.blockedByHttpHeader'), BLOCKED_BY_ROBOTS_TXT: () => $t('searchIndex.blockedByRobotsTxt'),
  SUCCESSFUL: () => $t('searchIndex.fetchSuccessful'), SOFT_404: () => $t('searchIndex.coverageSoft404'), BLOCKED_ROBOTS_TXT: () => $t('searchIndex.coverageBlockedRobots'), NOT_FOUND: () => $t('searchIndex.coverageNotFound'),
  ACCESS_DENIED: () => $t('searchIndex.fetchUnauthorized'), SERVER_ERROR: () => $t('searchIndex.coverageServerError'), REDIRECT_ERROR: () => $t('searchIndex.coverageRedirectError'), ACCESS_FORBIDDEN: () => $t('searchIndex.fetchForbidden'),
  BLOCKED_4XX: () => $t('searchIndex.fetch4xx'), INTERNAL_CRAWL_ERROR: () => $t('searchIndex.fetchInternalError'), INVALID_URL: () => $t('searchIndex.fetchInvalidUrl'), PAGE_FETCH_STATE_UNSPECIFIED: () => $t('searchIndex.notFetched'),
  DESKTOP: () => $t('searchIndex.crawledDesktop'), MOBILE: () => $t('searchIndex.crawledMobile'),
};
const enumName = (v?: string | null) => (v ? (ENUM[v] ?? (() => v))() : "—");
// Rich result types as Search Console's enhancement reports name them (others stay in English).
const RICH: Record<string, () => string> = {
  Breadcrumbs: () => $t('searchIndex.richBreadcrumbs'), FAQ: () => $t('searchIndex.richFaq'), "Product snippets": () => $t('searchIndex.richProduct'), "Merchant listings": () => $t('searchIndex.richMerchant'),
  "Review snippets": () => $t('searchIndex.richReview'), Videos: () => $t('searchIndex.richVideos'), "Image metadata": () => $t('searchIndex.richImage'), Logos: () => $t('searchIndex.richLogos'), "Sitelinks searchbox": () => $t('searchIndex.richSitelinks'), Events: () => $t('searchIndex.richEvents'),
};
const richName = (t: string) => (RICH[t] ?? (() => t))();
// A type with only the counts that are not zero: "常见问题 1 个错误".
const richProblem = (type: string, errors: number, warnings: number) => $t('searchIndex.richProblem', { 0: richName(type), 1: [errors ? $t('searchIndex.errorCount', { 0: errors }) : "", warnings ? $t('searchIndex.warningCount', { 0: warnings }) : ""].filter(Boolean).join($t('searchIndex.listSeparator')) });
const STATUS: Record<Status, { tone: Tone; label: () => string }> = {
  indexed: { tone: "green", label: () => $t('searchIndex.statusIndexed') }, notIndexed: { tone: "amber", label: () => $t('searchIndex.statusNotIndexed') },
  unchecked: { tone: "grey", label: () => $t('searchIndex.statusUnchecked') }, error: { tone: "red", label: () => $t('searchIndex.statusError') },
};
const TYPE: Record<string, () => string> = { blog: () => $t('searchIndex.typeBlog'), docs: () => $t('searchIndex.typeDocs'), page: () => $t('searchIndex.typePage') };
const issuesOf = (r: IndexRow) => (r.rich ?? []).reduce((n, t) => ({ errors: n.errors + t.errors, warnings: n.warnings + t.warnings }), { errors: 0, warnings: 0 });
const inTab = (tab: Tab, r: IndexRow) => tab === "all" || (tab === "indexed" ? r.status === "indexed" : tab === "notIndexed" ? r.status === "notIndexed" : tab === "canonical" ? Boolean(r.canonicalMismatch) : issuesOf(r).errors + issuesOf(r).warnings > 0);

// `onPick` sets the table's tab and reason together (both live in the URL: ?list=&reason=).
export function IndexingView({ projectId, property, tab, reason, onPick }: { projectId: number; property?: string; tab: string | null; reason: string | null; onPick: (v: { list?: string; reason?: string }) => void }) {
  const navigate = useNavigate();
  const { data: view, error, reload } = useFreshData<IndexView>(`data-view:search-index:${projectId}:${property || ''}`, () => api.action<IndexView>("nrSearchIndex", "view", { method: "POST", body: { projectId }, unwrap: "data" }), { staleTime: GOOGLE_PROGRESS_CACHE_MS });
  // While the first batch runs, look again every 30 seconds.
  useEffect(() => { if (!view?.running) return; const t = window.setInterval(reload, 30000); return () => window.clearInterval(t); }, [view?.running, reload]);
  const [open, setOpen] = useState<IndexRow | null>(null);
  const [handing, setHanding] = useState<IndexRow[]>();
  const current: Tab = TABS.find((t) => t === tab) ?? "all";
  if (error) return <LoadError title={$t('searchIndex.notLoaded')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} onRetry={reload} />;
  if (!view) return <ListSkeleton rows={6} />;
  if (!view.connected) return <EmptyState icon={<FileSearch />} title={$t('searchPerformance.onceSearchConsoleConnectedSearch')} description={$t('common.authorizationReadsDataSyncsAutomatically')} action={<Button onClick={() => void navigate("/connections?source=gsc")}>{$t('searchPerformance.connectSearchConsole')}</Button>} />;
  if (!view.hasContent) return <EmptyState icon={<FileSearch />} title={$t('searchIndex.needContent')} description={$t('searchIndex.needContentHelp')} action={<Button onClick={() => void navigate("/connections?source=site")}>{$t('searchIndex.connectWebsite')}</Button>} />;
  if (!view.total) return <EmptyState icon={<FileSearch />} title={$t('searchIndex.noPagesInProperty')} description={$t('searchIndex.noPagesInPropertyHelp', { 0: view.site })} />;
  const pages = view.pages ?? [], checked = pages.filter((p) => p.status === "indexed" || p.status === "notIndexed");
  if (!checked.length) return <EmptyState icon={<FileSearch />} title={view.running ? $t('searchIndex.firstBatchRunning') : $t('searchIndex.notCheckedYet')} description={view.lastError ? $t('searchIndex.lastErrorDetail', { 0: view.lastError }) : $t('searchIndex.notCheckedYetHelp', { 0: view.quota?.daily ?? 500 })} />;
  const notes = [$t('searchIndex.noteQuota', { 0: num(view.quota?.daily ?? 500) }), $t('searchIndex.noteSource'), $t('searchIndex.noteIndexedVersion'), ...(view.outside ? [$t('searchIndex.noteOutside', { 0: view.outside, 1: view.site })] : []), $t('searchIndex.noteMessages')];
  return (
    <>
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" data-index-status="">
        <span>{$tj('searchIndex.statusLine', { 0: num(checked.length), 1: num(view.total), 2: num(view.quota?.daily ?? 500), 3: formatDateTime(view.lastRunAt) })}</span>
        {view.running ? <span>· {$t('searchIndex.checking')}</span> : null}
        <NotesTip notes={notes} />
      </div>
      {view.lastError ? <InlineError>{$t('searchIndex.lastErrorDetail', { 0: view.lastError })}</InlineError> : null}
      <Tiles pages={pages} checked={checked.length} tab={current} onTab={(t) => onPick({ list: t === current ? undefined : t })} />
      <HistoryCard history={view.history ?? []} />
      <div className="grid gap-3 lg:grid-cols-3">
        <ReasonsCard pages={pages} onPick={(r) => onPick({ list: "notIndexed", reason: r })} />
        <CrawlCard pages={checked} now={view.now ?? new Date(0).toISOString()} />
        <RichCard pages={checked} />
      </div>
      <IndexTable key={`${current}:${reason}`} pages={pages} tab={current} reason={reason} onTab={(t) => onPick({ list: t === "all" ? undefined : t })} onReason={(r) => onPick({ list: current === "all" ? undefined : current, reason: r })} onOpen={setOpen} onHandOff={setHanding} />
      {open ? <PageDrawer property={property} projectId={projectId} row={open} onClose={() => setOpen(null)} onHandOff={() => { setHanding([open]); setOpen(null); }} /> : null}
      {handing ? <HandOff projectId={projectId} rows={handing} onClose={() => setHanding(undefined)} /> : null}
    </>
  );
}

// 已编入索引, 未编入索引, 规范网址不一致 and 富媒体结果问题; a tile picks the table's tab.
function Tiles({ pages, checked, tab, onTab }: { pages: IndexRow[]; checked: number; tab: Tab; onTab: (t: Tab) => void }) {
  const indexed = pages.filter((p) => p.status === "indexed").length, not = pages.filter((p) => p.status === "notIndexed");
  const reasons = new Set(not.map((p) => p.coverageState || "")).size, issues = pages.reduce((n, p) => { const x = issuesOf(p); return { errors: n.errors + x.errors, warnings: n.warnings + x.warnings, pages: n.pages + (x.errors + x.warnings ? 1 : 0) }; }, { errors: 0, warnings: 0, pages: 0 });
  const tiles: { key: Tab; label: string; value: number; hint: string; help: string }[] = [
    { key: "indexed", label: $t('searchIndex.indexed'), value: indexed, hint: $t('searchIndex.shareOfChecked', { 0: pct(checked ? indexed / checked : 0) }), help: $t('searchIndex.indexedHelp') },
    { key: "notIndexed", label: $t('searchIndex.notIndexed'), value: not.length, hint: $t('searchIndex.reasonCount', { 0: reasons }), help: $t('searchIndex.notIndexedHelp') },
    { key: "canonical", label: $t('searchIndex.canonicalMismatch'), value: pages.filter((p) => p.canonicalMismatch).length, hint: $t('searchIndex.canonicalMismatchHint'), help: $t('searchIndex.canonicalMismatchHelp') },
    { key: "rich", label: $t('searchIndex.richIssues'), value: issues.pages, hint: $t('searchIndex.errorsWarnings', { 0: issues.errors, 1: issues.warnings }), help: $t('searchIndex.richIssuesHelp') },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label={$t('searchPerformance.figures')}>
      {tiles.map((t) => (
        <div key={t.key} data-index-tile={t.key} className={cn("relative rounded-xl", tab === t.key && "ring-2 ring-primary")}>
          <button type="button" aria-pressed={tab === t.key} aria-label={t.label} onClick={() => onTab(t.key)} className="absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
          <Card className="pointer-events-none relative h-full gap-0 p-4 [&_[data-info-tip]]:pointer-events-auto">
            <StatTile label={t.label} value={num(t.value)} hint={t.hint} help={t.help} />
          </Card>
        </div>
      ))}
    </div>
  );
}

// Indexed and not indexed pages, as counted once a day.
function HistoryCard({ history }: { history: NonNullable<IndexView["history"]> }) {
  return (
    <Card className="gap-3 px-4" data-index-history="">
      <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{$t('searchIndex.history')}</h2><InfoTip label={$t('common.howReadChart')}>{$t('searchIndex.historyInfo')}</InfoTip></div>
      {history.length >= 2 ? (
        <div className="nr-chart-box">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={44} />
              <Tooltip formatter={(v) => num(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line isAnimationActive={false} type="linear" dataKey="indexed" name={$t('searchIndex.indexed')} stroke="var(--chart-3)" dot={false} />
              <Line isAnimationActive={false} type="linear" dataKey="notIndexed" name={$t('searchIndex.notIndexed')} stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="text-sm text-muted-foreground">{$t('searchIndex.historyStarts', { 0: formatDate(history[0]?.date) })}</p>}
    </Card>
  );
}

const Head = ({ title, info }: { title: string; info: string }) => <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{title}</h2><InfoTip label={$t('common.aboutData')}>{info}</InfoTip></div>;
function Bars({ rows, onPick }: { rows: { key: string; name: string; value: number; share: number; title?: string }[]; onPick?: (key: string) => void }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] items-center gap-2 text-sm" data-bar={r.key}>
          {onPick ? <button type="button" className="truncate text-left text-primary underline-offset-4 hover:underline" title={r.title ?? r.name} onClick={() => onPick(r.key)}>{r.name}</button> : <span className="truncate" title={r.title ?? r.name}>{r.name}</span>}
          <span className="h-2 overflow-hidden rounded-sm bg-muted"><span className="block h-full rounded-sm bg-primary/70" style={{ width: `${Math.max(r.share * 100, r.share ? 1 : 0)}%` }} /></span>
          <span className="text-right tabular-nums text-muted-foreground">{num(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}
const tally = (keys: string[]) => { const m = new Map<string, number>(); for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };

// Why pages are not indexed, most first; a reason filters the table.
function ReasonsCard({ pages, onPick }: { pages: IndexRow[]; onPick: (reason: string) => void }) {
  const not = pages.filter((p) => p.status === "notIndexed"), rows = tally(not.map((p) => p.coverageState || "")).slice(0, 6);
  return (
    <Card className="gap-3 px-4" data-index-reasons="">
      <Head title={$t('searchIndex.reasons')} info={$t('searchIndex.reasonsInfo')} />
      {rows.length ? <Bars rows={rows.map(([k, n]) => ({ key: k, name: coverageName(k), value: n, share: n / not.length }))} onPick={onPick} /> : <p className="text-sm text-muted-foreground">{$t('searchIndex.allIndexed')}</p>}
    </Card>
  );
}

// How long ago Google last crawled the checked pages.
function CrawlCard({ pages, now }: { pages: IndexRow[]; now: string }) {
  const at = Date.parse(now), age = (p: IndexRow) => (p.lastCrawlTime ? (at - Date.parse(p.lastCrawlTime)) / DAY : null);
  const buckets: { key: string; name: string; test: (d: number | null) => boolean }[] = [
    { key: "7", name: $t('searchIndex.within7Days'), test: (d) => d !== null && d <= 7 }, { key: "30", name: $t('searchIndex.within30Days'), test: (d) => d !== null && d > 7 && d <= 30 },
    { key: "90", name: $t('searchIndex.within90Days'), test: (d) => d !== null && d > 30 && d <= 90 }, { key: "older", name: $t('searchIndex.olderThan90Days'), test: (d) => d !== null && d > 90 },
    { key: "never", name: $t('searchIndex.neverCrawled'), test: (d) => d === null },
  ];
  const mobile = pages.filter((p) => p.crawledAs === "MOBILE").length, crawled = pages.filter((p) => p.crawledAs).length;
  return (
    <Card className="gap-3 px-4" data-index-crawl="">
      <Head title={$t('searchIndex.lastCrawl')} info={$t('searchIndex.lastCrawlInfo')} />
      <Bars rows={buckets.map((b) => { const n = pages.filter((p) => b.test(age(p))).length; return { key: b.key, name: b.name, value: n, share: pages.length ? n / pages.length : 0 }; })} />
      {crawled ? <p className="border-t border-border pt-2 text-xs text-muted-foreground">{$t('searchIndex.crawledAsShare', { 0: pct(mobile / crawled) })}</p> : null}
    </Card>
  );
}

// Rich result types found on the checked pages, with the types that have errors or warnings.
function RichCard({ pages }: { pages: IndexRow[] }) {
  const all = pages.flatMap((p) => p.rich ?? []), rows = tally(all.map((t) => t.type)).slice(0, 6);
  const problems = [...new Set(all.map((t) => t.type))].map((type) => { const own = all.filter((t) => t.type === type); return { type, errors: own.reduce((n, t) => n + t.errors, 0), warnings: own.reduce((n, t) => n + t.warnings, 0) }; }).filter((x) => x.errors + x.warnings);
  return (
    <Card className="gap-3 px-4" data-index-rich="">
      <Head title={$t('searchIndex.richResults')} info={$t('searchIndex.richResultsInfo')} />
      {rows.length ? <Bars rows={rows.map(([k, n]) => ({ key: k, name: richName(k), value: n, share: n / pages.length }))} /> : <p className="text-sm text-muted-foreground">{$t('searchIndex.noRichResults')}</p>}
      {problems.length ? <p className="border-t border-border pt-2 text-xs text-muted-foreground">{$t('searchIndex.richProblems', { 0: problems.map((x) => richProblem(x.type, x.errors, x.warnings)).join(" · ") })}</p> : null}
    </Card>
  );
}

const helper = createColumnHelper<IndexRow>();
function IndexTable({ pages, tab, reason, onTab, onReason, onOpen, onHandOff }: { pages: IndexRow[]; tab: Tab; reason: string | null; onTab: (t: Tab) => void; onReason: (r?: string) => void; onOpen: (r: IndexRow) => void; onHandOff: (rows: IndexRow[]) => void }) {
  const [text, setText] = useState("");
  const [type, setType] = useState("all");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [rowSelection, setRowSelection] = useState({});
  const anchorRef = useSelectionAnchor();
  const reasons = useMemo(() => tally(pages.filter((p) => p.coverageState).map((p) => p.coverageState!)).map(([k]) => k), [pages]);
  const rows = useMemo(() => pages.filter((p) => inTab(tab, p) && (!reason || p.coverageState === reason) && (type === "all" || p.type === type) && (!text.trim() || p.url.toLowerCase().includes(text.trim().toLowerCase()))), [pages, tab, reason, type, text]);
  const columns = useMemo<ColumnDef<IndexRow>[]>(() => [
    makeSelectionColumn<IndexRow>(anchorRef),
    helper.accessor("url", { enableSorting: false, header: () => $t('common.page'), cell: ({ row, getValue }) => <button type="button" className="block max-w-sm truncate text-left text-primary underline-offset-4 hover:underline" title={getValue()} onClick={() => onOpen(row.original)}>{pathOf(getValue())}</button> }) as ColumnDef<IndexRow>,
    helper.accessor("status", { header: ({ column }) => <SortableHeader column={column} label={$t('searchIndex.status')} help={false} />, cell: ({ getValue }) => <Tag tone={STATUS[getValue()].tone} dot>{STATUS[getValue()].label()}</Tag> }) as ColumnDef<IndexRow>,
    helper.accessor((r) => r.error ?? r.coverageState ?? "", { id: "reason", enableSorting: false, header: () => $t('searchIndex.reason'), cell: ({ row }) => { const r = row.original, text = r.status === "unchecked" || (r.status === "indexed" && !r.error) ? "—" : r.error ?? coverageName(r.coverageState); return <span className="block max-w-xs truncate" title={text}>{text}</span>; } }) as ColumnDef<IndexRow>,
    helper.accessor((r) => r.lastCrawlTime ?? undefined, { id: "lastCrawl", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('searchIndex.lastCrawl')} help={false} />, cell: ({ row }) => dateOf(row.original.lastCrawlTime), meta: { cellClassName: "tabular-nums" } }) as ColumnDef<IndexRow>,
    helper.accessor((r) => (r.status === "unchecked" || r.status === "error" ? undefined : r.canonicalMismatch ? 1 : 0), { id: "canonical", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('searchIndex.canonical')} help={false} />, cell: ({ row }) => (row.original.status === "unchecked" || row.original.status === "error" ? "—" : row.original.canonicalMismatch ? <Tag tone="amber">{$t('searchIndex.mismatch')}</Tag> : $t('searchIndex.same')) }) as ColumnDef<IndexRow>,
    helper.accessor((r) => (r.rich?.length ? issuesOf(r).errors * 1000 + issuesOf(r).warnings : undefined), { id: "rich", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('searchIndex.richShort')} help={false} />, cell: ({ row }) => { const r = row.original, x = issuesOf(r); return !r.rich?.length ? "—" : x.errors ? <Tag tone="red">{$t('searchIndex.errorCount', { 0: x.errors })}</Tag> : x.warnings ? <Tag tone="amber">{$t('searchIndex.warningCount', { 0: x.warnings })}</Tag> : $t('searchIndex.itemCount', { 0: r.rich.length }); } }) as ColumnDef<IndexRow>,
    helper.accessor((r) => r.checkedAt ?? undefined, { id: "checkedAt", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('searchIndex.checkedAt')} align="right" help={false} />, cell: ({ row }) => dateOf(row.original.checkedAt), meta: right }) as ColumnDef<IndexRow>,
  ], [anchorRef, onOpen]);
  const table = useDataTable({ data: rows, columns, withSorting: true, withPagination: true, enableRowSelection: true, state: { pagination, rowSelection }, onPaginationChange: setPagination, onRowSelectionChange: setRowSelection, getRowId: (r) => r.url });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  useHandOffSource("search-index", { count: selected.length, open: () => onHandOff(selected), noun: $t('common.pagesSelected'), clear: () => setRowSelection({}) });
  const counts = Object.fromEntries(TABS.map((t) => [t, pages.filter((p) => inTab(t, p)).length])) as Record<Tab, number>;
  const exportRows = () => {
    const ok = downloadCsv($t('searchIndex.csvName'), [$t('common.page'), $t('searchIndex.status'), $t('searchIndex.reason'), $t('searchIndex.lastCrawl'), $t('searchIndex.canonical'), $t('searchIndex.richShort'), $t('searchIndex.checkedAt')],
      rows.map((r): CsvValue[] => [r.url, STATUS[r.status].label(), r.error ?? (r.status === "unchecked" ? "" : coverageName(r.coverageState)), r.lastCrawlTime ?? "", r.canonicalMismatch ? $t('searchIndex.mismatch') : "", (r.rich ?? []).map((t) => richName(t.type)).join(" / "), r.checkedAt ?? ""]));
    if (!ok) toast.error(() => $t('searchPerformance.noDataExport'));
  };
  return (
    <Card className="gap-0 py-0" data-report="">
      <DataTableTabs value={tab} onValueChange={(v) => onTab(v as Tab)} actions={<Button variant="outline" size="sm" onClick={exportRows}><Download data-icon="inline-start" />{$t('common.exportCsv')}</Button>}>
        <TabsTrigger value="all">{$tj('searchIndex.tabAll', { 0: num(counts.all) })}</TabsTrigger>
        <TabsTrigger value="indexed">{$tj('searchIndex.tabIndexed', { 0: num(counts.indexed) })}</TabsTrigger>
        <TabsTrigger value="notIndexed">{$tj('searchIndex.tabNotIndexed', { 0: num(counts.notIndexed) })}</TabsTrigger>
        <TabsTrigger value="canonical">{$tj('searchIndex.tabCanonical', { 0: num(counts.canonical) })}</TabsTrigger>
        <TabsTrigger value="rich">{$tj('searchIndex.tabRich', { 0: num(counts.rich) })}</TabsTrigger>
      </DataTableTabs>
      <DataTableToolbar>
        <Input className="h-8 w-56" aria-label={$t('searchIndex.urlContains')} placeholder={$t('searchIndex.urlContains')} value={text} maxLength={500} onChange={(e) => { setText(e.target.value); setPagination((s) => ({ ...s, pageIndex: 0 })); }} />
        <Select value={reason ?? "all"} onValueChange={(v) => onReason(!v || v === "all" ? undefined : String(v))}>
          <SelectTrigger size="sm" className="w-56" aria-label={$t('searchIndex.reason')}><SelectValue>{(v: string) => (v === "all" ? $t('searchIndex.allReasons') : coverageName(v))}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="all">{$t('searchIndex.allReasons')}</SelectItem>{(reason && !reasons.includes(reason) ? [...reasons, reason] : reasons).map((k) => <SelectItem key={k} value={k}>{coverageName(k)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(String(v || "all")); setPagination((s) => ({ ...s, pageIndex: 0 })); }}>
          <SelectTrigger size="sm" className="w-32" aria-label={$t('searchIndex.pageType')}><SelectValue>{(v: string) => (v === "all" ? $t('searchIndex.allTypes') : (TYPE[v] ?? (() => v))())}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="all">{$t('searchIndex.allTypes')}</SelectItem>{Object.keys(TYPE).map((k) => <SelectItem key={k} value={k}>{TYPE[k]()}</SelectItem>)}</SelectContent>
        </Select>
      </DataTableToolbar>
      <DataTable table={table} isFiltered={Boolean(text.trim() || reason || type !== "all")} onClearFilters={() => { setText(""); setType("all"); onReason(undefined); }}
        empty={{ title: $t('searchIndex.noPagesHere') }}
        onRowClick={(row, e) => { if (!(e.target as HTMLElement).closest("button,a,[role=checkbox]")) onOpen(row.original); }}
        footer={rows.length ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null} />
    </Card>
  );
}

// One page: what Google says about it, read when opened.
function PageDrawer({ projectId, property, row, onClose, onHandOff }: { projectId: number; property?: string; row: IndexRow; onClose: () => void; onHandOff: () => void }) {
  const { data, error } = useFreshData<{ connected: boolean; result: PageResult | null }>(`data-view:search-index-page:${projectId}:${property || ''}:${row.url}:${row.checkedAt || ''}`, () => api.action("nrSearchIndex", "page", { method: "POST", body: { projectId, url: row.url }, unwrap: "data" }), { staleTime: GOOGLE_PROGRESS_CACHE_MS });
  const r = data?.result, href = safeLink(row.url), link = r?.link ? safeLink(r.link) : null;
  const facts: [string, ReactNode][] = r && !r.error ? [
    [$t('searchIndex.verdict'), enumName(r.verdict)], [$t('searchIndex.reason'), coverageName(r.coverageState)], [$t('searchIndex.lastCrawl'), formatDateTime(r.lastCrawlTime)],
    [$t('searchIndex.crawledAs'), enumName(r.crawledAs)], [$t('searchIndex.robotsTxt'), enumName(r.robotsTxtState)], [$t('searchIndex.indexing'), enumName(r.indexingState)], [$t('searchIndex.pageFetch'), enumName(r.pageFetchState)],
    [$t('searchIndex.googleCanonical'), r.googleCanonical ?? "—"], [$t('searchIndex.userCanonical'), r.userCanonical ?? "—"], [$t('searchIndex.checkedAt'), formatDateTime(r.checkedAt)],
  ] : [];
  return (
    <DetailDrawer open onClose={onClose} title={`${$t('common.page')} · ${pathOf(row.url)}`} description={STATUS[row.status].label()} actions={<Button size="sm" variant="outline" onClick={onHandOff}>{$t('searchIndex.handOff')}</Button>}>
      {href ? <a className="nr-link mb-3 inline-flex items-center gap-1 break-all" href={href} target="_blank" rel="noreferrer">{row.url}<ArrowUpRight className="size-3.5" /></a> : <p className="mb-3 break-all text-sm">{row.url}</p>}
      {error ? <InlineError>{error instanceof Error ? error.message : $t('common.tryAgainLater')}</InlineError> : !data ? <ListSkeleton rows={4} /> : !r ? <p className="text-sm text-muted-foreground">{$t('searchIndex.notCheckedPage')}</p> : r.error ? <InlineError>{$t('searchIndex.pageErrorDetail', { 0: r.error })}</InlineError> : (
        <>
          <table className="w-full text-sm" data-index-facts="">
            <tbody>{facts.map(([k, v]) => <tr key={k} className="border-t border-border first:border-0"><td className="w-36 py-1.5 pr-2 align-top text-muted-foreground">{k}</td><td className={cn("py-1.5 break-all", k === $t('searchIndex.googleCanonical') && r.canonicalMismatch && "nr-down")}>{v}</td></tr>)}</tbody>
          </table>
          {r.canonicalMismatch ? <p className="mt-2 text-xs text-muted-foreground">{$t('searchIndex.canonicalMismatchHelp')}</p> : null}
          <List title={$t('searchIndex.sitemaps')} items={r.sitemaps} empty={$t('searchIndex.noSitemaps')} />
          <List title={$t('searchIndex.referringUrls')} items={r.referringUrls} empty={$t('searchIndex.noReferringUrls')} />
          <h3 className="mt-5 mb-1 text-sm font-semibold">{$t('searchIndex.richResults')}</h3>
          {r.richResults?.types.length ? (
            <ul className="flex flex-col gap-2 text-sm" data-index-rich-detail="">
              {r.richResults.types.map((t) => (
                <li key={t.type} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center gap-2"><span className="font-medium">{richName(t.type)}</span><span className="text-xs text-muted-foreground">{$t('searchIndex.itemCount', { 0: t.items })}</span>{t.issues.some((x) => x.severity === "ERROR") ? <Tag tone="red">{$t('searchIndex.hasErrors')}</Tag> : t.issues.length ? <Tag tone="amber">{$t('searchIndex.hasWarnings')}</Tag> : <Tag tone="green">{$t('searchIndex.valid')}</Tag>}</div>
                  {t.issues.length ? <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">{t.issues.map((x) => <li key={`${x.severity}:${x.item}:${x.message}`}><span className={x.severity === "ERROR" ? "nr-down" : ""}>{x.severity === "ERROR" ? $t('searchIndex.error') : $t('searchIndex.warning')}</span> · {x.message}{x.item ? ` (${x.item})` : ""}</li>)}</ul> : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{$t('searchIndex.noRichResultsPage')}</p>}
          {link ? <a className="nr-link mt-5 inline-flex items-center gap-1" href={link} target="_blank" rel="noreferrer">{$t('searchIndex.openInSearchConsole')}<ArrowUpRight className="size-3.5" /></a> : null}
        </>
      )}
    </DetailDrawer>
  );
}
const List = ({ title, items, empty }: { title: string; items: string[]; empty: string }) => (
  <>
    <h3 className="mt-5 mb-1 text-sm font-semibold">{title}</h3>
    {items.length ? <ul className="flex flex-col gap-0.5 text-sm">{items.map((u) => { const h = safeLink(u); return <li key={u} className="truncate" title={u}>{h ? <a className="nr-link" href={h} target="_blank" rel="noreferrer">{u}</a> : u}</li>; })}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}
  </>
);

// 交给 Agent for the ticked pages: one task, its brief built from what Google says about them, started with 优化页面.
function HandOff({ projectId, rows, onClose }: { projectId: number; rows: IndexRow[]; onClose: () => void }) {
  const [result, setResult] = useState<HandOffResult>();
  const draft: TaskDraft = useMemo(() => indexDraft(rows.map((r) => ({ url: r.url, status: STATUS[r.status].label(), reason: r.error ?? (r.status === "unchecked" ? null : coverageName(r.coverageState)), lastCrawl: r.lastCrawlTime ? r.lastCrawlTime.slice(0, 10) : null, canonicalMismatch: Boolean(r.canonicalMismatch), rich: (r.rich ?? []).filter((t) => t.errors + t.warnings).map((t) => richProblem(t.type, t.errors, t.warnings)) }))), [rows]);
  return <><HandOffNotice result={result} />{result ? null : <DraftHandOffDialog projectId={projectId} draft={draft} playbookId="optimize-page" page={rows.length === 1 ? rows[0].url : undefined} description={$t('searchIndex.handOffDescription')} onClose={onClose} onDone={setResult} />}</>;
}
