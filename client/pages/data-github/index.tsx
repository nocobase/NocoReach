import { $t } from "#i18n";
// GitHub (网站与产品), rebuilt 2026-10-14 after the first NocoReach's GitHub page (user request): the figures GitHub keeps
// with dates (stars, forks, contributors, commits, issues, pull requests, releases) in one chart for any range up to
// 全部时间; views and clones, which GitHub gives for 14 days only and NocoReach saves daily, in a chart of their own;
// referring sites and popular content over their daily snapshots; what the repository is made of and how its community
// works; and the most discussed Discussions and Issues, which, like referring sites and popular content, can go to the
// Agent. A second tab, GitHub 热点 (?view=hot, hot.tsx), shows what developers across GitHub look at.
import { useNavigate, useSearchParams } from "react-router";
import { ArrowUpRight, Github } from "lucide-react";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { StatTile } from "#components/seo/stat-tile";
import { Tabs, TabsList, TabsTrigger } from "#components/ui/tabs";
import { NotesTip } from "#components/reach/info-tip";
import { AllCheck, RowCheck, useTickedList, type Selection } from "#components/reach/hand-off-slot";
import { useProject } from "../reach-data";
import { useFreshData } from "../workspace-cache";
import { RangePicker, useRange } from "../range-picker";
import { safeLink } from "../analytics";
import { HandOffBar } from "../hand-off-bar";
import { discussionsDraft } from "../seo-hand-off";
import { TrendCard } from "./trends";
import { PathsCard, ReferrersCard } from "./snapshots";
import { CompositionCard, EfficiencyCard } from "./composition";
import { HotTab } from "./hot";
import { change, COMMUNITY, num, pct, TRAFFIC, type Discussion, type View } from "./model";
import "../data-views.css";

const RANGES = ["7", "28", "90", "12m", "all", "custom"];
const Row = ({ title, url, meta, selection }: { title: string; url: string; meta: string; selection: Selection }) => (
  <div className="flex items-start gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
    <span className="pt-0.5"><RowCheck selection={selection} k={url} label={title} /></span>
    <a className="nr-link min-w-0 flex-1" href={safeLink(url)} target="_blank" rel="noreferrer">{title}</a>
    <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
  </div>
);
const Section = ({ title, check, note, children, ...rest }: { title: string; check?: React.ReactNode; note?: string; children: React.ReactNode; [k: `data-${string}`]: unknown }) => (
  <Card className="gap-0 py-0" {...rest}>
    <div className="flex items-center gap-3 border-b border-border px-4 py-2">{check}<h2 className="text-sm font-semibold">{title}</h2></div>
    {note ? <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">{note}</p> : null}
    {children}
  </Card>
);
const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;

// The eight figures at the top, each with the change against the period before where both are known.
function Tiles({ view }: { view: View }) {
  const f = view.figures!, p = view.previous ?? null, t = view.totals!;
  const delta = (now: number | null | undefined, before: number | null | undefined) => { const c = change(now, before); return c === null ? null : { change: c, better: c >= 0 }; };
  const rate = (x: typeof f | null) => (x && x.prsClosed ? (x.prsMerged ?? 0) / x.prsClosed : null);
  const tiles = [
    { key: "stars", label: $t('dataGithub.totalStars'), value: num(t.stars), hint: f.starsAdded != null ? $t('dataGithub.addedInPeriod', { 0: `${f.starsAdded >= 0 ? "+" : ""}${num(f.starsAdded)}` }) : undefined, delta: delta(f.starsAdded, p?.starsAdded) },
    { key: "forks", label: $t('dataGithub.newForks'), value: num(f.forksAdded), hint: $t('dataGithub.totalValue', { 0: num(t.forks) }), delta: delta(f.forksAdded, p?.forksAdded) },
    { key: "views", label: $t('common.views'), value: num(f.views), hint: f.trafficDays ? $t('dataGithub.dailyUniqueVisitors', { 0: num((f.uniques ?? 0) / f.trafficDays) }) : undefined, delta: delta(f.views, p?.views) },
    { key: "clones", label: $t('dataGithub.clones'), value: num(f.clones), hint: f.cloneDays ? $t('dataGithub.dailyUniqueCloners', { 0: num((f.cloners ?? 0) / f.cloneDays) }) : undefined, delta: delta(f.clones, p?.clones) },
    { key: "contributors", label: $t('dataGithub.firstTimeContributors'), value: num(f.newContributors), hint: $t('dataGithub.totalValue', { 0: num(t.contributors) }), delta: delta(f.newContributors, p?.newContributors) },
    { key: "merge", label: $t('dataGithub.prMergeRate'), value: pct(rate(f)), hint: f.prsClosed != null ? $t('dataGithub.mergedOfClosed', { 0: num(f.prsMerged), 1: num(f.prsClosed) }) : undefined, delta: delta(rate(f), rate(p)) },
    { key: "ai", label: $t('dataGithub.aiReferrals'), value: num(t.aiReferrals), hint: t.aiReferralsDate ? $t('dataGithub.latestSnapshotOn', { 0: t.aiReferralsDate }) : undefined, delta: null },
    { key: "downloads", label: $t('dataGithub.releaseDownloads'), value: num(t.releaseDownloads), hint: t.releases ? $t('dataGithub.releasesTotal', { 0: num(t.releases) }) : undefined, delta: null },
  ];
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles.map((x) => <Card key={x.key} className="gap-0 p-4" data-metric={x.key}><StatTile label={x.label} value={x.value} delta={x.delta} hint={x.hint} /></Card>)}</div>;
}

export default function DataGitHub() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [params, setParams] = useSearchParams();
  const tab = params.get("view") === "hot" ? "hot" : "repo";
  const choose = (v: string) => { const p = new URLSearchParams(params); if (v === "hot") p.set("view", "hot"); else p.delete("view"); setParams(p, { replace: true }); };
  const custom = range.range === "custom" && (!range.from || !range.to);
  const r = RANGES.includes(range.range) ? range : { range: "28" };
  const { data: view, error } = useFreshData(project && !custom && tab === "repo" ? `data-view:github:${project.id}:${JSON.stringify(r)}` : null, () => api.action<View>("nrDataViews", "github", { method: "POST", body: { projectId: project!.id, ...r }, unwrap: "data" }));
  const w = view?.window, d = view?.discussions, h = view?.history;
  const discussionMeta = (x: Discussion) => $t('dataGithub.comments', { 0: x.comments, 1: x.answerable ? (x.answered ? $t('dataGithub.answered') : $t('dataGithub.notAnsweredYet')) : x.category });
  const issueMeta = (i: NonNullable<View["issues"]>["top"][number]) => $t('dataGithub.comments', { 0: i.comments, 1: i.state === "open" ? $t('dataGithub.open') : $t('common.closed') });
  const discussions = useTickedList("github-discussions", view?.connected && d?.enabled !== false ? d?.top : undefined, (x) => x.url, (ticked) => ({ playbookId: "community-summary", description: $t('dataGithub.mostDiscussedDiscussionsBecomeOne'), draft: () => discussionsDraft(`GitHub Discussions（${view!.repo}）`, $t('dataGithub.discussions'), ticked.map((x) => ({ title: x.title, url: x.url, meta: discussionMeta(x) }))) }));
  const issues = useTickedList("github-issues", view?.connected ? view.issues?.top : undefined, (i) => i.url, (ticked) => ({ playbookId: "community-summary", description: $t('dataGithub.mostDiscussedIssuesBecomeOne'), draft: () => discussionsDraft(`GitHub Issues（${view!.repo}）`, "issue", ticked.map((i) => ({ title: i.title, url: i.url, meta: issueMeta(i) }))) }));
  // Why a chart is empty: no token, the history still being read, or the range before the first saved day.
  const historyEmpty = !h?.token ? $t('dataGithub.historyNeedsToken') : h.activity !== "complete" ? $t('dataGithub.historyReading') : $t('dataGithub.noRecordsInRange');
  const trafficEmpty = !h?.token ? $t('dataGithub.shownOnceTrafficConnected') : h.savedSince ? $t('dataGithub.savedSinceOnly', { 0: h.savedSince }) : $t('dataGithub.savedFromNextRead');
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={tab === "repo" ? <NotesTip notes={view?.notes} /> : undefined} title="GitHub" description={tab === "hot" ? $t('githubHot.description') : view?.repo ? view.description || view.repo : $t('dataGithub.pageDescription')}
        actions={tab === "repo" && view?.url && safeLink(view.url) ? <Button variant="outline" size="sm" render={<a href={safeLink(view.url)!} target="_blank" rel="noreferrer" />} nativeButton={false}>{view.repo}<ArrowUpRight data-icon="inline-end" /></Button> : undefined} />
      <Tabs value={tab} onValueChange={(v) => choose(String(v))}>
        <TabsList variant="line" className="h-auto! justify-start">
          <TabsTrigger value="repo">{$t('githubHot.ourRepository')}</TabsTrigger>
          <TabsTrigger value="hot">{$t('githubHot.tab')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "hot" ? (project ? <HotTab projectId={project.id} /> : null) : <>
      <RangePicker value={r} onChange={setRange} options={RANGES} summary={w ? (w.all ? $t('dataGithub.allTimeSummary', { 0: w.start, 1: w.end }) : $t('common.comparedPreviousDays', { 0: w.start, 1: w.end, 2: w.days })) : undefined} />
      {error ? <LoadError title={$t('dataGithub.notLoadGithubData')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} /> : null}
      {!view && !error ? <ListSkeleton rows={5} /> : null}
      {view && !view.connected ? <EmptyState icon={<Github />} title={$t('dataGithub.onceGithubRepositoryConnectedStars')} description={$t('dataGithub.publicRepositoriesNeedNoCredentials')} action={<Button onClick={() => navigate("/connections?source=github")}>{$t('dataGithub.connectGithub')}</Button>} /> : null}
      {view?.connected ? (
        <>
          <Tiles view={view} />
          <TrendCard title={$t('dataGithub.communityGrowth')} info={w?.all ? $t('dataGithub.communityInfoAll') : $t('dataGithub.communityInfo')} param="communityView" groups={COMMUNITY} rows={view.community!} previous={view.previousCommunity!} compare={!w?.all} empty={historyEmpty} />
          <TrendCard title={$t('dataGithub.repositoryTraffic')} info={$t('dataGithub.trafficInfo')} param="trafficView" groups={TRAFFIC} rows={view.traffic!} previous={view.previousTraffic!} compare={!w?.all} empty={trafficEmpty} />
          <div className="grid gap-4 xl:grid-cols-2">
            <ReferrersCard snap={view.referrers} repo={view.repo!} empty={trafficEmpty} />
            <PathsCard snap={view.paths} repo={view.repo!} empty={trafficEmpty} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <CompositionCard view={view} />
            <EfficiencyCard view={view} />
          </div>
          <Section data-discussions title="Discussions"
            check={d?.top?.length && d.enabled !== false ? <AllCheck selection={discussions} count={d.top.length} /> : undefined}
            note={d && d.enabled !== false ? $t('dataGithub.discussionsLast90DaysAnswered', { 0: d.total, 1: d.answered, 2: Object.keys(d.categories || {}).length ? $t('dataGithub.category', { 0: Object.entries(d.categories!).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join("、") }) : "" }) : undefined}>
            {!d ? <Empty>{$t('dataGithub.readTrafficTokenDiscussionsLast')}</Empty> : d.enabled === false ? <Empty>{$t('dataGithub.discussionsNotEnabledRepository')}</Empty> : d.top!.map((x) => <Row key={x.url} title={x.title} url={x.url} meta={discussionMeta(x)} selection={discussions} />)}
          </Section>
          <Section title="Issues"
            check={view.issues?.top?.length ? <AllCheck selection={issues} count={view.issues.top.length} /> : undefined}
            note={view.issues ? $t('dataGithub.issuesLast90DaysSorted', { 0: view.issues.total }) : undefined}>
            {view.issues ? view.issues.top.map((i) => <Row key={i.url} title={i.title} url={i.url} meta={issueMeta(i)} selection={issues} />) : <Empty>{$t('dataGithub.shownAfterNextSync')}</Empty>}
          </Section>
        </>
      ) : null}
      </>}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
