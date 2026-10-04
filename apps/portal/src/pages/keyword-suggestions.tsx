// 关键词 › AI 建议 (2026-10-04): keywords the online AI suggests from the website, 记忆, Search Console and competitors,
// in groups with why and which page could answer them; the site's own rank next to each, search volume and difficulty
// when DataForSEO is connected. Made the first time the tab opens; after that only on 重新建议. Ticked keywords are saved
// to 已保存 or go to the Agent.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Bookmark, Bot, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { LoadError } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TabsTrigger } from "@/components/ui/tabs";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "@/components/seo/data-table";
import { DataTableTabs } from "@/components/seo/data-table-toolbar";
import { TableBulkActionBar, TableBulkActionButton } from "@/components/seo/table-bulk-action-bar";
import { SortableHeader } from "@/components/seo/sortable-header";
import { ScoreBadge } from "@/components/seo/score-badge";
import { IntentBadge } from "@/components/seo/intent-badge";
import { useProject } from "./reach-data";
import { markets, metric } from "./keyword-api";
import { KeywordHandOffDialog } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";

type Metrics = { volume: number | null; difficulty: number | null; cpc: number | null; intent: string | null };
type Suggestion = { id: string; keyword: string; group: string; intent: string | null; reason: string; page: string | null; site: { position: number; clicks: number; impressions: number; page: string } | null; metrics: Metrics | null };
type View = { at?: string; market: { locationCode: number; language: string }; items: Suggestion[]; basis?: { pages: number; home: boolean; queries: number; competitors: number }; metricsAt?: string | null; metricsError?: string | null; dataforseo: boolean };
const GROUPS = ["产品与功能词", "使用场景与问题词", "对比与替代词", "品类与行业词"];
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrKeywordSuggest", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const helper = createColumnHelper<Suggestion>();
// DataForSEO's intent when looked up, otherwise the AI's (a comparison is a commercial search).
const intentOf = (s: Suggestion) => s.metrics?.intent || (s.intent === "comparison" ? "commercial" : s.intent);

export function KeywordSuggestions({ onSaved }: { onSaved: () => void }) {
  const { project } = useProject();
  const navigate = useNavigate();
  const [view, setView] = useState<View>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "suggest" | "lookup" | "save">("");
  const [group, setGroup] = useState("all");
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [handing, setHanding] = useState(false);
  const [handOff, setHandOff] = useState<HandOffResult>();
  const anchorRef = useSelectionAnchor();
  const run = async (action: "suggest" | "lookup", body: object = {}) => {
    if (!project) return;
    setBusy(action); setError("");
    try { setView(await call<View>(project.id, action, body)); setRowSelection({}); }
    catch (e) { setError(e instanceof Error ? e.message : "没有完成，请重试"); }
    finally { setBusy(""); }
  };
  // The first time: nothing suggested yet, so suggest right away.
  useEffect(() => {
    if (!project) return;
    setView(undefined);
    void call<View>(project.id, "view").then((v) => { setView(v); if (!v.items.length) void run("suggest"); }).catch((e) => setError(e instanceof Error ? e.message : "没有读出来"));
  }, [project?.id]);
  const rows = useMemo(() => (view?.items ?? []).filter((s) => group === "all" || s.group === group), [view, group]);
  const columns = useMemo<ColumnDef<Suggestion>[]>(() => [
    makeSelectionColumn<Suggestion>(anchorRef),
    helper.accessor("keyword", {
      header: ({ column }) => <SortableHeader column={column} label="关键词" />,
      cell: ({ row }) => <div className="min-w-0 max-w-sm"><span className="block truncate font-medium" title={row.original.keyword}>{row.original.keyword}</span><span className="block truncate text-xs text-muted-foreground" title={row.original.reason}>{row.original.reason}</span></div>,
    }) as ColumnDef<Suggestion>,
    helper.accessor("group", { enableSorting: false, header: () => "分组", cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{getValue()}</span> }) as ColumnDef<Suggestion>,
    helper.display({ id: "intent", header: () => "意图", cell: ({ row }) => <IntentBadge intent={intentOf(row.original)} /> }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.metrics?.volume ?? undefined, { id: "volume", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="月搜索量" align="right" />, cell: ({ row }) => metric(row.original.metrics?.volume), meta: right }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.metrics?.difficulty ?? undefined, { id: "difficulty", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="难度" align="right" />, cell: ({ row }) => <ScoreBadge value={row.original.metrics?.difficulty ?? null} />, meta: right }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.site?.position ?? undefined, { id: "rank", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="本站排名" align="right" title="本站近 28 天在 Google 里的平均排名（Search Console）" />, cell: ({ row }) => row.original.site ? <span title={`点击 ${row.original.site.clicks} · 曝光 ${row.original.site.impressions}`}>{row.original.site.position.toFixed(1)}</span> : <span className="text-muted-foreground">—</span>, meta: right }) as ColumnDef<Suggestion>,
    helper.display({ id: "page", header: () => "对应页面", cell: ({ row }) => { const page = row.original.site?.page || row.original.page; return page ? <span className="block max-w-48 truncate text-xs" title={page}>{pathOf(page)}</span> : <span className="text-xs text-nr-ink-amber">需要新页面</span>; } }) as ColumnDef<Suggestion>,
  ], [anchorRef]);
  const table = useDataTable({ data: rows, columns, withSorting: true, enableRowSelection: true, state: { rowSelection }, onRowSelectionChange: setRowSelection, getRowId: (s) => s.id });
  const selected = (view?.items ?? []).filter((s) => rowSelection[s.id]);
  const save = async () => {
    if (!project || !selected.length) return;
    setBusy("save");
    try { const r = await call<{ saved: number; skipped: number }>(project.id, "save", { ids: selected.map((s) => s.id) }); toast.success(`已保存 ${r.saved} 个${r.skipped ? `，${r.skipped} 个原来就有` : ""}`); setRowSelection({}); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "没有保存"); }
    finally { setBusy(""); }
  };
  if (error && !view?.items.length) return <LoadError title="关键词建议没有完成" message={error} />;
  if (!view || (busy === "suggest" && !view.items.length)) return <Card className="px-4"><p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />AI 正在读官网、项目记忆和搜索数据，整理关键词建议，一般半分钟到一分钟…</p></Card>;
  const b = view.basis;
  return (
    <>
      <HandOffNotice result={handOff} />
      <div className="flex flex-wrap items-center justify-between gap-2" data-suggest-basis>
        <p className="nr-footnote">{b ? `根据${b.pages ? `官网 ${b.pages} 个页面` : "官网首页"}、项目记忆${b.queries ? `、Search Console 的 ${b.queries} 个查询` : ""}${b.competitors ? `、${b.competitors} 个竞品` : ""}生成` : ""}{view.at ? ` · ${new Date(view.at).toLocaleDateString("zh-CN")}` : ""}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="目标市场" className="h-8 rounded-md border bg-background px-2 text-sm" value={`${view.market.locationCode}|${view.market.language}`} disabled={Boolean(busy)} onChange={(e) => { const [loc, lang] = e.target.value.split("|"); void run("suggest", { market: { locationCode: Number(loc), language: lang } }); }}>
            {markets.map((m) => <option key={`${m.locationCode}|${m.language}`} value={`${m.locationCode}|${m.language}`}>{m.label}</option>)}
          </select>
          {view.dataforseo && !view.metricsAt ? <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void run("lookup")}>{busy === "lookup" ? "正在查…" : "查搜索量"}</Button> : null}
          <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void run("suggest", { force: true })}><RefreshCw data-icon="inline-start" />{busy === "suggest" ? "正在重新建议…" : "重新建议"}</Button>
        </div>
      </div>
      {error ? <p className="nr-error" role="alert">{error}</p> : null}
      {view.metricsError ? <p className="nr-data-note">搜索量没有查到：{view.metricsError}</p> : !view.dataforseo ? <p className="nr-data-note">接入 DataForSEO 后，建议会一起带上搜索量和难度。<button type="button" className="nr-link" onClick={() => navigate("/connections?source=keywords")}>去接入</button></p> : null}
      <Card className="gap-0 py-0">
        <DataTableTabs value={group} onValueChange={(v) => { setGroup(v); setRowSelection({}); }}>
          <TabsTrigger value="all">全部 ({view.items.length})</TabsTrigger>
          {GROUPS.map((g) => { const n = view.items.filter((s) => s.group === g).length; return n ? <TabsTrigger key={g} value={g}>{g} ({n})</TabsTrigger> : null; })}
        </DataTableTabs>
        <DataTable table={table} empty={{ title: "这一组没有建议" }} />
      </Card>
      <p className="nr-footnote"><Sparkles className="mr-1 inline size-3.5" />AI 的建议只是起点：搜索量、难度是 DataForSEO 的市场估算{view.metricsAt ? `（${new Date(view.metricsAt).toLocaleDateString("zh-CN")}）` : ""}，本站排名来自 Search Console 近 28 天。</p>
      <TableBulkActionBar selectedCount={selected.length} selectedLabel="个关键词已选" onClear={() => setRowSelection({})}
        actions={<>
          <TableBulkActionButton icon={<Bookmark className="size-3.5" />} onClick={() => void save()}>{busy === "save" ? "正在保存…" : "保存"}</TableBulkActionButton>
          <TableBulkActionButton icon={<Bot className="size-3.5" />} onClick={() => setHanding(true)}>交给 Agent</TableBulkActionButton>
        </>} />
      {handing && project && selected.length ? (
        <KeywordHandOffDialog projectId={project.id} rows={selected.map((s) => ({ keyword: s.keyword, market: view.market, volume: s.metrics?.volume ?? null, difficulty: s.metrics?.difficulty ?? null, intent: intentOf(s) ?? null, ...(s.site ? { rank: s.site } : {}) }))}
          onClose={() => setHanding(false)} onDone={(r) => { setHanding(false); setRowSelection({}); setHandOff(r.started ? { ok: true, text: `已交给 Agent：${r.title}`, taskId: r.taskId } : { ok: false, text: `任务已建好，但没能开始：${r.title}。到任务页点“开始”即可。`, taskId: r.taskId }); }} />
      ) : null}
    </>
  );
}
