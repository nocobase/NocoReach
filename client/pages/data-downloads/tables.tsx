import { $t } from "#i18n";
// 下载量 · one table with tabs, as on 访问 and GitHub: 包 (each figure with the period before, its daily average, peak,
// running total and latest version; a row opens its days; ticked rows go to the Agent to find out why downloads moved),
// 版本 (npm and PyPI versions with their dist-tags and publish times, npm's last 7 days by version), Docker 标签 (the
// newest image tags with their platforms, sizes, push and last-pull times) and Release 安装包 (the GitHub release files).
// 版本 and Docker 标签 filter by release line.
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, Search } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { TabsTrigger } from "#components/ui/tabs";
import { DataTableTabs, DataTableToolbar } from "#components/seo/data-table-toolbar";
import { SortableHeader } from "#components/seo/sortable-header";
import { Tag } from "#components/reach/tag";
import { cn } from "#lib/utils";
import { safeLink } from "../analytics";
import { DetailDrawer } from "../detail-drawer";
import { packagesDraft } from "../seo-hand-off";
import { Grid } from "../data-github/tables";
import { Segmented } from "#components/reach/segmented";
import { distTagLabel } from "./dist-tag";
import { ago, bytes, change, CHANNEL, dateOf, kindLabel, num, pct, REGISTRY, type AssetRow, type Channel, type Item, type TagRow, type VersionRow, type View } from "./model";
import { formatChange, formatDate } from '#lib/format';
import { Delta } from '#components/reach/delta';

type TabId = "packages" | "versions" | "tags" | "assets";
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const sortable = { sortDescFirst: true, sortUndefined: "last" } as const;
const Ext = ({ href, children }: { href: string | null | undefined; children: ReactNode }) => (href && safeLink(href) ? <a className="nr-link" href={safeLink(href)!} target="_blank" rel="noreferrer">{children}</a> : <>{children}</>);
const nameOf = (it: Item) => (it.kind === "assets" ? REGISTRY.github : it.title);
function count<T>(id: string, label: string, get: (r: T) => number | null | undefined, show: (v: number | null) => string = (v) => num(v)): ColumnDef<T> {
  return { id, accessorFn: (r) => get(r) ?? undefined, ...sortable, header: ({ column }) => <SortableHeader column={column} label={label} align="right" help={false} />, cell: ({ row }) => show(get(row.original) ?? null), meta: right };
}
function when<T>(id: string, label: string, get: (r: T) => string | null | undefined, end?: string): ColumnDef<T> {
  return { id, accessorFn: (r) => get(r) || undefined, ...sortable, header: ({ column }) => <SortableHeader column={column} label={label} help={false} />, cell: ({ row }) => { const t = get(row.original); return <span className="whitespace-nowrap tabular-nums" title={t ?? undefined}>{dateOf(t)}{t && end ? <span className="ml-1.5 text-xs text-muted-foreground">{ago(t, end)}</span> : null}</span>; } };
}
const text = <T,>(id: string, label: string, get: (r: T) => string, cell?: (r: T) => ReactNode): ColumnDef<T> => ({ id, accessorFn: (r) => get(r).toLowerCase(), header: ({ column }) => <SortableHeader column={column} label={label} help={false} />, cell: ({ row }) => (cell ? cell(row.original) : get(row.original)) });
const channelCol = <T extends { channel: Channel }>(): ColumnDef<T> => ({ id: "channel", accessorFn: (r) => r.channel, header: ({ column }) => <SortableHeader column={column} label={$t('dataDownloads.channel')} help={false} />, cell: ({ row }) => <Tag tone={CHANNEL[row.original.channel].tone}>{CHANNEL[row.original.channel].label()}</Tag> });

export function ReportCard({ view, projectId }: { view: View; projectId?: number }) {
  const [params, setParams] = useSearchParams();
  const t = view.tables!, items = view.items ?? [], w = view.window!;
  const tabs: { id: TabId; label: string }[] = [
    { id: "packages", label: $t('dataDownloads.packagesTab') },
    ...(t.versions.length ? [{ id: "versions" as const, label: $t('dataDownloads.versionsTab') }] : []),
    ...(t.tags.length ? [{ id: "tags" as const, label: $t('dataDownloads.tagsTab') }] : []),
    ...(t.assets.length ? [{ id: "assets" as const, label: $t('dataDownloads.assetsTab') }] : []),
  ];
  const tab = tabs.find((x) => x.id === params.get("tab"))?.id ?? "packages";
  const [query, setQuery] = useState("");
  const [line, setLine] = useState("all");
  const [open, setOpen] = useState<Item | null>(null);
  const choose = (id: string) => { const p = new URLSearchParams(params); if (id === "packages") p.delete("tab"); else p.set("tab", id); setParams(p, { replace: true }); setQuery(""); setLine("all"); };
  const q = query.trim().toLowerCase(), has = (...xs: (string | null | undefined)[]) => !q || xs.some((x) => x?.toLowerCase().includes(q));
  const lines = (rows: { channel: Channel }[]) => { const seen = new Set(rows.map((r) => r.channel)); return [{ id: "all", label: $t('dataDownloads.allLines') }, ...(Object.keys(CHANNEL) as Channel[]).filter((c) => seen.has(c)).map((c) => ({ id: c, label: CHANNEL[c].label() }))]; };
  const period = $t('common.range', { 0: formatDate(w.start), 1: formatDate(w.end) });
  const several = (ids: string[]) => new Set(ids).size > 1;
  const notes: Record<TabId, string> = {
    packages: $t('dataDownloads.packagesNote'),
    versions: $t('dataDownloads.versionsNote'),
    tags: $t('dataDownloads.tagsNote', { 0: num(t.tags.length) }),
    assets: $t('dataDownloads.assetsNote'),
  };
  const common = { projectId, query: q, onClear: () => setQuery("") };
  const label = tabs.find((x) => x.id === tab)!.label;
  return (
    <Card className="gap-0 py-0" data-report="">
      <DataTableTabs value={tab} onValueChange={choose} description={notes[tab]}>
        {tabs.map((x) => <TabsTrigger key={x.id} value={x.id}>{x.label}</TabsTrigger>)}
      </DataTableTabs>
      <DataTableToolbar>
        {tab === "versions" || tab === "tags" ? <Segmented label={$t('dataDownloads.channel')} options={lines(tab === "versions" ? t.versions : t.tags)} value={line} onChange={setLine} /> : null}
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
          <Input aria-label={$t('dataDownloads.searchIn', { 0: label })} className="h-8 w-64 pl-8" placeholder={$t('dataDownloads.searchIn', { 0: label })} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </DataTableToolbar>
      {tab === "packages" ? (
        <Grid<Item> key={tab} id="packages" {...common} empty={$t('dataDownloads.noDataInRange')} rows={items.filter((it) => has(it.title, it.name, kindLabel(it)))} rowId={(it) => it.id} sort="value" onOpen={setOpen}
          handOff={(ticked) => ({ noun: $t('dataDownloads.packagesSelected'), playbookId: "change-research", description: $t('dataDownloads.tickedPackagesBecomeOneTask'), draft: () => packagesDraft(ticked.map((it) => ({ title: nameOf(it), registry: kindLabel(it), value: it.value, previous: it.previous, change: it.change })), period) })}
          columns={[
            text<Item>("name", $t('dataDownloads.package'), nameOf, (it) => <button type="button" className="flex min-w-0 flex-col text-left" onClick={() => setOpen(it)}><span className="truncate text-primary underline-offset-4 hover:underline">{nameOf(it)}</span>{it.name !== nameOf(it) ? <span className="truncate text-xs text-muted-foreground">{it.name}</span> : null}</button>),
            text<Item>("kind", $t('dataDownloads.source'), kindLabel, (it) => <span className="text-muted-foreground">{kindLabel(it)}</span>),
            count<Item>("value", $t('common.selectedPeriod'), (it) => it.value), count<Item>("previous", $t('dataDownloads.previousPeriod'), (it) => it.previous),
            { ...count<Item>("change", $t('common.change'), (it) => it.change), cell: ({ row }) => { const c = row.original.change; return c === null ? <span>—</span> : <Delta value={c} />; } },
            count<Item>("average", $t('dataDownloads.dailyAverageLabel'), (it) => it.average), count<Item>("peak", $t('dataDownloads.peak'), (it) => it.peak?.value),
            count<Item>("total", $t('dataDownloads.runningTotal'), (it) => it.total),
            { id: "latest", accessorFn: (it) => it.latest?.published || undefined, ...sortable, header: ({ column }) => <SortableHeader column={column} label={$t('dataDownloads.latestVersion')} help={false} />, cell: ({ row }) => { const l = row.original.latest; return l ? <span className="whitespace-nowrap tabular-nums">{l.version}<span className="ml-1.5 text-xs text-muted-foreground">{ago(l.published, w.end)}</span></span> : "—"; } },
          ]} />
      ) : tab === "versions" ? (
        <Grid<VersionRow> key={tab} id="package-versions" {...common} empty={$t('dataDownloads.noDataInRange')} rows={t.versions.filter((v) => (line === "all" || v.channel === line) && has(v.version, v.package, ...v.tags))} rowId={(v) => v.key} sort="published"
          columns={[
            ...(several(t.versions.map((v) => v.id)) ? [text<VersionRow>("package", $t('dataDownloads.package'), (v) => v.package, (v) => <span className="text-muted-foreground">{v.package}</span>)] : []),
            text<VersionRow>("version", $t('dataDownloads.version'), (v) => v.version, (v) => <span className="flex items-center gap-1.5 tabular-nums">{v.version}{v.tags.map((x) => <Tag key={x} tone={x === "latest" ? "blue" : "grey"}>{distTagLabel(x)}</Tag>)}{v.yanked ? <Tag tone="red">{$t('dataDownloads.yanked')}</Tag> : null}</span>),
            channelCol<VersionRow>(), when<VersionRow>("published", $t('dataDownloads.published'), (v) => v.published, w.end),
            ...(t.versions.some((v) => v.registry === "npm") ? [count<VersionRow>("lastWeek", $t('dataDownloads.lastWeekDownloads'), (v) => v.lastWeek)] : []),
            ...(t.versions.some((v) => v.registry === "pypi") ? [count<VersionRow>("files", $t('dataDownloads.files'), (v) => v.files), count<VersionRow>("size", $t('dataDownloads.size'), (v) => v.size, bytes)] : []),
          ]} />
      ) : tab === "tags" ? (
        <Grid<TagRow> key={tab} id="docker-tags" {...common} empty={$t('dataDownloads.noDataInRange')} rows={t.tags.filter((x) => (line === "all" || x.channel === line) && has(x.tag, x.image, ...x.platforms))} rowId={(x) => x.key} sort="pushed"
          columns={[
            ...(several(t.tags.map((x) => x.id)) ? [text<TagRow>("image", $t('dataDownloads.image'), (x) => x.image, (x) => <span className="text-muted-foreground">{x.image}</span>)] : []),
            text<TagRow>("tag", $t('dataDownloads.tag'), (x) => x.tag, (x) => <span className="tabular-nums" title={x.digest ?? undefined}>{x.tag}</span>),
            channelCol<TagRow>(),
            { id: "platforms", header: () => $t('dataDownloads.platforms'), enableSorting: false, cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.platforms.join(" · ") || "—"}</span> },
            count<TagRow>("size", $t('dataDownloads.size'), (x) => x.size, bytes),
            when<TagRow>("pushed", $t('dataDownloads.pushed'), (x) => x.pushed, w.end), when<TagRow>("pulled", $t('dataDownloads.lastPulledCol'), (x) => x.pulled, w.end),
          ]} />
      ) : (
        <Grid<AssetRow> key={tab} id="release-assets" {...common} empty={$t('dataDownloads.noDataInRange')} rows={t.assets.filter((a) => has(a.name, a.release, a.tag))} rowId={(a) => a.key} sort="downloads"
          columns={[
            text<AssetRow>("release", $t('dataDownloads.release'), (a) => a.release, (a) => <span className="flex items-center gap-1.5 whitespace-nowrap"><Ext href={a.url}>{a.release}</Ext>{a.prerelease ? <Tag tone="grey">{$t('dataDownloads.prerelease')}</Tag> : null}</span>),
            text<AssetRow>("name", $t('dataDownloads.file'), (a) => a.name),
            count<AssetRow>("downloads", $t('common.downloads'), (a) => a.downloads), count<AssetRow>("size", $t('dataDownloads.size'), (a) => a.size, bytes),
            when<AssetRow>("published", $t('dataDownloads.published'), (a) => a.published, w.end),
          ]} />
      )}
      {open ? <ItemDrawer view={view} item={open} onClose={() => setOpen(null)} /> : null}
    </Card>
  );
}

// One package: its figures with the period before and its days as a line.
function ItemDrawer({ view, item: it, onClose }: { view: View; item: Item; onClose: () => void }) {
  const w = view.window!, value = (r: Record<string, unknown> | undefined) => (typeof r?.[it.id] === "number" ? (r[it.id] as number) : null);
  const points = (view.daily ?? []).map((r, i) => ({ date: r.date, value: value(r), previous: value(view.previousDaily?.[i]) }));
  const c = change(it.value, it.previous);
  const rows: [string, string, string?][] = [
    [$t('common.selectedPeriod'), num(it.value), it.previous != null ? `${$t('dataDownloads.previousPeriod')} ${num(it.previous)}${c != null ? ` · ${formatChange(c)}` : ""}` : undefined],
    [$t('dataDownloads.dailyAverageLabel'), num(it.average, 1)],
    [$t('dataDownloads.peak'), num(it.peak?.value), it.peak?.date],
    ...(it.total != null ? [[$t('dataDownloads.runningTotal'), num(it.total)] as [string, string]] : []),
    ...(it.latest ? [[$t('dataDownloads.latestVersion'), it.latest.version, ago(it.latest.published, w.end)] as [string, string, string]] : []),
  ];
  return (
    <DetailDrawer open onClose={onClose} title={`${nameOf(it)} · ${kindLabel(it)}`} description={$t('common.range', { 0: formatDate(w.start), 1: formatDate(w.end) })}>
      {safeLink(it.url) ? <a className="nr-link mb-3 inline-flex items-center gap-1 break-all" href={safeLink(it.url)!} target="_blank" rel="noreferrer">{it.url}<ArrowUpRight className="size-3.5" /></a> : null}
      <table className="w-full text-sm" data-item-figures="">
        <tbody>{rows.map(([k, v, sub]) => <tr key={k} className="border-t border-border first:border-0"><td className="py-1.5">{k}</td><td className="py-1.5 text-right tabular-nums">{v}{sub ? <span className="ml-2 text-xs text-muted-foreground">{sub}</span> : null}</td></tr>)}</tbody>
      </table>
      <h3 className="mt-5 mb-1 text-sm font-semibold">{$t('dataDownloads.perDay', { 0: kindLabel(it) })}</h3>
      {points.filter((x) => x.value !== null).length < 2 ? <p className="text-sm text-muted-foreground">{it.since ? $t('dataDownloads.noDaysInRange', { 0: dateOf(it.since) }) : $t('dataDownloads.shownAfterNextSync')}</p> : (
        <div className="nr-chart-box" data-item-line="">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={points} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={28} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={52} tickFormatter={(v: number) => num(v)} />
              <Tooltip formatter={(v) => num(Number(v))} labelFormatter={(d) => dateOf(String(d))} />
              <Area isAnimationActive={false} type="linear" dataKey="value" name={kindLabel(it)} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.1} connectNulls={false} />
              <Line isAnimationActive={false} type="linear" dataKey="previous" name={$t('dataDownloads.previousPeriod')} stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </DetailDrawer>
  );
}
