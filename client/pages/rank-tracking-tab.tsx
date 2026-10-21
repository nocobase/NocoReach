import { useMessageState, $t, $tj, $legacyText } from "#i18n";
// 排名跟踪 tab of 关键词: ported from every-app/open-seo db8bde1 src/client/features/rank-tracking/ (RankTrackingTable,
// RankTrackingTrendChart, CheckConfirmModal; MIT). Changes: weekly desktop checks only (user choice), started from
// 已保存 instead of a separate add flow, the site's Search Console position alongside, Chinese copy.
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { useCallback, useEffect, useMemo, useState } from "react";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { toast } from "#lib/toast";
import { EmptyState, ListSkeleton, InlineError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#components/ui/select";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableToolbar } from "#components/seo/data-table-toolbar";
import { TableBulkActionButton } from "#components/seo/table-bulk-action-bar";
import { SortableHeader } from "#components/seo/sortable-header";
import { safeLink } from "./analytics";
import { currentProjectId } from "./current-project";
import { getMarkets, marketLabel, rankOf, useOpenKeyword, type Ranks } from "./keyword-api";
import { DraftHandOffDialog } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { trackedDraft, trackedPage, type TrackedRow } from "./seo-hand-off";
import {confirmAction} from "#components/reach/confirm";
import { InfoTip } from "#components/reach/info-tip";
import { formatDate } from '#lib/format';
import { Delta } from '#components/reach/delta';

type Check = { at: string; position: number | null; url: string | null; runId: string };
type Tracked = { id: string; keyword: string; locationCode: number; language: string; addedAt: string; latest: Check | null; previous: Check | null; history: Check[]; nextCheckAt: string | null };
type Status = { keywords: Tracked[]; lastRun: { at: string; ok: boolean; errors: string[]; checked: number } | null };
export const rankRequest = <T,>(action: string, body: object = {}) => api.action<T>("nrRankTracking", action, { method: "POST", body: { projectId: String(currentProjectId()), ...body }, unwrap: "data" });
const day = (v?: string | null) => formatDate(v);
const pathOf = (u?: string | null) => { try { return u ? new URL(u).pathname : ""; } catch { return u || ""; } };
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;

// Starting tracking from 已保存: one market for the chosen keywords (theirs when they have one), checked weekly.
export function StartTrackingDialog({ keywords, onClose, onDone }: { keywords: { keyword: string; market: { locationCode: number; language: string } | null }[]; onClose: () => void; onDone: () => void }) {
  const first = keywords.find((k) => k.market)?.market;
  const [market, setMarket] = useState(() => getMarkets().find((m) => first && m.locationCode === first.locationCode && m.language === first.language) ?? getMarkets()[0]);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const r = await rankRequest<{ added: number }>("add", { keywords: keywords.map((k) => ({ keyword: k.keyword, locationCode: k.market?.locationCode ?? market.locationCode, language: k.market?.language ?? market.language })) });
      toast.success(() => (r.added ? $t('rankTracking.startedTrackingKeywordsRunningFirst',{0:r.added}) : $t('rankTracking.keywordsAlreadyTracked')));
      onDone();
    } catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('rankTracking.notTrackingYet'))); }
    finally { setBusy(false); }
  };
  const noMarket = keywords.filter((k) => !k.market).length;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{$tj('rankTracking.trackRankKeywords',{0:keywords.length})}</DialogTitle><DialogDescription>{$t('rankTracking.scheduleAndCostHelp')}</DialogDescription></DialogHeader>
        {noMarket ? (
          <label className="flex flex-col gap-2 text-sm"><span className="text-muted-foreground">{$tj('rankTracking.keywordsNoMarketSavedSearch',{0:noMarket})}</span>
            <Select value={`${market.locationCode}:${market.language}`} onValueChange={(v) => { const m = getMarkets().find((x) => `${x.locationCode}:${x.language}` === v); if (m) setMarket(m); }}>
              <SelectTrigger className="w-full" aria-label={$t('rankTracking.trackingMarket')}><SelectValue>{(v: string) => $t(getMarkets().find((x) => `${x.locationCode}:${x.language}` === v)?.label ?? "")}</SelectValue></SelectTrigger>
              <SelectContent>{getMarkets().map((m) => <SelectItem key={`${m.locationCode}:${m.language}`} value={`${m.locationCode}:${m.language}`}>{$t(m.label)}</SelectItem>)}</SelectContent>
            </Select>
          </label>
        ) : null}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>{$t('common.cancel')}</Button><Button disabled={busy} onClick={() => void start()}>{busy ? $t('common.starting') : $t('common.startTracking')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Spark({ history }: { history: Check[] }) {
  const pts = history.map((c) => c.position ?? 101);
  if (pts.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const w = 80, h = 22, max = Math.max(...pts), min = Math.min(...pts), span = max - min || 1;
  // Lower positions are better, so 1 is drawn at the top.
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${2 + ((p - min) / span) * (h - 4)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} className="h-5 w-20" role="img" aria-label={$t('rankTracking.rankTrend')}><polyline points={d} fill="none" stroke="var(--chart-3)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}
function Move({ now, before }: { now: Check | null; before: Check | null }) {
  if (!now || !before) return <span className="text-muted-foreground">—</span>;
  const a = before.position ?? 101, b = now.position ?? 101, d = a - b;
  if (d === 0) return <span className="text-muted-foreground">{$t('common.flat')}</span>;
  return <Delta value={d} kind="count" />;
}
const pos = (c: Check | null) => (!c ? "—" : c.position ? String(c.position) : $t('common.beyond100'));

const helper = createColumnHelper<Tracked & { site?: number }>();
export function RankTrackingTab({ ranks }: { ranks?: Ranks }) {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useMessageState("");
  const [busy, setBusy] = useState(false);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const openKeyword = useOpenKeyword();
  const anchorRef = useSelectionAnchor();
  const load = useCallback(() => rankRequest<Status>("status").then((s) => { setStatus(s); setError(""); }).catch((e) => setError(() => (e instanceof Error ? $legacyText(e.message) : $t('rankTracking.notLoadRankTracking')))), [setError]);
  useEffect(() => { void load(); }, [load]);
  // The first check runs in the background after keywords are added; look again shortly while any has none.
  useEffect(() => { if (!status?.keywords.some((k) => !k.latest)) return; const t = setTimeout(() => void load(), 8000); return () => clearTimeout(t); }, [status, load]);
  const rows = useMemo(() => (status?.keywords ?? []).map((k) => ({ ...k, site: rankOf(ranks, k.keyword)?.position })), [status, ranks]);
  const columns = useMemo<ColumnDef<Tracked & { site?: number }>[]>(() => [
    makeSelectionColumn<Tracked & { site?: number }>(anchorRef),
    helper.accessor("keyword", { header: ({ column }) => <SortableHeader column={column} label={$t('common.keywords')} />, cell: ({ getValue }) => <span className="block max-w-xs truncate font-medium" title={getValue()}>{getValue()}</span> }) as ColumnDef<Tracked & { site?: number }>,
    helper.display({ id: "market", header: () => $t('common.market'), cell: ({ row }) => <span className="text-muted-foreground">{marketLabel(row.original)}</span> }) as ColumnDef<Tracked & { site?: number }>,
    helper.accessor((r) => r.latest?.position ?? (r.latest ? 101 : undefined), { id: "position", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('rankTracking.latestRank')} align="right" />, cell: ({ row }) => <span className="font-semibold">{pos(row.original.latest)}</span>, meta: right }) as ColumnDef<Tracked & { site?: number }>,
    helper.display({ id: "move", header: () => <span className="block text-right">{$t('rankTracking.sinceLastCheck')}</span>, cell: ({ row }) => <span className="block text-right tabular-nums"><Move now={row.original.latest} before={row.original.previous} /></span> }) as ColumnDef<Tracked & { site?: number }>,
    helper.display({ id: "page", header: () => $t('common.rankingPage'), cell: ({ row }) => { const u = row.original.latest?.url; return u && safeLink(u) ? <a className="block max-w-56 truncate text-primary hover:underline" href={safeLink(u)} target="_blank" rel="noreferrer" title={u}>{pathOf(u)}</a> : <span className="text-muted-foreground">—</span>; } }) as ColumnDef<Tracked & { site?: number }>,
    helper.display({ id: "trend", header: () => $t('rankTracking.trend'), cell: ({ row }) => <Spark history={row.original.history} /> }) as ColumnDef<Tracked & { site?: number }>,
    helper.accessor("site", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.searchConsolePosition')} align="right" />, cell: ({ getValue }) => (getValue() == null ? "—" : Number(getValue()).toFixed(1)), meta: right }) as ColumnDef<Tracked & { site?: number }>,
    helper.display({ id: "checked", header: () => <span className="block text-right">{$t('rankTracking.lastChecked')}</span>, cell: ({ row }) => <span className="block text-right text-muted-foreground tabular-nums">{row.original.latest ? day(row.original.latest.at) : $t('rankTracking.waitingFirstCheck')}</span> }) as ColumnDef<Tracked & { site?: number }>,
  ], [anchorRef]);
  const table = useDataTable({ data: rows, columns, withSorting: true, enableRowSelection: true, state: { rowSelection, sorting }, onRowSelectionChange: setRowSelection, onSortingChange: setSorting, getRowId: (r) => r.id });
  const selected = rows.filter((r) => rowSelection[r.id]);
  const [handing, setHanding] = useState<TrackedRow[]>();
  useHandOffSource("rank-tracking", status?.keywords.length ? { count: selected.length, open: () => setHanding(handOffRows(selected)), noun: $t('common.keywordsSelected'), actions: <><TableBulkActionButton icon={<Trash2 className="size-3.5 text-destructive" />} onClick={async() => { if (await confirmAction({ title: () => ($t('rankTracking.stopTrackingKeywords',{0:selected.length})), description: () => ($t('rankTracking.checkHistoryDeletedToo')), action: 'rankTracking.stopTracking' })) void rankRequest<Status>("remove", { ids: selected.map((s) => s.id) }).then((s) => { setStatus(s); setRowSelection({}); }); }}>{$t('rankTracking.stopTracking')}</TableBulkActionButton></>, clear: () => setRowSelection({}) } : null);
  const [handed, setHanded] = useState<HandOffResult>();
  const handOffRows = (list: Tracked[]): TrackedRow[] => list.map((t) => { const g = rankOf(ranks, t.keyword); return { keyword: t.keyword, market: marketLabel(t), latest: t.latest, previous: t.previous, ...(g ? { gsc: { position: g.position, clicks: g.clicks, page: g.page } } : {}) }; });
  const checkNow = async () => {
    setBusy(true);
    try { const r = await rankRequest<Status & { checked: number; errors: string[] }>("check"); setStatus(r); r.errors.length ? toast.error(() => ($legacyText(r.errors[0]))) : toast.success(() => ($t('rankTracking.keywordsChecked',{0:r.checked}))); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('rankTracking.notFullyChecked'))); }
    finally { setBusy(false); }
  };
  if (error) return <p role="alert" className="nr-error">{error}</p>;
  if (!status) return <ListSkeleton rows={4} />;
  if (!status.keywords.length) return <EmptyState icon={<TrendingUp />} title={$t('rankTracking.noTrackedKeywordsYet')} description={$t('rankTracking.selectKeywordsUnderSavedClick')} />;
  return (
    <>
      <Card className="gap-0 py-0">
        <DataTable table={table} empty={{ title: $t('rankTracking.noTrackedKeywordsYet') }} onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,[role=checkbox],a")) return; openKeyword(row.original.keyword, row.original); }}
          toolbar={<DataTableToolbar actions={<Button variant="outline" size="sm" disabled={busy} onClick={() => void checkNow()}><RefreshCw data-icon="inline-start" className={busy ? "animate-spin" : ""} />{busy ? $t('common.checking') : $t('common.checkNow')}</Button>}>
            <span className="text-xs text-muted-foreground">{$tj('rankTracking.checkedWeeklyGoogleDesktopTop',{0:status.keywords.length,1:status.lastRun ? $t('rankTracking.last',{0:day(status.lastRun.at)}) : ""})}<InfoTip label={$t('rankTracking.howRankTrackingWorks')} className="ml-1">{$t('rankTracking.checkNowReusesResultLast')}</InfoTip></span>
          </DataTableToolbar>} />
      </Card>
      {status.lastRun && !status.lastRun.ok ? <InlineError>{$tj('rankTracking.lastCheckNotFinish',{0:$legacyText(status.lastRun.errors[0])})}</InlineError> : null}
      <HandOffNotice result={handed} />
      {handing ? <DraftHandOffDialog projectId={Number(currentProjectId())} draft={trackedDraft(handing)} playbookId={handing.some((r) => r.latest?.position || r.gsc) ? "optimize-page" : "content-outline"} page={trackedPage(handing)} description={$t('rankTracking.selectedKeywordsBecomeOneTask')} onClose={() => setHanding(undefined)} onDone={(r) => { setHanding(undefined); setRowSelection({}); setHanded(r); }} /> : null}
    </>
  );
}
