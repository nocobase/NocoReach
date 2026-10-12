import { getCurrentLocale, $t } from "#i18n";
// 下载量 (网站与产品): npm and PyPI downloads per day and per package, and Docker Hub pulls gained between daily samples.
// Ticked packages go to the Agent from the bar at the bottom: why their downloads moved (2026-10-08).
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Package } from "lucide-react";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker, useRange } from "./range-picker";
import { MetricTile, type Metric } from "./data-parts";
import { safeLink } from "./analytics";
import "./data-views.css";
import { NotesTip } from "#components/reach/info-tip";
import { AllCheck, RowCheck, useTickedList } from "#components/reach/hand-off-slot";
import { HandOffBar } from "./hand-off-bar";
import { packagesDraft } from "./seo-hand-off";

type Pkg = { id: string; registry: "npm" | "pypi" | "docker"; name: string; title: string; url: string; value: number | null; previous: number | null; change: number | null; total: number | null };
type View = { connected: boolean; window?: { start: string; end: string; days: number }; cutoff?: string | null; kpis?: Metric[]; notes?: string[]; series?: { date: string; value: number | null }[]; packages?: Pkg[] };
const REGISTRY: Record<Pkg["registry"], string> = { npm: "npm", pypi: "PyPI", docker: "Docker Hub" };
// Full numbers in the table (the tiles shorten large ones).
const full = (v: number | null) => (v === null ? "—" : v.toLocaleString(getCurrentLocale()));

export default function DataDownloads() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:downloads:${project.id}:${JSON.stringify(range)}` : null, () => api.action<View>("nrDataViews", "downloads", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const w = view?.window;
  const packages = useTickedList("packages", view?.connected ? view.packages : undefined, (p) => p.id, (ticked) => ({ playbookId: "change-research", noun: $t('dataDownloads.packagesSelected'), description: $t('dataDownloads.tickedPackagesBecomeOneTask'), draft: () => packagesDraft(ticked.map((p) => ({ title: p.title, registry: REGISTRY[p.registry], value: p.value, previous: p.previous, change: p.change })), w ? $t('common.range',{0:w.start,1:w.end}) : "") }));
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title={$t('common.downloads')} description={$t('dataDownloads.dailyDownloadsProductNpmPypi')} />
      <RangePicker value={range} onChange={setRange} summary={w ? $t('dataDownloads.comparedPreviousDays',{0:w.start,1:w.end,2:w.days,3:view?.cutoff ? $t('dataDownloads.downloadsThrough',{0:view.cutoff}) : ""}) : undefined} />
      {error ? <LoadError title={$t('dataDownloads.notLoadDownloads')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<Package />} title={$t('dataDownloads.oncePackagesConnectedDailyDownloads')} description={$t('dataDownloads.enterNpmPypiPackageNames')} action={<Button onClick={() => navigate("/connections?source=packages")}>{$t('dataDownloads.connectPackages')}</Button>} /> : null}
      {view?.connected ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          
          {view.series!.filter((p) => p.value !== null).length > 1 ? (
            <Card className="gap-3 px-4">
              <h2 className="text-sm font-semibold">{$t('dataDownloads.dailyDownloadsNpmPypiCombined')}</h2>
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={view.series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={56} />
                    <Tooltip />
                    <Area isAnimationActive={false} type="linear" dataKey="value" name={$t('common.downloads')} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}
          <Card className="gap-0 py-0">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{$t('dataDownloads.perPackage')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr className="border-b border-border"><th className="w-10 py-2 pl-4"><AllCheck selection={packages} count={view.packages!.length} /></th><th className="px-4 py-2 text-left font-normal">{$t('dataDownloads.package')}</th><th className="px-4 py-2 text-left font-normal">{$t('dataDownloads.source')}</th><th className="px-4 py-2 text-right font-normal">{$t('common.selectedPeriod')}</th><th className="px-4 py-2 text-right font-normal">{$t('dataDownloads.previousPeriod')}</th><th className="px-4 py-2 text-right font-normal">{$t('common.change')}</th><th className="px-4 py-2 text-right font-normal">{$t('dataDownloads.totalPulls')}</th></tr></thead>
                <tbody>
                  {view.packages!.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0" data-package={p.id}>
                      <td className="w-10 py-2.5 pl-4"><RowCheck selection={packages} k={p.id} label={p.title} /></td>
                      <td className="px-4 py-2.5"><a className="nr-link" href={safeLink(p.url)} target="_blank" rel="noreferrer">{p.title}</a>{p.title !== p.name ? <span className="ml-2 text-xs text-muted-foreground">{p.name}</span> : null}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{REGISTRY[p.registry]}{p.registry === "docker" ? $t('dataDownloads.pulls') : ""}</td>
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
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
