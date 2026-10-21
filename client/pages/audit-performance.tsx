import { useMessageState, $t, $tj, $legacyText } from "#i18n";
// 审计 · 性能检查 (Lighthouse): after every-app/open-seo db8bde1 src/client/features/lighthouse/ (scores, metrics, failing
// checks by category; MIT). One page at a time and only when asked (DataForSEO, about $0.005); Chinese names for the common
// checks. Its own tab since 2026-10-14 (user request): the check form, every check made so far in a table, and a row's
// result in a drawer with the earlier checks of the same page and device. Ticked results or the one open go to the Agent
// as 技术修复.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { Tag, type Tone } from "#components/reach/tag";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableToolbar } from "#components/seo/data-table-toolbar";
import { TablePagination } from "#components/seo/table-pagination";
import { SortableHeader } from "#components/seo/sortable-header";
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { InfoTip, WithInfo } from "#components/reach/info-tip";
import { ListSkeleton } from "#components/reach/states";
import { cn } from "#lib/utils";
import type { TaskDraft } from "./keyword-hand-off";
import { DetailDrawer } from "./detail-drawer";
import { SectionHandOff } from "./section-hand-off";
import { safeLink } from "./analytics";
import { help } from "./glossary";
import { formatDateTime } from '#lib/format';

type Issue = { category: string; key: string; title: string; description: string; value: string; score: number; savingsMs: number | null; savingsBytes: number | null; severity: "high" | "medium" };
type Result = { url: string; finalUrl: string; strategy: "mobile" | "desktop"; version: string | null; scores: Record<string, number | null>; metrics: { key: string; label: string; value: string; score: number | null }[]; issues: Issue[] };
type Metric = Result["metrics"][number];
type Run = { id: string | number; status: string; spec: { url: string; strategy: "mobile" | "desktop" }; result?: Result | null; errorCode?: string | null; createdAt: string };
// One check as the list gives it: scores, metrics and the worst ten failing checks (server/nocoreach/lighthouse.ts list).
type Record_ = { id: string; status: string; url: string; finalUrl: string | null; strategy: "mobile" | "desktop"; createdAt: string; scores: Record<string, number | null> | null; metrics: Metric[]; issueCount: number | null; issues: Pick<Issue, "category" | "key" | "title" | "value" | "severity">[]; errorCode: string | null };
const getCategory = (): Record<string, string> => ({ performance: $t('lighthouseCard.performance'), accessibility: $t('lighthouseCard.accessibility'), "best-practices": $t('lighthouseCard.bestPractices'), seo: "SEO" });
const tone = (v: number | null): Tone => (v == null ? "grey" : v >= 90 ? "green" : v >= 50 ? "amber" : "red");
const ink = (v: number | null) => (v == null ? "" : v >= 90 ? "text-nr-ink-green" : v >= 50 ? "text-nr-ink-amber" : "text-nr-ink-red");
// Chinese names for the checks that come up most; others keep Lighthouse's English title.
const getZh = (): Record<string, string> => ({
  "render-blocking-resources": $t('lighthouseCard.eliminateRenderBlockingResources'), "unused-javascript": $t('lighthouseCard.reduceUnusedJavascript'), "unused-css-rules": $t('lighthouseCard.reduceUnusedCss'), "uses-optimized-images": $t('lighthouseCard.compressImages'), "modern-image-formats": $t('lighthouseCard.useModernImageFormatsLike'),
  "uses-responsive-images": $t('lighthouseCard.serveProperlySizedImages'), "offscreen-images": $t('lighthouseCard.deferOffscreenImages'), "total-byte-weight": $t('lighthouseCard.pageTooHeavy'), "dom-size": $t('lighthouseCard.tooManyPageElements'), "bootup-time": $t('lighthouseCard.reduceJavascriptExecutionTime'), "mainthread-work-breakdown": $t('lighthouseCard.reduceMainThreadWork'),
  "font-display": $t('lighthouseCard.showTextWhileFontsLoad'), "server-response-time": $t('lighthouseCard.slowServerResponse'), redirects: $t('lighthouseCard.avoidMultipleRedirects'), "uses-text-compression": $t('lighthouseCard.enableTextCompression'), "uses-long-cache-ttl": $t('lighthouseCard.staticAssetsCachedTooBriefly'), "unminified-javascript": $t('lighthouseCard.minifyJavascript'), "unminified-css": $t('lighthouseCard.minifyCss'),
  "legacy-javascript": $t('lighthouseCard.removeJavascriptLegacyBrowsers'), "duplicated-javascript": $t('lighthouseCard.removeDuplicateJavascript'), "third-party-summary": $t('lighthouseCard.thirdPartyCodeSlowsLoading'), "lcp-lazy-loaded": $t('lighthouseCard.notLazyLoadLargestContent'), "prioritize-lcp-image": $t('lighthouseCard.preloadLargestContentImage'), "unsized-images": $t('lighthouseCard.imagesLackWidthHeight'),
  "non-composited-animations": $t('lighthouseCard.animationsCauseRepaints'), "layout-shift-elements": $t('lighthouseCard.elementsCauseLayoutShifts'), "largest-contentful-paint": $t('lighthouseCard.largestContentAppearsTooLate'), "uses-rel-preconnect": $t('lighthouseCard.preconnectRequiredOrigins'), "efficient-animated-content": $t('lighthouseCard.useVideoAnimatedContent'),
  "color-contrast": $t('lighthouseCard.insufficientTextContrast'), "image-alt": $t('lighthouseCard.imagesLackAltText'), "link-name": $t('lighthouseCard.linksNoReadableText'), "button-name": $t('lighthouseCard.buttonsNoAccessibleName'), "html-has-lang": $t('lighthouseCard.pageNotDeclareLanguage'), label: $t('lighthouseCard.formFieldsLackLabels'), "heading-order": $t('lighthouseCard.headingLevelsSkip'), "target-size": $t('lighthouseCard.tapTargetsTooSmall'), "tap-targets": $t('lighthouseCard.tapTargetsTooSmall'),
  "meta-description": $t('lighthouseCard.missingMetaDescription'), "document-title": $t('lighthouseCard.missingPageTitle'), "is-crawlable": $t('lighthouseCard.pageBlocksSearchEngineIndexing'), "link-text": $t('lighthouseCard.linkTextNotDescriptive'), "crawlable-anchors": $t('lighthouseCard.linksCannotCrawled'), "hreflang": $t('lighthouseCard.invalidHreflang'), canonical: $t('lighthouseCard.invalidCanonicalUrl'), "robots-txt": $t('lighthouseCard.robotsTxtInvalid'),
  "errors-in-console": $t('lighthouseCard.errorsBrowserConsole'), "image-aspect-ratio": $t('lighthouseCard.imagesShowWrongAspectRatio'), "image-size-responsive": $t('lighthouseCard.imagesLowResolution'), "valid-source-maps": $t('lighthouseCard.missingSourceMaps'), deprecations: $t('lighthouseCard.usesDeprecatedApis'), "inspector-issues": $t('lighthouseCard.browserReportedIssues'),
});
const zh = (i: Issue) => getZh()[i.key] || i.title;
const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname === "/" ? x.host : x.pathname; } catch { return u; } };
function draft(r: Result): TaskDraft {
  const device = r.strategy === "mobile" ? $t('lighthouseCard.mobile') : $t('lighthouseCard.computer');
  return {
    title: $t('lighthouseCard.improvePagePerformance',{0:pathOf(r.finalUrl),1:device}).slice(0, 200),
    objective: $t('lighthouseCard.getLighthousePerformanceScore90',{0:r.finalUrl}).slice(0, 1000),
    brief: [$t('lighthouseCard.pageLighthouse',{0:r.finalUrl,1:r.version || "",2:device}), $t('lighthouseCard.scores',{0:Object.entries(r.scores).map(([k, v]) => `${getCategory()[k]} ${v ?? "—"}`).join("，")}), $t('lighthouseCard.metrics',{0:r.metrics.map((m) => `${m.label} ${m.value}`).join("，")}), "", $t('lighthouseCard.failedChecks'), ...r.issues.slice(0, 20).map((i) => `- [${getCategory()[i.category]}] ${zh(i)}${getZh()[i.key] ? `（${i.title}）` : ""}${i.value ? `：${i.value}` : ""}`), "", $t('lighthouseCard.suggestionFixItemsSaveMost')].join("\n").slice(0, 20000),
  };
}


const deviceName = (s: string) => (s === "desktop" ? $t('lighthouseCard.computer') : $t('lighthouseCard.mobile'));
const when = (v: string) => formatDateTime(v);
// "3.8 s" or "890 ms" as seconds, so LCP sorts by time.
const seconds = (v?: string | null) => { const m = String(v ?? "").replace(/,/g, "").match(/([\d.]+)\s*(ms|s)?/); return m ? Number(m[1]) / (m[2] === "ms" ? 1000 : 1) : undefined; };
const lcpOf = (r: Record_) => r.metrics.find((m) => m.key === "largest-contentful-paint");
const failure = (r: { status: string }) => (r.status === "unknown" ? $t('common.resultUncertain') : $t('common.noResults'));
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;
const PAGE_SIZES = [25, 50, 100] as const;
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const helper = createColumnHelper<Record_>();
const linkClass = "block max-w-md truncate text-left text-primary underline-offset-4 hover:underline";

// The ticked results as one 技术修复 task: each page's scores and LCP, then its worst failing checks.
function draftMany(rows: Record_[]): TaskDraft {
  const lines = rows.slice(0, 20).flatMap((r) => [
    `- ${r.finalUrl || r.url}（${deviceName(r.strategy)}，${when(r.createdAt)}）：${CATEGORIES.map((k) => `${getCategory()[k]} ${r.scores?.[k] ?? "—"}`).join("，")}${lcpOf(r) ? `，LCP ${lcpOf(r)!.value}` : ""}`,
    ...r.issues.slice(0, 6).map((i) => `  - [${getCategory()[i.category]}] ${getZh()[i.key] || i.title}${i.value ? `：${i.value}` : ""}`),
  ]);
  const page = pathOf(rows[0].finalUrl || rows[0].url);
  return {
    title: (rows.length === 1 ? $t('lighthouseCard.improvePagePerformance', { 0: page, 1: deviceName(rows[0].strategy) }) : $t('auditPerformance.improvePagesPerformance', { 0: page, 1: rows.length })).slice(0, 200),
    objective: $t('auditPerformance.improvePagesObjective').slice(0, 1000),
    brief: [$t('auditPerformance.tickedResults', { 0: rows.length }), ...lines, "", $t('lighthouseCard.suggestionFixItemsSaveMost')].join("\n").slice(0, 20000),
  };
}

export function PerformanceTab({ projectId, initialUrl }: { projectId: number; initialUrl?: string | null }) {
  const navigate = useNavigate();
  const call = <T,>(action: string, body: object = {}) => api.action<T>("nrLighthouse", action, { method: "POST", body: { projectId: String(projectId), ...body }, unwrap: "data" });
  const [status, setStatus] = useState<{ connected: boolean; suggested: string }>();
  const [url, setUrl] = useState(initialUrl || "");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState("");
  const [records, setRecords] = useState<Record_[]>();
  const [listError, setListError] = useMessageState("");
  const [openId, setOpenId] = useState<string>();
  const load = () => call<Record_[]>("list").then((r) => { setRecords(r); setListError(""); }).catch((e) => setListError(() => (e instanceof Error ? $legacyText(e.message) : $t('auditPerformance.notLoadRuns'))));
  useEffect(() => {
    void call<{ connected: boolean; suggested: string }>("status").then((s) => { setStatus(s); setUrl((u) => u || s.suggested); }).catch(() => setStatus({ connected: false, suggested: "" }));
    void load();
  }, [projectId]);
  // A finished check opens in the drawer; one without a result says why here and stays in the list.
  const check = async () => {
    setBusy(true); setError("");
    try {
      const r = await call<Run>("run", { url: url.trim(), strategy, requestKey: crypto.randomUUID().replace(/-/g, "") });
      if (r.status === "completed") setOpenId(String(r.id));
      else setError(() => (r.status === "unknown" ? r.errorCode || $t('common.resultUncertainMayChargedRepeat') : $t('lighthouseCard.noResults', { 0: r.errorCode || $t('errors.unknownReason') })));
      void load();
    } catch (e) { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('lighthouseCard.notFullyCheckedTryAgain'))); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Card className="gap-3 px-4" data-lighthouse-form="">
        {status && !status.connected ? (
          <p className="text-sm text-muted-foreground">{$t('lighthouseCard.lighthouseRunsThroughDataforseoFirst')}<Button variant="link" className="h-auto p-0" onClick={() => navigate("/connections?source=keywords")}>{$t('common.connectDataforseo')}</Button>。</p>
        ) : (
          <form className="flex flex-col gap-2 lg:flex-row lg:items-center" onSubmit={(e) => { e.preventDefault(); void check(); }}>
            <Input className="lg:max-w-xl" aria-label={$t('lighthouseCard.urlCheck')} value={url} placeholder="https://www.example.com/pricing" onChange={(e) => setUrl(e.target.value)} />
            <div className="nr-range !m-0" role="group" aria-label={$t('lighthouseCard.device')}>{(["mobile", "desktop"] as const).map((s) => <button key={s} type="button" aria-pressed={strategy === s} onClick={() => setStrategy(s)}>{deviceName(s)}</button>)}</div>
            <div className="flex items-center gap-2"><Button type="submit" disabled={busy || !url.trim()}>{busy ? $t('lighthouseCard.checkingAboutHalfMinute') : $t('common.check')}</Button><InfoTip label={$t('auditPerformance.aboutCheck')}>{$t('lighthouseCard.checksOnePageTimeWhen')}</InfoTip></div>
          </form>
        )}
        {error ? <p role="alert" className="nr-error">{error}</p> : null}
      </Card>
      {listError ? <p role="alert" className="nr-error">{listError}</p> : !records ? <ListSkeleton rows={5} /> : <RunsTable records={records} onOpen={setOpenId} />}
      {openId ? <RunDrawer id={openId} records={records ?? []} projectId={projectId} getRun={(runId) => call<Run>("getRun", { runId })} onOpen={setOpenId} onClose={() => setOpenId(undefined)} /> : null}
    </>
  );
}

// Every check so far, newest first; search by address, one device or both; ticked results go to the Agent together.
function RunsTable({ records, onOpen }: { records: Record_[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"all" | "mobile" | "desktop">("all");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const anchorRef = useSelectionAnchor();
  const rows = useMemo(() => records.filter((r) => (only === "all" || r.strategy === only) && (r.finalUrl || r.url).toLowerCase().includes(query.trim().toLowerCase())), [records, only, query]);
  const columns = useMemo<ColumnDef<Record_>[]>(() => [
    makeSelectionColumn<Record_>(anchorRef),
    helper.accessor((r) => r.finalUrl || r.url, { id: "page", enableSorting: false, header: () => $t('common.page'), cell: ({ getValue, row }) => <button type="button" className={linkClass} title={getValue()} onClick={() => onOpen(row.original.id)}>{pathOf(getValue())}</button> }) as ColumnDef<Record_>,
    helper.accessor("strategy", { enableSorting: false, header: () => $t('lighthouseCard.device'), cell: ({ getValue }) => deviceName(getValue()) }) as ColumnDef<Record_>,
    ...CATEGORIES.map((k, i) => helper.accessor((r) => r.scores?.[k] ?? undefined, {
      id: k, sortDescFirst: true, sortUndefined: "last",
      header: ({ column }) => <SortableHeader column={column} label={getCategory()[k]} align="right" />,
      cell: ({ getValue, row }) => (row.original.scores ? <span className={cn("font-medium", ink(getValue() ?? null))}>{getValue() ?? "—"}</span> : i === 0 ? <Tag tone="grey">{failure(row.original)}</Tag> : "—"),
      meta: right,
    }) as ColumnDef<Record_>),
    helper.accessor((r) => seconds(lcpOf(r)?.value), { id: "lcp", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="LCP" align="right" />, cell: ({ row }) => { const m = lcpOf(row.original); return m ? <span className={ink(m.score)}>{m.value}</span> : "—"; }, meta: right }) as ColumnDef<Record_>,
    helper.accessor("createdAt", { sortDescFirst: true, header: ({ column }) => <SortableHeader column={column} label={$t('auditPerformance.checkedAt')} align="right" help={false} />, cell: ({ getValue }) => when(getValue()), meta: right }) as ColumnDef<Record_>,
  ], [onOpen, anchorRef]);
  const table = useDataTable({ data: rows, columns, withSorting: true, withPagination: true, enableRowSelection: (row) => row.original.status === "completed", enableSortingRemoval: false, state: { pagination, rowSelection }, onPaginationChange: setPagination, onRowSelectionChange: setRowSelection, getRowId: (r) => r.id, initialState: { sorting: [{ id: "createdAt", desc: true }] } });
  const ticked = table.getSelectedRowModel().rows.map((r) => r.original);
  useHandOffSource("lighthouse", { count: ticked.length, draft: () => draftMany(ticked), playbookId: "tech-fix", page: ticked.length === 1 ? ticked[0].finalUrl || ticked[0].url : undefined, description: $t('auditPerformance.tickedHandOff'), clear: () => setRowSelection({}) });
  const choose = (next: () => void) => { next(); setPagination((p) => ({ ...p, pageIndex: 0 })); };
  return (
    <Card className="gap-0 py-0" data-lighthouse-runs="">
      <DataTableToolbar>
        <label className="relative flex items-center"><Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" /><Input aria-label={$t('common.searchPages')} className="h-8 w-64 pl-8" placeholder={$t('auditPerformance.searchUrl')} value={query} onChange={(e) => choose(() => setQuery(e.target.value))} /></label>
        <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label={$t('auditPerformance.filterDevice')}>
          {(["all", "mobile", "desktop"] as const).map((s) => <button key={s} type="button" aria-pressed={only === s} onClick={() => choose(() => setOnly(s))} className={cn("inline-flex h-8 items-center px-3 text-sm text-muted-foreground transition-colors hover:text-foreground", only === s && "bg-muted font-medium text-foreground")}>{s === "all" ? $t('auditPerformance.bothDevices') : deviceName(s)}</button>)}
        </div>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">{$t('auditPerformance.runCount', { 0: records.length })}</span>
      </DataTableToolbar>
      <DataTable table={table} isFiltered={Boolean(query) || only !== "all"} onClearFilters={() => choose(() => { setQuery(""); setOnly("all"); })} empty={{ title: $t('auditPerformance.noRuns'), description: $t('auditPerformance.noRunsHelp') }}
        onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,a,[role=checkbox]")) return; onOpen(row.original.id); }}
        footer={rows.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize as (typeof PAGE_SIZES)[number]} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null} />
    </Card>
  );
}

// One check in full: the scores, the main metrics, every failing check, and the other checks of the same page and device.
function RunDrawer({ id, records, projectId, getRun, onOpen, onClose }: { id: string; records: Record_[]; projectId: number; getRun: (id: string) => Promise<Run>; onOpen: (id: string) => void; onClose: () => void }) {
  const [run, setRun] = useState<Run>();
  const [error, setError] = useMessageState("");
  useEffect(() => { let alive = true; setRun(undefined); setError(""); getRun(id).then((r) => { if (alive) setRun(r); }).catch((e) => { if (alive) setError(() => (e instanceof Error ? $legacyText(e.message) : $t('auditPerformance.notLoadRun'))); }); return () => { alive = false; }; }, [id]);
  const r = run?.status === "completed" ? run.result : null;
  const history = run ? records.filter((x) => x.url === run.spec.url && x.strategy === run.spec.strategy) : [];
  return (
    <DetailDrawer open onClose={onClose}
      title={run ? `${pathOf(r?.finalUrl || run.spec.url)} · ${deviceName(run.spec.strategy)}` : $t('siteAudit.performanceTab')}
      description={run ? $t('auditPerformance.runDescription', { 0: when(run.createdAt), 1: r?.version || "—" }) : ""}
      actions={r ? <SectionHandOff projectId={projectId} playbookId="tech-fix" page={r.finalUrl} description={$t('lighthouseCard.scoresMetricsFailedChecksRun')} draft={() => draft(r)} /> : undefined}>
      {error ? <p role="alert" className="nr-error">{error}</p> : !run ? <ListSkeleton rows={4} /> : !r ? (
        <p className="text-sm text-muted-foreground">{run.status === "unknown" ? run.errorCode || $t('common.resultUncertainMayChargedRepeat') : $t('lighthouseCard.noResults', { 0: run.errorCode || $t('errors.unknownReason') })}</p>
      ) : (
        <div className="flex flex-col gap-4" data-lighthouse-result="">
          {safeLink(r.finalUrl) ? <a className="nr-link block break-all text-sm" href={safeLink(r.finalUrl)!} target="_blank" rel="noreferrer">{r.finalUrl}</a> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(r.scores).map(([k, v]) => <div key={k} className="rounded-lg border p-3" data-score={k}><p className="text-xs text-muted-foreground"><WithInfo help={help(getCategory()[k])}>{getCategory()[k]}</WithInfo></p><p className={`font-heading text-2xl font-semibold tabular-nums ${ink(v)}`}>{v ?? "—"}</p></div>)}</div>
          {r.metrics.length ? <div className="flex flex-wrap gap-2 text-xs">{r.metrics.map((m) => <span key={m.key} className="rounded-md bg-muted px-2 py-1"><span className="text-muted-foreground"><WithInfo help={help(m.label)}>{m.label}</WithInfo></span> <span className={ink(m.score)}>{m.value}</span></span>)}</div> : null}
          <section>
            <h3 className="mb-1 text-sm font-semibold">{$t('auditPerformance.failedChecksCount', { 0: r.issues.length })}</h3>
            {r.issues.length ? (
              <ul className="divide-y rounded-lg border text-sm">{r.issues.map((i) => <li key={i.category + i.key} className="flex flex-wrap items-center gap-2 px-3 py-2" title={i.description} data-issue-key={i.key}><Tag tone={i.severity === "high" ? "red" : "amber"}>{getCategory()[i.category]}</Tag><span className="min-w-0 flex-1">{zh(i)}{getZh()[i.key] ? <span className="ml-2 text-xs text-muted-foreground">{i.title}</span> : null}</span>{i.value ? <span className="text-xs text-muted-foreground">{i.value}</span> : null}</li>)}</ul>
            ) : <p className="text-sm text-muted-foreground">{$t('lighthouseCard.checksPassed')}</p>}
          </section>
        </div>
      )}
      {history.length > 1 ? (
        <section className="mt-5" data-page-history="">
          <h3 className="mb-1 text-sm font-semibold">{$t('auditPerformance.pageHistory')}</h3>
          <ul className="divide-y rounded-lg border text-sm">{history.map((x) => (
            <li key={x.id}><button type="button" aria-current={x.id === id ? "true" : undefined} onClick={() => onOpen(x.id)} className={cn("flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50", x.id === id && "bg-muted")}>
              <span className="tabular-nums">{when(x.createdAt)}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">{x.scores ? <><Tag tone={tone(x.scores.performance)}>{$tj('lighthouseCard.performanceValue', { 0: x.scores.performance ?? "—" })}</Tag>{lcpOf(x) ? <span>LCP {lcpOf(x)!.value}</span> : null}</> : <span>{failure(x)}</span>}</span>
            </button></li>
          ))}</ul>
        </section>
      ) : null}
    </DetailDrawer>
  );
}
