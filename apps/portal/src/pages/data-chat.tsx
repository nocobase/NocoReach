// Discord or Slack (社区; one page each since 2026-10-04): the chosen channels read once a day — messages and questions in
// the range, per channel, the questions that may be unanswered and the threads with the most replies.
import { useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { MessagesSquare, RefreshCw } from "lucide-react";
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

type Message = { platform: "discord" | "slack"; channel: string; text: string; createdAt: string; replies: number; url: string };
type Side = { connected: boolean; name?: string };
type View = { connected: boolean; side?: Side; window?: { start: string; end: string; days: number }; lastRun?: { at: string } | null; kpis?: Metric[]; series?: { date: string; value: number | null }[]; channels?: { platform: string; channel: string; messages: number; questions: number; open: number }[]; open?: Message[]; busiest?: Message[]; notes?: string[] };
const NAME = { discord: "Discord", slack: "Slack" } as const;

export function DataChat({ platform }: { platform: "discord" | "slack" }) {
  const name = NAME[platform];
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:${platform}:${project.id}:${JSON.stringify(range)}:${nonce}` : null, () => api.action<View>("nrChat", "view", { method: "POST", body: { projectId: project!.id, platform, ...range }, unwrap: "data" }));
  const sync = async () => {
    setBusy(true);
    try { const r = await api.action<{ read: number; errors: string[] }>("nrChat", "sync", { method: "POST", body: { projectId: project!.id, platform }, unwrap: "data" }); toast.success(r.errors.length ? `部分没有读完：${r.errors[0]}` : `读到 ${r.read} 条`); setNonce((n) => n + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : "没有读完"); }
    finally { setBusy(false); }
  };
  const w = view?.window, where = view?.side?.name ? `${platform === "discord" ? "服务器" : "工作区"}：${view.side.name}` : "";
  const list = (title: string, rows: Message[], empty: string, handOff: boolean) => (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2"><h2 className="text-sm font-semibold">{title}</h2>{handOff && rows.length ? <SectionHandOff projectId={project?.id} playbookId="community-summary" description="这些提问合成一个任务，让 Agent 归类、找文档里有没有答案、给出该补的内容，确认后立即开始。" draft={() => discussionsDraft(name, "提问", rows.map((m) => ({ title: m.text.replace(/\s+/g, " ").slice(0, 120), url: m.url, meta: `#${m.channel} · ${m.createdAt.slice(0, 10)}` })))} /> : null}</div>
      {rows.length ? rows.map((m) => (
        <div key={m.url} className="border-b border-border px-4 py-2.5 last:border-0" data-chat-message>
          <p className="line-clamp-2 text-sm">{m.text}</p>
          <p className="text-xs text-muted-foreground">#{m.channel} · {m.createdAt.slice(0, 10)}{m.replies ? ` · ${m.replies} 条回复` : ""} · <a className="nr-link" href={safeLink(m.url)} target="_blank" rel="noreferrer">打开</a></p>
        </div>
      )) : <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>}
    </Card>
  );
  return (
    <PageContainer className="nr-data-page">
      <PageHeader title={name} description={`${name} 选中频道里的消息和提问，每天读一次。`} actions={view?.connected ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void sync()}><RefreshCw data-icon="inline-start" />{busy ? "正在读取…" : "立即读取"}</Button> : undefined} />
      <RangePicker value={range} onChange={setRange} summary={w ? `${w.start} 至 ${w.end} · 对比前 ${w.days} 天` : undefined} />
      {error ? <LoadError title={`${name} 没有读出来`} message={error instanceof Error ? error.message : "请稍后再试"} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<MessagesSquare />} title={`接入 ${name} 后，这里显示频道里的提问和没人回的问题`} description={platform === "discord" ? "用你们自己建的 Discord 机器人，粘贴 token、选频道就行，免费。" : "用工作区里的内部应用，粘贴 token、选频道就行，免费。"} action={<Button onClick={() => navigate(`/connections?source=${platform}`)}>接入 {name}</Button>} /> : null}
      {view?.connected ? (
        <>
          <p className="nr-footnote">{where}{view.lastRun ? ` · 上次读取 ${new Date(view.lastRun.at).toLocaleString("zh-CN")}` : ""}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          {view.notes!.map((n) => <p key={n} className="nr-data-note">{n}</p>)}
          {view.series!.filter((p) => p.value !== null).length > 1 ? (
            <Card className="gap-3 px-4">
              <h2 className="text-sm font-semibold">每天的消息</h2>
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={view.series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={40} />
                    <Tooltip />
                    <Area isAnimationActive={false} type="linear" dataKey="value" name="消息" stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {list("可能没人回的提问", view.open!, "所选时间内没有发现没人回的提问。", true)}
            <Card className="gap-0 py-0">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">频道</h2>
              {view.channels!.length ? view.channels!.map((c) => (
                <div key={c.platform + c.channel} className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-sm last:border-0" data-chat-channel={c.channel}><span className="truncate">#{c.channel}</span><span className="shrink-0 tabular-nums text-muted-foreground">{c.messages} 条 · {c.questions} 问{c.open ? ` · ${c.open} 没人回` : ""}</span></div>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">所选时间内没有消息。</p>}
            </Card>
          </div>
          {list("回复最多", view.busiest!, "所选时间内没有带回复的消息。", false)}
        </>
      ) : null}
    </PageContainer>
  );
}
