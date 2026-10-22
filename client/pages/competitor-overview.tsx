import { useMessageState, $t, $tj, $legacyText } from "#i18n";
// 竞品 › 总览 (2026-10-05, after Semrush and Similarweb): our site and each competitor side by side — estimated organic
// search traffic and its year, ranking keywords (DataForSEO, updated monthly by itself) next to Google interest, GitHub
// stars, the AI share of mentions and the last 30 days, all already collected. A row opens the competitor: its traffic
// line, the keywords it ranks for that we do not (to hand to the Agent), its top pages and what it published lately.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { toast } from "#lib/toast";
import { InlineError, ListSkeleton, LoadError } from "#components/reach/states";
import { NotesTip, WithInfo } from "#components/reach/info-tip";
import { Tag } from "#components/reach/tag";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Checkbox } from "#components/ui/checkbox";
import { DataTable, useDataTable } from "#components/seo/data-table";
import { SortableHeader } from "#components/seo/sortable-header";
import { DetailDrawer } from "./detail-drawer";
import { SectionHandOff } from "./section-hand-off";
import { competitorKeywordsDraft } from "./seo-hand-off";
import { rankOf, rankRequest, type Ranks } from "./keyword-api";
import { help } from "./glossary";
import { CompetitorWatchTab } from "./competitor-watch";
import { formatCount, formatDate, formatSigned } from '#lib/format';
import { Delta } from '#components/reach/delta';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select';

type Gap = { keyword: string; volume: number | null; difficulty: number | null; intent: string | null; position: number | null; url: string | null; traffic: number | null };
type Row = { id: string; name: string; domain: string | null; own: boolean; searched: boolean; checkedAt: string | null; errors: string[]; traffic: number | null; trafficChange: number | null; keywords: number | null; top10: number | null; months: { date: string; etv: number | null; count: number | null }[]; interest: number | null; interestChange: number | null; stars: number | null; starsWeek: number | null; aiShare: number | null; pages30: number; release: string | null; gap: Gap[]; topPages: { url: string; traffic: number | null; keywords: number | null }[]; events: { type: string; title: string; url: string; at: string }[] };
type View = { dataforseo: boolean; market: { locationCode: number; language: string }; marketLabel: string; markets: { locationCode: number; language: string; label: string }[]; refreshing: boolean; sites: Row[]; notes: string[] };
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrCompetitorResearch", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const short = (v: number | null) => formatCount(v);
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const delta = (v: number | null) => <Delta value={v} />;
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
  const [error, setError] = useMessageState("");
  const [openId, setOpenId] = useState<string>();
  const load = () => call<View>(projectId, "view").then((v) => { setView(v); setError(""); }).catch((e) => setError(() => (e instanceof Error ? $legacyText(e.message) : $t('competitorOverview.notLoadCompetitorOverview'))));
  useEffect(() => { setView(undefined); void load(); }, [projectId]);
  useEffect(() => { if (!view?.refreshing) return; const t = setTimeout(() => void load(), 5000); return () => clearTimeout(t); }, [view]);
  const changeMarket = async (value: string) => {
    const [locationCode, language] = value.split("|");
    try { setView(await call<View>(projectId, "market", { locationCode: Number(locationCode), language })); toast.success(() => ($t('competitorOverview.checkingSearchDataNewMarket'))); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('competitorOverview.noChange'))); }
  };
  const hasAiShare = (view?.sites ?? []).some((r) => r.aiShare != null);
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    helper.accessor("name", { enableSorting: false, header: () => $t('competitorOverview.website'), cell: ({ row }) => { const r = row.original; return <div className="min-w-0"><span className="flex items-center gap-1.5 font-medium">{r.name}{r.own ? <Tag tone="blue">{$t('common.us')}</Tag> : null}</span><span className="block truncate text-xs text-muted-foreground">{r.domain || $t('competitorOverview.noWebsite')}</span></div>; } }) as ColumnDef<Row>,
    helper.accessor((r) => r.traffic ?? undefined, { id: "traffic", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('competitorOverview.organicSearchTraffic')} align="right" />, cell: ({ row }) => <span className="inline-flex items-baseline gap-1.5">{short(row.original.traffic)}<span className="text-xs">{delta(row.original.trafficChange)}</span></span>, meta: right }) as ColumnDef<Row>,
    helper.display({ id: "spark", header: () => $t('competitorOverview.value12Months'), cell: ({ row }) => <Spark months={row.original.months} /> }) as ColumnDef<Row>,
    helper.accessor((r) => r.keywords ?? undefined, { id: "keywords", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.rankingKeywords')} align="right" />, cell: ({ row }) => short(row.original.keywords), meta: right }) as ColumnDef<Row>,
    helper.accessor((r) => r.top10 ?? undefined, { id: "top10", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.top10')} align="right" />, cell: ({ row }) => short(row.original.top10), meta: right }) as ColumnDef<Row>,
    helper.accessor((r) => r.interest ?? undefined, { id: "interest", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.googleInterest')} align="right" />, cell: ({ row }) => row.original.interest ?? "—", meta: right }) as ColumnDef<Row>,
    helper.accessor((r) => r.stars ?? undefined, { id: "stars", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="GitHub Star" align="right" help={$t('competitorOverview.currentStarsRepositorySmallNumber')} />, cell: ({ row }) => <span className="inline-flex items-baseline gap-1.5">{short(row.original.stars)}{row.original.starsWeek ? <span className="text-xs text-muted-foreground">{$tj('competitorOverview.week',{0:formatSigned(row.original.starsWeek)})}</span> : null}</span>, meta: right }) as ColumnDef<Row>,
    // No AI share column until a brand check has measured one (UI review 2026-10-21: an all-dash column).
    ...(hasAiShare ? [helper.accessor((r) => r.aiShare ?? undefined, { id: "ai", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.aiShareVoice')} align="right" />, cell: ({ row }) => pct(row.original.aiShare), meta: right }) as ColumnDef<Row>] : []),
    helper.display({ id: "recent", header: () => <WithInfo help={help($t('common.last30Days'))}>{$t('common.last30Days')}</WithInfo>, cell: ({ row }) => { const r = row.original; const text = $t('competitorOverview.newPageCountDetail',{0:r.pages30,1:r.release ? ` · ${r.release}` : ""}); return <span className="block max-w-56 truncate text-xs text-muted-foreground" title={text}>{text}</span>; } }) as ColumnDef<Row>,
  ], [hasAiShare]);
  const rows = view?.sites ?? [];
  const table = useDataTable({ data: rows, columns, withSorting: true, getRowId: (r) => r.id });
  if (error) return <LoadError title={$t('competitorOverview.notLoadCompetitorOverview')} message={error} onRetry={() => void load()} />;
  if (!view) return <ListSkeleton rows={4} />;
  // No competitors yet: the AI suggestions and the form from 动态; the table appears once one is added.
  if (rows.length <= 1) return <CompetitorWatchTab projectId={projectId} onListChange={(n) => { if (n) void load(); }} />;
  const open = rows.find((r) => r.id === openId);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {view.refreshing ? <><LoaderCircle className="size-3.5 animate-spin" />{$t('competitorOverview.checkingSearchDataUsuallyMinute')}</> : view.dataforseo ? $t('competitorOverview.searchDataUpdatedMonthly',{0:$legacyText(view.marketLabel)}) : $t('competitorOverview.googleInterestStarsAiMentions')}
          <NotesTip notes={view.notes} label={$t('competitorOverview.whereOverviewDataComes')} side="bottom" />
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {view.dataforseo ? <Select value={`${view.market.locationCode}|${view.market.language}`} disabled={view.refreshing} onValueChange={(v) => void changeMarket(String(v))}>
            <SelectTrigger size="sm" className="w-full sm:w-40" aria-label={$t('competitorOverview.searchDataMarket')}><SelectValue>{(v: string) => $t(view.markets.find((m) => `${m.locationCode}|${m.language}` === v)?.label ?? "")}</SelectValue></SelectTrigger>
            <SelectContent align="end" className="w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal">{view.markets.map((m) => <SelectItem key={`${m.locationCode}|${m.language}`} value={`${m.locationCode}|${m.language}`}>{$t(m.label)}</SelectItem>)}</SelectContent>
          </Select> : null}
          <Button size="sm" variant="outline" onClick={onManage}>{$t('competitorOverview.addRemoveCompetitors')}</Button>
        </div>
      </div>
      {!view.dataforseo ? <p className="text-xs text-muted-foreground">{$t('competitorOverview.dataforseoConnectedGetSiteOrganic')}<button type="button" className="nr-link" onClick={() => navigate("/connections?source=keywords")}>{$t('common.openConnections')}</button></p> : null}
      <Card className="gap-0 py-0">
        <DataTable table={table} empty={{ title: $t('common.noCompetitorsYet') }} onRowClick={(row) => setOpenId(row.original.id)} />
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
    <DetailDrawer open onClose={onClose} title={r.name} description={`${r.domain || $t('competitorOverview.noWebsite')}${r.searched ? $t('competitorOverview.updated',{0:market,1:formatDate(r.checkedAt)}) : ""}`}
      actions={!r.own && r.gap.length ? <SectionHandOff projectId={projectId} disabled={!chosen.length} playbookId="content-outline" label={chosen.length ? $t('common.handOffAgentValue',{0:chosen.length}) : $t('common.handOffAgent')} description={$t('competitorOverview.keywordHandoffHelp')} draft={() => competitorKeywordsDraft(r.domain || r.name, market, chosen.map((g) => ({ keyword: g.keyword, position: g.position, volume: g.volume, traffic: g.traffic, url: g.url, difficulty: g.difficulty, intent: g.intent })))} /> : undefined}>
      <div className="space-y-5">
        {r.errors.length ? <InlineError>{$tj('common.checkIncomplete',{0:$legacyText(r.errors[0])})}</InlineError> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tile($t('competitorOverview.organicSearchTraffic'), short(r.traffic))}{tile($t('common.rankingKeywords'), short(r.keywords))}{tile($t('common.top10'), short(r.top10))}{tile($t('common.last30Days'), $t('competitorOverview.newPageCount',{0:r.pages30}))}
        </div>
        {r.months.filter((m) => m.etv !== null).length > 1 ? (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold">{$t('competitorOverview.monthlyOrganicSearchTrafficEstimated')}</h3>
            <div className="nr-chart-box" data-traffic-chart>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={r.months} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" fontSize={11} minTickGap={24} />
                  <YAxis fontSize={11} width={44} tickFormatter={(v: number) => short(v)} />
                  <Tooltip formatter={(v) => short(Number(v))} />
                  <Line isAnimationActive={false} type="linear" dataKey="etv" name={$t('competitorOverview.organicSearchTraffic')} stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : !dataforseo || !r.domain ? <p className="text-sm text-muted-foreground">{!r.domain ? $t('competitorOverview.noWebsiteNoSearchData') : $t('competitorOverview.connectDataforseoSeeSearchTraffic')}</p> : <p className="text-sm text-muted-foreground">{$t('competitorOverview.searchDataStillLoading')}</p>}
        {!r.own && r.searched ? (
          <section className="space-y-1" data-gap>
            <h3 className="text-sm font-semibold"><WithInfo help={$t('competitorOverview.keywordGapHelp')}>{$t('competitorOverview.keywordGapRankNot')}</WithInfo></h3>
            {r.gap.length ? (
              <table className="w-full table-fixed text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="w-7" /><th className="py-1 text-left font-normal">{$t('common.keywords')}</th><th className="w-20 text-right font-normal">{$t('common.monthlyVolume')}</th><th className="w-16 text-right font-normal">{$t('competitorOverview.position')}</th><th className="w-12 text-right font-normal">{$t('common.site')}</th></tr></thead>
                <tbody>{r.gap.map((g) => { const own = rankOf(ranks, g.keyword); return (
                  <tr key={g.keyword} className="border-t" data-gap-keyword={g.keyword}>
                    <td className="py-1.5"><Checkbox aria-label={$t('common.selectValue',{0:g.keyword})} checked={Boolean(picked[g.keyword])} onCheckedChange={(on) => setPicked((p) => ({ ...p, [g.keyword]: on === true }))} /></td>
                    <td className="truncate py-1.5" title={g.keyword}>{g.keyword}</td>
                    <td className="text-right tabular-nums">{short(g.volume)}</td>
                    <td className="text-right tabular-nums">{g.url ? <a className="nr-link" href={g.url} target="_blank" rel="noreferrer" title={g.url}>{g.position ?? "—"}</a> : g.position ?? "—"}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{own ? own.position.toFixed(0) : "—"}</td>
                  </tr>); })}</tbody>
              </table>
            ) : <p className="text-sm text-muted-foreground">{$t('competitorOverview.noKeywordsWhereRankNot')}</p>}
          </section>
        ) : null}
        {r.topPages.length ? (
          <section className="space-y-1" data-top-pages>
            <h3 className="text-sm font-semibold">{$t('competitorOverview.topPagesEstimatedTraffic')}</h3>
            {r.topPages.map((pg) => <p key={pg.url} className="flex items-center gap-2 text-sm"><a className="nr-link min-w-0 flex-1 truncate" href={pg.url} target="_blank" rel="noreferrer" title={pg.url}>{pathOf(pg.url)}</a><span className="shrink-0 tabular-nums text-muted-foreground">{$tj('competitorOverview.keywords',{0:short(pg.traffic),1:short(pg.keywords)})}</span></p>)}
          </section>
        ) : null}
        {r.events.length ? (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold">{$t('competitorOverview.recentActivity')}</h3>
            {r.events.map((e) => <p key={e.url + e.at} className="flex items-center gap-2 text-sm"><Tag tone={e.type === "release" ? "violet" : "grey"}>{e.type === "release" ? $t('common.newRelease') : $t('common.newPages')}</Tag><a className="nr-link min-w-0 flex-1 truncate" href={e.url} target="_blank" rel="noreferrer">{e.title}<ExternalLink className="ml-0.5 inline size-3" /></a><span className="shrink-0 text-xs text-muted-foreground">{formatDate(e.at.slice(0, 10))}</span></p>)}
          </section>
        ) : null}
      </div>
    </DetailDrawer>
  );
}
