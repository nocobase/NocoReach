import { $t, $tj } from "@/i18n";
// Discord or Slack (社区; one page each since 2026-10-04): the chosen channels read once a day — messages and questions in
// the range, per channel, the questions that may be unanswered and the threads with the most replies.
import { useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@/lib/reach-api";
import { MessagesSquare, RefreshCw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "@/components/reach/states";
import { Button } from "@/components/reach-ui/button";
import { Card } from "@/components/reach-ui/card";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker, useRange } from "./range-picker";
import { MetricTile, type Metric } from "./data-parts";
import { safeLink } from "./analytics";
import { HandOffBar } from "./hand-off-bar";
import { AllCheck, RowCheck, useTickedList, type Selection } from "@/components/reach/hand-off-slot";
import { discussionsDraft, replyDraft } from "./seo-hand-off";
import "./data-views.css";
import { NotesTip } from "@/components/reach/info-tip";

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
    try { const r = await api.action<{ read: number; errors: string[] }>("nrChat", "sync", { method: "POST", body: { projectId: project!.id, platform }, unwrap: "data" }); toast.success(r.errors.length ? $t("部分没有读完：{0}",{0:$t(r.errors[0])}) : $t("读到 {0} 条",{0:r.read})); setNonce((n) => n + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : $t("没有读完")); }
    finally { setBusy(false); }
  };
  const w = view?.window, where = view?.side?.name ? `${platform === "discord" ? $t("服务器") : $t("工作区")}：${view.side.name}` : "";
  const asItem = (m: Message) => ({ title: m.text.replace(/\s+/g, " ").slice(0, 120), url: m.url, meta: `#${m.channel} · ${m.createdAt.slice(0, 10)}` });
  const open = useTickedList(`${platform}-open`, view?.connected ? view.open : undefined, (m) => m.url, (ticked) => ({ playbookId: "community-reply", description: $t("这些提问合成一个任务，让 Agent 各起草一条回复，审核后你复制去回复。"), draft: () => replyDraft(name, $t("没人回的提问"), ticked.map(asItem)) }));
  const busiest = useTickedList(`${platform}-busiest`, view?.connected ? view.busiest : undefined, (m) => m.url, (ticked) => ({ playbookId: "community-summary", description: $t("这些消息合成一个任务，让 Agent 归类、找文档里有没有答案、给出该补的内容，确认后立即开始。"), draft: () => discussionsDraft(name, $t("消息"), ticked.map(asItem)) }));
  const list = (title: string, rows: Message[], empty: string, selection: Selection) => (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2"><AllCheck selection={selection} count={rows.length} /><h2 className="text-sm font-semibold">{title}</h2></div>
      {rows.length ? rows.map((m) => (
        <div key={m.url} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0" data-chat-message>
          <span className="pt-0.5"><RowCheck selection={selection} k={m.url} label={m.text.slice(0, 60)} /></span><div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm">{m.text}</p>
          <p className="text-xs text-muted-foreground">#{m.channel} · {m.createdAt.slice(0, 10)}{m.replies ? $t(" · {0} 条回复",{0:m.replies}) : ""} · <a className="nr-link" href={safeLink(m.url)} target="_blank" rel="noreferrer">{$t("打开")}</a></p>
        </div></div>
      )) : <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>}
    </Card>
  );
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title={name} description={$t("{0} 选中频道里的消息和提问，每天读一次。",{0:name})} actions={view?.connected ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void sync()}><RefreshCw data-icon="inline-start" />{busy ? $t("正在读取…") : $t("立即读取")}</Button> : undefined} />
      <RangePicker value={range} onChange={setRange} summary={w ? $t("{0} 至 {1} · 对比前 {2} 天",{0:w.start,1:w.end,2:w.days}) : undefined} />
      {error ? <LoadError title={$t("{0} 没有读出来",{0:name})} message={error instanceof Error ? error.message : $t("请稍后再试")} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<MessagesSquare />} title={$t("接入 {0} 后，这里显示频道里的提问和没人回的问题",{0:name})} description={platform === "discord" ? $t("用你们自己建的 Discord 机器人，粘贴 token、选频道就行，免费。") : $t("用工作区里的内部应用，粘贴 token、选频道就行，免费。")} action={<Button onClick={() => navigate(`/connections?source=${platform}`)}>{$tj("接入 {0}",{0:name})}</Button>} /> : null}
      {view?.connected ? (
        <>
          <p className="nr-footnote">{where}{view.lastRun ? $t(" · 上次读取 {0}",{0:new Date(view.lastRun.at).toLocaleString("zh-CN")}) : ""}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          
          {view.series!.filter((p) => p.value !== null).length > 1 ? (
            <Card className="gap-3 px-4">
              <h2 className="text-sm font-semibold">{$t("每天的消息")}</h2>
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={view.series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={40} />
                    <Tooltip />
                    <Area isAnimationActive={false} type="linear" dataKey="value" name={$t("消息")} stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {list($t("可能没人回的提问"), view.open!, $t("所选时间内没有发现没人回的提问。"), open)}
            <Card className="gap-0 py-0">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{$t("频道")}</h2>
              {view.channels!.length ? view.channels!.map((c) => (
                <div key={c.platform + c.channel} className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-sm last:border-0" data-chat-channel={c.channel}><span className="truncate">#{c.channel}</span><span className="shrink-0 tabular-nums text-muted-foreground">{$tj("{0} 条 · {1} 问{2}",{0:c.messages,1:c.questions,2:c.open ? $t(" · {0} 没人回",{0:c.open}) : ""})}</span></div>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">{$t("所选时间内没有消息。")}</p>}
            </Card>
          </div>
          {list($t("回复最多"), view.busiest!, $t("所选时间内没有带回复的消息。"), busiest)}
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
