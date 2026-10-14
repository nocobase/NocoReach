import { $t, $tj } from "@/i18n";
// 访问 (网站与产品, GA4), rebuilt 2026-10-14 after GA4's own reports (user request: show everything GA4 has). From the
// top: 今天 (实时 and today against yesterday and last week, today.tsx), the range, GA4's eight figures (a figure picks
// the line below it), where sessions come from (channels with AI 助手, new and returning visitors, devices) and the
// report tables (reports.tsx). The numbers are read live from GA4 for a window ending at the synced cutoff, like the
// other data pages; the line runs on to yesterday with the days after the cutoff dotted.
import { useState } from "react";
import { useNavigate } from "react-router";
import { BarChart3 } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { nocobaseClient as api } from "@/lib/nocoreach-api";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "@/components/reach/states";
import { NotesTip, InfoTip } from "@/components/reach/info-tip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useProject } from "../reach-data";
import { useFreshData } from "../workspace-cache";
import { RangePicker, useRange } from "../range-picker";
import { MetricTile } from "../data-parts";
import { HandOffBar } from "../hand-off-bar";
import { ReportCard } from "./reports";
import { TodayCard } from "./today";
import { change, channelName, deviceName, KPI_KEYS, METRICS, show, visitorName, type MetricKey, type Report, type Row } from "./model";
import "../data-views.css";

const RANGES = ["7", "28", "90", "3m", "12m"];

export default function DataWebsite() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const r = RANGES.includes(range.range) ? range.range : "28";
  const [metric, setMetric] = useState<MetricKey>("users");
  const { data: report, error } = useFreshData<Report>(project ? `data-view:website:${project.id}:${r}` : null, () => api.action<Report>("nrDataViews", "website", { method: "POST", body: { projectId: project!.id, range: r }, unwrap: "data" }));
  const w = report?.window;
  const ready = Boolean(report?.connected && report.cutoff && report.totals);
  const pageUrl = (page: string) => (page.startsWith("http") ? page : `https://${project?.domains?.[0] ?? ""}${page}`);
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={report?.notes} />} title={$t("访问")} description={$t("网站的访客、来源、页面和事件，按 GA4 的报表整理。")} />
      {report?.connected ? <TodayCard projectId={project?.id} /> : null}
      <RangePicker value={{ range: r }} onChange={setRange} options={RANGES} summary={w ? $t("{0} 至 {1} · 对比前 {2} 天 · 数据截至 {3}", { 0: w.start, 1: w.end, 2: w.days, 3: report?.cutoff }) : undefined} />
      {error ? <LoadError title={$t("访问数据没有读出来")} message={error instanceof Error ? $t(error.message) : $t("请稍后再试")} /> : null}
      {!report && !error ? <ListSkeleton rows={6} /> : null}
      {report && (!report.connected || !report.cutoff) ? <EmptyState icon={<BarChart3 />} title={$t("接入 GA4 后，这里显示网站的访问、来源和页面")} description={$t("授权只读取数据，每天自动同步一次。")} action={<Button onClick={() => navigate("/connections?source=ga4")}>{$t("接入 GA4")}</Button>} /> : null}
      {ready ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label={$t("指标")}>
            {KPI_KEYS.map((key) => {
              const m = METRICS[key], value = m.of(report!.totals!.current ?? {}), previous = report!.totals!.previous ? m.of(report!.totals!.previous) : null;
              return (
                <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)} data-metric={m.label} className={cn("rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50", metric === key && "ring-2 ring-primary")}>
                  <Card className="h-full gap-0 p-4"><MetricTile m={{ key, label: m.label, value, previous, complete: true, change: change(value, previous), format: m.format === "count" ? undefined : m.format }} /></Card>
                </button>
              );
            })}
          </div>
          <TrendCard report={report!} metric={metric} />
          <div className="grid gap-3 lg:grid-cols-2">
            <ChannelCard report={report!} />
            <AudienceCard report={report!} />
          </div>
          <ReportCard report={report!} range={r} projectId={project?.id} toUrl={pageUrl} />
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

// The chosen figure per day against the same day of the period before; the days after the cutoff dotted (初步).
function TrendCard({ report, metric }: { report: Report; metric: MetricKey }) {
  const m = METRICS[metric], cutoff = report.cutoff!;
  const points = (report.daily ?? []).map((d, i) => {
    const before = report.previousDaily?.[i];
    const value = m.of(d);
    return { date: d.date, value: d.date <= cutoff ? value : null, fresh: d.date >= cutoff ? value : null, previous: before ? m.of(before) : null, previousDate: before?.date ?? "" };
  });
  const fresh = points.some((p) => p.date > cutoff);
  if (points.filter((p) => p.value !== null).length < 2) return null;
  const axis = (v: number) => (m.format === "percent" ? `${Math.round(v * 100)}%` : m.format === "duration" ? `${Math.round(v)}s` : m.format === "decimal" ? v.toFixed(1) : Math.round(v).toLocaleString());
  return (
    <Card className="gap-3 px-4">
      <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{$tj("每天的{0}", { 0: $t(m.label) })}</h2><InfoTip label={$t("图怎么看")}>{$t("点上面的指标切换这条线。虚线是前一期同一天{0}。", { 0: fresh ? $t("；点线是数据截止日之后还没定稿的初步数据，不算进上面的数字") : "" })}</InfoTip></div>
      <div className="nr-chart-box" data-website-chart={metric}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={points} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
            <YAxis fontSize={11} width={56} tickFormatter={axis} />
            <Tooltip formatter={(v) => show(Number(v), m.format)} labelFormatter={(d, p) => `${d}${p?.[0]?.payload?.previousDate ? $t(" · 前一期 {0}", { 0: p[0].payload.previousDate }) : ""}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area isAnimationActive={false} type="linear" dataKey="value" name={$t(m.label)} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.1} />
            <Line isAnimationActive={false} type="linear" dataKey="previous" name={$t("前一期")} stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
            {fresh ? <Line isAnimationActive={false} type="linear" dataKey="fresh" name={$t("初步数据")} stroke="var(--chart-3)" strokeDasharray="2 3" dot={false} /> : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// Shares of sessions, which add up across the rows of one dimension (users do not).
function Bars({ rows, total, name, accent }: { rows: Row[]; total: number; name: (r: Row) => string; accent?: (r: Row) => boolean }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => {
        const share = total ? (r.sessions ?? 0) / total : 0;
        return (
          <li key={r.key} className="grid grid-cols-[7rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-sm">
            <span className="truncate" title={name(r)}>{name(r)}</span>
            <span className="h-2 overflow-hidden rounded-sm bg-muted"><span className={cn("block h-full rounded-sm", accent?.(r) ? "bg-nr-ink-violet" : "bg-primary/70")} style={{ width: `${Math.max(share * 100, share ? 1 : 0)}%` }} /></span>
            <span className="text-right tabular-nums text-muted-foreground">{show(share, "percent")}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ChannelCard({ report }: { report: Report }) {
  const total = report.totals?.current?.sessions ?? 0;
  const rows = (report.tables?.channel ?? []).slice(0, 7);
  const ai: Row | null = report.ai?.sessions ? { key: "ai", dims: {}, sessions: report.ai.sessions } : null;
  return (
    <Card className="gap-3 px-4">
      <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{$t("渠道")}</h2><InfoTip label={$t("渠道怎么分")}>{$t("按 GA4 的默认渠道分组，占全部会话的比例。AI 助手是按来源名找出的 ChatGPT、Perplexity 等，GA4 把它们算在引荐等渠道里，所以单独列在下面，不和上面相加。")}</InfoTip></div>
      {rows.length ? <Bars rows={rows} total={total} name={(r) => channelName(r.dims.sessionDefaultChannelGroup)} /> : <p className="text-sm text-muted-foreground">{$t("所选时间内没有数据")}</p>}
      {ai ? <div className="border-t border-border pt-2"><Bars rows={[ai]} total={total} name={() => $t("其中 AI 助手")} accent={() => true} /></div> : null}
    </Card>
  );
}

function AudienceCard({ report }: { report: Report }) {
  const total = report.totals?.current?.sessions ?? 0;
  const visitors = report.tables?.newVsReturning?.filter((r) => r.dims.newVsReturning === "new" || r.dims.newVsReturning === "returning") ?? [];
  const devices = (report.tables?.device ?? []).slice(0, 4);
  return (
    <Card className="gap-3 px-4">
      <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{$t("新访客与回访 · 设备")}</h2><InfoTip label={$t("怎么算")}>{$t("占全部会话的比例。新访客是第一次来的人带来的会话，回访是来过的人又来的会话。")}</InfoTip></div>
      {visitors.length ? <Bars rows={visitors} total={total} name={(r) => visitorName(r.dims.newVsReturning)} /> : null}
      {devices.length ? <div className={cn(visitors.length && "border-t border-border pt-2")}><Bars rows={devices} total={total} name={(r) => deviceName(r.dims.deviceCategory)} /></div> : null}
      {!visitors.length && !devices.length ? <p className="text-sm text-muted-foreground">{$t("所选时间内没有数据")}</p> : null}
    </Card>
  );
}
