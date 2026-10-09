import { $t, $tj } from "@/i18n";
// 论坛 (社区): topics, replies and unanswered questions of the connected Discourse forum for the period against the one
// before; categories; unanswered and most discussed topics (both can go to the Agent). Same parts as the other data
// pages (2026-10-04).
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@/lib/nocoreach-api";
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
import { HandOffBar } from "./hand-off-bar";
import { AllCheck, RowCheck, useTickedList, type Selection } from "@/components/reach/hand-off-slot";
import { discussionsDraft, replyDraft } from "./seo-hand-off";
import "./data-views.css";
import { NotesTip, InfoTip } from "@/components/reach/info-tip";

type Topic = { title: string; url: string; views?: number; replies?: number; solved?: boolean; category: string; date: string };
type View = { connected: boolean; origin?: string; title?: string; window?: { start: string; end: string; days: number }; notes?: string[]; kpis?: Metric[]; daily?: { date: string; topics: number | null; replies: number | null }[]; categories?: { name: string; count: number; previous: number | null }[]; top?: Topic[]; unanswered?: Topic[] };
const short = (d: string) => d.slice(5);
const topicMeta = (t: Topic) => $t("{0} · 浏览 {1} · 回复 {2}{3}",{0:t.category,1:t.views,2:t.replies,3:t.solved ? $t(" · 已解决") : ""});
const TopicRow = ({ t, meta, selection }: { t: Topic; meta: string; selection: Selection }) => (
  <div className="flex items-start gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
    <span className="pt-0.5"><RowCheck selection={selection} k={t.url} label={t.title} /></span>
    <a className="nr-link min-w-0 flex-1" href={safeLink(t.url)} target="_blank" rel="noreferrer">{t.title}</a>
    <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
  </div>
);
const Head = ({ title, check }: { title: string; check?: React.ReactNode }) => <div className="flex items-center gap-3 border-b border-border px-4 py-2">{check}<h2 className="text-sm font-semibold">{title}</h2></div>;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;

export default function DataCommunity() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:community:${project.id}:${JSON.stringify(range)}` : null, () => api.action<View>("nrDataViews", "community", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const w = view?.window, forum = $t("论坛（{0}）",{0:view?.title || view?.origin});
  const unanswered = useTickedList("forum-unanswered", view?.connected ? view.unanswered : undefined, (t) => t.url, (ticked) => ({ playbookId: "community-reply", description: $t("这些无人回复的主题合成一个任务，让 Agent 各起草一条回复，审核后你复制去回复。"), draft: () => replyDraft(forum, $t("无人回复的主题"), ticked.map((t) => ({ title: t.title, url: t.url, meta: `${t.category} · ${t.date}` }))) }));
  const top = useTickedList("forum-top", view?.connected ? view.top : undefined, (t) => t.url, (ticked) => ({ playbookId: "community-summary", description: $t("讨论最多的主题合成一个任务，让 Agent 归类问题、看哪些能用文档回答，确认后立即开始。"), draft: () => discussionsDraft(forum, $t("讨论最多的主题"), ticked.map((t) => ({ title: t.title, url: t.url, meta: topicMeta(t) }))) }));
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title={$t("论坛")} description={view?.origin ? <>{$t("Discourse 论坛")} <a className="nr-link" href={view.origin} target="_blank" rel="noreferrer">{view.title || view.origin}</a>  {$t("的主题、回复与无人回复的问题。")}</> : $t("社区论坛（Discourse）的主题、回复与无人回复的问题。")} />
      <RangePicker value={range} onChange={setRange} summary={w ? $t("{0} 至 {1} · 对比前 {2} 天",{0:w.start,1:w.end,2:w.days}) : undefined} />
      {error ? <LoadError title={$t("论坛数据没有读出来")} message={error instanceof Error ? error.message : $t("请稍后再试")} /> : null}
      {!view && !error ? <ListSkeleton rows={5} /> : null}
      {view && !view.connected ? <EmptyState icon={<MessagesSquare />} title={$t("接入社区论坛后，这里显示讨论量、分类和无人回复的主题")} description={$t("目前支持 Discourse 论坛的公开分类，不需要账号，不保存用户名。")} action={<Button onClick={() => navigate("/connections?source=discourse")}>{$t("接入社区论坛")}</Button>} /> : null}
      {view?.connected ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          
          <Card className="gap-3 px-4">
            <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{$t("每天的新主题与回复")}</h2><InfoTip label={$t("图怎么看")}>{$t("回复按主题创建的日子归类，是最近一次读取时的累计回复数。")}</InfoTip></div>
            <div className="nr-chart-box">
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={view.daily} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={short} minTickGap={24} fontSize={11} />
                  <YAxis yAxisId="t" allowDecimals={false} fontSize={11} width={32} />
                  <YAxis yAxisId="r" orientation="right" allowDecimals={false} fontSize={11} width={40} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar isAnimationActive={false} yAxisId="t" dataKey="topics" name={$t("新主题")} fill="var(--chart-2)" />
                  <Line isAnimationActive={false} yAxisId="r" dataKey="replies" name={$t("这些主题的回复")} stroke="var(--chart-5)" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="gap-0 py-0">
              <Head title={$t("分类")} />
              {view.categories!.length ? view.categories!.map((c) => <div key={c.name} className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-sm last:border-0"><span className="truncate">{c.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{$tj("{0} 个新主题{1}",{0:c.count,1:c.previous != null ? $t(" · 前一期 {0}",{0:c.previous}) : ""})}</span></div>) : <Empty>{$t("所选时间内没有新主题。")}</Empty>}
            </Card>
            <Card className="gap-0 py-0">
              <Head title={$t("无人回复")} check={<AllCheck selection={unanswered} count={view.unanswered!.length} />} />
              {view.unanswered!.length ? view.unanswered!.map((t) => <TopicRow key={t.url} t={t} meta={`${t.category} · ${t.date}`} selection={unanswered} />) : <Empty>{$t("所选时间内没有无人回复的主题。")}</Empty>}
            </Card>
          </div>
          <Card className="gap-0 py-0">
            <Head title={$t("讨论最多的主题")} check={<AllCheck selection={top} count={view.top!.length} />} />
            {view.top!.length ? view.top!.map((t) => <TopicRow key={t.url} t={t} meta={topicMeta(t)} selection={top} />) : <Empty>{$t("所选时间内没有新主题。")}</Empty>}
          </Card>
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
