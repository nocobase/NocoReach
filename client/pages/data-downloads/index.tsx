import { $t } from "#i18n";
// 下载量 (网站与产品), rebuilt 2026-10-14 in the shape of 访问 and GitHub (user request: take the first NocoReach's 产品采用
// page, which had far more to see): a figure per package and one for the GitHub release files, a figure picking the
// daily line below it (or 增长指数, every figure from 100 on its first day, to compare how they move); 版本与发布,
// 版本分布 (npm, the last 7 days by version) and 运行环境 (the images' platforms, the Python versions and systems); and
// the tables of packages, versions, image tags and release files (tables.tsx). Downloads, pulls and release-file
// downloads are counted differently, so they are never added together.
import { useState } from "react";
import { useNavigate } from "react-router";
import { Package } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { cn } from "#lib/utils";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, InlineError, ListSkeleton, LoadError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { StatTile } from "#components/seo/stat-tile";
import { InfoTip, NotesTip } from "#components/reach/info-tip";
import { Tag } from "#components/reach/tag";
import { useProject } from "../reach-data";
import { useFreshData } from "../workspace-cache";
import { RangePicker } from '../range-picker';
import { validRange, useRange } from '../range-state';
import { HandOffBar } from "../hand-off-bar";
import { Segmented } from "../data-github/segmented";
import { ReportCard } from "./tables";
import { ago, bytes, change, CHANNEL, dateOf, kindLabel, num, otherName, pct, REGISTRY, type Item, type Row, type Share, type View } from "./model";
import "../data-views.css";
import { formatDate } from '#lib/format';

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#7F77DD", "#D4537E", "#1D9E75", "#BA7517", "#888780", "#378ADD"];
const COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" };

export default function DataDownloads() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [picked, setPicked] = useState<string | null>(null);
  const custom = !validRange(range);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:downloads:${project.id}:${JSON.stringify(range)}` : null, () => api.action<View>("nrDataViews", "downloads", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const w = view?.window, items = view?.items ?? [];
  const chosen = items.find((x) => x.id === picked) ?? items[0];
  const cards = view?.connected ? [<ReleasesCard key="releases" view={view} />, ...(view.versions?.length ? [<VersionsCard key="versions" view={view} />] : []), ...(view.environment?.platforms.length || view.environment?.python.length ? [<EnvironmentCard key="environment" view={view} />] : [])] : [];
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={view?.notes?.length ? <NotesTip notes={view.notes} /> : undefined} title={$t('common.downloads')} description={$t('dataDownloads.pageDescription')} />
      <RangePicker value={range} onChange={setRange} summary={w ? ('all' in w && w.all ? $t('rangePicker.availableRange',{0:formatDate(w.start),1:formatDate(w.end)}) : $t('dataDownloads.comparedPreviousDays', { 0: formatDate(w.start), 1: formatDate(w.end), 2: w.days, 3: view?.cutoff ? $t('dataDownloads.downloadsThrough', { 0: formatDate(view.cutoff) }) : "" })) : undefined} />
      {error ? <LoadError title={$t('dataDownloads.notLoadDownloads')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} /> : null}
      {!view && !error ? <ListSkeleton rows={6} /> : null}
      {view && !view.connected ? <EmptyState icon={<Package />} title={$t('dataDownloads.oncePackagesConnectedDailyDownloads')} description={$t('dataDownloads.enterNpmPypiPackageNames')} action={<Button onClick={() => navigate("/connections?source=packages")}>{$t('dataDownloads.connectPackages')}</Button>} /> : null}
      {view?.connected && chosen ? (
        <>
          {view.sync && !view.sync.ok && view.sync.errors.length ? <InlineError>{$t('dataDownloads.lastReadFailed', { 0: view.sync.errors.slice(0, 3).join("；") })}</InlineError> : null}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label={$t('dataDownloads.figures')}>
            {items.map((it) => <Tile key={it.id} item={it} active={it.id === chosen.id} onPick={() => setPicked(it.id)} />)}
          </div>
          <TrendCard view={view} item={chosen} />
          {cards.length ? <div className={cn("grid gap-3", COLS[cards.length])}>{cards}</div> : null}
          {view.coverage?.length ? <CoverageCard view={view} /> : null}
          <ReportCard view={view} projectId={project?.id} />
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

// One package (or the release files): the period's count with its change; the whole tile picks the line (as on 访问).
function Tile({ item: it, active, onPick }: { item: Item; active: boolean; onPick: () => void }) {
  const label = `${it.kind === "assets" ? REGISTRY.github : it.title} · ${kindLabel(it)}`;
  const hint = it.kind === "downloads"
    ? [it.average != null ? $t('dataDownloads.dailyAverage', { 0: num(it.average) }) : null, it.latest ? `latest ${it.latest.version}` : null].filter(Boolean).join(" · ")
    : it.value == null && it.since ? $t('dataDownloads.recordedSince', { 0: dateOf(it.since) }) : $t('dataDownloads.totalValue', { 0: num(it.total) });
  const value = it.value == null ? "—" : `${it.kind === "downloads" ? "" : "+"}${num(it.value)}`;
  return (
    <div data-metric={it.id} className={cn("relative rounded-xl", active && "ring-2 ring-primary")}>
      <button type="button" aria-pressed={active} aria-label={label} onClick={onPick} className="absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
      <Card className="pointer-events-none relative h-full gap-0 p-4"><StatTile label={label} value={value} delta={it.change === null ? null : { change: it.change, better: it.change >= 0 }} hint={hint || undefined} /></Card>
    </div>
  );
}

// The chosen figure per day against the same day of the period before; or 增长指数, every figure from 100 on its first
// day with a count, to compare how they move whatever their size.
function TrendCard({ view, item }: { view: View; item: Item }) {
  const [mode, setMode] = useState("count");
  const daily = view.daily ?? [], items = view.items ?? [];
  const value = (r: Row | undefined, id: string) => (typeof r?.[id] === "number" ? (r[id] as number) : null);
  const points = mode === "count"
    ? daily.map((r, i) => ({ date: r.date, value: value(r, item.id), previous: view.previousDaily?.[i] ? value(view.previousDaily[i], item.id) : null }))
    : (() => { const base = Object.fromEntries(items.map((it) => [it.id, daily.map((r) => value(r, it.id)).find((x) => x) ?? null])); return daily.map((r) => ({ date: r.date, ...Object.fromEntries(items.map((it) => { const v = value(r, it.id), b = base[it.id]; return [it.id, v != null && b ? Math.round((v / b) * 1000) / 10 : null]; })) })); })();
  const has = mode === "count" ? daily.filter((r) => value(r, item.id) != null).length >= 2 : items.some((it) => daily.filter((r) => value(r, it.id) != null).length >= 2);
  const title = mode === "count" ? $t('dataDownloads.perDay', { 0: `${item.kind === "assets" ? REGISTRY.github : item.title} · ${kindLabel(item)}` }) : $t('dataDownloads.growthIndex');
  return (
    <Card className="gap-0 py-0" data-trend={mode === "count" ? item.id : "index"}>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{title}</h2><InfoTip label={$t('common.howReadChart')}>{mode === "count" ? $t('dataDownloads.trendInfo') : $t('dataDownloads.growthIndexInfo')}</InfoTip></div>
        {items.length > 1 ? <div className="ml-auto"><Segmented label={$t('dataDownloads.chartMode')} options={[{ id: "count", label: $t('dataDownloads.countMode') }, { id: "index", label: $t('dataDownloads.growthIndex') }]} value={mode} onChange={setMode} /></div> : null}
      </div>
      {has ? (
        <div className="nr-chart-box px-4 py-3">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={points} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={56} tickFormatter={(v: number) => num(v)} />
              <Tooltip formatter={(v) => num(Number(v), mode === "count" ? 0 : 1)} labelFormatter={(d) => dateOf(String(d))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {mode === "count" ? <>
                <Area isAnimationActive={false} type="linear" dataKey="value" name={kindLabel(item)} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.1} connectNulls={false} />
                <Line isAnimationActive={false} type="linear" dataKey="previous" name={$t('dataDownloads.previousPeriod')} stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
              </> : items.map((it, i) => <Line key={it.id} isAnimationActive={false} type="linear" dataKey={it.id} name={`${it.kind === "assets" ? REGISTRY.github : it.title} · ${kindLabel(it)}`} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls={false} />)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="px-4 py-6 text-sm text-muted-foreground">{item.since ? $t('dataDownloads.noDaysInRange', { 0: dateOf(item.since) }) : $t('dataDownloads.shownAfterNextSync')}</p>}
    </Card>
  );
}

const Head = ({ title, info, children }: { title: string; info: string; children?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-1"><h2 className="text-sm font-semibold">{title}</h2><InfoTip label={$t('common.aboutData')}>{info}</InfoTip>{children ? <div className="ml-auto">{children}</div> : null}</div>
);
const Bars = ({ rows }: { rows: Share[] }) => (
  <ul className="flex flex-col gap-1.5">
    {rows.map((r) => (
      <li key={r.name} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-sm" data-bar={r.name}>
        <span className="truncate" title={otherName(r.name)}>{otherName(r.name)}</span>
        <span className="h-2 overflow-hidden rounded-sm bg-muted"><span className="block h-full rounded-sm bg-primary/70" style={{ width: `${Math.max((r.share ?? 0) * 100, r.share ? 1 : 0)}%` }} /></span>
        <span className="text-right tabular-nums text-muted-foreground" title={num(r.count)}>{pct(r.share)}</span>
      </li>
    ))}
  </ul>
);
// A card switching between packages or images when there are several.
function usePick<T extends { id: string }>(list: T[]) {
  const [id, setId] = useState<string | null>(null);
  return [list.find((x) => x.id === id) ?? list[0], setId] as const;
}

// Each dist-tag's version and how long ago it came out, and how much was released in the period.
function ReleasesCard({ view }: { view: View }) {
  const r = view.releases, end = view.window?.end, several = new Set(r?.tags.map((t) => t.id)).size > 1;
  const latest = (view.items ?? []).filter((it) => it.latest && (it.kind !== "downloads" || !r?.tags.some((t) => t.id === it.id)));
  const counts = ([["npm", "dataDownloads.publishedNpm"], ["pypi", "dataDownloads.publishedPypi"], ["docker", "dataDownloads.publishedDocker"], ["github", "dataDownloads.publishedGithub"]] as const).filter(([k]) => r?.published[k] != null).map(([k, key]) => $t(key, { 0: num(r!.published[k]) }));
  return (
    <Card className="gap-3 px-4" data-releases="">
      <Head title={$t('dataDownloads.releases')} info={$t('dataDownloads.releasesInfo')} />
      {r?.tags.length || latest.length ? (
        <ul className="flex flex-col text-sm">
          {r?.tags.slice(0, 8).map((t) => (
            <li key={`${t.id}:${t.tag}`} className="flex items-baseline gap-2 border-b border-border py-1.5 last:border-0" data-dist-tag={t.tag}>
              <Tag tone={t.tag === "latest" ? "blue" : "grey"}>{t.tag}</Tag>
              <span className="min-w-0 flex-1 truncate tabular-nums">{t.version}{several ? <span className="ml-1.5 text-xs text-muted-foreground">{t.package}</span> : null}</span>
              <span className="shrink-0 text-xs text-muted-foreground" title={dateOf(t.published)}>{ago(t.published, end)}</span>
            </li>
          ))}
          {latest.map((it) => (
            <li key={it.id} className="flex items-baseline gap-2 border-b border-border py-1.5 last:border-0">
              <Tag tone="slate">{it.kind === "pulls" ? "Docker" : it.kind === "assets" ? "Release" : REGISTRY[it.registry]}</Tag>
              <span className="min-w-0 flex-1 truncate tabular-nums">{it.latest!.version}<span className="ml-1.5 text-xs text-muted-foreground">{it.title}</span></span>
              <span className="shrink-0 text-xs text-muted-foreground" title={dateOf(it.latest!.published)}>{ago(it.latest!.published, end)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{$t('dataDownloads.shownAfterNextSync')}</p>}
      {counts.length ? <p className="border-t border-border pt-2 text-xs text-muted-foreground">{$t('dataDownloads.publishedInPeriod', { 0: counts.join(" · ") })}</p> : null}
    </Card>
  );
}

// Last week's npm downloads by version line (2.2, 2.3 beta); npm gives these for the last 7 days only.
function VersionsCard({ view }: { view: View }) {
  const list = view.versions!, [v, pick] = usePick(list);
  return (
    <Card className="gap-3 px-4" data-versions="">
      <Head title={$t('dataDownloads.versionShare')} info={$t('dataDownloads.versionShareInfo')}>
        {list.length > 1 ? <Segmented label={$t('dataDownloads.versionShare')} options={list.map((x) => ({ id: x.id, label: x.package }))} value={v.id} onChange={pick} /> : null}
      </Head>
      <Bars rows={v.rows} />
      <p className="border-t border-border pt-2 text-xs text-muted-foreground">{$t('dataDownloads.versionShareFoot', { 0: v.package, 1: dateOf(v.at), 2: num(v.total) })}</p>
    </Card>
  );
}

// Which platforms the images are built for (the share of tags with each), and PyPI's Python versions and systems.
function EnvironmentCard({ view }: { view: View }) {
  const e = view.environment!, [img, pickImg] = usePick(e.platforms), [py, pickPy] = usePick(e.python);
  return (
    <Card className="gap-3 px-4" data-environment="">
      <Head title={$t('dataDownloads.environment')} info={$t('dataDownloads.environmentInfo')} />
      {img ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex-1">{$t('dataDownloads.imagePlatforms', { 0: img.image, 1: num(img.tags) })}</span>{e.platforms.length > 1 ? <Segmented label={$t('dataDownloads.environment')} options={e.platforms.map((x) => ({ id: x.id, label: x.image }))} value={img.id} onChange={pickImg} /> : null}</div>
          {img.rows.length ? <Bars rows={img.rows} /> : null}
          <p className="text-xs text-muted-foreground">{[img.latest ? $t('dataDownloads.imageSize', { 0: img.latest.tag, 1: bytes(img.latest.size) }) : null, img.pulled ? $t('dataDownloads.lastPulled', { 0: dateOf(img.pulled) }) : null].filter(Boolean).join(" · ")}</p>
        </div>
      ) : null}
      {py ? (
        <div className={cn("flex flex-col gap-2", img && "border-t border-border pt-2")}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex-1">{$t('dataDownloads.pythonOf', { 0: py.package, 1: py.versions?.from ?? py.systems?.from ?? "—", 2: py.versions?.to ?? py.systems?.to ?? "—" })}</span>{e.python.length > 1 ? <Segmented label="PyPI" options={e.python.map((x) => ({ id: x.id, label: x.package }))} value={py.id} onChange={pickPy} /> : null}</div>
          {py.versions?.rows.length ? <Bars rows={py.versions.rows.slice(0, 5)} /> : null}
          {py.systems?.rows.length ? <Bars rows={py.systems.rows.slice(0, 4)} /> : null}
        </div>
      ) : null}
    </Card>
  );
}

// Docker 发布覆盖, as the first NocoReach had it: per release line of an image, its tags, its tag × platform builds (one
// tag built for two CPUs is two), the CPUs, the largest image of one platform and the latest push.
function CoverageCard({ view }: { view: View }) {
  const list = view.coverage!, [c, pick] = usePick(list), end = view.window?.end;
  return (
    <Card className="gap-0 py-0" data-coverage="">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Head title={$t('dataDownloads.coverage')} info={$t('dataDownloads.coverageInfo', { 0: num(c.read), 1: num(c.total) })} />
        {list.length > 1 ? <div className="ml-auto"><Segmented label={$t('dataDownloads.coverage')} options={list.map((x) => ({ id: x.id, label: x.image }))} value={c.id} onChange={pick} /></div> : null}
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pl-4 font-medium">{$t('dataDownloads.channel')}</th><th className="py-2 text-right font-medium">{$t('dataDownloads.tagsCount')}</th><th className="py-2 text-right font-medium">{$t('dataDownloads.builds')}</th><th className="py-2 pl-6 font-medium">CPU</th><th className="py-2 text-right font-medium">{$t('dataDownloads.largestImage')}</th><th className="py-2 pr-4 text-right font-medium">{$t('dataDownloads.lastPushed')}</th></tr></thead>
        <tbody>
          {c.rows.map((r) => (
            <tr key={r.channel} className="border-b border-border last:border-0" data-coverage-row={r.channel}>
              <td className="py-2 pl-4"><Tag tone={CHANNEL[r.channel].tone}>{CHANNEL[r.channel].label()}</Tag></td>
              <td className="py-2 text-right tabular-nums">{num(r.tags)}</td>
              <td className="py-2 text-right tabular-nums">{num(r.builds)}</td>
              <td className="py-2 pl-6 text-muted-foreground">{r.archs.length ? r.archs.map((a) => `${a.name} ${num(a.count)}`).join(" · ") : "—"}</td>
              <td className="py-2 text-right tabular-nums">{bytes(r.maxSize)}</td>
              <td className="py-2 pr-4 text-right whitespace-nowrap tabular-nums" title={r.pushed ?? undefined}>{dateOf(r.pushed)}<span className="ml-1.5 text-xs text-muted-foreground">{ago(r.pushed, end)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
