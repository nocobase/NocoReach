// 关键词 (已保存): ported from every-app/open-seo db8bde1 src/routes/_app/p/$projectId/saved.tsx and
// src/client/features/saved-keywords/ (table, filters, tag filter, tag chips, bulk tags modal, manage tags; MIT).
// Changes: 本站排名 and 本站页面 from the synced Search Console data, 交给 Agent (one task for the chosen keywords),
// saved keywords from 搜索表现 without a market estimate, no paid "update stats", Chinese copy, CSV export only.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { createColumnHelper, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { Bot, Copy, Download, Settings2, Tags, Trash2, Bookmark, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "@/components/seo/data-table";
import { DataTableFilterGroup, DataTableFilterPanel, DataTableFilterToggle, DataTableRangeFilter, DataTableToolbar } from "@/components/seo/data-table-toolbar";
import { TablePagination } from "@/components/seo/table-pagination";
import { TableBulkActionBar, TableBulkActionButton } from "@/components/seo/table-bulk-action-bar";
import { SortableHeader } from "@/components/seo/sortable-header";
import { ScoreBadge } from "@/components/seo/score-badge";
import { IntentBadge, INTENT_LABELS, toIntent } from "@/components/seo/intent-badge";
import { TAG_COLORS, TagChip, TagDot } from "@/components/seo/tag-chip";
import { downloadCsv, normalizeExportValue, type CsvValue } from "@/components/seo/csv";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RankTrackingTab, StartTrackingDialog } from "./rank-tracking-tab";
import KeywordResearch from "./keyword-research";
import { KeywordHandOffDialog, type HandOffKeyword } from "./keyword-hand-off";
import { KeywordSuggestions } from "./keyword-suggestions";
import { KeywordDetail } from "./keyword-research";
import { useProject } from "./reach-data";
import { safeLink } from "./analytics";
import { keywordRequest, marketLabel, metric, rankOf, rankRequest, type Ranks, type SavedKeyword, type Tag } from "./keyword-api";
import { cn } from "@/lib/utils";
import "./reach-workspace.css";
import "./data-views.css";
import {confirmAction} from "@/components/reach/confirm";

type Saved = { tags: Tag[]; items: SavedKeyword[] };
type Filters = { include: string; exclude: string; minVol: string; maxVol: string; minKd: string; maxKd: string; tagIds: string[] };
const EMPTY: Filters = { include: "", exclude: "", minVol: "", maxVol: "", minKd: "", maxKd: "", tagIds: [] };
const PAGE_SIZES = [50, 100] as const;
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const activeCount = (f: Filters) => [f.include, f.exclude, f.minVol || f.maxVol, f.minKd || f.maxKd, f.tagIds.length ? "x" : ""].filter(Boolean).length;
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("zh-CN") : "—");
function applyFilters(rows: SavedKeyword[], f: Filters) {
  const terms = (s: string) => s.split(/[,，]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const inc = terms(f.include), exc = terms(f.exclude), num = (s: string) => (s.trim() === "" ? null : Number(s));
  const [minV, maxV, minK, maxK] = [num(f.minVol), num(f.maxVol), num(f.minKd), num(f.maxKd)];
  return rows.filter((r) => {
    const k = r.keyword.toLowerCase(), v = r.metrics?.volume ?? null, d = r.metrics?.difficulty ?? null;
    if (inc.length && !inc.every((t) => k.includes(t))) return false;
    if (exc.some((t) => k.includes(t))) return false;
    if (minV !== null && (v == null || v < minV)) return false;
    if (maxV !== null && (v == null || v > maxV)) return false;
    if (minK !== null && (d == null || d < minK)) return false;
    if (maxK !== null && (d == null || d > maxK)) return false;
    if (f.tagIds.length && !f.tagIds.some((t) => r.tagIds.includes(t))) return false;
    return true;
  });
}

type Row = SavedKeyword & { rank?: number };
const helper = createColumnHelper<Row>();
export default function SavedKeywords() {
  const navigate = useNavigate();
  const { project } = useProject();
  const [data, setData] = useState<Saved>();
  const [ranks, setRanks] = useState<Ranks>();
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<SavedKeyword>();
  const [dialog, setDialog] = useState<"handoff" | "tags" | "manage" | "delete" | "track">();
  const [params, setParams] = useSearchParams();
  // AI 建议 opens first while nothing is saved (2026-10-04); a tab in the address wins.
  const explicit = (["suggest", "saved", "tracking", "research"] as const).find((t) => t === params.get("tab"));
  const tab = explicit ?? (data && !data.items.length ? "suggest" : "saved");
  // Each tab keeps only its own query: 找新词 owns q, view, loc, lang and run.
  const setTab = (v: string) => { const p = new URLSearchParams(v === "research" ? params : undefined); p.set("tab", v); setParams(p, { replace: true }); };
  const [handOff, setHandOff] = useState<HandOffResult>();
  const anchorRef = useSelectionAnchor();

  const load = () => keywordRequest<Saved>("saved").then((d) => { setData(d); setError(""); return d; }).catch((e) => { setError(e instanceof Error ? e.message : "关键词没有读出来"); return undefined; });
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (project && data?.items.length) void rankRequest(project.id, data.items.map((i) => i.keyword)).then(setRanks).catch(() => undefined);
  }, [project?.id, data?.items.length]);
  useEffect(() => { setPagination((p) => ({ ...p, pageIndex: 0 })); }, [filters]);

  const tags = data?.tags ?? [];
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  // 本站排名 is copied onto each row so sorting sees it (TanStack caches accessor values per data array).
  const rows = useMemo(() => applyFilters(data?.items ?? [], filters).map((r) => ({ ...r, rank: rankOf(ranks, r.keyword)?.position })), [data, filters, ranks]);
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      makeSelectionColumn<Row>(anchorRef),
      helper.accessor("keyword", {
        header: ({ column }) => <SortableHeader column={column} label="关键词" />,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-xs space-y-1">
            <span className="block truncate font-medium" title={row.original.keyword}>{row.original.keyword}</span>
            {row.original.tagIds.length ? <div className="flex flex-wrap gap-1">{row.original.tagIds.map((id) => tagById.get(id)).filter(Boolean).map((t) => <TagChip key={t!.id} tag={t!} />)}</div> : null}
          </div>
        ),
      }) as ColumnDef<Row>,
      helper.accessor((r) => marketLabel(r.market), { id: "market", enableSorting: false, header: () => "市场", cell: ({ row }) => <span className="text-muted-foreground">{row.original.market ? marketLabel(row.original.market) : row.original.source === "ai" ? "AI 建议" : "搜索表现"}</span> }) as ColumnDef<Row>,
      helper.accessor((r) => r.metrics?.volume ?? undefined, { id: "volume", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="月搜索量" align="right" />, cell: ({ row }) => metric(row.original.metrics?.volume), meta: right }) as ColumnDef<Row>,
      helper.accessor((r) => r.metrics?.difficulty ?? undefined, { id: "difficulty", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="难度" align="right" />, cell: ({ row }) => <ScoreBadge value={row.original.metrics?.difficulty ?? null} />, meta: right }) as ColumnDef<Row>,
      helper.accessor((r) => r.metrics?.cpc ?? undefined, { id: "cpc", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="CPC" align="right" />, cell: ({ row }) => (row.original.metrics?.cpc == null ? "—" : `$${row.original.metrics.cpc.toFixed(2)}`), meta: right }) as ColumnDef<Row>,
      helper.display({ id: "intent", header: () => "意图", cell: ({ row }) => (row.original.metrics ? <IntentBadge intent={row.original.metrics.intent} /> : "—") }) as ColumnDef<Row>,
      helper.accessor("rank", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="本站排名" align="right" title="本站近 28 天在 Google 里的平均排名（Search Console）" />, cell: ({ getValue }) => (getValue() == null ? "—" : Number(getValue()).toFixed(1)), meta: right }) as ColumnDef<Row>,
      helper.display({ id: "page", header: () => "本站页面", cell: ({ row }) => { const page = rankOf(ranks, row.original.keyword)?.page; return page ? (safeLink(page) ? <a className="block max-w-56 truncate text-primary hover:underline" href={safeLink(page)} target="_blank" rel="noreferrer" title={page}>{new URL(page).pathname}</a> : <span className="block max-w-56 truncate">{page}</span>) : <span className="text-muted-foreground">—</span>; } }) as ColumnDef<Row>,
      helper.accessor("savedAt", { header: ({ column }) => <SortableHeader column={column} label="保存时间" align="right" />, cell: ({ getValue }) => day(getValue()), meta: right }) as ColumnDef<Row>,
    ],
    [anchorRef, ranks, tagById],
  );
  const table = useDataTable({
    data: rows, columns, withSorting: true, withPagination: true, enableRowSelection: true,
    state: { rowSelection, pagination, sorting }, onRowSelectionChange: setRowSelection, onPaginationChange: setPagination, onSortingChange: setSorting,
    getRowId: (r) => r.id,
  });
  const selected = (data?.items ?? []).filter((r) => rowSelection[r.id]);
  const handOffRows: HandOffKeyword[] = selected.map((r) => ({ keyword: r.keyword, market: r.market, volume: r.metrics?.volume ?? null, difficulty: r.metrics?.difficulty ?? null, intent: r.metrics?.intent ?? null, rank: rankOf(ranks, r.keyword) }));
  const csv = (list: SavedKeyword[]) =>
    downloadCsv("关键词", ["关键词", "市场", "月搜索量", "难度", "CPC", "意图", "本站排名", "本站页面", "标签", "保存时间"], list.map((r): CsvValue[] => [r.keyword, r.market ? marketLabel(r.market) : r.source === "ai" ? "AI 建议" : "搜索表现", r.metrics?.volume, r.metrics?.difficulty, r.metrics?.cpc, r.metrics ? INTENT_LABELS[toIntent(r.metrics.intent)] : "", rankOf(ranks, r.keyword)?.position ?? "", rankOf(ranks, r.keyword)?.page ?? "", r.tagIds.map((id) => tagById.get(id)?.name).filter(Boolean).join("、"), day(r.savedAt)])) || toast.error("没有可以导出的关键词");
  const copy = async () => {
    try { await navigator.clipboard.writeText(selected.map((r) => normalizeExportValue(r.keyword)).join("\n")); toast.success(`已复制 ${selected.length} 个关键词`); }
    catch { toast.error("没能复制到剪贴板"); }
  };

  return (
    <PageContainer className="nr-data-page">
      <PageHeader
        title="关键词"
        description="AI 根据官网先建议一批关键词；也可以自己找新词。保存后对照本站在 Google 里的排名，想看准确名次的可以每周跟踪。"
        actions={data?.items.length && tab === "saved" ? <Button variant="outline" size="sm" onClick={() => csv(rows)}><Download data-icon="inline-start" />导出 CSV</Button> : undefined}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line" className="h-auto! justify-start">
          <TabsTrigger value="suggest">AI 建议</TabsTrigger>
          <TabsTrigger value="saved">已保存{data ? ` (${data.items.length})` : ""}</TabsTrigger>
          <TabsTrigger value="tracking">排名跟踪</TabsTrigger>
          <TabsTrigger value="research">找新词</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "suggest" ? (data || explicit ? <KeywordSuggestions onSaved={() => void load()} /> : <ListSkeleton rows={6} />) : tab === "research" ? <KeywordResearch embedded /> : tab === "tracking" ? <RankTrackingTab ranks={ranks} /> : <>
      <HandOffNotice result={handOff} />
      {error ? <LoadError title="关键词没有读出来" message={error} onRetry={() => void load()} /> : null}
      {!data && !error ? <ListSkeleton rows={6} /> : null}
      {data && !data.items.length ? (
        <EmptyState icon={<Bookmark />} title="还没有保存关键词" description="先看看 AI 根据官网建议的关键词，勾选后保存；也可以在“找新词”里自己输入。" action={<Button onClick={() => setTab("suggest")}>看 AI 建议</Button>} />
      ) : null}
      {data?.items.length ? (
        <Card className="gap-0 py-0">
          <DataTable
            table={table}
            isFiltered={activeCount(filters) > 0}
            onClearFilters={() => setFilters(EMPTY)}
            onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,[role=checkbox],a")) return; setDetail(row.original); }}
            empty={{ title: "还没有保存关键词" }}
            toolbar={
              <>
                <DataTableToolbar>
                  <DataTableFilterToggle open={showFilters} activeCount={activeCount(filters)} onToggle={() => setShowFilters((v) => !v)} />
                  <TagFilter tags={tags} value={filters.tagIds} onChange={(tagIds) => setFilters((f) => ({ ...f, tagIds }))} onManage={() => setDialog("manage")} />
                  <span className="text-xs text-muted-foreground">{activeCount(filters) ? `显示 ${rows.length} 个，共 ${data.items.length} 个` : `共 ${data.items.length} 个关键词`}</span>
                </DataTableToolbar>
                {showFilters ? <SavedFilters value={filters} onChange={setFilters} /> : null}
              </>
            }
            footer={rows.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null}
          />
        </Card>
      ) : null}
      {data?.items.length ? <p className="nr-footnote">搜索量、难度、CPC 是保存时 DataForSEO 的市场估算（从搜索表现保存的没有）；本站排名和页面是近 28 天 Search Console 的数据{ranks?.cutoff ? `（截至 ${ranks.cutoff}）` : ""}。</p> : null}
      <TableBulkActionBar
        selectedCount={selected.length}
        selectedLabel="个关键词已选"
        onClear={() => setRowSelection({})}
        actions={<>
          <TableBulkActionButton icon={<Bot className="size-3.5" />} onClick={() => setDialog("handoff")}>交给 Agent</TableBulkActionButton>
          <TableBulkActionButton icon={<TrendingUp className="size-3.5" />} onClick={() => setDialog("track")}>开始跟踪</TableBulkActionButton>
          <TableBulkActionButton icon={<Tags className="size-3.5" />} onClick={() => setDialog("tags")}>标签</TableBulkActionButton>
          <TableBulkActionButton icon={<Copy className="size-3.5" />} onClick={() => void copy()}>复制</TableBulkActionButton>
          <TableBulkActionButton icon={<Download className="size-3.5" />} onClick={() => csv(selected)}>导出</TableBulkActionButton>
          <TableBulkActionButton icon={<Trash2 className="size-3.5 text-destructive" />} onClick={() => setDialog("delete")}>删除</TableBulkActionButton>
        </>}
      />
      {dialog === "handoff" && project && selected.length ? (
        <KeywordHandOffDialog projectId={project.id} rows={handOffRows} onClose={() => setDialog(undefined)}
          onDone={(r) => { setDialog(undefined); setRowSelection({}); setHandOff(r.started ? { ok: true, text: `已交给 Agent：${r.title}`, taskId: r.taskId } : { ok: false, text: `任务已建好，但没能开始：${r.title}。到任务页点“开始”即可。`, taskId: r.taskId }); }} />
      ) : null}
      {dialog === "tags" && selected.length ? <BulkTagsDialog tags={tags} selected={selected} onClose={() => setDialog(undefined)} onDone={() => { setDialog(undefined); setRowSelection({}); void load(); }} /> : null}
      {dialog === "track" && selected.length ? <StartTrackingDialog keywords={selected.map((r) => ({ keyword: r.keyword, market: r.market }))} onClose={() => setDialog(undefined)} onDone={() => { setDialog(undefined); setRowSelection({}); setTab("tracking"); }} /> : null}
      {dialog === "manage" ? <ManageTagsDialog tags={tags} onClose={() => setDialog(undefined)} onChanged={() => void load()} /> : null}
      {dialog === "delete" && selected.length ? (
        <Dialog open onOpenChange={(o) => { if (!o) setDialog(undefined); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>删除 {selected.length} 个关键词？</DialogTitle><DialogDescription>只删除保存的关键词和它们的标签，研究记录还在，可以再保存。</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="outline" onClick={() => setDialog(undefined)}>取消</Button><Button variant="destructive" onClick={() => void keywordRequest<{ removed: number }>("removeSaved", { ids: selected.map((s) => s.id) }).then((r) => { toast.success(`已删除 ${r.removed} 个关键词`); setRowSelection({}); setDialog(undefined); void load(); }).catch((e) => toast.error(e instanceof Error ? e.message : "没有删除成功"))}>删除</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      </>}
      {detail ? <KeywordDetail item={{ keyword: detail.keyword, volume: detail.metrics?.volume ?? null, difficulty: detail.metrics?.difficulty ?? null, cpc: detail.metrics?.cpc ?? null, competition: detail.metrics?.competition ?? null, intent: detail.metrics?.intent ?? null, monthlySearches: detail.metrics?.monthlySearches ?? [] }} market={detail.market} rank={rankOf(ranks, detail.keyword)} onClose={() => setDetail(undefined)} /> : null}
    </PageContainer>
  );
}

function SavedFilters({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  return (
    <DataTableFilterPanel activeCount={activeCount(value)} onReset={() => onChange(EMPTY)}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <DataTableFilterGroup label="包含"><Input aria-label="包含" className="h-7" placeholder="都要包含，逗号分隔" value={value.include} onChange={(e) => set({ include: e.target.value })} /></DataTableFilterGroup>
        <DataTableFilterGroup label="排除"><Input aria-label="排除" className="h-7" placeholder="任何一个都不要" value={value.exclude} onChange={(e) => set({ exclude: e.target.value })} /></DataTableFilterGroup>
        <DataTableRangeFilter label="月搜索量" min={value.minVol} max={value.maxVol} onChange={(minVol, maxVol) => set({ minVol, maxVol })} />
        <DataTableRangeFilter label="难度" min={value.minKd} max={value.maxKd} onChange={(minKd, maxKd) => set({ minKd, maxKd })} />
      </div>
    </DataTableFilterPanel>
  );
}

// Tag chips to filter by (any of the chosen tags) and the way into 管理标签.
function TagFilter({ tags, value, onChange, onManage }: { tags: Tag[]; value: string[]; onChange: (ids: string[]) => void; onManage: () => void }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="按标签筛选">
      {tags.map((t) => <TagChip key={t.id} tag={t} selected={value.includes(t.id)} onClick={() => onChange(value.includes(t.id) ? value.filter((x) => x !== t.id) : [...value, t.id])} />)}
      <Button variant="ghost" size="icon-xs" aria-label="管理标签" title="管理标签" onClick={onManage}><Settings2 /></Button>
    </div>
  );
}

// Add tags (pick or create by name) and remove tags the chosen keywords carry, in one save.
function BulkTagsDialog({ tags, selected, onClose, onDone }: { tags: Tag[]; selected: SavedKeyword[]; onClose: () => void; onDone: () => void }) {
  const [add, setAdd] = useState<string[]>([]);
  const [remove, setRemove] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const present = tags.filter((t) => selected.some((s) => s.tagIds.includes(t.id)));
  const q = text.trim(), matches = tags.filter((t) => !add.includes(t.name) && (!q || t.name.toLowerCase().includes(q.toLowerCase())));
  const canCreate = q.length > 0 && q.length <= 40 && !tags.some((t) => t.name.toLowerCase() === q.toLowerCase()) && !add.some((a) => a.toLowerCase() === q.toLowerCase());
  const pick = (name: string) => { setAdd((a) => [...a, name]); setText(""); };
  const save = async () => {
    setBusy(true);
    try { await keywordRequest("tagSaved", { ids: selected.map((s) => s.id), add, remove }); toast.success("标签已更新"); onDone(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "标签没有更新"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>给 {selected.length} 个关键词改标签</DialogTitle><DialogDescription>选已有的标签或输入新名字回车创建；点下面已有的标签可以去掉。</DialogDescription></DialogHeader>
        <div className="space-y-4 text-sm">
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">加标签</p>
            {add.length ? <div className="flex flex-wrap gap-1.5">{add.map((name) => { const t = tags.find((x) => x.name === name); return <TagChip key={name} tag={t ?? { id: name, name, color: TAG_COLORS[(tags.length + add.indexOf(name)) % TAG_COLORS.length] }} onClick={() => setAdd((a) => a.filter((x) => x !== name))} trailing={<span aria-hidden>×</span>} />; })}</div> : null}
            <Input aria-label="搜索或新建标签" placeholder="搜索或新建标签" value={text} maxLength={40} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const exact = tags.find((t) => t.name.toLowerCase() === q.toLowerCase()); if (exact && !add.includes(exact.name)) pick(exact.name); else if (canCreate) pick(q); } }} />
            <div className="flex flex-wrap gap-1.5">
              {matches.slice(0, 20).map((t) => <TagChip key={t.id} tag={t} onClick={() => pick(t.name)} />)}
              {canCreate ? <Button variant="outline" size="xs" onClick={() => pick(q)}>新建“{q}”</Button> : null}
            </div>
          </section>
          {present.length ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">去掉标签</p>
              <div className="flex flex-wrap gap-1.5">{present.map((t) => <span key={t.id} className={cn(remove.includes(t.id) && "line-through opacity-50")}><TagChip tag={t} selected={remove.includes(t.id)} onClick={() => setRemove((r) => (r.includes(t.id) ? r.filter((x) => x !== t.id) : [...r, t.id]))} /></span>)}</div>
            </section>
          ) : null}
        </div>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy || (!add.length && !remove.length)} onClick={() => void save()}>{busy ? "正在保存…" : "保存"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Rename, recolor or delete tags (deleting removes the tag from every keyword).
function ManageTagsDialog({ tags, onClose, onChanged }: { tags: Tag[]; onClose: () => void; onChanged: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>管理标签</DialogTitle><DialogDescription>改名字、换颜色或删除；删除后关键词上的这个标签也会去掉。</DialogDescription></DialogHeader>
        <div className="max-h-96 space-y-2 overflow-y-auto">{tags.map((t) => <ManageTagRow key={t.id + t.name + t.color} tag={t} onChanged={onChanged} />)}{!tags.length ? <p className="text-sm text-muted-foreground">还没有标签。</p> : null}</div>
        <DialogFooter><Button variant="outline" onClick={onClose}>完成</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function ManageTagRow({ tag, onChanged }: { tag: Tag; onChanged: () => void }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [busy, setBusy] = useState(false);
  const act = async (action: "updateTag" | "deleteTag", body: object) => {
    setBusy(true);
    try { await keywordRequest(action, { tagId: tag.id, ...body }); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "没有保存成功"); }
    finally { setBusy(false); }
  };
  const changed = name.trim() !== tag.name || color !== tag.color;
  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5" data-tag={tag.name}>
      <div className="flex items-center gap-2">
        <TagDot color={color} />
        <Input aria-label={`标签 ${tag.name} 的名字`} className="h-7 flex-1" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <Button size="xs" disabled={busy || !changed || !name.trim()} onClick={() => void act("updateTag", { ...(name.trim() !== tag.name ? { name } : {}), ...(color !== tag.color ? { color } : {}) })}>保存</Button>
        <Button size="icon-xs" variant="ghost" aria-label={`删除标签 ${tag.name}`} disabled={busy} onClick={async() => { if (await confirmAction({ title: `删除标签“${tag.name}”？`, description: '关键词上的这个标签一起去掉。', action: '删除' })) void act("deleteTag", {}); }}><Trash2 className="text-destructive" /></Button>
      </div>
      <div className="flex gap-1.5" role="group" aria-label="颜色">
        {TAG_COLORS.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={color === c} className={cn("rounded-full p-0.5", color === c && "ring-2 ring-ring")} onClick={() => setColor(c)}><TagDot color={c} /></button>)}
      </div>
    </div>
  );
}
