import { $t, $tj } from "@/i18n";
// Hacker News (社区): mentions per day, the stories that drew most points and the latest comments in range.
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Newspaper } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker, useRange } from "./range-picker";
import { MetricTile, type Metric } from "./data-parts";
import { safeLink } from "./analytics";
import { HandOffButton } from "./hand-off-button";
import { AllCheck, RowCheck, useTickedList } from "@/components/reach/hand-off-slot";
import { discussionsDraft } from "./seo-hand-off";
import "./data-views.css";
import { NotesTip } from "@/components/reach/info-tip";

type Story = { title: string; url: string | null; hnUrl: string; points: number; comments: number; date: string; term: string };
type Comment = { title: string; hnUrl: string; excerpt: string; date: string; term: string };
type View = { connected: boolean; terms?: string[]; window?: { start: string; end: string; days: number }; retainedFrom?: string | null; kpis?: Metric[]; notes?: string[]; series?: { date: string; value: number | null }[]; stories?: Story[]; comments?: Comment[] };

export default function DataHackerNews() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:hackernews:${project.id}:${JSON.stringify(range)}` : null, () => api.action<View>("nrDataViews", "hackernews", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const w = view?.window;
  const stories = useTickedList("hn-stories", view?.connected ? view.stories : undefined, (s) => s.hnUrl, (ticked) => ({ playbookId: "community-summary", description: $t("这些帖子合成一个任务，让 Agent 整理大家在说什么、该补什么，确认后立即开始。"), draft: () => discussionsDraft("Hacker News", $t("帖子"), ticked.map((s) => ({ title: s.title, url: s.hnUrl, meta: $t("{0} 分 · {1} 条评论 · {2}",{0:s.points,1:s.comments,2:s.date}) }))) }));
  const comments = useTickedList("hn-comments", view?.connected ? view.comments : undefined, (c) => c.hnUrl, (ticked) => ({ playbookId: "community-summary", description: $t("这些评论合成一个任务，让 Agent 整理大家在说什么、该补什么，确认后立即开始。"), draft: () => discussionsDraft("Hacker News", $t("评论"), ticked.map((c) => ({ title: c.title || $t("评论"), url: c.hnUrl, meta: c.date, excerpt: c.excerpt }))) }));
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title="Hacker News" description={$t("Hacker News 上提到产品的帖子和评论。")} actions={<HandOffButton projectId={project?.id} />} />
      <RangePicker value={range} onChange={setRange} summary={w ? $t("{0} 至 {1} · 对比前 {2} 天",{0:w.start,1:w.end,2:w.days}) : undefined} />
      {error ? <LoadError title={$t("Hacker News 提及没有读出来")} message={error instanceof Error ? error.message : $t("请稍后再试")} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<Newspaper />} title={$t("接入 Hacker News 后，这里显示每天的提及和热门帖子")} description={$t("按产品名搜索 Hacker News 的公开帖子和评论，不需要账号，不保存作者。")} action={<Button onClick={() => navigate("/connections?source=mentions")}>{$t("接入 Hacker News")}</Button>} /> : null}
      {view?.connected ? (
        <>
          <p className="nr-footnote">{$tj("搜索词：{0}",{0:view.terms!.join("、")})}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          
          {view.series!.length ? (
            <Card className="gap-3 px-4">
              <h2 className="text-sm font-semibold">{$t("每日提及")}</h2>
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={view.series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={32} />
                    <Tooltip />
                    <Bar isAnimationActive={false} dataKey="value" name={$t("提及")} fill="var(--chart-3)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="gap-0 py-0">
              <div className="flex items-center gap-3 border-b border-border px-4 py-2"><AllCheck selection={stories} count={view.stories!.length} /><h2 className="text-sm font-semibold">{$t("分数最高的帖子")}</h2></div>
              {view.stories!.length ? view.stories!.map((s) => (
                <div key={s.hnUrl} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0" data-story>
                  <span className="pt-0.5"><RowCheck selection={stories} k={s.hnUrl} label={s.title} /></span><div className="min-w-0 flex-1">
                  <a className="nr-link font-medium" href={safeLink(s.hnUrl)} target="_blank" rel="noreferrer">{s.title}</a>
                  <p className="text-xs text-muted-foreground">{$tj("{0} 分 · {1} 条评论 · {2}",{0:s.points,1:s.comments,2:s.date})}{s.url ? <> · <a className="nr-link" href={safeLink(s.url)} target="_blank" rel="noreferrer">{$t("原文")}</a></> : null}</p>
                </div></div>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">{$t("所选时间内没有帖子提到产品。")}</p>}
            </Card>
            <Card className="gap-0 py-0">
              <div className="flex items-center gap-3 border-b border-border px-4 py-2"><AllCheck selection={comments} count={view.comments!.length} /><h2 className="text-sm font-semibold">{$t("最新的评论")}</h2></div>
              {view.comments!.length ? view.comments!.map((c) => (
                <div key={c.hnUrl} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0" data-comment>
                  <span className="pt-0.5"><RowCheck selection={comments} k={c.hnUrl} label={c.title || $t("评论")} /></span><div className="min-w-0 flex-1">
                  <a className="nr-link text-sm" href={safeLink(c.hnUrl)} target="_blank" rel="noreferrer">{c.title || $t("评论")}</a>
                  {c.excerpt ? <p className="line-clamp-2 text-sm text-muted-foreground">{c.excerpt}</p> : null}
                  <p className="text-xs text-muted-foreground">{c.date}</p>
                </div></div>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">{$t("所选时间内没有评论提到产品。")}</p>}
            </Card>
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}
