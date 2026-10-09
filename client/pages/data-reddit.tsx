import { $t, $tj } from "@/i18n";
// Reddit (社区): threads that name the product, found once a week through a Google search of reddit.com, with their
// subreddits; visits from Reddit when GA4 is connected.
import { useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@/lib/nocoreach-api";
import { MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "@/lib/toast";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/seo/stat-tile";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker, useRange } from "./range-picker";
import { MetricTile, type Metric } from "./data-parts";
import { safeLink } from "./analytics";
import { HandOffBar } from "./hand-off-bar";
import { AllCheck, RowCheck, useTickedList } from "@/components/reach/hand-off-slot";
import { discussionsDraft } from "./seo-hand-off";
import "./data-views.css";
import { NotesTip } from "@/components/reach/info-tip";

type Post = { id: string; title: string; url: string; subreddit: string; snippet: string; postedAt: string | null; firstSeenAt: string; term: string };
type View = { connected: boolean; terms?: string[]; window?: { start: string; end: string; days: number }; retainedFrom?: string | null; lastRun?: { at: string; ok: boolean; errors: string[] } | null; total?: number; visits?: { sessions: number; views: number; conversions: number; previous: number } | null; kpis?: Metric[]; notes?: string[]; subreddits?: { name: string; count: number }[]; posts?: Post[] };

export default function DataReddit() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:reddit:${project.id}:${JSON.stringify(range)}:${nonce}` : null, () => api.action<View>("nrReddit", "view", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const check = async () => {
    setBusy(true);
    try { const r = await api.action<{ added: number; errors: string[] }>("nrReddit", "check", { method: "POST", body: { projectId: project!.id }, unwrap: "data" }); toast.success(r.errors.length ? $t("部分没有查完：{0}",{0:$t(r.errors[0])}) : r.added ? $t("新发现 {0} 个帖子",{0:r.added}) : $t("没有新帖子")); setNonce((n) => n + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : $t("没有查完")); }
    finally { setBusy(false); }
  };
  const w = view?.window, visits = view?.visits;
  const posts = useTickedList("reddit-posts", view?.connected ? view.posts : undefined, (p) => String(p.id), (ticked) => ({ playbookId: "community-summary", description: $t("这些帖子合成一个任务，让 Agent 整理大家在问什么、该补什么，确认后立即开始。"), draft: () => discussionsDraft("Reddit", $t("帖子"), ticked.map((p) => ({ title: p.title, url: p.url, meta: `r/${p.subreddit} · ${p.postedAt || p.firstSeenAt.slice(0, 10)}`, excerpt: p.snippet }))) }));
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title="Reddit" description={$t("Reddit 上提到产品的帖子，每周在 Google 里搜一次。")} actions={view?.connected ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void check()}><RefreshCw data-icon="inline-start" />{busy ? $t("正在查找…") : $t("立即查找")}</Button> : undefined} />
      <RangePicker value={range} onChange={setRange} summary={w ? $t("{0} 至 {1} · 对比前 {2} 天",{0:w.start,1:w.end,2:w.days}) : undefined} />
      {error ? <LoadError title={$t("Reddit 讨论没有读出来")} message={error instanceof Error ? error.message : $t("请稍后再试")} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<MessageCircle />} title={$t("接入 Reddit 讨论后，这里显示提到产品的帖子和版块")} description={$t("通过已接入的 DataForSEO 每周在 Google 里搜一次，不需要 Reddit 账号。")} action={<Button onClick={() => navigate("/connections?source=reddit")}>{$t("接入 Reddit 讨论")}</Button>} /> : null}
      {view?.connected ? (
        <>
          <p className="nr-footnote">{$tj("搜索词：{0}{1}",{0:view.terms!.join("、"),1:view.lastRun ? $t(" · 上次查找 {0}",{0:new Date(view.lastRun.at).toLocaleString("zh-CN")}) : ""})}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}
            {visits ? <Card className="gap-0 p-4" data-metric={$t("来自 Reddit 的访问")}><StatTile label={$t("来自 Reddit 的访问")} value={visits.sessions.toLocaleString()} delta={visits.previous ? { change: (visits.sessions - visits.previous) / visits.previous, better: visits.sessions >= visits.previous } : null} hint={$t("浏览 {0} · 关键事件 {1}",{0:visits.views.toLocaleString(),1:visits.conversions.toLocaleString()})} /></Card> : null}
          </div>
          
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="gap-0 py-0">
              <div className="flex items-center gap-3 border-b border-border px-4 py-2"><AllCheck selection={posts} count={view.posts!.length} /><h2 className="text-sm font-semibold">{$t("帖子")}</h2></div>
              {view.posts!.length ? view.posts!.map((p) => (
                <div key={p.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0" data-post={p.id}>
                  <span className="pt-0.5"><RowCheck selection={posts} k={String(p.id)} label={p.title || p.url} /></span><div className="min-w-0 flex-1">
                  <a className="nr-link font-medium" href={safeLink(p.url)} target="_blank" rel="noreferrer">{p.title || p.url}</a>
                  {p.snippet ? <p className="line-clamp-2 text-sm text-muted-foreground">{p.snippet}</p> : null}
                  <p className="text-xs text-muted-foreground">r/{p.subreddit} · {p.postedAt ? $t("发帖 {0}",{0:p.postedAt}) : $t("发帖日期未知 · {0} 找到",{0:p.firstSeenAt.slice(0, 10)})}</p>
                </div></div>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">{$t("所选时间内没有新帖子。")}</p>}
            </Card>
            <Card className="gap-0 py-0">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{$t("版块")}</h2>
              {view.subreddits!.length ? view.subreddits!.map((s) => (
                <a key={s.name} className="flex items-center justify-between border-b border-border px-4 py-2 text-sm last:border-0 hover:bg-muted/50" href={`https://www.reddit.com/r/${s.name}/`} target="_blank" rel="noreferrer"><span>r/{s.name}</span><span className="tabular-nums text-muted-foreground">{$tj("{0} 个",{0:s.count})}</span></a>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">{$t("所选时间内没有。")}</p>}
            </Card>
          </div>
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
