// Hacker News tab of 讨论: mentions per day, the stories that drew most points and the latest comments in range.
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Newspaper } from "lucide-react";
import { EmptyState, ListSkeleton, LoadError } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker, useRange } from "./range-picker";
import { MetricTile, type Metric } from "./data-parts";
import { safeLink } from "./analytics";

type Story = { title: string; url: string | null; hnUrl: string; points: number; comments: number; date: string; term: string };
type Comment = { title: string; hnUrl: string; excerpt: string; date: string; term: string };
type View = { connected: boolean; terms?: string[]; window?: { start: string; end: string; days: number }; retainedFrom?: string | null; kpis?: Metric[]; notes?: string[]; series?: { date: string; value: number | null }[]; stories?: Story[]; comments?: Comment[] };

export function HackerNewsTab() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:hackernews:${project.id}:${JSON.stringify(range)}` : null, () => api.action<View>("nrDataViews", "hackernews", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const w = view?.window;
  return (
    <>
      <RangePicker value={range} onChange={setRange} summary={w ? `${w.start} 至 ${w.end} · 对比前 ${w.days} 天` : undefined} />
      {error ? <LoadError title="Hacker News 提及没有读出来" message={error instanceof Error ? error.message : "请稍后再试"} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<Newspaper />} title="接入 Hacker News 后，这里显示每天的提及和热门帖子" description="按产品名搜索 Hacker News 的公开帖子和评论，不需要账号，不保存作者。" action={<Button onClick={() => navigate("/connections?source=mentions")}>接入 Hacker News</Button>} /> : null}
      {view?.connected ? (
        <>
          <p className="nr-footnote">搜索词：{view.terms!.join("、")}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          {view.notes!.map((n) => <p key={n} className="nr-data-note">{n}</p>)}
          {view.series!.length ? (
            <Card className="gap-3 px-4">
              <h2 className="text-sm font-semibold">每日提及</h2>
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={view.series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={32} />
                    <Tooltip />
                    <Bar isAnimationActive={false} dataKey="value" name="提及" fill="var(--chart-3)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="gap-0 py-0">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">分数最高的帖子</h2>
              {view.stories!.length ? view.stories!.map((s) => (
                <div key={s.hnUrl} className="border-b border-border px-4 py-2.5 last:border-0" data-story>
                  <a className="nr-link font-medium" href={safeLink(s.hnUrl)} target="_blank" rel="noreferrer">{s.title}</a>
                  <p className="text-xs text-muted-foreground">{s.points} 分 · {s.comments} 条评论 · {s.date}{s.url ? <> · <a className="nr-link" href={safeLink(s.url)} target="_blank" rel="noreferrer">原文</a></> : null}</p>
                </div>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">所选时间内没有帖子提到产品。</p>}
            </Card>
            <Card className="gap-0 py-0">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">最新的评论</h2>
              {view.comments!.length ? view.comments!.map((c) => (
                <div key={c.hnUrl} className="border-b border-border px-4 py-2.5 last:border-0" data-comment>
                  <a className="nr-link text-sm" href={safeLink(c.hnUrl)} target="_blank" rel="noreferrer">{c.title || "评论"}</a>
                  {c.excerpt ? <p className="line-clamp-2 text-sm text-muted-foreground">{c.excerpt}</p> : null}
                  <p className="text-xs text-muted-foreground">{c.date}</p>
                </div>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">所选时间内没有评论提到产品。</p>}
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
