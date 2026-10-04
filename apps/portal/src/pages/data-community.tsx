// 论坛 (社区): topics, replies and unanswered questions of the connected Discourse forum for the period against the one
// before; categories; unanswered and most discussed topics (both can go to the Agent). Same parts as the other data
// pages (2026-10-04).
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { MessagesSquare } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker, useRange } from "./range-picker";
import { MetricTile, type Metric } from "./data-parts";
import { safeLink } from "./analytics";
import { SectionHandOff } from "./section-hand-off";
import { discussionsDraft } from "./seo-hand-off";
import "./data-views.css";

type Topic = { title: string; url: string; views?: number; replies?: number; solved?: boolean; category: string; date: string };
type View = { connected: boolean; origin?: string; title?: string; window?: { start: string; end: string; days: number }; notes?: string[]; kpis?: Metric[]; daily?: { date: string; topics: number | null; replies: number | null }[]; categories?: { name: string; count: number; previous: number | null }[]; top?: Topic[]; unanswered?: Topic[] };
const short = (d: string) => d.slice(5);
const topicMeta = (t: Topic) => `${t.category} · 浏览 ${t.views} · 回复 ${t.replies}${t.solved ? " · 已解决" : ""}`;
const TopicRow = ({ t, meta }: { t: Topic; meta: string }) => (
  <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
    <a className="nr-link min-w-0" href={safeLink(t.url)} target="_blank" rel="noreferrer">{t.title}</a>
    <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
  </div>
);
const Head = ({ title, action }: { title: string; action?: React.ReactNode }) => <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2"><h2 className="text-sm font-semibold">{title}</h2>{action}</div>;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;

export default function DataCommunity() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:community:${project.id}:${JSON.stringify(range)}` : null, () => api.action<View>("nrDataViews", "community", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const w = view?.window, forum = `论坛（${view?.title || view?.origin}）`;
  return (
    <PageContainer className="nr-data-page">
      <PageHeader title="论坛" description={view?.origin ? <>Discourse 论坛 <a className="nr-link" href={view.origin} target="_blank" rel="noreferrer">{view.title || view.origin}</a> 的主题、回复与无人回复的问题。</> : "社区论坛（Discourse）的主题、回复与无人回复的问题。"} />
      <RangePicker value={range} onChange={setRange} summary={w ? `${w.start} 至 ${w.end} · 对比前 ${w.days} 天` : undefined} />
      {error ? <LoadError title="论坛数据没有读出来" message={error instanceof Error ? error.message : "请稍后再试"} /> : null}
      {!view && !error ? <ListSkeleton rows={5} /> : null}
      {view && !view.connected ? <EmptyState icon={<MessagesSquare />} title="接入社区论坛后，这里显示讨论量、分类和无人回复的主题" description="目前支持 Discourse 论坛的公开分类，不需要账号，不保存用户名。" action={<Button onClick={() => navigate("/connections?source=discourse")}>接入社区论坛</Button>} /> : null}
      {view?.connected ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          {view.notes!.map((n) => <p key={n} className="nr-data-note">{n}</p>)}
          <Card className="gap-3 px-4">
            <h2 className="text-sm font-semibold">每天的新主题与回复</h2>
            <div className="nr-chart-box">
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={view.daily} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={short} minTickGap={24} fontSize={11} />
                  <YAxis yAxisId="t" allowDecimals={false} fontSize={11} width={32} />
                  <YAxis yAxisId="r" orientation="right" allowDecimals={false} fontSize={11} width={40} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar isAnimationActive={false} yAxisId="t" dataKey="topics" name="新主题" fill="var(--chart-2)" />
                  <Line isAnimationActive={false} yAxisId="r" dataKey="replies" name="这些主题的回复" stroke="var(--chart-5)" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground">回复按主题创建的日子归类，是最近一次读取时的累计回复数。</p>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="gap-0 py-0">
              <Head title="分类" />
              {view.categories!.length ? view.categories!.map((c) => <div key={c.name} className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-sm last:border-0"><span className="truncate">{c.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{c.count} 个新主题{c.previous != null ? ` · 前一期 ${c.previous}` : ""}</span></div>) : <Empty>所选时间内没有新主题。</Empty>}
            </Card>
            <Card className="gap-0 py-0">
              <Head title="无人回复" action={view.unanswered!.length ? <SectionHandOff projectId={project?.id} playbookId="community-summary" description="这些无人回复的主题合成一个任务，让 Agent 归类问题、看哪些能用文档回答，确认后立即开始。" draft={() => discussionsDraft(forum, "无人回复的主题", view.unanswered!.map((t) => ({ title: t.title, url: t.url, meta: `${t.category} · ${t.date}` })))} /> : undefined} />
              {view.unanswered!.length ? view.unanswered!.map((t) => <TopicRow key={t.url} t={t} meta={`${t.category} · ${t.date}`} />) : <Empty>所选时间内没有无人回复的主题。</Empty>}
            </Card>
          </div>
          <Card className="gap-0 py-0">
            <Head title="讨论最多的主题" action={view.top!.length ? <SectionHandOff projectId={project?.id} playbookId="community-summary" description="讨论最多的主题合成一个任务，让 Agent 归类问题、看哪些能用文档回答，确认后立即开始。" draft={() => discussionsDraft(forum, "讨论最多的主题", view.top!.map((t) => ({ title: t.title, url: t.url, meta: topicMeta(t) })))} /> : undefined} />
            {view.top!.length ? view.top!.map((t) => <TopicRow key={t.url} t={t} meta={topicMeta(t)} />) : <Empty>所选时间内没有新主题。</Empty>}
          </Card>
        </>
      ) : null}
    </PageContainer>
  );
}
