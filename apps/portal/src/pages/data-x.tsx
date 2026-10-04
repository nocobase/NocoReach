// X (社区): posts naming the product, read once a day with the project's own X API key within a monthly cap — the daily
// count, engagement, the posts people engaged with most and the newest ones.
import { useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { AtSign, RefreshCw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
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
import { NotesTip } from "@/components/reach/info-tip";

type Post = { id: string; text: string; createdAt: string; url: string; metrics: { likes: number; reposts: number; replies: number; quotes: number; views: number | null } };
type View = { connected: boolean; terms?: string[]; handle?: string; window?: { start: string; end: string; days: number }; lastRun?: { at: string; ok: boolean; errors: string[]; capped: boolean } | null; spend?: { usd: number; posts: number; cap: number }; kpis?: Metric[]; series?: { date: string; value: number | null }[]; notes?: string[]; top?: Post[]; latest?: Post[] };
const stats = (m: Post["metrics"]) => `♥ ${m.likes.toLocaleString()} · 转发 ${m.reposts.toLocaleString()} · 回复 ${m.replies.toLocaleString()}${m.views != null ? ` · 浏览 ${m.views.toLocaleString()}` : ""}`;

export default function DataX() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:x:${project.id}:${JSON.stringify(range)}:${nonce}` : null, () => api.action<View>("nrX", "view", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const check = async () => {
    setBusy(true);
    try { const r = await api.action<{ added: number; capped: boolean; errors: string[] }>("nrX", "check", { method: "POST", body: { projectId: project!.id }, unwrap: "data" }); toast.success(r.errors.length ? `没有查完：${r.errors[0]}` : r.capped ? "本月已到上限" : r.added ? `新读到 ${r.added} 条` : "没有新帖子"); setNonce((n) => n + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : "没有查完"); }
    finally { setBusy(false); }
  };
  const w = view?.window, sp = view?.spend;
  const list = (title: string, rows: Post[], empty: string) => (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2"><h2 className="text-sm font-semibold">{title}</h2>{rows.length ? <SectionHandOff projectId={project?.id} playbookId="community-summary" description="这些帖子合成一个任务，让 Agent 整理大家在说什么、该补什么，确认后立即开始。" draft={() => discussionsDraft("X", "帖子", rows.map((p) => ({ title: p.text.replace(/\s+/g, " ").slice(0, 120), url: p.url, meta: `${p.createdAt.slice(0, 10)} · ${p.metrics.likes} 赞` })))} /> : null}</div>
      {rows.length ? rows.map((p) => (
        <div key={p.id} className="border-b border-border px-4 py-2.5 last:border-0" data-x-post={p.id}>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm">{p.text}</p>
          <p className="text-xs text-muted-foreground">{p.createdAt.slice(0, 10)} · {stats(p.metrics)} · <a className="nr-link" href={safeLink(p.url)} target="_blank" rel="noreferrer">在 X 打开</a></p>
        </div>
      )) : <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>}
    </Card>
  );
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title="X" description="X 上提到产品的帖子，用你们自己的 X API 每天查一次。" actions={view?.connected ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void check()}><RefreshCw data-icon="inline-start" />{busy ? "正在查找…" : "立即查找"}</Button> : undefined} />
      <RangePicker value={range} onChange={setRange} summary={w ? `${w.start} 至 ${w.end} · 对比前 ${w.days} 天` : undefined} />
      {error ? <LoadError title="X 提及没有读出来" message={error instanceof Error ? error.message : "请稍后再试"} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<AtSign />} title="接入 X 后，这里显示提到产品的帖子和每天的提及数" description="需要你们自己的 X API（按条付费），可以设每月上限，默认 $5。" action={<Button onClick={() => navigate("/connections?source=social")}>接入 X</Button>} /> : null}
      {view?.connected ? (
        <>
          <p className="nr-footnote">搜索词：{view.terms!.join("、")}{view.handle ? `（不含 @${view.handle}）` : ""}{view.lastRun ? ` · 上次查找 ${new Date(view.lastRun.at).toLocaleString("zh-CN")}` : ""}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}
            <Card className="gap-1 p-4" data-metric="本月花费"><p className="text-xs text-muted-foreground">本月花费（估算）</p><p className="text-2xl font-semibold tabular-nums">${sp!.usd.toFixed(2)}<span className="text-sm font-normal text-muted-foreground"> / ${sp!.cap}</span></p><p className="text-xs text-muted-foreground">读了 {sp!.posts.toLocaleString()} 条</p></Card>
          </div>
          
          {view.series!.filter((p) => p.value !== null).length > 1 ? (
            <Card className="gap-3 px-4">
              <h2 className="text-sm font-semibold">每天提到产品的帖子（不含转发）</h2>
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={view.series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={40} />
                    <Tooltip />
                    <Area isAnimationActive={false} type="linear" dataKey="value" name="帖子" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-2">
            {list("互动最多", view.top!, "所选时间内没有读到帖子。")}
            {list("最新", view.latest!, "所选时间内没有读到帖子。")}
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}
