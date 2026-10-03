// 域名概览: ported from every-app/open-seo db8bde1 src/client/features/domain/ (DomainOverviewPage, DomainSearchCard,
// KeywordsTab, PagesTab, DomainKeywordsTable, DomainPagesTable; MIT). Changes: backlinks left out (user decision), one
// paid query per tab through NocoReach's DataForSEO layer (查询 reads the ranking keywords, which also carry the
// traffic and position counts; pages only on request), 本站点击 next to an estimate when the site is your own,
// saving keywords to 关键词, Chinese copy, CSV export only.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { createColumnHelper, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { Download, Globe, History, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabsTrigger } from "@/components/ui/tabs";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "@/components/seo/data-table";
import { DataTableFilterGroup, DataTableFilterPanel, DataTableFilterToggle, DataTableTabs, DataTableToolbar } from "@/components/seo/data-table-toolbar";
import { TablePagination } from "@/components/seo/table-pagination";
import { TableBulkActionBar, TableBulkActionButton } from "@/components/seo/table-bulk-action-bar";
import { SortableHeader } from "@/components/seo/sortable-header";
import { StatTile } from "@/components/seo/stat-tile";
import { ScoreBadge } from "@/components/seo/score-badge";
import { IntentBadge, INTENT_LABELS, toIntent } from "@/components/seo/intent-badge";
import { downloadCsv, type CsvValue } from "@/components/seo/csv";
import { useProject } from "./reach-data";
import { currentProjectId } from "./current-project";
import { safeLink } from "./analytics";
import { keywordRequest, markets, marketLabel, metric, rankOf, rankRequest, type KeywordConnectionState, type Ranks } from "./keyword-api";
import "./reach-workspace.css";
import "./data-views.css";

type Item = { id: string; keyword: string; url: string; volume: number | null; difficulty: number | null; intent: string | null; position: number | null; traffic: number | null; keywords: number | null; cpc: number | null };
type Spec = { kind: "domain"; view: "keywords" | "pages"; target: string; locationCode: number; language: string };
type Run = { id: number | string; status: string; spec: Spec; result?: { items: Item[]; totalCount: number | null; summary?: { traffic: number; keywords: number; top3: number; top10: number } | null }; errorCode?: string; createdAt: string; completedAt?: string };
type Recent = { id: string; status: string; spec: Spec; createdAt: string; completedAt: string | null; count: number | null; summary: Run["result"] extends infer R ? R extends { summary?: infer S } ? S : null : null };
const call = <T,>(action: string, body: object = {}) => api.action<T>("nrDomains", action, { method: "POST", body: { projectId: String(currentProjectId()), ...body }, unwrap: "data" });
const requestKey = () => crypto.randomUUID().replace(/-/g, "");
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const fmtTime = (v?: string | null) => (v ? new Date(v).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const bare = (d?: string) => String(d || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

export default function DomainOverview() {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const own = (project?.domains ?? []).map(bare);
  const [connection, setConnection] = useState<KeywordConnectionState>();
  const [recent, setRecent] = useState<Recent[]>();
  const [runs, setRuns] = useState<{ keywords?: Run; pages?: Run }>({});
  const [busy, setBusy] = useState<"" | "keywords" | "pages">("");
  const [error, setError] = useState("");
  const market = markets.find((m) => String(m.locationCode) === params.get("loc") && m.language === params.get("lang")) ?? markets[0];
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
    } catch (e) { setError(e instanceof Error ? e.message : "查询没有完成，请稍后再试"); }
    finally { setBusy(""); }
  };
  const shown = runs.keywords;
  const isOwn = Boolean(shown && own.includes(bare(shown.spec.target)));
  const setTab = (v: string) => { const p = new URLSearchParams(params); v === "pages" ? p.set("tab", "pages") : p.delete("tab"); setParams(p, { replace: true }); };
  return (
    <PageContainer className="nr-data-page">
      <PageHeader
        title="域名概览"
        description="查任何网站（包括竞品）在 Google 里排名的关键词和热门页面。DataForSEO 的市场估算，不是本站数据。"
        actions={shown ? <Button variant="outline" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}><History data-icon="inline-start" />最近查过的</Button> : undefined}
      />
      {connection && !connection.verifiedAt ? (
        <EmptyState icon={<Globe />} title="先接入 DataForSEO" description="域名概览用 DataForSEO 的数据，按查询收费；花费在数据接入里看。" />
      ) : (
        <Card className="px-4">
          <form className="flex flex-col gap-2 lg:flex-row lg:items-center" onSubmit={(e) => { e.preventDefault(); void query("keywords"); }}>
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" aria-label="域名" placeholder="例如 example.com" value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
            </div>
            <Select value={`${form.market.locationCode}:${form.market.language}`} onValueChange={(v) => { const m = markets.find((x) => `${x.locationCode}:${x.language}` === v); if (m) setForm((f) => ({ ...f, market: m })); }}>
              <SelectTrigger className="w-full lg:w-44" aria-label="市场"><SelectValue>{(v: string) => markets.find((x) => `${x.locationCode}:${x.language}` === v)?.label}</SelectValue></SelectTrigger>
              <SelectContent>{markets.map((m) => <SelectItem key={`${m.locationCode}:${m.language}`} value={`${m.locationCode}:${m.language}`}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="submit" disabled={Boolean(busy) || !form.target.trim()} className="lg:px-6">{busy === "keywords" ? "正在查询…" : "查询"}</Button>
          </form>
          <p className="text-xs text-muted-foreground">查的是这个域名（含子域名）在所选市场的自然搜索排名。30 天内查过同样条件会直接打开已有结果。</p>
          {error ? <p role="alert" className="nr-error">{error}</p> : null}
        </Card>
      )}
      {shown ? (
        shown.status !== "completed" ? <EmptyState icon={<Globe />} title="查询没有完成" description={shown.errorCode || "不要重复发起同样的查询；可以到 DataForSEO 后台核对是否计费。"} /> : (
          <>
            <Summary run={shown} />
            <Card className="gap-0 py-0">
              <DataTableTabs value={tab} onValueChange={setTab}>
                <TabsTrigger value="keywords">关键词 ({shown.result?.items.length ?? 0})</TabsTrigger>
                <TabsTrigger value="pages">页面{runs.pages?.result ? ` (${runs.pages.result.items.length})` : ""}</TabsTrigger>
              </DataTableTabs>
              {tab === "keywords" ? <KeywordsTable run={shown} own={isOwn} /> : runs.pages && runs.pages.spec.target === shown.spec.target ? <PagesTable run={runs.pages} /> : (
                <div className="space-y-2 p-6 text-sm">
                  <p className="text-muted-foreground">看 {shown.spec.target} 哪些页面带来最多的自然搜索流量。这是另一次查询，点了才查。</p>
                  <Button variant="outline" disabled={Boolean(busy)} onClick={() => void query("pages", shown.spec.target, markets.find((m) => m.locationCode === shown.spec.locationCode && m.language === shown.spec.language) ?? form.market)}>{busy === "pages" ? "正在查询…" : "查询热门页面"}</Button>
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
    </PageContainer>
  );
}

function Summary({ run }: { run: Run }) {
  const s = run.result?.summary;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["估算自然流量 / 月", s?.traffic], ["排名关键词", s?.keywords], ["前 3 名", s?.top3], ["前 10 名", s?.top10]].map(([label, v]) => (
          <Card key={String(label)} className="gap-0 p-4" data-metric={label}><StatTile label={String(label)} value={v == null ? "—" : Math.round(Number(v)).toLocaleString()} /></Card>
        ))}
      </div>
      <p className="nr-footnote">{run.spec.target} · {marketLabel(run.spec)} · {fmtTime(run.completedAt || run.createdAt)}；流量是按排名和搜索量估算的，不是对方的真实访问。</p>
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
  useEffect(() => { if (own && project && items.length) void rankRequest(project.id, items.map((i) => i.keyword)).then(setRanks).catch(() => undefined); }, [run.id, own, project?.id]);
  const terms = (s: string) => s.split(/[,，]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const rows = useMemo(() => { const inc = terms(filter.include), exc = terms(filter.exclude); return items.filter((r) => { const k = r.keyword.toLowerCase(); return inc.every((t) => k.includes(t)) && !exc.some((t) => k.includes(t)); }).map((r) => ({ ...r, siteClicks: rankOf(ranks, r.keyword)?.clicks })); }, [items, filter, ranks]);
  const active = Number(Boolean(filter.include)) + Number(Boolean(filter.exclude));
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    makeSelectionColumn<Row>(anchorRef),
    kHelper.accessor("keyword", { header: ({ column }) => <SortableHeader column={column} label="关键词" />, cell: ({ getValue }) => <span className="block max-w-xs truncate font-medium" title={getValue()}>{getValue()}</span> }) as ColumnDef<Row>,
    kHelper.accessor("position", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="排名" align="right" />, cell: ({ getValue }) => metric(getValue()), meta: right }) as ColumnDef<Row>,
    kHelper.accessor("volume", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="月搜索量" align="right" />, cell: ({ getValue }) => metric(getValue()), meta: right }) as ColumnDef<Row>,
    kHelper.accessor("traffic", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="估算流量" align="right" title="按排名和搜索量估算的每月点击" />, cell: ({ getValue }) => (getValue() == null ? "—" : Math.round(getValue()!).toLocaleString()), meta: right }) as ColumnDef<Row>,
    kHelper.accessor("url", { enableSorting: false, header: () => "排名页面", cell: ({ getValue }) => (safeLink(getValue()) ? <a className="block max-w-56 truncate text-primary hover:underline" href={safeLink(getValue())} target="_blank" rel="noreferrer" title={getValue()}>{pathOf(getValue())}</a> : <span className="block max-w-56 truncate">{getValue()}</span>) }) as ColumnDef<Row>,
    kHelper.accessor("difficulty", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="难度" align="right" />, cell: ({ getValue }) => <ScoreBadge value={getValue()} />, meta: right }) as ColumnDef<Row>,
    kHelper.accessor("intent", { enableSorting: false, header: () => "意图", cell: ({ getValue }) => <IntentBadge intent={getValue()} /> }) as ColumnDef<Row>,
    ...(own ? [kHelper.accessor("siteClicks", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="本站点击" align="right" title="本站近 28 天在 Search Console 里这个词的实际点击" />, cell: ({ getValue }) => (getValue() == null ? "—" : getValue()!.toLocaleString()), meta: right }) as ColumnDef<Row>] : []),
  ], [anchorRef, own]);
  const table = useDataTable({ data: rows, columns, withSorting: true, withPagination: true, enableRowSelection: true, state: { rowSelection, pagination, sorting }, onRowSelectionChange: setRowSelection, onPaginationChange: setPagination, onSortingChange: setSorting, getRowId: (r) => r.id });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const csv = (list: (Row)[]) => downloadCsv(`域名概览-${run.spec.target}-关键词`, ["关键词", "排名", "月搜索量", "估算流量", "排名页面", "难度", "意图", ...(own ? ["本站点击"] : [])], list.map((r): CsvValue[] => [r.keyword, r.position, r.volume, r.traffic, r.url, r.difficulty, INTENT_LABELS[toIntent(r.intent)], ...(own ? [r.siteClicks ?? ""] : [])])) || toast.error("没有可以导出的关键词");
  const save = async () => {
    try { const r = await keywordRequest<{ saved: number; skipped: number }>("saveFromRun", { runId: String(run.id), itemIds: selected.map((s) => s.id) }); toast.success(`已保存 ${r.saved} 个关键词${r.skipped ? `，${r.skipped} 个之前已保存` : ""}`); setRowSelection({}); }
    catch (e) { toast.error(e instanceof Error ? e.message : "没有保存成功"); }
  };
  return (
    <>
      <DataTable table={table} isFiltered={active > 0} onClearFilters={() => setFilter({ include: "", exclude: "" })} empty={{ title: "没有查到排名关键词", description: "这个网站在所选市场可能还没有自然搜索排名。" }}
        toolbar={<>
          <DataTableToolbar actions={<Button variant="outline" size="sm" onClick={() => csv(rows)}><Download data-icon="inline-start" />导出 CSV</Button>}>
            <DataTableFilterToggle open={showFilters} activeCount={active} onToggle={() => setShowFilters((v) => !v)} />
            <span className="text-xs text-muted-foreground">{run.result?.totalCount ? `共 ${run.result.totalCount.toLocaleString()} 个，这里列出估算流量最多的 ${items.length} 个` : `共 ${items.length} 个`}</span>
          </DataTableToolbar>
          {showFilters ? <DataTableFilterPanel activeCount={active} onReset={() => setFilter({ include: "", exclude: "" })}><div className="grid gap-2 sm:grid-cols-2"><DataTableFilterGroup label="包含"><Input aria-label="包含" className="h-7" placeholder="都要包含，逗号分隔" value={filter.include} onChange={(e) => setFilter((f) => ({ ...f, include: e.target.value }))} /></DataTableFilterGroup><DataTableFilterGroup label="排除"><Input aria-label="排除" className="h-7" placeholder="任何一个都不要" value={filter.exclude} onChange={(e) => setFilter((f) => ({ ...f, exclude: e.target.value }))} /></DataTableFilterGroup></div></DataTableFilterPanel> : null}
        </>}
        footer={rows.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={[50, 100] as const} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null} />
      {own ? <p className="px-4 pb-3 text-xs text-muted-foreground">这是本站：“本站点击”是 Search Console 近 28 天的实际点击，可以和估算流量对照。</p> : null}
      <TableBulkActionBar selectedCount={selected.length} selectedLabel="个关键词已选" onClear={() => setRowSelection({})} actions={<>
        <TableBulkActionButton icon={<Save className="size-3.5" />} onClick={() => void save()}>保存为关键词</TableBulkActionButton>
        <TableBulkActionButton icon={<Download className="size-3.5" />} onClick={() => csv(selected)}>导出</TableBulkActionButton>
      </>} />
    </>
  );
}

const pHelper = createColumnHelper<Item>();
function PagesTable({ run }: { run: Run }) {
  const items = run.result?.items ?? [];
  const [sorting, setSorting] = useState<SortingState>([{ id: "traffic", desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const columns = useMemo<ColumnDef<Item>[]>(() => [
    pHelper.accessor("url", { enableSorting: false, header: () => "页面", cell: ({ getValue }) => (safeLink(getValue()) ? <a className="block max-w-xl truncate text-primary hover:underline" href={safeLink(getValue())} target="_blank" rel="noreferrer" title={getValue()}>{getValue()}</a> : <span className="block max-w-xl truncate">{getValue()}</span>) }) as ColumnDef<Item>,
    pHelper.accessor("traffic", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="估算流量" align="right" />, cell: ({ getValue }) => (getValue() == null ? "—" : Math.round(getValue()!).toLocaleString()), meta: right }) as ColumnDef<Item>,
    pHelper.accessor("keywords", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="排名关键词" align="right" />, cell: ({ getValue }) => metric(getValue()), meta: right }) as ColumnDef<Item>,
  ], []);
  const table = useDataTable({ data: items, columns, withSorting: true, withPagination: true, state: { pagination, sorting }, onPaginationChange: setPagination, onSortingChange: setSorting, getRowId: (r) => r.id });
  return <DataTable table={table} empty={{ title: "没有查到页面" }}
    toolbar={<DataTableToolbar actions={<Button variant="outline" size="sm" onClick={() => downloadCsv(`域名概览-${run.spec.target}-页面`, ["页面", "估算流量", "排名关键词"], items.map((r): CsvValue[] => [r.url, r.traffic, r.keywords])) || toast.error("没有可以导出的页面")}><Download data-icon="inline-start" />导出 CSV</Button>}><span className="text-xs text-muted-foreground">{marketLabel(run.spec)} · {fmtTime(run.completedAt || run.createdAt)}</span></DataTableToolbar>}
    footer={items.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={[50, 100] as const} totalCount={items.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null} />;
}

function RecentList({ recent, onOpen }: { recent?: Recent[]; onOpen: (r: Recent) => void }) {
  if (!recent) return <ListSkeleton rows={4} />;
  recent = recent.filter((r) => r.spec.view === "keywords");
  if (!recent.length) return <EmptyState icon={<Globe />} title="还没有查过网站" description="输入一个域名（默认是本站），看看它在 Google 里排名的关键词。" />;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">最近查过的</h2>
      <Card className="gap-0 py-0">
        {recent.map((r) => (
          <button key={r.id} type="button" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 text-left text-sm last:border-0 hover:bg-muted/50" onClick={() => onOpen(r)}>
            <span className="min-w-0 flex-1 truncate font-medium">{r.spec.target}</span>
            <span className="text-xs text-muted-foreground">{marketLabel(r.spec)}{r.summary ? ` · 估算流量 ${Math.round(r.summary.traffic).toLocaleString()}` : ""}</span>
            <span className="w-24 text-xs text-muted-foreground tabular-nums">{r.status === "completed" ? `${r.count ?? 0} 条` : "没有完成"}</span>
            <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">{fmtTime(r.completedAt || r.createdAt)}</span>
          </button>
        ))}
      </Card>
    </section>
  );
}
