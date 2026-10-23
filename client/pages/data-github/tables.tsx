import { $t } from "#i18n";
// GitHub page · 我们的仓库: one table with tabs, as 访问's reports. 来源网站 and 热门页面 are GitHub's top ten of the 14 days
// to the latest snapshot in the period, against the snapshot a week before, a row opening its line over the saved
// snapshots; 贡献者, Issues and Pull requests are those of the period (the history read with the token); Releases all of
// them; Discussions the most discussed of the last 90 days. Ticked referring sites, pages, issues and discussions go to
// the Agent (看懂这些访问来源 / 补进官网文档 / 归类社区问题).
import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, Search } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { TabsTrigger } from "#components/ui/tabs";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableTabs } from "#components/seo/data-table-toolbar";
import { TablePagination } from "#components/seo/table-pagination";
import { SortableHeader } from "#components/seo/sortable-header";
import { useHandOffSource, type HandOffSource } from "#components/reach/hand-off-slot";
import { Tag, type Tone } from "#components/reach/tag";
import { safeLink } from "../analytics";
import { DetailDrawer } from "../detail-drawer";
import { discussionsDraft, githubTrafficDraft } from "../seo-hand-off";
import { dateOf, hours, num, pct, type Contributor, type Discussion, type Item, type Kind, type PopularPath, type Referrer, type Release, type Snapshot, type View } from "./model";
import { formatDate, formatSigned } from '#lib/format';

export const KIND: Record<Kind, { label: () => string; tone: Tone }> = {
  own: { label: () => $t('dataGithub.kindOwn'), tone: "blue" }, ai: { label: () => $t('dataGithub.kindAi'), tone: "violet" }, search: { label: () => $t('dataGithub.kindSearch'), tone: "green" },
  community: { label: () => $t('dataGithub.kindCommunity'), tone: "orange" }, content: { label: () => $t('dataGithub.kindContent'), tone: "amber" }, github: { label: () => "GitHub", tone: "slate" }, other: { label: () => $t('dataGithub.kindOther'), tone: "grey" },
};
const AREA: Record<string, () => string> = { home: () => $t('dataGithub.areaHome'), code: () => $t('dataGithub.areaCode'), releases: () => "Releases", issues: () => "Issues", pulls: () => "Pull requests", tags: () => "Tags", wiki: () => "Wiki", discussions: () => "Discussions", actions: () => "Actions", insights: () => "Insights" };
const STATE: Record<Item["state"], { label: () => string; tone: Tone }> = { open: { label: () => $t('dataGithub.open'), tone: "green" }, closed: { label: () => $t('common.closed'), tone: "slate" }, merged: { label: () => $t('dataGithub.merged'), tone: "violet" } };

type Ref = Snapshot<Referrer>["items"][number];
type Pop = Snapshot<PopularPath>["items"][number];
type TabId = "referrers" | "paths" | "contributors" | "issues" | "pulls" | "releases" | "discussions";
const TABS: { id: TabId; label: () => string }[] = [
  { id: "referrers", label: () => $t('dataGithub.referringSites') }, { id: "paths", label: () => $t('dataGithub.popularPages') }, { id: "contributors", label: () => $t('dataGithub.contributors') },
  { id: "issues", label: () => $t('dataGithub.tabIssues') }, { id: "pulls", label: () => $t('dataGithub.tabPulls') }, { id: "releases", label: () => $t('dataGithub.tabReleases') }, { id: "discussions", label: () => $t('dataGithub.tabDiscussions') },
];
const PAGE_SIZES = [25, 50, 100] as const;
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const sortable = { sortDescFirst: true, sortUndefined: "last" } as const;
const Ext = ({ href, children }: { href: string | null | undefined; children: ReactNode }) => (href && safeLink(href) ? <a className="nr-link" href={safeLink(href)!} target="_blank" rel="noreferrer">{children}</a> : <>{children}</>);
const Who = ({ external }: { external: boolean | null }) => (external === null ? null : external ? <Tag tone="orange">{$t('dataGithub.outside')}</Tag> : <Tag tone="slate">{$t('dataGithub.team')}</Tag>);

function count<T>(id: string, label: string, get: (r: T) => number | null | undefined, show: (v: number | null) => string = (v) => num(v)): ColumnDef<T> {
  return { id, accessorFn: (r) => get(r) ?? undefined, ...sortable, header: ({ column }) => <SortableHeader column={column} label={label} align="right" help={false} />, cell: ({ row }) => show(get(row.original) ?? null), meta: right };
}
function date<T>(id: string, label: string, get: (r: T) => string | null | undefined): ColumnDef<T> {
  return { id, accessorFn: (r) => get(r) || undefined, ...sortable, header: ({ column }) => <SortableHeader column={column} label={label} help={false} />, cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{dateOf(get(row.original))}</span> };
}
const plain = <T,>(id: string, label: string, cell: (r: T) => ReactNode, className?: string): ColumnDef<T> => ({ id, header: () => label, cell: ({ row }) => cell(row.original), enableSorting: false, meta: className ? { cellClassName: className } : undefined });
// Against the snapshot about a week before: the difference in views, or 新上榜 when it was not in that top ten.
const weekChange = (r: { count: number; previous: number | null }, compared: string | null) => (!compared || r.previous === null ? "—" : r.previous === 0 ? $t('dataGithub.newInTopTen') : formatSigned(r.count - r.previous));

export function ReportCard({ view, projectId }: { view: View; projectId?: number }) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get("tab"))?.id ?? "referrers";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ kind: "referrers" | "paths"; key: string } | null>(null);
  const choose = (id: string) => { const p = new URLSearchParams(params); if (id === "referrers") p.delete("tab"); else p.set("tab", id); setParams(p, { replace: true }); setQuery(""); };
  const t = view.tables!, repo = view.repo!, q = query.trim().toLowerCase(), has = (...xs: (string | null | undefined)[]) => !q || xs.some((x) => x?.toLowerCase().includes(q));
  const short = (path: string) => path.replace(new RegExp(`^/${repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), "") || "/";
  const notes: Record<TabId, ReactNode> = {
    referrers: t.referrers ? $t('dataGithub.snapshotNote', { 0: formatDate(t.referrers.date), 1: formatDate(t.referrers.comparedWith) }) : null,
    paths: t.paths ? $t('dataGithub.snapshotNote', { 0: formatDate(t.paths.date), 1: formatDate(t.paths.comparedWith) }) : null,
    contributors: $t('dataGithub.contributorsNote'),
    issues: $t('dataGithub.openedInPeriodNote', { 0: num(t.issues.length) }),
    pulls: $t('dataGithub.openedInPeriodNote', { 0: num(t.pulls.length) }),
    releases: $t('dataGithub.releasesNote', { 0: num(view.totals?.releases), 1: num(view.totals?.releaseDownloads) }),
    discussions: t.discussions ? $t('dataGithub.discussionsNote') : null,
  };
  const trafficEmpty = view.history?.state === "token" ? $t('dataGithub.shownOnceTrafficConnected') : view.history?.savedSince ? $t('dataGithub.savedSinceOnly', { 0: view.history.savedSince }) : $t('dataGithub.savedFromNextRead');
  const historyEmpty = view.history?.state === "token" ? $t('dataGithub.historyNeedsToken') : view.history?.state !== "complete" ? $t('dataGithub.historyReading') : $t('dataGithub.noRecordsInRange');
  const label = TABS.find((x) => x.id === tab)!.label();
  const common = { projectId, query: q, onClear: () => setQuery("") };
  return (
    <Card className="gap-0 py-0" data-report="">
      <DataTableTabs value={tab} onValueChange={choose} description={notes[tab]} tools={<>
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
          <Input aria-label={$t('dataGithub.searchIn', { 0: label })} className="h-8 w-64 pl-8" placeholder={$t('dataGithub.searchIn', { 0: label })} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </>}>
        {TABS.map((x) => <TabsTrigger key={x.id} value={x.id}>{x.label()}</TabsTrigger>)}
      </DataTableTabs>
      {tab === "referrers" ? (
        <Grid<Ref> key={tab} id="github-referrers" {...common} empty={t.referrers ? $t('dataGithub.noRecordsInRange') : trafficEmpty} rows={(t.referrers?.items ?? []).filter((r) => has(r.referrer, KIND[r.kind].label()))} rowId={(r) => r.key} sort="count" onOpen={(r) => setOpen({ kind: "referrers", key: r.key })}
          handOff={(ticked) => ({ noun: $t('dataGithub.sourcesSelected'), playbookId: "change-research", description: $t('dataGithub.tickedReferringSitesBecomeOne'), draft: () => githubTrafficDraft(repo, "referrers", ticked.map((r) => ({ name: r.referrer, count: r.count, uniques: r.uniques }))) })}
          columns={[
            { id: "name", accessorFn: (r) => r.referrer.toLowerCase(), header: ({ column }) => <SortableHeader column={column} label={$t('dataGithub.source')} help={false} />, cell: ({ row }) => <button type="button" className="text-left text-primary underline-offset-4 hover:underline" onClick={() => setOpen({ kind: "referrers", key: row.original.key })}>{row.original.referrer}</button> },
            plain<Ref>("kind", $t('dataGithub.kind'), (r) => <Tag tone={KIND[r.kind].tone}>{KIND[r.kind].label()}</Tag>),
            count<Ref>("count", $t('common.views'), (r) => r.count), count<Ref>("uniques", $t('dataGithub.uniqueVisitors'), (r) => r.uniques), count<Ref>("share", $t('dataGithub.shareOfTopTen'), (r) => r.share, pct),
            { ...count<Ref>("change", $t('dataGithub.vsWeekBefore'), (r) => (r.previous === null ? null : r.count - r.previous)), cell: ({ row }) => weekChange(row.original, t.referrers!.comparedWith) },
          ]} />
      ) : tab === "paths" ? (
        <Grid<Pop> key={tab} id="github-paths" {...common} empty={t.paths ? $t('dataGithub.noRecordsInRange') : trafficEmpty} rows={(t.paths?.items ?? []).filter((r) => has(r.path, r.title))} rowId={(r) => r.key} sort="count" onOpen={(r) => setOpen({ kind: "paths", key: r.key })}
          handOff={(ticked) => ({ noun: $t('common.pagesSelected'), playbookId: "content-outline", description: $t('dataGithub.tickedPopularPagesBecomeOne'), draft: () => githubTrafficDraft(repo, "paths", ticked.map((p) => ({ name: `${p.title || p.path}（${p.path}）`, count: p.count, uniques: p.uniques }))) })}
          columns={[
            { id: "name", accessorFn: (r) => r.path, header: ({ column }) => <SortableHeader column={column} label={$t('dataGithub.path')} help={false} />, cell: ({ row }) => <button type="button" className="flex max-w-md min-w-0 flex-col text-left" onClick={() => setOpen({ kind: "paths", key: row.original.key })}><span className="truncate text-primary underline-offset-4 hover:underline">{short(row.original.path)}</span>{row.original.title ? <span className="truncate text-xs text-muted-foreground">{row.original.title}</span> : null}</button> },
            plain<Pop>("area", $t('dataGithub.area'), (r) => (AREA[r.area] ?? (() => $t('dataGithub.kindOther')))(), "text-muted-foreground"),
            count<Pop>("count", $t('common.views'), (r) => r.count), count<Pop>("uniques", $t('dataGithub.uniqueVisitors'), (r) => r.uniques), count<Pop>("share", $t('dataGithub.shareOfTopTen'), (r) => r.share, pct),
            { ...count<Pop>("change", $t('dataGithub.vsWeekBefore'), (r) => (r.previous === null ? null : r.count - r.previous)), cell: ({ row }) => weekChange(row.original, t.paths!.comparedWith) },
          ]} />
      ) : tab === "contributors" ? (
        <Grid<Contributor> key={tab} id="github-contributors" {...common} empty={t.contributors.length ? $t('dataGithub.noRecordsInRange') : view.history?.state === "complete" ? $t('dataGithub.shownAfterNextSync') : historyEmpty} rows={t.contributors.filter((c) => has(c.login))} rowId={(c) => c.login} sort="commits"
          columns={[
            { id: "name", accessorFn: (c) => c.login.toLowerCase(), header: ({ column }) => <SortableHeader column={column} label={$t('dataGithub.contributors')} help={false} />, cell: ({ row }) => <span className="flex items-center gap-1.5"><Ext href={row.original.url}>{row.original.login.replace(/^~/, "")}</Ext><Who external={row.original.external} /></span> },
            count<Contributor>("commits", $t('dataGithub.commitsInPeriod'), (c) => c.commits), ...(view.window?.all ? [] : [count<Contributor>("previous", $t('dataGithub.commitsPrevious'), (c) => c.previous)]),
            count<Contributor>("total", $t('dataGithub.allContributions'), (c) => c.total), date<Contributor>("first", $t('dataGithub.firstCommit'), (c) => c.firstCommit),
          ]} />
      ) : tab === "issues" || tab === "pulls" ? (
        <Grid<Item> key={tab} id={`github-${tab}`} {...common} empty={view.history?.state === "complete" ? $t('dataGithub.noRecordsInRange') : historyEmpty} rows={t[tab].filter((i) => has(i.title, i.author, `#${i.number}`))} rowId={(i) => String(i.number)} sort="created"
          handOff={tab === "issues" ? (ticked) => ({ noun: $t('dataGithub.issuesSelected'), playbookId: "community-summary", description: $t('dataGithub.tickedIssuesBecomeOne'), draft: () => discussionsDraft(`GitHub Issues（${repo}）`, "issue", ticked.map((i) => ({ title: i.title, url: i.url, meta: $t('dataGithub.comments', { 0: i.comments ?? 0, 1: STATE[i.state].label() }) }))) }) : undefined}
          columns={[
            { id: "title", accessorFn: (i) => i.number, header: ({ column }) => <SortableHeader column={column} label={$t('common.title')} help={false} />, cell: ({ row }) => <span className="flex max-w-xl min-w-0 items-center gap-1.5"><span className="shrink-0 text-muted-foreground tabular-nums">#{row.original.number}</span><span className="truncate"><Ext href={row.original.url}>{row.original.title}</Ext></span></span> },
            plain<Item>("author", $t('dataGithub.author'), (i) => <span className="flex items-center gap-1.5 whitespace-nowrap">{i.author ?? "—"}<Who external={i.external} /></span>),
            { id: "state", accessorFn: (i) => i.state, header: ({ column }) => <SortableHeader column={column} label={$t('common.status')} help={false} />, cell: ({ row }) => <Tag tone={STATE[row.original.state].tone}>{STATE[row.original.state].label()}</Tag> },
            date<Item>("created", $t('dataGithub.opened'), (i) => i.created), count<Item>("comments", $t('common.comments'), (i) => i.comments),
            count<Item>("hours", tab === "pulls" ? $t('dataGithub.timeToMerge') : $t('dataGithub.timeToClose'), (i) => (tab === "pulls" && i.state !== "merged" ? null : i.closed ? i.hours : null), hours),
          ]} />
      ) : tab === "releases" ? (
        <Grid<Release> key={tab} id="github-releases" {...common} empty={$t('dataGithub.noReleases')} rows={t.releases.filter((r) => has(r.name, r.tag))} rowId={(r) => r.tag} sort="date"
          columns={[
            { id: "name", accessorFn: (r) => r.tag, header: ({ column }) => <SortableHeader column={column} label={$t('dataGithub.version')} help={false} />, cell: ({ row }) => <span className="flex items-center gap-1.5"><Ext href={row.original.url}>{row.original.name || row.original.tag}</Ext>{row.original.name && row.original.name !== row.original.tag ? <span className="text-xs text-muted-foreground">{row.original.tag}</span> : null}{row.original.prerelease ? <Tag tone="grey">{$t('dataGithub.prerelease')}</Tag> : null}</span> },
            date<Release>("date", $t('dataGithub.published'), (r) => r.date), count<Release>("downloads", $t('common.downloads'), (r) => r.downloads), count<Release>("files", $t('dataGithub.assets'), (r) => r.files),
          ]} />
      ) : (
        <Grid<Discussion> key={tab} id="github-discussions" {...common} empty={t.discussionsEnabled === false ? $t('dataGithub.discussionsNotEnabledRepository') : t.discussions ? $t('dataGithub.noDiscussions') : $t('dataGithub.readTrafficTokenDiscussionsLast')} rows={(t.discussions ?? []).filter((d) => has(d.title, d.category))} rowId={(d) => d.url} sort="comments"
          handOff={(ticked) => ({ noun: $t('dataGithub.discussionsSelected'), playbookId: "community-summary", description: $t('dataGithub.tickedDiscussionsBecomeOne'), draft: () => discussionsDraft(`GitHub Discussions（${repo}）`, $t('dataGithub.discussions'), ticked.map((d) => ({ title: d.title, url: d.url, meta: $t('dataGithub.comments', { 0: d.comments, 1: d.answerable ? (d.answered ? $t('dataGithub.answered') : $t('dataGithub.notAnsweredYet')) : d.category }) }))) })}
          columns={[
            { id: "title", accessorFn: (d) => d.title.toLowerCase(), header: ({ column }) => <SortableHeader column={column} label={$t('common.title')} help={false} />, cell: ({ row }) => <span className="block max-w-xl truncate"><Ext href={row.original.url}>{row.original.title}</Ext></span> },
            plain<Discussion>("category", $t('common.category'), (d) => d.category, "text-muted-foreground"),
            count<Discussion>("comments", $t('common.comments'), (d) => d.comments), count<Discussion>("upvotes", $t('dataGithub.upvotes'), (d) => d.upvotes),
            plain<Discussion>("answered", $t('dataGithub.answer'), (d) => (d.answerable ? <Tag tone={d.answered ? "green" : "amber"}>{d.answered ? $t('dataGithub.answered') : $t('dataGithub.notAnsweredYet')}</Tag> : "—")),
          ]} />
      )}
      {open ? <SnapshotDrawer view={view} kind={open.kind} itemKey={open.key} short={short} onClose={() => setOpen(null)} /> : null}
    </Card>
  );
}

// One tab's rows: sortable columns, pages of 25, and, where the rows can go to the Agent, ticks. Also 下载量's tables.
export function Grid<T>({ id, rows, columns, rowId, sort, query, onClear, empty, projectId, handOff, onOpen }: {
  id: string; rows: T[]; columns: ColumnDef<T>[]; rowId: (r: T) => string; sort: string; query: string; onClear: () => void; empty: string; projectId?: number;
  handOff?: (ticked: T[]) => Omit<HandOffSource, "count" | "clear">; onOpen?: (r: T) => void;
}) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const anchorRef = useSelectionAnchor();
  const withTicks = Boolean(handOff && projectId);
  const all = useMemo(() => (withTicks ? [makeSelectionColumn<T>(anchorRef), ...columns] : columns), [withTicks, anchorRef, columns]);
  const table = useDataTable({ data: rows, columns: all, withSorting: true, withPagination: true, enableRowSelection: withTicks, state: { pagination, rowSelection }, onPaginationChange: setPagination, onRowSelectionChange: setRowSelection, getRowId: rowId, initialState: { sorting: [{ id: sort, desc: true }] } });
  const ticked = table.getSelectedRowModel().rows.map((r) => r.original);
  useHandOffSource(id, withTicks && handOff ? { count: ticked.length, ...handOff(ticked), clear: () => setRowSelection({}) } : null);
  return (
    <DataTable table={table} isFiltered={Boolean(query)} onClearFilters={onClear} empty={{ title: empty }}
      onRowClick={onOpen ? (row, e) => { if (!(e.target as HTMLElement).closest("button,a,[role=checkbox]")) onOpen(row.original); } : undefined}
      footer={rows.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null} />
  );
}

// A referring site or page: its figures in the latest snapshot and its 14-day total on every saved snapshot of the period.
function SnapshotDrawer({ view, kind, itemKey, short, onClose }: { view: View; kind: "referrers" | "paths"; itemKey: string; short: (p: string) => string; onClose: () => void }) {
  const snap = view.tables![kind]!, item = (snap.items as (Ref | Pop)[]).find((x) => x.key === itemKey);
  if (!item) return null;
  const name = "referrer" in item ? item.referrer : short(item.path), series = snap.series[itemKey] ?? [];
  const points = snap.dates.map((d, i) => ({ date: d, value: series[i] ?? null }));
  const page = "path" in item ? `https://github.com${item.path}` : null;
  const rows: [string, string][] = [[$t('common.views'), num(item.count)], [$t('dataGithub.uniqueVisitors'), num(item.uniques)], [$t('dataGithub.shareOfTopTen'), pct(item.share)], [$t('dataGithub.weekBeforeValue', { 0: snap.comparedWith ?? "—" }), item.previous === null ? "—" : num(item.previous)]];
  return (
    <DetailDrawer open onClose={onClose} title={`${kind === "referrers" ? $t('dataGithub.referringSites') : $t('dataGithub.popularPages')} · ${name}`} description={$t('dataGithub.fourteenDaysTo', { 0: formatDate(snap.date) })}>
      {page && safeLink(page) ? <a className="nr-link mb-3 inline-flex items-center gap-1 break-all" href={safeLink(page)!} target="_blank" rel="noreferrer">{"title" in item && item.title ? item.title : page}<ArrowUpRight className="size-3.5" /></a> : null}
      {"kind" in item ? <p className="mb-3"><Tag tone={KIND[item.kind].tone}>{KIND[item.kind].label()}</Tag></p> : null}
      <table className="w-full text-sm" data-snapshot-figures="">
        <tbody>{rows.map(([k, v]) => <tr key={k} className="border-t border-border first:border-0"><td className="py-1.5">{k}</td><td className="py-1.5 text-right tabular-nums">{v}</td></tr>)}</tbody>
      </table>
      <h3 className="mt-5 mb-1 text-sm font-semibold">{$t('dataGithub.onEverySnapshot')}</h3>
      {points.filter((x) => x.value !== null).length < 2 ? <p className="text-sm text-muted-foreground">{$t('dataGithub.tooFewSnapshots')}</p> : (
        <div className="nr-chart-box" data-snapshot-line="">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={points} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={28} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={48} />
              <Tooltip formatter={(v) => num(Number(v))} labelFormatter={(d) => $t('dataGithub.fourteenDaysTo', { 0: String(d) })} />
              <Line isAnimationActive={false} type="linear" dataKey="value" name={$t('common.views')} stroke="var(--chart-3)" strokeWidth={2} dot={points.length < 20} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{$t('dataGithub.snapshotInfoShort')}</p>
    </DetailDrawer>
  );
}
