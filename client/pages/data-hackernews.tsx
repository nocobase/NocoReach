import { $t, $tj } from "#i18n";
// Hacker News (社区): mentions per day, the stories that drew most points and the latest comments in range. Since
// 2026-11-10 also the last week's stories on the followed topics with the most points and comments, read with each daily
// sync, in their own group (Topic discussions) beside the mentions.
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Newspaper } from "lucide-react";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker } from './range-picker';
import { validRange, useRange } from './range-state';
import { MetricTile, metricGrid, type Metric } from "./data-parts";
import { safeLink } from "./analytics";
import { HandOffBar } from "./hand-off-bar";
import { AllCheck, RowCheck, useTickedList } from "#components/reach/hand-off-slot";
import { discussionsDraft } from "./seo-hand-off";
import "./data-views.css";
import { NotesTip } from "#components/reach/info-tip";
import { formatDate } from '#lib/format';
import { TopicGroupTabs, TopicScope } from './followed-topics';
import { topicMarks, useTopicGroup } from './followed-topics-scope';

type Story = { title: string; url: string | null; hnUrl: string; points: number; comments: number; date: string; term: string };
type Comment = { title: string; hnUrl: string; excerpt: string; date: string; term: string };
type TopicStory = Omit<Story, 'term'> & { topics: string[] };
type View = { connected: boolean; topic?: { topics: string[]; lastSync: { at: string; ok: boolean } | null; count: number; stories: TopicStory[] }; terms?: string[]; window?: { start: string; end: string; days: number }; retainedFrom?: string | null; kpis?: Metric[]; notes?: string[]; series?: { date: string; value: number | null }[]; stories?: Story[]; comments?: Comment[] };

export default function DataHackerNews() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const custom = !validRange(range);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:hackernews:${project.id}:${JSON.stringify(range)}` : null, () => api.action<View>("nrDataViews", "hackernews", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const w = view?.window;
  const topic = view?.topic, [group, setGroup] = useTopicGroup(Boolean(topic?.topics.length));
  const topicStories = useTickedList("hn-topic-stories", view?.connected && topic ? topic.stories : undefined, (s) => s.hnUrl, (ticked) => ({ playbookId: "community-summary", description: $t('common.postsBecomeOneTaskAgent'), draft: () => discussionsDraft("Hacker News", $t('common.posts'), ticked.map((s) => ({ title: s.title, url: s.hnUrl, meta: `${topicMarks(s.topics)} · ${$t('dataHackernews.pointsComments',{0:s.points,1:s.comments,2:formatDate(s.date)})}` }))) }));
  const stories = useTickedList("hn-stories", view?.connected ? view.stories : undefined, (s) => s.hnUrl, (ticked) => ({ playbookId: "community-summary", description: $t('common.postsBecomeOneTaskAgent'), draft: () => discussionsDraft("Hacker News", $t('common.posts'), ticked.map((s) => ({ title: s.title, url: s.hnUrl, meta: $t('dataHackernews.pointsComments',{0:s.points,1:s.comments,2:formatDate(s.date)}) }))) }));
  const comments = useTickedList("hn-comments", view?.connected ? view.comments : undefined, (c) => c.hnUrl, (ticked) => ({ playbookId: "community-summary", description: $t('dataHackernews.commentsBecomeOneTaskAgent'), draft: () => discussionsDraft("Hacker News", $t('common.comments'), ticked.map((c) => ({ title: c.title || $t('common.comments'), url: c.hnUrl, meta: c.date, excerpt: c.excerpt }))) }));
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title="Hacker News" description={$t('dataHackernews.productTopicsDescription')} />
      <RangePicker value={range} onChange={setRange} summary={w ? ('all' in w && w.all ? $t('rangePicker.availableRange',{0:formatDate(w.start),1:formatDate(w.end)}) : $t('common.comparedPreviousDays',{0:formatDate(w.start),1:formatDate(w.end),2:w.days})) : undefined} />
      {error ? <LoadError title={$t('dataHackernews.notLoadHackerNewsMentions')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<Newspaper />} title={$t('dataHackernews.onceHackerNewsConnectedDaily')} description={$t('dataHackernews.searchesPublicHackerNewsPosts')} action={<Button onClick={() => navigate("/connections?source=mentions")}>{$t('dataHackernews.connectHackerNews')}</Button>} /> : null}
      {view?.connected ? (
        <>
          <TopicScope terms={view.terms} topics={topic?.topics.length ?? 0} cadence="daily" />
          {topic ? <TopicGroupTabs group={group} onChange={setGroup} topics={topic.count} mentions={view.stories!.length + view.comments!.length} /> : null}
          {topic && group === 'topics' ? (
            <Card className="gap-0 py-0" data-group="topics">
              <div className="flex items-center gap-3 border-b border-border px-4 py-2"><AllCheck selection={topicStories} count={topic.stories.length} /><h2 className="text-sm font-semibold">{$t('followedTopics.topStories')}</h2></div>
              {topic.stories.length ? topic.stories.map((s) => (
                <div key={s.hnUrl} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0" data-topic-story>
                  <span className="pt-0.5"><RowCheck selection={topicStories} k={s.hnUrl} label={s.title} /></span><div className="min-w-0 flex-1">
                  <a className="nr-link font-medium" href={safeLink(s.hnUrl)} target="_blank" rel="noreferrer">{s.title}</a>
                  <p className="text-xs text-muted-foreground">{topicMarks(s.topics)} · {$tj('dataHackernews.pointsComments',{0:s.points,1:s.comments,2:formatDate(s.date)})}{s.url ? <> · <a className="nr-link" href={safeLink(s.url)} target="_blank" rel="noreferrer">{$t('dataHackernews.original')}</a></> : null}</p>
                </div></div>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">{!topic.topics.length ? $t('followedTopics.noTopics') : topic.lastSync ? $t('followedTopics.noTopicPosts') : $t('followedTopics.notSearchedYet')}</p>}
            </Card>
          ) : <>
          <div className={metricGrid(view.kpis!.length)}>{view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          
          {view.series!.length ? (
            <Card className="gap-3 px-4">
              <h2 className="text-sm font-semibold">{$t('dataHackernews.dailyMentions')}</h2>
              {/* No mention in the period: say so instead of drawing an empty axis (guideline T5.4). */}
              {!view.series!.some((p) => p.value) ? <p className="text-sm text-muted-foreground">{$t('dataHackernews.noMentionsInPeriod')}</p> : <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={view.series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={32} />
                    <Tooltip />
                    <Bar isAnimationActive={false} dataKey="value" name={$t('dataHackernews.mentions')} fill="var(--chart-3)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>}
            </Card>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="gap-0 py-0">
              <div className="flex items-center gap-3 border-b border-border px-4 py-2"><AllCheck selection={stories} count={view.stories!.length} /><h2 className="text-sm font-semibold">{$t('common.topScoringPosts')}</h2></div>
              {view.stories!.length ? view.stories!.map((s) => (
                <div key={s.hnUrl} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0" data-story>
                  <span className="pt-0.5"><RowCheck selection={stories} k={s.hnUrl} label={s.title} /></span><div className="min-w-0 flex-1">
                  <a className="nr-link font-medium" href={safeLink(s.hnUrl)} target="_blank" rel="noreferrer">{s.title}</a>
                  <p className="text-xs text-muted-foreground">{$tj('dataHackernews.pointsComments',{0:s.points,1:s.comments,2:formatDate(s.date)})}{s.url ? <> · <a className="nr-link" href={safeLink(s.url)} target="_blank" rel="noreferrer">{$t('dataHackernews.original')}</a></> : null}</p>
                </div></div>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">{$t('dataHackernews.noPostsMentionProductSelected')}</p>}
            </Card>
            <Card className="gap-0 py-0">
              <div className="flex items-center gap-3 border-b border-border px-4 py-2"><AllCheck selection={comments} count={view.comments!.length} /><h2 className="text-sm font-semibold">{$t('dataHackernews.latestComments')}</h2></div>
              {view.comments!.length ? view.comments!.map((c) => (
                <div key={c.hnUrl} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0" data-comment>
                  <span className="pt-0.5"><RowCheck selection={comments} k={c.hnUrl} label={c.title || $t('common.comments')} /></span><div className="min-w-0 flex-1">
                  <a className="nr-link text-sm" href={safeLink(c.hnUrl)} target="_blank" rel="noreferrer">{c.title || $t('common.comments')}</a>
                  {c.excerpt ? <p className="line-clamp-2 text-sm text-muted-foreground">{c.excerpt}</p> : null}
                  <p className="text-xs text-muted-foreground">{formatDate(c.date)}</p>
                </div></div>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">{$t('dataHackernews.noCommentsMentionProductSelected')}</p>}
            </Card>
          </div>
          </>}
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
