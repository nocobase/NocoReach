import { $t, $tj } from "@/i18n";
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
import { HandOffBar } from "./hand-off-bar";
import { AllCheck, RowCheck, useTickedList, type Selection } from "@/components/reach/hand-off-slot";
import { discussionsDraft } from "./seo-hand-off";
import "./data-views.css";
import { NotesTip } from "@/components/reach/info-tip";

type Post = { id: string; text: string; createdAt: string; url: string; metrics: { likes: number; reposts: number; replies: number; quotes: number; views: number | null } };
type View = { connected: boolean; terms?: string[]; handle?: string; window?: { start: string; end: string; days: number }; lastRun?: { at: string; ok: boolean; errors: string[]; capped: boolean } | null; spend?: { usd: number; posts: number; cap: number }; kpis?: Metric[]; series?: { date: string; value: number | null }[]; notes?: string[]; top?: Post[]; latest?: Post[] };
const stats = (m: Post["metrics"]) => $t("♥ {0} · 转发 {1} · 回复 {2}{3}",{0:m.likes.toLocaleString(),1:m.reposts.toLocaleString(),2:m.replies.toLocaleString(),3:m.views != null ? $t(" · 浏览 {0}",{0:m.views.toLocaleString()}) : ""});

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
    try { const r = await api.action<{ added: number; capped: boolean; errors: string[] }>("nrX", "check", { method: "POST", body: { projectId: project!.id }, unwrap: "data" }); toast.success(r.errors.length ? $t("没有查完：{0}",{0:$t(r.errors[0])}) : r.capped ? $t("本月已到上限") : r.added ? $t("新读到 {0} 条",{0:r.added}) : $t("没有新帖子")); setNonce((n) => n + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : $t("没有查完")); }
    finally { setBusy(false); }
  };
  const w = view?.window, sp = view?.spend;
  const source = (ticked: Post[]) => ({ playbookId: "community-summary", description: $t("这些帖子合成一个任务，让 Agent 整理大家在说什么、该补什么，确认后立即开始。"), draft: () => discussionsDraft("X", $t("帖子"), ticked.map((p) => ({ title: p.text.replace(/\s+/g, " ").slice(0, 120), url: p.url, meta: $t("{0} · {1} 赞",{0:p.createdAt.slice(0, 10),1:p.metrics.likes}) }))) });
  const top = useTickedList("x-top", view?.connected ? view.top : undefined, (p) => String(p.id), source);
  const latest = useTickedList("x-latest", view?.connected ? view.latest : undefined, (p) => String(p.id), source);
  const list = (title: string, rows: Post[], empty: string, selection: Selection) => (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2"><AllCheck selection={selection} count={rows.length} /><h2 className="text-sm font-semibold">{title}</h2></div>
      {rows.length ? rows.map((p) => (
        <div key={p.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0" data-x-post={p.id}>
          <span className="pt-0.5"><RowCheck selection={selection} k={String(p.id)} label={p.text.slice(0, 60)} /></span><div className="min-w-0 flex-1">
          <p className="line-clamp-3 whitespace-pre-wrap text-sm">{p.text}</p>
          <p className="text-xs text-muted-foreground">{p.createdAt.slice(0, 10)} · {stats(p.metrics)} · <a className="nr-link" href={safeLink(p.url)} target="_blank" rel="noreferrer">{$t("在 X 打开")}</a></p>
        </div></div>
      )) : <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>}
    </Card>
  );
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title="X" description={$t("X 上提到产品的帖子，用你们自己的 X API 每天查一次。")} actions={view?.connected ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void check()}><RefreshCw data-icon="inline-start" />{busy ? $t("正在查找…") : $t("立即查找")}</Button> : undefined} />
      <RangePicker value={range} onChange={setRange} summary={w ? $t("{0} 至 {1} · 对比前 {2} 天",{0:w.start,1:w.end,2:w.days}) : undefined} />
      {error ? <LoadError title={$t("X 提及没有读出来")} message={error instanceof Error ? error.message : $t("请稍后再试")} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<AtSign />} title={$t("接入 X 后，这里显示提到产品的帖子和每天的提及数")} description={$t("需要你们自己的 X API（按条付费），可以设每月上限，默认 $5。")} action={<Button onClick={() => navigate("/connections?source=social")}>{$t("接入 X")}</Button>} /> : null}
      {view?.connected ? (
        <>
          <p className="nr-footnote">{$tj("搜索词：{0}{1}{2}",{0:view.terms!.join("、"),1:view.handle ? $t("（不含 @{0}）",{0:view.handle}) : "",2:view.lastRun ? $t(" · 上次查找 {0}",{0:new Date(view.lastRun.at).toLocaleString("zh-CN")}) : ""})}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}
            <Card className="gap-1 p-4" data-metric={$t("本月花费")}><p className="text-xs text-muted-foreground">{$t("本月花费（估算）")}</p><p className="text-2xl font-semibold tabular-nums">${sp!.usd.toFixed(2)}<span className="text-sm font-normal text-muted-foreground"> / ${sp!.cap}</span></p><p className="text-xs text-muted-foreground">{$tj("读了 {0} 条",{0:sp!.posts.toLocaleString()})}</p></Card>
          </div>
          
          {view.series!.filter((p) => p.value !== null).length > 1 ? (
            <Card className="gap-3 px-4">
              <h2 className="text-sm font-semibold">{$t("每天提到产品的帖子（不含转发）")}</h2>
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={view.series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={40} />
                    <Tooltip />
                    <Area isAnimationActive={false} type="linear" dataKey="value" name={$t("帖子")} stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-2">
            {list($t("互动最多"), view.top!, $t("所选时间内没有读到帖子。"), top)}
            {list($t("最新"), view.latest!, $t("所选时间内没有读到帖子。"), latest)}
          </div>
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
