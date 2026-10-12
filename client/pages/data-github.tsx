import { getCurrentLocale, $t, $tj } from "#i18n";
// GitHub (网站与产品): the repository's stars, forks and views for the period against the one before, daily stars (release
// lines left out 2026-10-04: with alphas and betas there were too many to read), views and clones (Traffic), referring sites and popular pages, and the most discussed Issues and
// Discussions (both can go to the Agent). Same parts as the other data pages (2026-10-04).
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { Github } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker, useRange } from "./range-picker";
import { MetricTile, type Metric } from "./data-parts";
import { safeLink } from "./analytics";
import { HandOffBar } from "./hand-off-bar";
import { AllCheck, RowCheck, useTickedList, type Selection } from "#components/reach/hand-off-slot";
import { discussionsDraft, githubTrafficDraft } from "./seo-hand-off";
import "./data-views.css";
import { NotesTip, InfoTip } from "#components/reach/info-tip";

type Day = { date: string; stars?: number | null; forks?: number | null; views?: number; uniques?: number; clones?: number };
type View = {
  connected: boolean; repo?: string; url?: string; window?: { start: string; end: string; days: number }; notes?: string[]; kpis?: Metric[]; daily?: Day[];
  releases?: { tag: string; publishedAt: string; url: string }[];
  referrers?: { date: string; items: { referrer: string; count: number; uniques: number }[] } | null;
  paths?: { date: string; items: { path: string; title: string; count: number; uniques: number }[] } | null;
  issues?: { total: number; top: { title: string; url: string; comments: number; state: string }[] } | null;
  discussions?: { enabled?: boolean; total?: number; answered?: number; categories?: Record<string, number>; top?: { title: string; url: string; comments: number; upvotes: number; answered: boolean; answerable: boolean; category: string }[] } | null;
};
const short = (d: string) => d.slice(5);
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

export default function DataGitHub() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:github:${project.id}:${JSON.stringify(range)}` : null, () => api.action<View>("nrDataViews", "github", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const w = view?.window, hasTraffic = Boolean(view?.daily?.some((d) => d.views !== undefined)), hasStars = Boolean(view?.daily?.some((d) => typeof d.stars === "number"));
  const d = view?.discussions;
  const discussionMeta = (x: NonNullable<NonNullable<View["discussions"]>["top"]>[number]) => $t('dataGithub.comments',{0:x.comments,1:x.answerable ? (x.answered ? $t('dataGithub.answered') : $t('dataGithub.notAnsweredYet')) : x.category});
  const issueMeta = (i: NonNullable<View["issues"]>["top"][number]) => $t('dataGithub.comments',{0:i.comments,1:i.state === "open" ? $t('dataGithub.open') : $t('common.closed')});
  const discussions = useTickedList("github-discussions", view?.connected && d?.enabled !== false ? d?.top : undefined, (x) => x.url, (ticked) => ({ playbookId: "community-summary", description: $t('dataGithub.mostDiscussedDiscussionsBecomeOne'), draft: () => discussionsDraft(`GitHub Discussions（${view!.repo}）`, $t('dataGithub.discussions'), ticked.map((x) => ({ title: x.title, url: x.url, meta: discussionMeta(x) }))) }));
  const referrers = useTickedList("github-referrers", view?.connected ? view.referrers?.items : undefined, (r) => r.referrer, (ticked) => ({ playbookId: "change-research", description: $t('dataGithub.tickedReferringSitesBecomeOne'), draft: () => githubTrafficDraft(view!.repo || "", "referrers", ticked.map((r) => ({ name: r.referrer, count: r.count, uniques: r.uniques }))) }));
  const paths = useTickedList("github-paths", view?.connected ? view.paths?.items : undefined, (p) => p.path, (ticked) => ({ playbookId: "content-outline", description: $t('dataGithub.tickedPopularPagesBecomeOne'), draft: () => githubTrafficDraft(view!.repo || "", "paths", ticked.map((p) => ({ name: `${p.title || p.path}（${p.path}）`, count: p.count, uniques: p.uniques }))) }));
  const issues = useTickedList("github-issues", view?.connected ? view.issues?.top : undefined, (i) => i.url, (ticked) => ({ playbookId: "community-summary", description: $t('dataGithub.mostDiscussedIssuesBecomeOne'), draft: () => discussionsDraft(`GitHub Issues（${view!.repo}）`, "issue", ticked.map((i) => ({ title: i.title, url: i.url, meta: issueMeta(i) }))) }));
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title="GitHub" description={view?.repo ? <a className="nr-link" href={view.url} target="_blank" rel="noreferrer">{view.repo}</a> : $t('dataGithub.starsForksReleasesIssuesTraffic')} />
      <RangePicker value={range} onChange={setRange} summary={w ? $t('common.comparedPreviousDays',{0:w.start,1:w.end,2:w.days}) : undefined} />
      {error ? <LoadError title={$t('dataGithub.notLoadGithubData')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} /> : null}
      {!view && !error ? <ListSkeleton rows={5} /> : null}
      {view && !view.connected ? <EmptyState icon={<Github />} title={$t('dataGithub.onceGithubRepositoryConnectedStars')} description={$t('dataGithub.publicRepositoriesNeedNoCredentials')} action={<Button onClick={() => navigate("/connections?source=github")}>{$t('dataGithub.connectGithub')}</Button>} /> : null}
      {view?.connected ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">{view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          
          <Card className="gap-3 px-4">
            <h2 className="text-sm font-semibold">{$t('dataGithub.newStarsPerDay')}</h2>
            {hasStars ? (
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={view.daily} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={short} minTickGap={24} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={40} />
                    <Tooltip />
                    <Bar isAnimationActive={false} dataKey="stars" name={$t('common.newStars')} fill="var(--chart-2)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-sm text-muted-foreground">{$t('dataGithub.noDailyStarRecordsSelected')}</p>}
          </Card>
          <Card className="gap-3 px-4">
            <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{$t('dataGithub.repositoryViewsClones')}</h2><InfoTip label={$t('common.howReadChart')}>{$t('dataGithub.uniqueVisitorsCountedPerDay')}</InfoTip></div>
            {hasTraffic ? (
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={view.daily} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={short} minTickGap={24} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={40} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area isAnimationActive={false} dataKey="views" name={$t('common.views')} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.12} />
                    <Area isAnimationActive={false} dataKey="uniques" name={$t('dataGithub.uniqueVisitorsDay')} stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.12} />
                    <Area isAnimationActive={false} dataKey="clones" name={$t('dataGithub.clones')} stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-sm text-muted-foreground">{view.notes!.some((n) => n.includes("Traffic")) ? $t('dataGithub.shownOnceTrafficConnected') : $t('dataGithub.noTrafficRecordsSelectedPeriod')}</p>}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={$t('dataGithub.referringSites')} check={view.referrers?.items.length ? <AllCheck selection={referrers} count={view.referrers.items.length} /> : undefined} note={view.referrers ? $t('dataGithub.githubKeepsLast14Days',{0:view.referrers.date}) : undefined}>
              {view.referrers ? view.referrers.items.map((r) => <div key={r.referrer} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-0" data-referrer={r.referrer}><RowCheck selection={referrers} k={r.referrer} label={r.referrer} /><span className="min-w-0 flex-1 truncate">{r.referrer}</span><span className="shrink-0 tabular-nums text-muted-foreground">{$tj('dataGithub.viewsVisitors',{0:r.count.toLocaleString(getCurrentLocale()),1:r.uniques.toLocaleString(getCurrentLocale())})}</span></div>) : <Empty>{$t('dataGithub.shownOnceTrafficConnected')}</Empty>}
            </Section>
            <Section title={$t('dataGithub.popularPages')} check={view.paths?.items.length ? <AllCheck selection={paths} count={view.paths.items.length} /> : undefined} note={view.paths ? $t('dataGithub.githubKeepsLast14Days',{0:view.paths.date}) : undefined}>
              {view.paths ? view.paths.items.map((p) => <div key={p.path} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-0" data-path={p.path}><RowCheck selection={paths} k={p.path} label={p.title || p.path} /><span className="min-w-0 flex-1"><span className="block truncate">{p.title || p.path}</span><span className="block truncate text-xs text-muted-foreground">{p.path}</span></span><span className="shrink-0 tabular-nums text-muted-foreground">{$tj('dataGithub.views',{0:p.count.toLocaleString(getCurrentLocale())})}</span></div>) : <Empty>{$t('dataGithub.shownOnceTrafficConnected')}</Empty>}
            </Section>
          </div>
          <Section data-discussions title="Discussions"
            check={d?.top?.length && d.enabled !== false ? <AllCheck selection={discussions} count={d.top.length} /> : undefined}
            note={d && d.enabled !== false ? $t('dataGithub.discussionsLast90DaysAnswered',{0:d.total,1:d.answered,2:Object.keys(d.categories || {}).length ? $t('dataGithub.category',{0:Object.entries(d.categories!).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join("、")}) : ""}) : undefined}>
            {!d ? <Empty>{$t('dataGithub.readTrafficTokenDiscussionsLast')}</Empty> : d.enabled === false ? <Empty>{$t('dataGithub.discussionsNotEnabledRepository')}</Empty> : d.top!.map((x) => <Row key={x.url} title={x.title} url={x.url} meta={discussionMeta(x)} selection={discussions} />)}
          </Section>
          <Section title="Issues"
            check={view.issues?.top?.length ? <AllCheck selection={issues} count={view.issues.top.length} /> : undefined}
            note={view.issues ? $t('dataGithub.issuesLast90DaysSorted',{0:view.issues.total}) : undefined}>
            {view.issues ? view.issues.top.map((i) => <Row key={i.url} title={i.title} url={i.url} meta={issueMeta(i)} selection={issues} />) : <Empty>{$t('dataGithub.shownAfterNextSync')}</Empty>}
          </Section>
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
