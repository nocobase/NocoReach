// 排名跟踪 tab of 关键词: ported from every-app/open-seo db8bde1 src/client/features/rank-tracking/ (RankTrackingTable,
// RankTrackingTrendChart, CheckConfirmModal; MIT). Changes: weekly desktop checks only (user choice), started from
// 已保存 instead of a separate add flow, the site's Search Console position alongside, Chinese copy.
import { useEffect, useMemo, useState } from "react";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { createColumnHelper, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bot, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ListSkeleton } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "@/components/seo/data-table";
import { DataTableToolbar } from "@/components/seo/data-table-toolbar";
import { TableBulkActionBar, TableBulkActionButton } from "@/components/seo/table-bulk-action-bar";
import { SortableHeader } from "@/components/seo/sortable-header";
import { DetailDrawer } from "./detail-drawer";
import { safeLink } from "./analytics";
import { currentProjectId } from "./current-project";
import { markets, marketLabel, rankOf, type Ranks } from "./keyword-api";
import { DraftHandOffDialog } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { trackedDraft, trackedPage, type TrackedRow } from "./seo-hand-off";
import {confirmAction} from "@/components/reach/confirm";

type Check = { at: string; position: number | null; url: string | null; runId: string };
type Tracked = { id: string; keyword: string; locationCode: number; language: string; addedAt: string; latest: Check | null; previous: Check | null; history: Check[]; nextCheckAt: string | null };
type Status = { keywords: Tracked[]; lastRun: { at: string; ok: boolean; errors: string[]; checked: number } | null };
export const rankRequest = <T,>(action: string, body: object = {}) => api.action<T>("nrRankTracking", action, { method: "POST", body: { projectId: String(currentProjectId()), ...body }, unwrap: "data" });
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("zh-CN") : "—");
const pathOf = (u?: string | null) => { try { return u ? new URL(u).pathname : ""; } catch { return u || ""; } };
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;

// Starting tracking from 已保存: one market for the chosen keywords (theirs when they have one), checked weekly.
export function StartTrackingDialog({ keywords, onClose, onDone }: { keywords: { keyword: string; market: { locationCode: number; language: string } | null }[]; onClose: () => void; onDone: () => void }) {
  const first = keywords.find((k) => k.market)?.market;
  const [market, setMarket] = useState(markets.find((m) => first && m.locationCode === first.locationCode && m.language === first.language) ?? markets[0]);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const r = await rankRequest<{ added: number }>("add", { keywords: keywords.map((k) => ({ keyword: k.keyword, locationCode: k.market?.locationCode ?? market.locationCode, language: k.market?.language ?? market.language })) });
      toast.success(r.added ? `已开始跟踪 ${r.added} 个关键词，正在做第一次检查` : "这些关键词已经在跟踪了");
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "没有开始跟踪"); }
    finally { setBusy(false); }
  };
  const noMarket = keywords.filter((k) => !k.market).length;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>跟踪 {keywords.length} 个关键词的排名</DialogTitle><DialogDescription>每周查一次本站在 Google（桌面）前 100 名里排第几、是哪一页。每次检查都收费，算进数据接入里的 DataForSEO 月度预算，超了就停。</DialogDescription></DialogHeader>
        {noMarket ? (
          <label className="flex flex-col gap-2 text-sm"><span className="text-muted-foreground">{noMarket} 个关键词没有市场（从搜索表现保存的），用这个市场</span>
            <Select value={`${market.locationCode}:${market.language}`} onValueChange={(v) => { const m = markets.find((x) => `${x.locationCode}:${x.language}` === v); if (m) setMarket(m); }}>
              <SelectTrigger className="w-full" aria-label="跟踪市场"><SelectValue>{(v: string) => markets.find((x) => `${x.locationCode}:${x.language}` === v)?.label}</SelectValue></SelectTrigger>
              <SelectContent>{markets.map((m) => <SelectItem key={`${m.locationCode}:${m.language}`} value={`${m.locationCode}:${m.language}`}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </label>
        ) : null}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy} onClick={() => void start()}>{busy ? "正在开始…" : "开始跟踪"}</Button></DialogFooter>
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
  return <svg viewBox={`0 0 ${w} ${h}`} className="h-5 w-20" role="img" aria-label="排名走势"><polyline points={d} fill="none" stroke="var(--chart-3)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}
function Move({ now, before }: { now: Check | null; before: Check | null }) {
  if (!now || !before) return <span className="text-muted-foreground">—</span>;
  const a = before.position ?? 101, b = now.position ?? 101, d = a - b;
  if (d === 0) return <span className="text-muted-foreground">持平</span>;
  return <span className={d > 0 ? "nr-up" : "nr-down"}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}</span>;
}
const pos = (c: Check | null) => (!c ? "—" : c.position ? String(c.position) : "100 名外");

const helper = createColumnHelper<Tracked & { site?: number }>();
export function RankTrackingTab({ ranks }: { ranks?: Ranks }) {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [detail, setDetail] = useState<Tracked>();
  const anchorRef = useSelectionAnchor();
  const load = () => rankRequest<Status>("status").then((s) => { setStatus(s); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "排名跟踪没有读出来"));
  useEffect(() => { void load(); }, []);
  // The first check runs in the background after keywords are added; look again shortly while any has none.
  useEffect(() => { if (!status?.keywords.some((k) => !k.latest)) return; const t = setTimeout(() => void load(), 8000); return () => clearTimeout(t); }, [status]);
  const rows = useMemo(() => (status?.keywords ?? []).map((k) => ({ ...k, site: rankOf(ranks, k.keyword)?.position })), [status, ranks]);
  const columns = useMemo<ColumnDef<Tracked & { site?: number }>[]>(() => [
    makeSelectionColumn<Tracked & { site?: number }>(anchorRef),
    helper.accessor("keyword", { header: ({ column }) => <SortableHeader column={column} label="关键词" />, cell: ({ getValue }) => <span className="block max-w-xs truncate font-medium" title={getValue()}>{getValue()}</span> }) as ColumnDef<Tracked & { site?: number }>,
    helper.display({ id: "market", header: () => "市场", cell: ({ row }) => <span className="text-muted-foreground">{marketLabel(row.original)}</span> }) as ColumnDef<Tracked & { site?: number }>,
    helper.accessor((r) => r.latest?.position ?? (r.latest ? 101 : undefined), { id: "position", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="最新排名" align="right" />, cell: ({ row }) => <span className="font-semibold">{pos(row.original.latest)}</span>, meta: right }) as ColumnDef<Tracked & { site?: number }>,
    helper.display({ id: "move", header: () => <span className="block text-right">较上次</span>, cell: ({ row }) => <span className="block text-right tabular-nums"><Move now={row.original.latest} before={row.original.previous} /></span> }) as ColumnDef<Tracked & { site?: number }>,
    helper.display({ id: "page", header: () => "排名页面", cell: ({ row }) => { const u = row.original.latest?.url; return u && safeLink(u) ? <a className="block max-w-56 truncate text-primary hover:underline" href={safeLink(u)} target="_blank" rel="noreferrer" title={u}>{pathOf(u)}</a> : <span className="text-muted-foreground">—</span>; } }) as ColumnDef<Tracked & { site?: number }>,
    helper.display({ id: "trend", header: () => "走势", cell: ({ row }) => <Spark history={row.original.history} /> }) as ColumnDef<Tracked & { site?: number }>,
    helper.accessor("site", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="Search Console 排名" align="right" title="本站近 28 天平均排名，可以和跟踪到的名次对照" />, cell: ({ getValue }) => (getValue() == null ? "—" : Number(getValue()).toFixed(1)), meta: right }) as ColumnDef<Tracked & { site?: number }>,
    helper.display({ id: "checked", header: () => <span className="block text-right">上次检查</span>, cell: ({ row }) => <span className="block text-right text-muted-foreground tabular-nums">{row.original.latest ? day(row.original.latest.at) : "等待第一次检查"}</span> }) as ColumnDef<Tracked & { site?: number }>,
  ], [anchorRef]);
  const table = useDataTable({ data: rows, columns, withSorting: true, enableRowSelection: true, state: { rowSelection, sorting }, onRowSelectionChange: setRowSelection, onSortingChange: setSorting, getRowId: (r) => r.id });
  const selected = rows.filter((r) => rowSelection[r.id]);
  const [handing, setHanding] = useState<TrackedRow[]>();
  const [handed, setHanded] = useState<HandOffResult>();
  const handOffRows = (list: Tracked[]): TrackedRow[] => list.map((t) => { const g = rankOf(ranks, t.keyword); return { keyword: t.keyword, market: marketLabel(t), latest: t.latest, previous: t.previous, ...(g ? { gsc: { position: g.position, clicks: g.clicks, page: g.page } } : {}) }; });
  const checkNow = async () => {
    setBusy(true);
    try { const r = await rankRequest<Status & { checked: number; errors: string[] }>("check"); setStatus(r); r.errors.length ? toast.error(r.errors[0]) : toast.success(`已检查 ${r.checked} 个关键词`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "没有检查完"); }
    finally { setBusy(false); }
  };
  if (error) return <p role="alert" className="nr-error">{error}</p>;
  if (!status) return <ListSkeleton rows={4} />;
  if (!status.keywords.length) return <EmptyState icon={<TrendingUp />} title="还没有跟踪的关键词" description="在“已保存”里勾选关键词，点“开始跟踪”。每周检查一次本站在 Google 的名次。" />;
  return (
    <>
      <Card className="gap-0 py-0">
        <DataTable table={table} empty={{ title: "还没有跟踪的关键词" }} onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,[role=checkbox],a")) return; setDetail(row.original); }}
          toolbar={<DataTableToolbar actions={<Button variant="outline" size="sm" disabled={busy} onClick={() => void checkNow()}><RefreshCw data-icon="inline-start" className={busy ? "animate-spin" : ""} />{busy ? "正在检查…" : "立即检查"}</Button>}>
            <span className="text-xs text-muted-foreground">每周检查一次（Google 桌面前 100 名）· 跟踪 {status.keywords.length} 个{status.lastRun ? ` · 上次 ${day(status.lastRun.at)}` : ""}</span>
          </DataTableToolbar>} />
      </Card>
      {status.lastRun && !status.lastRun.ok ? <p className="nr-data-note">上次检查有没完成的：{status.lastRun.errors[0]}</p> : null}
      <p className="nr-footnote">“立即检查”6 天内查过的直接用那次结果，不重复收费。名次是那一刻的 Google 结果，和 Search Console 的平均排名会有出入。</p>
      <TableBulkActionBar selectedCount={selected.length} selectedLabel="个关键词已选" onClear={() => setRowSelection({})} actions={
        <><TableBulkActionButton icon={<Bot className="size-3.5" />} onClick={() => setHanding(handOffRows(selected))}>交给 Agent</TableBulkActionButton><TableBulkActionButton icon={<Trash2 className="size-3.5 text-destructive" />} onClick={async() => { if (await confirmAction({ title: `停止跟踪这 ${selected.length} 个关键词？`, description: '它们的检查记录一起删除。', action: '停止跟踪' })) void rankRequest<Status>("remove", { ids: selected.map((s) => s.id) }).then((s) => { setStatus(s); setRowSelection({}); }); }}>停止跟踪</TableBulkActionButton></>} />
      <HandOffNotice result={handed} />
      {handing ? <DraftHandOffDialog projectId={Number(currentProjectId())} draft={trackedDraft(handing)} playbookId={handing.some((r) => r.latest?.position || r.gsc) ? "optimize-page" : "content-outline"} page={trackedPage(handing)} description="选中的关键词合成一个任务，每周检查的名次写进任务说明，确认后立即开始。" onClose={() => setHanding(undefined)} onDone={(r) => { setHanding(undefined); setRowSelection({}); setHanded(r); }} /> : null}
      {detail ? (
        <DetailDrawer open onClose={() => setDetail(undefined)} title={detail.keyword} description={`${marketLabel(detail)} · 每周检查 · 从 ${day(detail.addedAt)} 开始`}>
          <div className="space-y-4 text-sm">
            {detail.history.length > 1 ? (
              <div className="nr-chart-box"><ResponsiveContainer width="100%" height={200}><LineChart data={detail.history.map((c) => ({ date: c.at.slice(5, 10), position: c.position }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" fontSize={11} /><YAxis reversed domain={[1, "dataMax"]} allowDecimals={false} fontSize={11} width={32} /><Tooltip formatter={(v) => [v == null ? "100 名外" : `第 ${v} 位`, "排名"]} /><Line isAnimationActive={false} type="linear" dataKey="position" stroke="var(--chart-3)" connectNulls={false} /></LineChart></ResponsiveContainer></div>
            ) : <p className="text-muted-foreground">检查两次以后显示走势。</p>}
            <ul className="space-y-1">{[...detail.history].reverse().map((c) => <li key={c.runId} className="flex justify-between gap-3"><span className="tabular-nums">{day(c.at)}</span><span className="font-medium">{pos(c)}</span><span className="min-w-0 flex-1 truncate text-right text-muted-foreground">{pathOf(c.url)}</span></li>)}</ul>
          </div>
        </DetailDrawer>
      ) : null}
    </>
  );
}
