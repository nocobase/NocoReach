import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
import { chipButtonClass, chipClass } from '#components/reach/chip';
import { cn } from '#lib/utils';
// 趋势 › 关注的关键词 (2026-10-04 user choice): keywords added right here (or picked from 关键词), each with its own
// 12-month line in Google Trends (100 = its own busiest week, so they are not compared with each other) and its related
// searches. Queried at once when added, then weekly; a row opens the full line and the searches, which go to the Agent.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, LoaderCircle, Plus, TrendingUp } from "lucide-react";
import { toast } from "#lib/toast";
import { EmptyState, InlineError } from "#components/reach/states";
import { InfoTip } from "#components/reach/info-tip";
import { Tag } from "#components/reach/tag";
import { confirmAction } from "#components/reach/confirm";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Checkbox } from "#components/ui/checkbox";
import { Input } from "#components/ui/input";
import { DataTable, useDataTable } from "#components/seo/data-table";
import { SortableHeader } from "#components/seo/sortable-header";
import { DetailDrawer } from "./detail-drawer";
import { SectionHandOff } from "./section-hand-off";
import { trendsDraft, type TrendQuery } from "./seo-hand-off";
import { keywordRequest, type SavedKeyword } from "./keyword-api";
import { formatDateTime } from '#lib/format';
import { Delta } from '#components/reach/delta';

type Query = { query: string; value: number; isNew?: boolean };
export type WatchedKeyword = { id: string; keyword: string; addedAt: string; checking: boolean; lastRun: { at: string; ok: boolean; errors: string[] } | null; checkedAt: string | null; checkUrl: string | null; points: { date: string; value: number | null }[]; recent: number | null; change: number | null; average: number | null; top: Query[]; rising: Query[] };
export type KeywordWatch = { dataforseo?: boolean; keywords?: WatchedKeyword[]; maxKeywords?: number; keywordPlace?: string };
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrTrends", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const change = (v: number | null) => (v === null ? "—" : <Delta value={v} />);
const getOwn = () => ($t('trendsKeywords.keywordRelativeInterestGoogleTrends'));
const helper = createColumnHelper<WatchedKeyword>();
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;

// The 12-month line as a small sparkline.
function Spark({ points }: { points: WatchedKeyword["points"] }) {
  const vals = points.map((p) => p.value);
  if (vals.filter((v) => v !== null).length < 2) return <span className="text-muted-foreground">—</span>;
  const step = 110 / Math.max(vals.length - 1, 1);
  const line = vals.map((v, i) => (v === null ? null : `${(i * step).toFixed(1)},${(22 - (v / 100) * 20).toFixed(1)}`)).filter(Boolean).join(" ");
  return <svg width="110" height="24" viewBox="0 0 110 24" aria-hidden="true" data-spark><polyline fill="none" stroke="var(--chart-3)" strokeWidth="1.5" points={line} /></svg>;
}

export function TrendKeywords({ projectId, view, onView, onRetry }: { projectId: number; view: KeywordWatch; onView: (v: KeywordWatch) => void; onRetry: (keywordId: string) => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string>();
  const list = view.keywords ?? [], max = view.maxKeywords ?? 10, full = list.length >= max, place = view.keywordPlace || $t('common.worldwide');
  useEffect(() => { void keywordRequest<{ items: SavedKeyword[] }>("saved").then((d) => setSaved(d.items.map((k) => k.keyword))).catch(() => setSaved([])); }, [projectId]);
  const tracked = new Set(list.map((k) => k.keyword.toLowerCase()));
  const picks = saved.filter((k, i, all) => !tracked.has(k.toLowerCase()) && all.findIndex((x) => x.toLowerCase() === k.toLowerCase()) === i).slice(0, 6);
  const add = async (keyword: string) => {
    if (!keyword.trim()) return;
    setBusy(true); setError("");
    try { onView(await call<KeywordWatch>(projectId, "addKeyword", { keyword })); setText(""); toast.success(() => ($t('trendsKeywords.followingRunningFirstCheck',{0:keyword.trim()}))); }
    catch (e) { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('trendsKeywords.notAddedTryAgain'))); }
    finally { setBusy(false); }
  };
  const remove = async (k: WatchedKeyword) => {
    if (!(await confirmAction({ title: () => ($t('common.stopWatching',{0:k.keyword})), description: () => ($t('trendsKeywords.dataAlreadyCheckedDeletedToo')), action: 'common.remove' }))) return;
    try { onView(await call<KeywordWatch>(projectId, "removeKeyword", { keywordId: k.id })); setOpenId(undefined); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('trendsKeywords.notRemoved'))); }
  };
  const columns = useMemo<ColumnDef<WatchedKeyword>[]>(() => [
    helper.accessor("keyword", {
      header: ({ column }) => <SortableHeader column={column} label={$t('common.keywords')} />,
      cell: ({ row }) => { const k = row.original; return <span className="flex min-w-0 items-center gap-2"><span className="truncate font-medium" title={k.keyword}>{k.keyword}</span>{k.checking || !k.lastRun ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />{$t('trendsKeywords.checking')}</span> : !k.lastRun.ok ? <Tag tone="red">{$t('common.notFullyChecked')}</Tag> : null}</span>; },
    }) as ColumnDef<WatchedKeyword>,
    helper.accessor((k) => k.recent ?? undefined, { id: "recent", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.last4Weeks')} align="right" help={getOwn()} />, cell: ({ row }) => row.original.recent ?? "—", meta: right }) as ColumnDef<WatchedKeyword>,
    helper.accessor((k) => k.change ?? undefined, { id: "change", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.change')} align="right" help={$t('trendsKeywords.last4WeeksAverageCompared')} />, cell: ({ row }) => { const c = row.original.change; return <span className={c === null ? "text-muted-foreground" : undefined}>{change(c)}</span>; }, meta: right }) as ColumnDef<WatchedKeyword>,
    helper.display({ id: "spark", header: () => $t('trendsKeywords.value12MonthTrend'), cell: ({ row }) => <Spark points={row.original.points} /> }) as ColumnDef<WatchedKeyword>,
    helper.display({ id: "rising", header: () => $t('trendsKeywords.risingRelatedSearches'), cell: ({ row }) => { const r = row.original.rising, fresh = r.filter((q) => q.isNew).length; return r.length ? <span className="flex min-w-0 items-center gap-2 text-sm"><span className="truncate" title={r[0].query}>{r[0].query} <span className="text-nr-ink-green tabular-nums">+{r[0].value.toLocaleString(getCurrentLocale())}%</span></span>{r.length > 1 ? <span className="shrink-0 text-xs text-muted-foreground">{$tj('common.moreValue',{0:r.length})}</span> : null}{fresh ? <Tag tone="blue">{$tj('trendsKeywords.newWeek',{0:fresh})}</Tag> : null}</span> : <span className="text-muted-foreground">—</span>; } }) as ColumnDef<WatchedKeyword>,
    // The menu cell stops clicks: events from the menu's portal would reach the row and open the detail.
    helper.display({ id: "actions", header: () => <span className="sr-only">{$t('common.actions')}</span>, cell: ({ row }) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><Button size="sm" variant="ghost" className="-my-1.5" onClick={() => void remove(row.original)}>{$t('common.remove')}</Button></div> }) as ColumnDef<WatchedKeyword>,
  ], []);
  const table = useDataTable({ data: list, columns, withSorting: true, getRowId: (k) => k.id });
  if (!view.dataforseo) return <EmptyState icon={<TrendingUp />} title={$t('common.connectDataforseoFirst')} description={$t('trendsKeywords.keywordTrendsCheckGoogleTrends')} action={<Button onClick={() => navigate("/connections?source=keywords")}>{$t('common.openConnections')}</Button>} />;
  const open = list.find((k) => k.id === openId);
  return (
    <>
      <div className="space-y-2">
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); void add(text); }}>
          <Input className="max-w-md" aria-label={$t('trendsKeywords.keywordFollow')} value={text} disabled={busy || full} placeholder={full ? $t('trendsKeywords.followUpRemoveOneFirst',{0:max}) : $t('trendsKeywords.addKeywordFollowExampleLow')} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" disabled={busy || full || !text.trim()}><Plus data-icon="inline-start" />{busy ? $t('common.adding') : $t('common.add')}</Button>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">{$tj('trendsKeywords.following',{0:list.length,1:max,2:$legacyText(place)})}<InfoTip label={$t('trendsKeywords.howKeywordTrendsChecked')}>{$tj('trendsKeywords.scheduleAndCostHelp',{0:getOwn()})}</InfoTip></span>
        </form>
        {picks.length && !full ? <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-picks>{$t('trendsKeywords.pickKeywords')}{picks.map((k) => <button key={k} type="button" className={cn(chipClass, chipButtonClass, "text-foreground")} disabled={busy} onClick={() => void add(k)}>{k}</button>)}</p> : null}
        {error ? <InlineError>{error}</InlineError> : null}
      </div>
      <Card className="gap-0 py-0">
        <DataTable table={table} empty={{ title: $t('trendsKeywords.noKeywordsFollowedYet'), description: $t('trendsKeywords.onceAddedGoogleInterestRising') }} onRowClick={(row) => setOpenId(row.original.id)} />
      </Card>
      {open ? <KeywordDetail projectId={projectId} k={open} place={place} onClose={() => setOpenId(undefined)} onRemove={() => void remove(open)} onRetry={() => onRetry(open.id)} /> : null}
    </>
  );
}

// One keyword: its full 12-month line, numbers, and the related searches to hand to the Agent.
function KeywordDetail({ projectId, k, place, onClose, onRemove, onRetry }: { projectId: number; k: WatchedKeyword; place: string; onClose: () => void; onRemove: () => void; onRetry: () => void }) {
  const [picked, setPicked] = useState<Record<string, TrendQuery>>({});
  const chosen = Object.values(picked);
  const toggle = (q: Query, kind: TrendQuery["kind"], on: boolean) => setPicked((cur) => { const next = { ...cur }; if (on) next[kind + q.query] = { query: q.query, value: q.value, kind }; else delete next[kind + q.query]; return next; });
  const rows = (title: string, kind: TrendQuery["kind"], list: Query[], empty: string) => (
    <section className="space-y-1" data-list={kind}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {list.length ? list.map((q) => (
        <label key={q.query} className="flex items-center gap-3 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50" data-query={q.query}>
          <Checkbox checked={Boolean(picked[kind + q.query])} onCheckedChange={(on) => toggle(q, kind, on === true)} />
          <span className="min-w-0 flex-1 truncate">{q.query}</span>
          {q.isNew ? <Tag tone="blue">{$t('common.newWeek')}</Tag> : null}
          {kind === "rising" ? <Delta value={q.value / 100} /> : <span className="tabular-nums text-muted-foreground">{q.value}</span>}
        </label>
      )) : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
  return (
    <DetailDrawer open onClose={onClose} title={k.keyword} description={$t('common.past12Months',{0:$legacyText(place),1:k.checkedAt ? $t('common.checked',{0:formatDateTime(k.checkedAt)}) : ""})}
      footer={<Button variant="ghost" className="text-destructive" onClick={onRemove}>{$t('common.remove')}</Button>}
      actions={<SectionHandOff projectId={projectId} disabled={!chosen.length} playbookId="content-outline" label={chosen.length ? $t('common.handOffAgentValue',{0:chosen.length}) : $t('common.handOffAgent')} description={$t('common.selectedRelatedSearchesBecomeOne')} draft={() => trendsDraft(k.keyword, place, chosen)} />}>
      <div className="space-y-4">
        {k.lastRun && !k.lastRun.ok && !k.checking ? <InlineError action={k.lastRun.errors[0]?.includes("不确定") ? <Button size="sm" variant="outline" onClick={onRetry}>{$t('common.queryAgain')}</Button> : undefined}>{$tj('common.lastCheckNotComplete',{0:$legacyText(k.lastRun.errors[0])})}</InlineError> : null}
        {!k.checkedAt ? <p role="status" className="text-sm text-muted-foreground">{k.checking || !k.lastRun ? $t('trendsKeywords.checkingUsuallyMinuteTwo') : $t('common.noDataYet')}</p> : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="flex items-center gap-1">{$t('common.last4Weeks')} <b className="text-lg tabular-nums">{k.recent ?? "—"}</b><InfoTip label={$t('trendsKeywords.whatNumbersMean')}>{getOwn()}</InfoTip></span>
              <span>{$t('common.change')} {change(k.change)}</span>
              <span className="text-muted-foreground">{$tj('trendsKeywords.value12MonthAverage',{0:k.average ?? "—"})}</span>
              {k.checkUrl ? <a className="nr-link inline-flex items-center gap-0.5" href={k.checkUrl} target="_blank" rel="noreferrer">{$t('common.openGoogleTrends')}<ExternalLink className="size-3" /></a> : null}
            </div>
            <div className="nr-chart-box" data-keyword-chart>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={k.points} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                  <YAxis domain={[0, 100]} allowDecimals={false} fontSize={11} width={32} />
                  <Tooltip />
                  <Line isAnimationActive={false} type="linear" dataKey="value" name={$t('trendsKeywords.interest')} stroke="var(--chart-3)" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-muted-foreground">{chosen.length ? $t('trendsKeywords.relatedSearchesSelected',{0:chosen.length}) : $t('trendsKeywords.selectRelatedSearchesHandThem')}</p>
            {rows($t('common.rising'), "rising", k.rising, $t('common.noClearlyRisingRelatedSearches'))}
            {rows($t('common.top'), "top", k.top, $t('common.googleGaveNoRelatedSearches'))}
          </>
        )}
      </div>
    </DetailDrawer>
  );
}
