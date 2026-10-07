import { $t, $tj } from "@/i18n";
// GitHub (网站与产品): the repository's stars, forks and views for the period against the one before, daily stars (release
// lines left out 2026-10-04: with alphas and betas there were too many to read), views and clones (Traffic), referring sites and popular pages, and the most discussed Issues and
// Discussions (both can go to the Agent). Same parts as the other data pages (2026-10-04).
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { Github } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import { NotesTip, InfoTip } from "@/components/reach/info-tip";

type Day = { date: string; stars?: number | null; forks?: number | null; views?: number; uniques?: number; clones?: number };
type View = {
  connected: boolean; repo?: string; url?: string; window?: { start: string; end: string; days: number }; notes?: string[]; kpis?: Metric[]; daily?: Day[];
  releases?: { tag: string; publishedAt: string; url: string }[];
  referrers?: { date: string; items: { referrer: string; count: number; uniques: number }[] } | null;
  paths?: { date: string; items: { path: string; title: string; count: number; uniques: number }[] } | null;
  issues?: { total: number; top: { title: string; url: string; comments: number; state: string }[] } | null;
  discussions?: { enabled?: boolean; total?: number; answered?: number; categories?: Record<string, number>; top?: { title: string; url: string; comments: number; upvotes: number; answered: boolean; answerable: boolean; category: string }[] } | null;
};
const short = (d: string) => d.slice(5);
const Row = ({ title, url, meta }: { title: string; url: string; meta: string }) => (
  <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
    <a className="nr-link min-w-0" href={safeLink(url)} target="_blank" rel="noreferrer">{title}</a>
    <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
  </div>
);
const Section = ({ title, action, note, children, ...rest }: { title: string; action?: React.ReactNode; note?: string; children: React.ReactNode; [k: `data-${string}`]: unknown }) => (
  <Card className="gap-0 py-0" {...rest}>
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2"><h2 className="text-sm font-semibold">{title}</h2>{action}</div>
    {note ? <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">{note}</p> : null}
    {children}
  </Card>
);
const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;

export default function DataGitHub() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:github:${project.id}:${JSON.stringify(range)}` : null, () => api.action<View>("nrDataViews", "github", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const w = view?.window, hasTraffic = Boolean(view?.daily?.some((d) => d.views !== undefined)), hasStars = Boolean(view?.daily?.some((d) => typeof d.stars === "number"));
  const d = view?.discussions;
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title="GitHub" description={view?.repo ? <a className="nr-link" href={view.url} target="_blank" rel="noreferrer">{view.repo}</a> : $t("仓库的 Star、Fork、版本、Issues 与访问。")} />
      <RangePicker value={range} onChange={setRange} summary={w ? $t("{0} 至 {1} · 对比前 {2} 天",{0:w.start,1:w.end,2:w.days}) : undefined} />
      {error ? <LoadError title={$t("GitHub 数据没有读出来")} message={error instanceof Error ? error.message : $t("请稍后再试")} /> : null}
      {!view && !error ? <ListSkeleton rows={5} /> : null}
      {view && !view.connected ? <EmptyState icon={<Github />} title={$t("接入 GitHub 仓库后，这里显示 Star、Fork、仓库浏览与来源网站")} description={$t("公开仓库不需要凭据；接入只读 token 后还能看到 Traffic，并补全 Star 历史。")} action={<Button onClick={() => navigate("/connections?source=github")}>{$t("接入 GitHub")}</Button>} /> : null}
      {view?.connected ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">{view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          
          <Card className="gap-3 px-4">
            <h2 className="text-sm font-semibold">{$t("每天新增的 Star")}</h2>
            {hasStars ? (
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={view.daily} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={short} minTickGap={24} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={40} />
                    <Tooltip />
                    <Bar isAnimationActive={false} dataKey="stars" name={$t("新增 Star")} fill="var(--chart-2)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-sm text-muted-foreground">{$t("所选时间内还没有每天的 Star 记录。")}</p>}
          </Card>
          <Card className="gap-3 px-4">
            <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{$t("仓库浏览与克隆")}</h2><InfoTip label={$t("图怎么看")}>{$t("独立访客按天统计，不能相加成整段时间的独立访客。GitHub 只保留最近 14 天，接入后每天归档。")}</InfoTip></div>
            {hasTraffic ? (
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={view.daily} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={short} minTickGap={24} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={40} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area isAnimationActive={false} dataKey="views" name={$t("浏览")} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.12} />
                    <Area isAnimationActive={false} dataKey="uniques" name={$t("当天独立访客")} stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.12} />
                    <Area isAnimationActive={false} dataKey="clones" name={$t("克隆")} stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-sm text-muted-foreground">{view.notes!.some((n) => n.includes("Traffic")) ? $t("接入 Traffic 后显示。") : $t("所选时间内没有 Traffic 记录。")}</p>}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={$t("来源网站")} note={view.referrers ? $t("GitHub 只给最近 14 天（记录于 {0}）",{0:view.referrers.date}) : undefined}>
              {view.referrers ? view.referrers.items.map((r) => <div key={r.referrer} className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-sm last:border-0"><span className="truncate">{r.referrer}</span><span className="shrink-0 tabular-nums text-muted-foreground">{$tj("浏览 {0} · 访客 {1}",{0:r.count.toLocaleString(),1:r.uniques.toLocaleString()})}</span></div>) : <Empty>{$t("接入 Traffic 后显示。")}</Empty>}
            </Section>
            <Section title={$t("热门页面")} note={view.paths ? $t("GitHub 只给最近 14 天（记录于 {0}）",{0:view.paths.date}) : undefined}>
              {view.paths ? view.paths.items.map((p) => <div key={p.path} className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-sm last:border-0"><span className="min-w-0"><span className="block truncate">{p.title || p.path}</span><span className="block truncate text-xs text-muted-foreground">{p.path}</span></span><span className="shrink-0 tabular-nums text-muted-foreground">{$tj("浏览 {0}",{0:p.count.toLocaleString()})}</span></div>) : <Empty>{$t("接入 Traffic 后显示。")}</Empty>}
            </Section>
          </div>
          <Section data-discussions title="Discussions"
            action={d?.top?.length ? <SectionHandOff projectId={project?.id} playbookId="community-summary" description={$t("讨论最多的 Discussions 合成一个任务，让 Agent 归类问题、看哪些能用文档回答，确认后立即开始。")} draft={() => discussionsDraft(`GitHub Discussions（${view.repo}）`, $t("讨论"), d!.top!.map((x) => ({ title: x.title, url: x.url, meta: $t("{0} 条评论 · {1}",{0:x.comments,1:x.answerable ? (x.answered ? $t("已有答案") : $t("还没有答案")) : x.category}) })))} /> : undefined}
            note={d && d.enabled !== false ? $t("近 90 天共 {0} 个讨论，{1} 个已有答案{2}。按讨论数排序，不随时间范围变化。",{0:d.total,1:d.answered,2:Object.keys(d.categories || {}).length ? $t("；分类：{0}",{0:Object.entries(d.categories!).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join("、")}) : ""}) : undefined}>
            {!d ? <Empty>{$t("填好 Traffic 的只读 token 后，每天读取近 90 天的讨论。")}</Empty> : d.enabled === false ? <Empty>{$t("这个仓库没有开启 Discussions。")}</Empty> : d.top!.map((x) => <Row key={x.url} title={x.title} url={x.url} meta={$t("{0} 条评论 · {1}",{0:x.comments,1:x.answerable ? (x.answered ? $t("已有答案") : $t("还没有答案")) : x.category})} />)}
          </Section>
          <Section title="Issues"
            action={view.issues?.top?.length ? <SectionHandOff projectId={project?.id} playbookId="community-summary" description={$t("讨论最多的 Issues 合成一个任务，让 Agent 分出哪些能用文档回答、哪些要改产品，确认后立即开始。")} draft={() => discussionsDraft(`GitHub Issues（${view.repo}）`, "issue", view.issues!.top.map((i) => ({ title: i.title, url: i.url, meta: $t("{0} 条评论 · {1}",{0:i.comments,1:i.state === "open" ? $t("未关闭") : $t("已关闭")}) })))} /> : undefined}
            note={view.issues ? $t("近 90 天共 {0} 个 issue，按讨论数排序，不随时间范围变化。",{0:view.issues.total}) : undefined}>
            {view.issues ? view.issues.top.map((i) => <Row key={i.url} title={i.title} url={i.url} meta={$t("{0} 条评论 · {1}",{0:i.comments,1:i.state === "open" ? $t("未关闭") : $t("已关闭")})} />) : <Empty>{$t("下一次同步后显示。")}</Empty>}
          </Section>
        </>
      ) : null}
    </PageContainer>
  );
}
