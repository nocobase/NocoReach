// 下载量 (网站与产品): npm and PyPI downloads per day and per package, and Docker Hub pulls gained between daily samples.
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Package } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker, useRange } from "./range-picker";
import { MetricTile, type Metric } from "./data-parts";
import { safeLink } from "./analytics";
import "./data-views.css";
import { NotesTip } from "@/components/reach/info-tip";

type Pkg = { id: string; registry: "npm" | "pypi" | "docker"; name: string; title: string; url: string; value: number | null; previous: number | null; change: number | null; total: number | null };
type View = { connected: boolean; window?: { start: string; end: string; days: number }; cutoff?: string | null; kpis?: Metric[]; notes?: string[]; series?: { date: string; value: number | null }[]; packages?: Pkg[] };
const REGISTRY: Record<Pkg["registry"], string> = { npm: "npm", pypi: "PyPI", docker: "Docker Hub" };
// Full numbers in the table (the tiles shorten large ones).
const full = (v: number | null) => (v === null ? "—" : v.toLocaleString());

export default function DataDownloads() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:downloads:${project.id}:${JSON.stringify(range)}` : null, () => api.action<View>("nrDataViews", "downloads", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const w = view?.window;
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title="下载量" description="产品在 npm、PyPI 每天的下载量，以及 Docker Hub 的拉取次数。" />
      <RangePicker value={range} onChange={setRange} summary={w ? `${w.start} 至 ${w.end} · 对比前 ${w.days} 天${view?.cutoff ? ` · 下载量截至 ${view.cutoff}` : ""}` : undefined} />
      {error ? <LoadError title="下载量没有读出来" message={error instanceof Error ? error.message : "请稍后再试"} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<Package />} title="接入软件包后，这里显示每天的下载量" description="填 npm、PyPI 的包名或 Docker Hub 的镜像名，不需要账号。" action={<Button onClick={() => navigate("/connections?source=packages")}>接入软件包</Button>} /> : null}
      {view?.connected ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          
          {view.series!.filter((p) => p.value !== null).length > 1 ? (
            <Card className="gap-3 px-4">
              <h2 className="text-sm font-semibold">每日下载量（npm 与 PyPI 合计）</h2>
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={view.series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={56} />
                    <Tooltip />
                    <Area isAnimationActive={false} type="linear" dataKey="value" name="下载量" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}
          <Card className="gap-0 py-0">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">每个包</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 text-left font-normal">包</th><th className="px-4 py-2 text-left font-normal">来源</th><th className="px-4 py-2 text-right font-normal">所选时间</th><th className="px-4 py-2 text-right font-normal">前一期</th><th className="px-4 py-2 text-right font-normal">变化</th><th className="px-4 py-2 text-right font-normal">累计拉取</th></tr></thead>
                <tbody>
                  {view.packages!.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0" data-package={p.id}>
                      <td className="px-4 py-2.5"><a className="nr-link" href={safeLink(p.url)} target="_blank" rel="noreferrer">{p.title}</a>{p.title !== p.name ? <span className="ml-2 text-xs text-muted-foreground">{p.name}</span> : null}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{REGISTRY[p.registry]}{p.registry === "docker" ? " · 拉取" : ""}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{full(p.value)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{full(p.previous)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${p.change === null ? "text-muted-foreground" : p.change >= 0 ? "nr-up" : "nr-down"}`}>{p.change === null ? "—" : `${p.change >= 0 ? "+" : ""}${(p.change * 100).toFixed(0)}%`}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{p.registry === "docker" ? full(p.total) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </PageContainer>
  );
}
