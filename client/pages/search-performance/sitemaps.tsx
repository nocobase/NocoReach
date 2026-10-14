import { getCurrentLocale, $t, $tj } from "#i18n";
// 搜索表现 · 站点地图 (?view=sitemaps, 2026-10-14, user request: everything Search Console's API offers, in NocoReach's
// own style): the sitemaps submitted to Search Console (Sitemaps API, read when the page asks and kept six hours) with
// the files under an index, and the sitemaps NocoReach read from robots.txt that Search Console does not list (未提交).
// 已编入/已检查 comes from 索引: the inspected pages Google lists in that sitemap and how many of them are indexed.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, FileCode2 } from "lucide-react";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { TabsTrigger } from "#components/ui/tabs";
import { DataTable, useDataTable } from "#components/seo/data-table";
import { DataTableTabs } from "#components/seo/data-table-toolbar";
import { SortableHeader } from "#components/seo/sortable-header";
import { StatTile } from "#components/seo/stat-tile";
import { NotesTip } from "#components/reach/info-tip";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Tag, type Tone } from "#components/reach/tag";
import { safeLink } from "../analytics";
import { DetailDrawer } from "../detail-drawer";
import { useFreshData } from "../workspace-cache";

type Content = { type: string; submitted: number };
type Entry = { path: string; type: string | null; isIndex: boolean; isPending: boolean; lastSubmitted: string | null; lastDownloaded: string | null; warnings: number; errors: number; contents: Content[]; checked: number; indexed: number };
type Sitemap = Entry & { children?: Entry[] };
type Row = (Sitemap & { status: Exclude<State, "unsubmitted"> }) | { path: string; status: "unsubmitted"; checked: number; indexed: number };
type State = "success" | "error" | "warning" | "pending" | "unsubmitted";
type SitemapsView = { connected: boolean; site?: string; readAt?: string; sitemaps?: Sitemap[]; unsubmitted?: { path: string; checked: number; indexed: number }[] };

const TABS = ["all", "problems", "unsubmitted"] as const;
const num = (v: number) => v.toLocaleString(getCurrentLocale());
const dateOf = (v?: string | null) => (v ? v.slice(0, 10) : "—");
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const stateOf = (s: Entry): Exclude<State, "unsubmitted"> => (s.errors ? "error" : s.warnings ? "warning" : s.isPending ? "pending" : "success");
const STATE: Record<State, { tone: Tone; label: () => string }> = {
  success: { tone: "green", label: () => $t('searchSitemaps.success') }, error: { tone: "red", label: () => $t('searchSitemaps.hasErrors') }, warning: { tone: "amber", label: () => $t('searchSitemaps.hasWarnings') },
  pending: { tone: "grey", label: () => $t('searchSitemaps.pending') }, unsubmitted: { tone: "orange", label: () => $t('searchSitemaps.unsubmitted') },
};
// Sitemaps API content and file types.
const CONTENT: Record<string, () => string> = {
  web: () => $t('searchSitemaps.contentWeb'), image: () => $t('searchSitemaps.contentImage'), video: () => $t('searchSitemaps.contentVideo'), news: () => $t('searchSitemaps.contentNews'), mobile: () => $t('searchSitemaps.contentMobile'),
  androidApp: () => $t('searchSitemaps.contentAndroid'), iosApp: () => $t('searchSitemaps.contentIos'), pattern: () => $t('searchSitemaps.contentPattern'), dataFeedElement: () => $t('searchSitemaps.contentDataFeed'),
};
const KIND: Record<string, () => string> = { sitemap: () => $t('searchSitemaps.kindSitemap'), rssFeed: () => "RSS", atomFeed: () => "Atom", urlList: () => $t('searchSitemaps.kindUrlList'), notSitemap: () => $t('searchSitemaps.kindNotSitemap') };
const contentName = (t: string) => (CONTENT[t] ?? (() => t))();
const urls = (s: { contents?: Content[] }) => (s.contents ?? []).reduce((n, c) => n + c.submitted, 0);
const contentText = (s: { contents?: Content[] }) => (s.contents ?? []).filter((c) => c.submitted).map((c) => $t('searchSitemaps.contentCount', { 0: contentName(c.type), 1: num(c.submitted) })).join(" · ");
const tally = (r: { checked: number; indexed: number }) => (r.checked ? `${num(r.indexed)} / ${num(r.checked)}` : "—");

export function SitemapsView({ projectId, tab, onTab }: { projectId: number; tab: string | null; onTab: (t?: string) => void }) {
  const navigate = useNavigate();
  const { data: view, error, reload } = useFreshData<SitemapsView>(`data-view:search-sitemaps:${projectId}`, () => api.action<SitemapsView>("nrSearchIndex", "sitemaps", { method: "POST", body: { projectId }, unwrap: "data" }));
  const [open, setOpen] = useState<Row | null>(null);
  const rows: Row[] = useMemo(() => [...(view?.sitemaps ?? []).map((s) => ({ ...s, status: stateOf(s) })), ...(view?.unsubmitted ?? []).map((u) => ({ ...u, status: "unsubmitted" as const }))], [view]);
  if (error) return <LoadError title={$t('searchSitemaps.notLoaded')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} onRetry={reload} />;
  if (!view) return <ListSkeleton rows={6} />;
  if (!view.connected) return <EmptyState icon={<FileCode2 />} title={$t('searchPerformance.onceSearchConsoleConnectedSearch')} description={$t('common.authorizationReadsDataSyncsAutomatically')} action={<Button onClick={() => void navigate("/connections?source=gsc")}>{$t('searchPerformance.connectSearchConsole')}</Button>} />;
  const submitted = view.sitemaps ?? [], current = TABS.find((t) => t === tab) ?? "all";
  const byType = new Map<string, number>();
  for (const s of submitted) for (const c of s.contents) byType.set(c.type, (byType.get(c.type) ?? 0) + c.submitted);
  const tiles = [
    { key: "count", label: $t('searchSitemaps.submittedSitemaps'), value: num(submitted.length), hint: submitted.some((s) => s.isIndex) ? $t('searchSitemaps.indexFiles', { 0: submitted.filter((s) => s.isIndex).length }) : "", help: $t('searchSitemaps.submittedSitemapsHelp') },
    { key: "urls", label: $t('searchSitemaps.submittedUrls'), value: num(submitted.reduce((n, s) => n + urls(s), 0)), hint: [...byType].filter(([, n]) => n).map(([t, n]) => $t('searchSitemaps.contentCount', { 0: contentName(t), 1: num(n) })).join(" · "), help: $t('searchSitemaps.submittedUrlsHelp') },
    { key: "errors", label: $t('searchSitemaps.errors'), value: num(submitted.reduce((n, s) => n + s.errors, 0)), hint: $t('searchSitemaps.errorsHint'), help: $t('searchSitemaps.errorsHelp') },
    { key: "warnings", label: $t('searchSitemaps.warnings'), value: num(submitted.reduce((n, s) => n + s.warnings, 0)), hint: $t('searchSitemaps.warningsHint'), help: $t('searchSitemaps.warningsHelp') },
  ];
  const shown = rows.filter((r) => current === "all" || (current === "unsubmitted" ? r.status === "unsubmitted" : r.status === "error" || r.status === "warning"));
  return (
    <>
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" data-sitemaps-status="">
        <span>{$t('searchSitemaps.statusLine', { 0: view.site, 1: view.readAt ? new Date(view.readAt).toLocaleString(getCurrentLocale()) : "—" })}</span>
        <NotesTip notes={[$t('searchSitemaps.noteSource'), $t('searchSitemaps.noteUnsubmitted'), $t('searchSitemaps.noteIndexed')]} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label={$t('searchPerformance.figures')}>
        {tiles.map((t) => <Card key={t.key} className="gap-0 p-4" data-sitemaps-tile={t.key}><StatTile label={t.label} value={t.value} hint={t.hint || undefined} help={t.help} tone={t.key === "errors" && t.value !== "0" ? "destructive" : undefined} /></Card>)}
      </div>
      <SitemapTable rows={shown} tab={current} counts={{ all: rows.length, problems: rows.filter((r) => r.status === "error" || r.status === "warning").length, unsubmitted: rows.filter((r) => r.status === "unsubmitted").length }} onTab={(t) => onTab(t === "all" ? undefined : t)} onOpen={setOpen} />
      {open ? <SitemapDrawer row={open} site={view.site ?? ""} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

const helper = createColumnHelper<Row>();
function SitemapTable({ rows, tab, counts, onTab, onOpen }: { rows: Row[]; tab: string; counts: Record<(typeof TABS)[number], number>; onTab: (t: string) => void; onOpen: (r: Row) => void }) {
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    helper.accessor("path", { enableSorting: false, header: () => $t('searchSitemaps.sitemap'), cell: ({ row }) => { const r = row.original; return <span className="flex min-w-0 items-center gap-1.5"><button type="button" className="truncate text-left text-primary underline-offset-4 hover:underline" title={r.path} onClick={() => onOpen(r)}>{pathOf(r.path)}</button>{"isIndex" in r && r.isIndex ? <Tag tone="blue">{$t('searchSitemaps.index')}</Tag> : null}{"type" in r && r.type && r.type !== "sitemap" ? <Tag tone="slate">{(KIND[r.type] ?? (() => r.type!))()}</Tag> : null}</span>; } }) as ColumnDef<Row>,
    helper.accessor("status", { header: ({ column }) => <SortableHeader column={column} label={$t('searchSitemaps.status')} help={false} />, cell: ({ getValue }) => <Tag tone={STATE[getValue()].tone} dot>{STATE[getValue()].label()}</Tag> }) as ColumnDef<Row>,
    helper.accessor((r) => ("lastSubmitted" in r ? r.lastSubmitted ?? undefined : undefined), { id: "lastSubmitted", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('searchSitemaps.lastSubmitted')} help={false} />, cell: ({ row }) => ("lastSubmitted" in row.original ? dateOf(row.original.lastSubmitted) : "—"), meta: { cellClassName: "tabular-nums" } }) as ColumnDef<Row>,
    helper.accessor((r) => ("lastDownloaded" in r ? r.lastDownloaded ?? undefined : undefined), { id: "lastDownloaded", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('searchSitemaps.lastDownloaded')} help={false} />, cell: ({ row }) => ("lastDownloaded" in row.original ? dateOf(row.original.lastDownloaded) : "—"), meta: { cellClassName: "tabular-nums" } }) as ColumnDef<Row>,
    helper.accessor((r) => ("contents" in r ? urls(r) : undefined), { id: "urls", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('searchSitemaps.submittedUrls')} align="right" help={false} />, cell: ({ row }) => { const r = row.original; return "contents" in r ? <span title={contentText(r)}>{num(urls(r))}</span> : "—"; }, meta: right }) as ColumnDef<Row>,
    helper.accessor((r) => (r.checked ? r.indexed / r.checked : undefined), { id: "indexed", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('searchSitemaps.indexedChecked')} align="right" help={false} />, cell: ({ row }) => tally(row.original), meta: right }) as ColumnDef<Row>,
    helper.accessor((r) => ("errors" in r ? r.errors * 1000 + r.warnings : undefined), { id: "issues", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('searchSitemaps.errorsWarnings')} align="right" help={false} />, cell: ({ row }) => { const r = row.original; return "errors" in r ? `${num(r.errors)} / ${num(r.warnings)}` : "—"; }, meta: right }) as ColumnDef<Row>,
  ], [onOpen]);
  const table = useDataTable({ data: rows, columns, withSorting: true, getRowId: (r) => r.path });
  return (
    <Card className="gap-0 py-0" data-report="">
      <DataTableTabs value={tab} onValueChange={onTab}>
        <TabsTrigger value="all">{$tj('searchSitemaps.tabAll', { 0: num(counts.all) })}</TabsTrigger>
        <TabsTrigger value="problems">{$tj('searchSitemaps.tabProblems', { 0: num(counts.problems) })}</TabsTrigger>
        <TabsTrigger value="unsubmitted">{$tj('searchSitemaps.tabUnsubmitted', { 0: num(counts.unsubmitted) })}</TabsTrigger>
      </DataTableTabs>
      <DataTable table={table} empty={{ title: tab === "all" ? $t('searchSitemaps.noSitemaps') : $t('searchSitemaps.noneHere'), description: tab === "all" ? $t('searchSitemaps.noSitemapsHelp') : undefined }}
        onRowClick={(row, e) => { if (!(e.target as HTMLElement).closest("button,a")) onOpen(row.original); }} />
    </Card>
  );
}

// One sitemap: what Google read from it, its content types, the files under an index; for one not submitted, why it
// matters and where to submit it.
function SitemapDrawer({ row, site, onClose }: { row: Row; site: string; onClose: () => void }) {
  const href = safeLink(row.path), gsc = `https://search.google.com/search-console/sitemaps?resource_id=${encodeURIComponent(site)}`;
  return (
    <DetailDrawer open onClose={onClose} title={`${$t('searchSitemaps.sitemap')} · ${pathOf(row.path)}`} description={STATE[row.status].label()}>
      {href ? <a className="nr-link mb-3 inline-flex items-center gap-1 break-all" href={href} target="_blank" rel="noreferrer">{row.path}<ArrowUpRight className="size-3.5" /></a> : <p className="mb-3 break-all text-sm">{row.path}</p>}
      {row.status === "unsubmitted" ? <p className="text-sm text-muted-foreground">{$t('searchSitemaps.unsubmittedHelp')}</p> : (
        <table className="w-full text-sm" data-sitemap-facts="">
          <tbody>{([
            [$t('searchSitemaps.kind'), row.isIndex ? $t('searchSitemaps.index') : (KIND[row.type ?? ""] ?? (() => row.type ?? "—"))()], [$t('searchSitemaps.lastSubmitted'), row.lastSubmitted ? new Date(row.lastSubmitted).toLocaleString(getCurrentLocale()) : "—"],
            [$t('searchSitemaps.lastDownloaded'), row.lastDownloaded ? new Date(row.lastDownloaded).toLocaleString(getCurrentLocale()) : "—"], [$t('searchSitemaps.errors'), num(row.errors)], [$t('searchSitemaps.warnings'), num(row.warnings)],
            [$t('searchSitemaps.submittedUrls'), contentText(row) || "0"],
          ] as [string, string][]).map(([k, v]) => <tr key={k} className="border-t border-border first:border-0"><td className="w-32 py-1.5 pr-2 text-muted-foreground">{k}</td><td className="py-1.5">{v}</td></tr>)}</tbody>
        </table>
      )}
      <h3 className="mt-5 mb-1 text-sm font-semibold">{$t('searchSitemaps.indexedChecked')}</h3>
      <p className="text-sm">{row.checked ? $t('searchSitemaps.indexedOfChecked', { 0: num(row.indexed), 1: num(row.checked) }) : $t('searchSitemaps.noCheckedPages')}</p>
      {"children" in row && row.children?.length ? (
        <>
          <h3 className="mt-5 mb-1 text-sm font-semibold">{$t('searchSitemaps.children')}</h3>
          <table className="w-full text-sm" data-sitemap-children="">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">{$t('searchSitemaps.sitemap')}</th><th className="py-1 font-medium">{$t('searchSitemaps.status')}</th><th className="py-1 text-right font-medium">{$t('searchSitemaps.submittedUrls')}</th><th className="py-1 text-right font-medium">{$t('searchSitemaps.indexedChecked')}</th></tr></thead>
            <tbody>{row.children.map((c) => <tr key={c.path} className="border-t border-border"><td className="max-w-48 truncate py-1.5 pr-2" title={c.path}>{pathOf(c.path)}</td><td className="py-1.5"><Tag tone={STATE[stateOf(c)].tone}>{STATE[stateOf(c)].label()}</Tag></td><td className="py-1.5 text-right tabular-nums">{num(urls(c))}</td><td className="py-1.5 text-right tabular-nums">{tally(c)}</td></tr>)}</tbody>
          </table>
        </>
      ) : null}
      <a className="nr-link mt-5 inline-flex items-center gap-1" href={gsc} target="_blank" rel="noreferrer">{$t('searchSitemaps.openInSearchConsole')}<ArrowUpRight className="size-3.5" /></a>
    </DetailDrawer>
  );
}
