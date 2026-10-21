import { $t, $tj } from "#i18n";
// GitHub (网站与产品). 我们的仓库 rebuilt 2026-10-14 in the shape of 访问 (user request: NocoReach's own style, a page
// description instead of the repository's, more to see): eight figures with the period before, a figure picking the
// daily line under them; 社区健康, 访问来源 and 仓库构成; and one table with tabs (tables.tsx). Stars, forks, commits,
// contributors, issues and pull requests run back to the repository's first day once the history is read; views,
// clones, referring sites and popular content from the day NocoReach started saving them (GitHub keeps 14 days).
// A second tab, GitHub 热点 (?view=hot, hot.tsx), shows what developers across GitHub look at.
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowUpRight, Github } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { cn } from "#lib/utils";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { StatTile } from "#components/seo/stat-tile";
import { Tabs, TabsList, TabsTrigger } from "#components/ui/tabs";
import { InfoTip, NotesTip } from "#components/reach/info-tip";
import { Tag } from "#components/reach/tag";
import { useProject } from "../reach-data";
import { useFreshData } from "../workspace-cache";
import { RangePicker } from '../range-picker';
import { validRange, useRange, githubRanges } from '../range-state';
import { safeLink } from "../analytics";
import { HandOffBar } from "../hand-off-bar";
import { HotTab } from "./hot";
import { ReportCard, KIND } from "./tables";
import { change, dateOf, hours, METRICS, num, pct, ratio, waiting, type Figures, type Metric, type MetricKey, type View } from "./model";
import "../data-views.css";
import { formatDate } from '#lib/format';
import { Delta } from '#components/reach/delta';

const RANGES = githubRanges;

export default function DataGitHub() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [params, setParams] = useSearchParams();
  const [metric, setMetric] = useState<MetricKey>("stars");
  const tab = params.get("view") === "hot" ? "hot" : "repo";
  const choose = (v: string) => { const p = new URLSearchParams(params); if (v === "hot") p.set("view", "hot"); else p.delete("view"); setParams(p, { replace: true }); };
  const custom = !validRange(range);
  const r = RANGES.includes(range.range) ? range : { range: "28" };
  const { data: view, error } = useFreshData(project && !custom && tab === "repo" ? `data-view:github:${project.id}:${JSON.stringify(r)}` : null, () => api.action<View>("nrDataViews", "github", { method: "POST", body: { projectId: project!.id, ...r }, unwrap: "data" }));
  const w = view?.window, link = view?.url ? safeLink(view.url) : null;
  const repo = view?.repo ? (link ? <a className="nr-link inline-flex items-center gap-0.5" href={link} target="_blank" rel="noreferrer">{view.repo}<ArrowUpRight className="size-3" /></a> : view.repo) : null;
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={tab === "repo" && view?.notes?.length ? <NotesTip notes={view.notes} /> : undefined} title="GitHub" description={tab === "hot" ? $t('githubHot.description') : $t('dataGithub.pageDescription')} />
      <Tabs value={tab} onValueChange={(v) => choose(String(v))}>
        <TabsList variant="line" className="h-auto! justify-start">
          <TabsTrigger value="repo">{$t('githubHot.ourRepository')}</TabsTrigger>
          <TabsTrigger value="hot">{$t('githubHot.tab')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "hot" ? (project ? <HotTab projectId={project.id} /> : null) : <>
      <RangePicker value={r} onChange={setRange} options={RANGES} summary={w && repo ? (w.all ? $tj('dataGithub.repoRangeAll', { 0: repo, 1: formatDate(w.start), 2: formatDate(w.end) }) : $tj('dataGithub.repoRange', { 0: repo, 1: formatDate(w.start), 2: formatDate(w.end), 3: w.days })) : undefined} />
      {error ? <LoadError title={$t('dataGithub.notLoadGithubData')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} /> : null}
      {!view && !error ? <ListSkeleton rows={6} /> : null}
      {view && !view.connected ? <EmptyState icon={<Github />} title={$t('dataGithub.onceGithubRepositoryConnectedStars')} description={$t('dataGithub.publicRepositoriesNeedNoCredentials')} action={<Button onClick={() => navigate("/connections?source=github")}>{$t('dataGithub.connectGithub')}</Button>} /> : null}
      {view?.connected && view.figures ? (
        <>
          <Tiles view={view} metric={metric} onPick={setMetric} />
          <TrendCard view={view} metric={METRICS.find((m) => m.key === metric)!} />
          <div className="grid gap-3 lg:grid-cols-3">
            <HealthCard view={view} />
            <SourcesCard view={view} />
            <CompositionCard view={view} />
          </div>
          <ReportCard view={view} projectId={project?.id} />
        </>
      ) : null}
      </>}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

// Views and clones before NocoReach saved them: when saving began, or that it begins with the next read.
const trafficSince = (v: View) => (v.history?.savedSince ? $t('dataGithub.savedSinceShort', { 0: v.history.savedSince }) : $t('dataGithub.savedFromNextReadShort'));

// The eight figures, each with its change against the period before; the whole tile picks the line below (as on 访问).
function Tiles({ view, metric, onPick }: { view: View; metric: MetricKey; onPick: (k: MetricKey) => void }) {
  const f = view.figures!, p = view.previous ?? null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label={$t('dataGithub.metrics')}>
      {METRICS.map((m) => {
        const wait = waiting(m, view.history), value = m.value(f), c = wait ? null : change(value, p ? m.value(p) : null);
        const hint = wait ? wait.hint : value == null && m.source === "traffic" ? trafficSince(view) : m.hint(view);
        return (
          <div key={m.key} data-metric={m.key} data-waiting={wait ? "" : undefined} className={cn("relative rounded-xl", metric === m.key && "ring-2 ring-primary")}>
            <button type="button" aria-pressed={metric === m.key} aria-label={m.label()} onClick={() => onPick(m.key)} className="absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
            <Card className="pointer-events-none relative h-full gap-0 p-4">
              <StatTile label={m.label()} value={wait ? wait.label : num(value)} className={wait ? "[&>p:nth-child(2)]:text-lg [&>p:nth-child(2)]:text-muted-foreground" : undefined} delta={c === null ? null : { change: c, better: c >= 0 }} hint={hint} />
            </Card>
          </div>
        );
      })}
    </div>
  );
}

// Why the chosen line is empty.
function emptyText(view: View, m: Metric) {
  const h = view.history;
  if (m.source === "traffic") return h?.state === "token" ? $t('dataGithub.shownOnceTrafficConnected') : h?.savedSince ? $t('dataGithub.savedSinceOnly', { 0: h.savedSince }) : $t('dataGithub.savedFromNextRead');
  if (m.source === "history" && h?.state !== "complete") return h?.state === "token" ? $t('dataGithub.historyNeedsToken') : h?.state === "failed" ? $t('dataGithub.historyFailedDetail', { 0: h.error || "—" }) : $t('dataGithub.historyReading');
  return m.key === "stars" ? $t('dataGithub.noDailyStarRecordsSelected') : $t('dataGithub.noRecordsInRange');
}

// The chosen figure per day against the same day of the period before (not for 全部时间).
function TrendCard({ view, metric }: { view: View; metric: Metric }) {
  const w = view.window!, compare = !w.all;
  const points = view.daily!.map((d, i) => ({ date: d.date, value: d[metric.line] ?? null, previous: compare ? (view.previousDaily?.[i]?.[metric.line] ?? null) : null })) as { date: string; value: number | null; previous: number | null }[];
  const has = points.filter((x) => x.value != null).length >= 2;
  return (
    <Card className="gap-0 py-0" data-trend={metric.key}>
      <div className="flex items-center gap-1 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{$t('dataGithub.metricPerDay', { 0: metric.label() })}</h2>
        <InfoTip label={$t('common.howReadChart')}>{compare ? $t('dataGithub.trendInfo') : $t('dataGithub.trendInfoAll')}</InfoTip>
      </div>
      {has ? (
        <div className="nr-chart-box px-4 py-3">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={points} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => (w.all ? d.slice(0, 7) : d.slice(5))} minTickGap={32} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={52} tickFormatter={(v: number) => num(v)} />
              <Tooltip formatter={(v) => num(Number(v))} labelFormatter={(d) => dateOf(String(d))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area isAnimationActive={false} type="linear" dataKey="value" name={metric.label()} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.1} connectNulls={false} />
              {compare ? <Line isAnimationActive={false} type="linear" dataKey="previous" name={$t('dataGithub.previousPeriod')} stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} /> : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="px-4 py-6 text-sm text-muted-foreground">{emptyText(view, metric)}</p>}
    </Card>
  );
}

const Head = ({ title, info, children }: { title: string; info: string; children?: React.ReactNode }) => (
  <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{title}</h2><InfoTip label={$t('common.aboutData')}>{info}</InfoTip>{children}</div>
);
const Bars = ({ rows }: { rows: { key: string; name: React.ReactNode; share: number | null; accent?: boolean; value?: string }[] }) => (
  <ul className="flex flex-col gap-1.5">
    {rows.map((r) => (
      <li key={r.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-sm" data-bar={r.key}>
        <span className="truncate">{r.name}</span>
        <span className="h-2 overflow-hidden rounded-sm bg-muted"><span className={cn("block h-full rounded-sm", r.accent ? "bg-nr-ink-violet" : "bg-primary/70")} style={{ width: `${Math.max((r.share ?? 0) * 100, r.share ? 1 : 0)}%` }} /></span>
        <span className="text-right tabular-nums text-muted-foreground" title={r.value}>{pct(r.share)}</span>
      </li>
    ))}
  </ul>
);

// Ratios worth watching, each with the period before; open issues and pull requests and watchers now.
function HealthCard({ view }: { view: View }) {
  const f = view.figures!, p = view.previous ?? null, t = view.totals!, of = (x: Figures | null, k: (x: Figures) => number | null) => (x ? k(x) : null);
  const rows: { label: string; now: number | null; before: number | null; show: (v: number | null) => string; lower?: boolean }[] = [
    { label: $t('dataGithub.prMergeMedian'), now: f.prMergeHours, before: p?.prMergeHours ?? null, show: hours, lower: true },
    { label: $t('dataGithub.issueCloseMedian'), now: f.issueCloseHours, before: p?.issueCloseHours ?? null, show: hours, lower: true },
    { label: $t('dataGithub.externalPrShare'), now: ratio(f.externalPrsOpened, f.prsOpened), before: of(p, (x) => ratio(x.externalPrsOpened, x.prsOpened)), show: pct },
    { label: $t('dataGithub.externalPrMergeRate'), now: ratio(f.externalPrsMerged, f.externalPrsClosed), before: of(p, (x) => ratio(x.externalPrsMerged, x.externalPrsClosed)), show: pct },
    { label: $t('dataGithub.externalCommitShare'), now: ratio(f.externalCommits, f.commits), before: of(p, (x) => ratio(x.externalCommits, x.commits)), show: pct },
    { label: $t('dataGithub.viewsPerVisitor'), now: ratio(f.views, f.uniques), before: of(p, (x) => ratio(x.views, x.uniques)), show: (v) => num(v, 2) },
  ];
  const wait = waiting(METRICS.find((m) => m.source === "history")!, view.history);
  return (
    <Card className="gap-3 px-4" data-health="">
      <Head title={$t('dataGithub.health')} info={$t('dataGithub.healthInfo')} />
      {wait ? <p className="text-xs text-muted-foreground">{wait.label} · {wait.hint}</p> : null}
      <ul className="flex flex-col text-sm">
        {rows.map((r) => {
          const c = change(r.now, r.before);
          return (
            <li key={r.label} className="flex items-baseline gap-2 border-b border-border py-1.5 last:border-0">
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <span className="tabular-nums">{r.show(r.now)}</span>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground" title={r.before != null ? $t('dataGithub.previousValue', { 0: r.show(r.before) }) : undefined}>
                {c === null ? (r.before != null ? $t('dataGithub.previousValue', { 0: r.show(r.before) }) : "") : <Delta value={c} good={r.lower ? "down" : "up"} />}
              </span>
            </li>
          );
        })}
        <li className="flex items-baseline gap-2 border-b border-border py-1.5"><span className="flex-1">{$t('dataGithub.openIssuesPrs')}</span><span className="tabular-nums">{num(t.openIssues)} / {num(t.openPrs)}</span><span className="w-24 shrink-0" /></li>
        <li className="flex items-baseline gap-2 py-1.5"><span className="flex-1">{$t('dataGithub.watchers')}</span><span className="tabular-nums">{num(t.watchers)}</span><span className="w-24 shrink-0" /></li>
      </ul>
    </Card>
  );
}

// Referring sites of the latest snapshot in the period by kind: own sites, AI assistants, search, communities, content.
function SourcesCard({ view }: { view: View }) {
  const s = view.sources;
  return (
    <Card className="gap-3 px-4" data-sources="">
      <Head title={$t('dataGithub.sources')} info={$t('dataGithub.sourcesInfo', { 0: formatDate(s?.date) })} />
      {s && s.total ? (
        <>
          <Bars rows={s.kinds.map((k) => ({ key: k.kind, name: KIND[k.kind].label(), share: k.share, accent: k.kind === "ai", value: num(k.count) }))} />
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">
            {s.ai ? $t('dataGithub.aiReferralViews', { 0: num(s.ai) }) : $t('dataGithub.noAiReferrals')} · {$t('dataGithub.snapshotOf', { 0: formatDate(s.date) })}
          </p>
        </>
      ) : <p className="text-sm text-muted-foreground">{view.history?.state === "token" ? $t('dataGithub.shownOnceTrafficConnected') : trafficSince(view)}</p>}
    </Card>
  );
}

// Languages by size of code, topics, and releases with their downloads.
function CompositionCard({ view }: { view: View }) {
  const c = view.composition!, t = view.totals!;
  return (
    <Card className="gap-3 px-4" data-composition="">
      <Head title={$t('dataGithub.composition')} info={$t('dataGithub.compositionInfo')} />
      {c.languages.length ? <Bars rows={c.languages.slice(0, 6).map((l) => ({ key: l.name, name: l.name, share: l.share }))} /> : <p className="text-sm text-muted-foreground">{$t('dataGithub.shownAfterNextSync')}</p>}
      {c.topics.length ? <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">{c.topics.slice(0, 12).map((x) => <Tag key={x} tone="blue">{x}</Tag>)}</div> : null}
      <p className="border-t border-border pt-2 text-xs text-muted-foreground">
        {$t('dataGithub.repoFacts', { 0: num(t.contributors), 1: num(t.releases), 2: num(t.releaseDownloads) })}
      </p>
    </Card>
  );
}
