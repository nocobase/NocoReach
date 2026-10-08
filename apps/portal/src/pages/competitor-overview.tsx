import { $t, $tj } from "@/i18n";
// 竞品 › 总览 (2026-10-05, after Semrush and Similarweb): our site and each competitor side by side — estimated organic
// search traffic and its year, ranking keywords (DataForSEO, updated monthly by itself) next to Google interest, GitHub
// stars, the AI share of mentions and the last 30 days, all already collected. A row opens the competitor: its traffic
// line, the keywords it ranks for that we do not (to hand to the Agent), its top pages and what it published lately.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { InlineError, ListSkeleton, LoadError } from "@/components/reach/states";
import { NotesTip, WithInfo } from "@/components/reach/info-tip";
import { Tag } from "@/components/reach/tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, useDataTable } from "@/components/seo/data-table";
import { SortableHeader } from "@/components/seo/sortable-header";
import { DetailDrawer } from "./detail-drawer";
import { SectionHandOff } from "./section-hand-off";
import { competitorKeywordsDraft } from "./seo-hand-off";
import { rankOf, rankRequest, type Ranks } from "./keyword-api";
import { help } from "./glossary";
import { CompetitorWatchTab } from "./competitor-watch";

type Gap = { keyword: string; volume: number | null; difficulty: number | null; intent: string | null; position: number | null; url: string | null; traffic: number | null };
type Row = { id: string; name: string; domain: string | null; own: boolean; searched: boolean; checkedAt: string | null; errors: string[]; traffic: number | null; trafficChange: number | null; keywords: number | null; top10: number | null; months: { date: string; etv: number | null; count: number | null }[]; interest: number | null; interestChange: number | null; stars: number | null; starsWeek: number | null; aiShare: number | null; pages30: number; release: string | null; gap: Gap[]; topPages: { url: string; traffic: number | null; keywords: number | null }[]; events: { type: string; title: string; url: string; at: string }[] };
type View = { dataforseo: boolean; market: { locationCode: number; language: string }; marketLabel: string; markets: { locationCode: number; language: string; label: string }[]; refreshing: boolean; sites: Row[]; notes: string[] };
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrCompetitorResearch", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const short = (v: number | null) => (v === null ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1000)}K` : v.toLocaleString());
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const delta = (v: number | null) => (v === null ? null : <span className={v >= 0 ? "text-nr-ink-green" : "text-nr-ink-red"}>{v >= 0 ? "↑" : "↓"}{Math.abs(Math.round(v * 100))}%</span>);
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const helper = createColumnHelper<Row>();
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;

function Spark({ months }: { months: Row["months"] }) {
  const vals = months.map((m) => m.etv).filter((v): v is number => v !== null);
  if (vals.length < 2) return <span className="text-muted-foreground">—</span>;
  const max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1, step = 80 / (vals.length - 1);
  return <svg width="80" height="20" viewBox="0 0 80 20" aria-hidden="true" data-spark><polyline fill="none" stroke="var(--chart-1)" strokeWidth="1.5" points={vals.map((v, i) => `${(i * step).toFixed(1)},${(18 - ((v - min) / span) * 16).toFixed(1)}`).join(" ")} /></svg>;
}

export function CompetitorOverview({ projectId, onManage }: { projectId: number; onManage: () => void }) {
  const navigate = useNavigate();
  const [view, setView] = useState<View>();
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string>();
  const load = () => call<View>(projectId, "view").then((v) => { setView(v); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : $t("竞品总览没有读出来")));
  useEffect(() => { setView(undefined); void load(); }, [projectId]);
  useEffect(() => { if (!view?.refreshing) return; const t = setTimeout(() => void load(), 5000); return () => clearTimeout(t); }, [view]);
  const changeMarket = async (value: string) => {
    const [locationCode, language] = value.split("|");
    try { setView(await call<View>(projectId, "market", { locationCode: Number(locationCode), language })); toast.success($t("正在按新的市场查搜索数据")); }
    catch (e) { toast.error(e instanceof Error ? e.message : $t("没有切换")); }
  };
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    helper.accessor("name", { enableSorting: false, header: () => $t("网站"), cell: ({ row }) => { const r = row.original; return <div className="min-w-0"><span className="flex items-center gap-1.5 font-medium">{r.name}{r.own ? <Tag tone="blue">{$t("我们")}</Tag> : null}</span><span className="block truncate text-xs text-muted-foreground">{r.domain || $t("没有官网")}</span></div>; } }) as ColumnDef<Row>,
    helper.accessor((r) => r.traffic ?? undefined, { id: "traffic", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t("自然搜索流量")} align="right" />, cell: ({ row }) => <span className="inline-flex items-baseline gap-1.5">{short(row.original.traffic)}<span className="text-xs">{delta(row.original.trafficChange)}</span></span>, meta: right }) as ColumnDef<Row>,
    helper.display({ id: "spark", header: () => $t("12 个月"), cell: ({ row }) => <Spark months={row.original.months} /> }) as ColumnDef<Row>,
    helper.accessor((r) => r.keywords ?? undefined, { id: "keywords", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t("排名关键词")} align="right" />, cell: ({ row }) => short(row.original.keywords), meta: right }) as ColumnDef<Row>,
    helper.accessor((r) => r.top10 ?? undefined, { id: "top10", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t("前 10")} align="right" />, cell: ({ row }) => short(row.original.top10), meta: right }) as ColumnDef<Row>,
    helper.accessor((r) => r.interest ?? undefined, { id: "interest", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t("Google 关注度")} align="right" />, cell: ({ row }) => row.original.interest ?? "—", meta: right }) as ColumnDef<Row>,
    helper.accessor((r) => r.stars ?? undefined, { id: "stars", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="GitHub Star" align="right" help={$t("仓库现在的 Star 数，小字是近一周新增。")} />, cell: ({ row }) => <span className="inline-flex items-baseline gap-1.5">{short(row.original.stars)}{row.original.starsWeek ? <span className="text-xs text-muted-foreground">{$tj("+{0}/周",{0:row.original.starsWeek})}</span> : null}</span>, meta: right }) as ColumnDef<Row>,
    helper.accessor((r) => r.aiShare ?? undefined, { id: "ai", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t("AI 提及份额")} align="right" />, cell: ({ row }) => pct(row.original.aiShare), meta: right }) as ColumnDef<Row>,
    helper.display({ id: "recent", header: () => <WithInfo help={help($t("近 30 天"))}>{$t("近 30 天")}</WithInfo>, cell: ({ row }) => { const r = row.original; return <span className="text-xs text-muted-foreground">{$tj("{0} 个新页面{1}",{0:r.pages30,1:r.release ? ` · ${r.release}` : ""})}</span>; } }) as ColumnDef<Row>,
  ], []);
  const rows = view?.sites ?? [];
  const table = useDataTable({ data: rows, columns, withSorting: true, getRowId: (r) => r.id });
  if (error) return <LoadError title={$t("竞品总览没有读出来")} message={error} onRetry={() => void load()} />;
  if (!view) return <ListSkeleton rows={4} />;
  // No competitors yet: the AI suggestions and the form from 动态; the table appears once one is added.
  if (rows.length <= 1) return <CompetitorWatchTab projectId={projectId} onListChange={(n) => { if (n) void load(); }} />;
  const open = rows.find((r) => r.id === openId);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {view.refreshing ? <><LoaderCircle className="size-3.5 animate-spin" />{$t("正在查搜索数据，一般一两分钟…")}</> : view.dataforseo ? $t("搜索数据：{0}，每月自动更新",{0:$t(view.marketLabel)}) : $t("Google 关注度、Star、AI 提及和新页面来自已有数据")}
          <NotesTip notes={view.notes} label={$t("总览的数据从哪来")} side="bottom" />
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {view.dataforseo ? <select aria-label={$t("搜索数据的市场")} className="h-8 rounded-md border bg-background px-2 text-sm" value={`${view.market.locationCode}|${view.market.language}`} disabled={view.refreshing} onChange={(e) => void changeMarket(e.target.value)}>
            {view.markets.map((m) => <option key={`${m.locationCode}|${m.language}`} value={`${m.locationCode}|${m.language}`}>{$t(m.label)}</option>)}
          </select> : null}
          <Button size="sm" variant="outline" onClick={onManage}>{$t("添加或移除竞品")}</Button>
        </div>
      </div>
      {!view.dataforseo ? <p className="text-xs text-muted-foreground">{$t("接入 DataForSEO 后，还能看到每个网站的自然搜索流量、排名关键词和关键词差距（每月约 $0.25）。")}<button type="button" className="nr-link" onClick={() => navigate("/connections?source=keywords")}>{$t("去接入")}</button></p> : null}
      <Card className="gap-0 py-0">
        <DataTable table={table} empty={{ title: $t("还没有竞品") }} onRowClick={(row) => setOpenId(row.original.id)} />
      </Card>
      {open ? <CompetitorDetail projectId={projectId} r={open} market={view.marketLabel} dataforseo={view.dataforseo} onClose={() => setOpenId(undefined)} /> : null}
    </>
  );
}

// One site: its numbers and traffic line; for a competitor also the keyword gap, top pages and recent changes.
function CompetitorDetail({ projectId, r, market, dataforseo, onClose }: { projectId: number; r: Row; market: string; dataforseo: boolean; onClose: () => void }) {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [ranks, setRanks] = useState<Ranks>();
  useEffect(() => { if (r.gap.length) void rankRequest(projectId, r.gap.map((g) => g.keyword)).then(setRanks).catch(() => undefined); }, [r.id]);
  const chosen = r.gap.filter((g) => picked[g.keyword]);
  const tile = (label: string, value: string) => <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground"><WithInfo help={help(label)}>{label}</WithInfo></p><p className="text-xl font-semibold tabular-nums">{value}</p></div>;
  return (
    <DetailDrawer open onClose={onClose} title={r.name} description={`${r.domain || $t("没有官网")}${r.searched ? $t(" · {0} · 更新于 {1}",{0:market,1:new Date(r.checkedAt!).toLocaleDateString("zh-CN")}) : ""}`}
      actions={!r.own && r.gap.length ? <SectionHandOff projectId={projectId} disabled={!chosen.length} playbookId="content-outline" label={chosen.length ? $t("交给 Agent（{0}）",{0:chosen.length}) : $t("交给 Agent")} description={$t("选中的关键词合成一个任务，让 Agent 看看对方排名的页面写了什么，决定本站新写还是改现有页面，确认后立即开始。")} draft={() => competitorKeywordsDraft(r.domain || r.name, market, chosen.map((g) => ({ keyword: g.keyword, position: g.position, volume: g.volume, traffic: g.traffic, url: g.url, difficulty: g.difficulty, intent: g.intent })))} /> : undefined}>
      <div className="space-y-5">
        {r.errors.length ? <InlineError>{$tj("这次没有查全：{0}",{0:$t(r.errors[0])})}</InlineError> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tile($t("自然搜索流量"), short(r.traffic))}{tile($t("排名关键词"), short(r.keywords))}{tile($t("前 10"), short(r.top10))}{tile($t("近 30 天"), $t("{0} 个新页面",{0:r.pages30}))}
        </div>
        {r.months.filter((m) => m.etv !== null).length > 1 ? (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold">{$t("每月自然搜索流量（估算）")}</h3>
            <div className="nr-chart-box" data-traffic-chart>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={r.months} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" fontSize={11} minTickGap={24} />
                  <YAxis fontSize={11} width={44} tickFormatter={(v: number) => short(v)} />
                  <Tooltip formatter={(v) => short(Number(v))} />
                  <Line isAnimationActive={false} type="linear" dataKey="etv" name={$t("自然搜索流量")} stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : !dataforseo || !r.domain ? <p className="text-sm text-muted-foreground">{!r.domain ? $t("没有官网，查不了搜索数据。到“动态”里点这个竞品的编辑，补上官网。") : $t("接入 DataForSEO 后显示搜索流量走势。")}</p> : <p className="text-sm text-muted-foreground">{$t("搜索数据还在查。")}</p>}
        {!r.own && r.searched ? (
          <section className="space-y-1" data-gap>
            <h3 className="text-sm font-semibold"><WithInfo help={$t("对方排进前 20、本站在 DataForSEO 的前 100 名里没有的关键词，按搜索量排；带对方品牌名的词已去掉。“本站”一列是 Search Console 近 28 天的平均排名。")}>{$t("关键词差距：它排得上、我们没有")}</WithInfo></h3>
            {r.gap.length ? (
              <table className="w-full table-fixed text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="w-7" /><th className="py-1 text-left font-normal">{$t("关键词")}</th><th className="w-20 text-right font-normal">{$t("月搜索量")}</th><th className="w-16 text-right font-normal">{$t("它的排名")}</th><th className="w-12 text-right font-normal">{$t("本站")}</th></tr></thead>
                <tbody>{r.gap.map((g) => { const own = rankOf(ranks, g.keyword); return (
                  <tr key={g.keyword} className="border-t" data-gap-keyword={g.keyword}>
                    <td className="py-1.5"><Checkbox aria-label={$t("选择 {0}",{0:g.keyword})} checked={Boolean(picked[g.keyword])} onCheckedChange={(on) => setPicked((p) => ({ ...p, [g.keyword]: on === true }))} /></td>
                    <td className="truncate py-1.5" title={g.keyword}>{g.keyword}</td>
                    <td className="text-right tabular-nums">{short(g.volume)}</td>
                    <td className="text-right tabular-nums">{g.url ? <a className="nr-link" href={g.url} target="_blank" rel="noreferrer" title={g.url}>{g.position ?? "—"}</a> : g.position ?? "—"}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{own ? own.position.toFixed(0) : "—"}</td>
                  </tr>); })}</tbody>
              </table>
            ) : <p className="text-sm text-muted-foreground">{$t("没有找到对方排得上、我们没有的词。")}</p>}
          </section>
        ) : null}
        {r.topPages.length ? (
          <section className="space-y-1" data-top-pages>
            <h3 className="text-sm font-semibold">{$t("热门页面（按估算流量）")}</h3>
            {r.topPages.map((pg) => <p key={pg.url} className="flex items-center gap-2 text-sm"><a className="nr-link min-w-0 flex-1 truncate" href={pg.url} target="_blank" rel="noreferrer" title={pg.url}>{pathOf(pg.url)}</a><span className="shrink-0 tabular-nums text-muted-foreground">{$tj("{0} · {1} 个词",{0:short(pg.traffic),1:short(pg.keywords)})}</span></p>)}
          </section>
        ) : null}
        {r.events.length ? (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold">{$t("最近的动态")}</h3>
            {r.events.map((e) => <p key={e.url + e.at} className="flex items-center gap-2 text-sm"><Tag tone={e.type === "release" ? "violet" : "grey"}>{e.type === "release" ? $t("新版本") : $t("新页面")}</Tag><a className="nr-link min-w-0 flex-1 truncate" href={e.url} target="_blank" rel="noreferrer">{e.title}<ExternalLink className="ml-0.5 inline size-3" /></a><span className="shrink-0 text-xs text-muted-foreground">{e.at.slice(5, 10)}</span></p>)}
          </section>
        ) : null}
      </div>
    </DetailDrawer>
  );
}
