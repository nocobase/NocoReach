import { useMessageState, $t, $tj, $legacyText } from "#i18n";
// 关键词 (已保存): ported from every-app/open-seo db8bde1 src/routes/_app/p/$projectId/saved.tsx and
// src/client/features/saved-keywords/ (table, filters, tag filter, tag chips, bulk tags modal, manage tags; MIT).
// Changes: 本站排名 and 本站页面 from the synced Search Console data, 交给 Agent (one task for the chosen keywords),
// saved keywords from 搜索表现 without a market estimate, no paid "update stats", Chinese copy, CSV export only.
import { HandOffBar } from "./hand-off-bar";
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate, useSearchParams } from "react-router";
import { createColumnHelper, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { Copy, Download, Settings2, Tags, Trash2, Bookmark, TrendingUp } from "lucide-react";
import { toast } from "#lib/toast";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#components/ui/dialog";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableFilterGroup, DataTableFilterPanel, DataTableFilterToggle, DataTableRangeFilter, DataTableToolbar } from "#components/seo/data-table-toolbar";
import { TablePagination } from "#components/seo/table-pagination";
import { TableBulkActionButton } from "#components/seo/table-bulk-action-bar";
import { SortableHeader } from "#components/seo/sortable-header";
import { ScoreBadge } from "#components/seo/score-badge";
import { IntentBadge, getIntentLabels, toIntent } from "#components/seo/intent-badge";
import { TAG_COLORS, TagChip, TagDot } from "#components/seo/tag-chip";
import { downloadCsv, normalizeExportValue, type CsvValue } from "#components/seo/csv";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { Tabs, TabsList, TabsTrigger } from "#components/ui/tabs";
import { RankTrackingTab, StartTrackingDialog } from "./rank-tracking-tab";
import KeywordResearch from "./keyword-research";
import { KeywordHandOffDialog, type HandOffKeyword } from "./keyword-hand-off";
import { KeywordSuggestions } from "./keyword-suggestions";
import { useProject } from "./reach-data";
import { safeLink } from "./analytics";
import { keywordRequest, marketLabel, metric, rankOf, rankRequest, useOpenKeyword, type Ranks, type SavedKeyword, type Tag } from "./keyword-api";
import { cn } from "#lib/utils";
import "./reach-workspace.css";
import "./data-views.css";
import {confirmAction} from "#components/reach/confirm";
import { WithInfo } from "#components/reach/info-tip";
import { help } from "./glossary";
import { formatDate } from '#lib/format';

type Saved = { tags: Tag[]; items: SavedKeyword[] };
type Filters = { include: string; exclude: string; minVol: string; maxVol: string; minKd: string; maxKd: string; tagIds: string[] };
const EMPTY: Filters = { include: "", exclude: "", minVol: "", maxVol: "", minKd: "", maxKd: "", tagIds: [] };
const PAGE_SIZES = [50, 100] as const;
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const activeCount = (f: Filters) => [f.include, f.exclude, f.minVol || f.maxVol, f.minKd || f.maxKd, f.tagIds.length ? "x" : ""].filter(Boolean).length;
const day = (v?: string | null) => formatDate(v);
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
  const [error, setError] = useMessageState("");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const openKeyword = useOpenKeyword();
  const [dialog, setDialog] = useState<"handoff" | "tags" | "manage" | "delete" | "track">();
  const [params, setParams] = useSearchParams();
  // AI 建议 opens first while nothing is saved (2026-10-04); a tab in the address wins.
  const explicit = (["suggest", "saved", "tracking", "research"] as const).find((t) => t === params.get("tab"));
  const tab = explicit ?? (data && !data.items.length ? "suggest" : "saved");
  // Each tab keeps only its own query: 找新词 owns q, view, loc, lang and run.
  const setTab = (v: string) => { const p = new URLSearchParams(v === "research" ? params : undefined); p.set("tab", v); setParams(p, { replace: true }); };
  const [handOff, setHandOff] = useState<HandOffResult>();
  const anchorRef = useSelectionAnchor();

  const load = useCallback(() => keywordRequest<Saved>("saved").then((d) => { setData(d); setError(""); return d; }).catch((e) => { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('savedKeywords.notLoadKeywords'))); return undefined; }), [setError]);
  useEffect(() => { void load(); }, [load]);
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
        header: ({ column }) => <SortableHeader column={column} label={$t('common.keywords')} />,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-xs space-y-1">
            <span className="block truncate font-medium" title={row.original.keyword}>{row.original.keyword}</span>
            {row.original.tagIds.length ? <div className="flex flex-wrap gap-1">{row.original.tagIds.map((id) => tagById.get(id)).filter(Boolean).map((t) => <TagChip key={t!.id} tag={t!} />)}</div> : null}
          </div>
        ),
      }) as ColumnDef<Row>,
      helper.accessor((r) => marketLabel(r.market), { id: "market", enableSorting: false, header: () => $t('common.market'), cell: ({ row }) => <span className="text-muted-foreground">{row.original.market ? marketLabel(row.original.market) : row.original.source === "ai" ? $t('common.aiSuggestions') : $t('common.searchPerformance')}</span> }) as ColumnDef<Row>,
      helper.accessor((r) => r.metrics?.volume ?? undefined, { id: "volume", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.monthlyVolume')} align="right" help={$t('savedKeywords.numbersTimeSavingKeywordsSaved',{0:help($t('common.monthlyVolume'))})} />, cell: ({ row }) => metric(row.original.metrics?.volume), meta: right }) as ColumnDef<Row>,
      helper.accessor((r) => r.metrics?.difficulty ?? undefined, { id: "difficulty", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.difficulty')} align="right" />, cell: ({ row }) => <ScoreBadge value={row.original.metrics?.difficulty ?? null} />, meta: right }) as ColumnDef<Row>,
      helper.accessor((r) => r.metrics?.cpc ?? undefined, { id: "cpc", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="CPC" align="right" />, cell: ({ row }) => (row.original.metrics?.cpc == null ? "—" : `$${row.original.metrics.cpc.toFixed(2)}`), meta: right }) as ColumnDef<Row>,
      helper.display({ id: "intent", header: () => <WithInfo help={help($t('common.intent'))}>{$t('common.intent')}</WithInfo>, cell: ({ row }) => (row.original.metrics ? <IntentBadge intent={row.original.metrics.intent} /> : "—") }) as ColumnDef<Row>,
      helper.accessor("rank", { sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.sitePosition')} align="right" />, cell: ({ getValue }) => (getValue() == null ? "—" : Number(getValue()).toFixed(1)), meta: right }) as ColumnDef<Row>,
      helper.display({ id: "page", header: () => $t('savedKeywords.page'), cell: ({ row }) => { const page = rankOf(ranks, row.original.keyword)?.page; return page ? (safeLink(page) ? <a className="block max-w-56 truncate text-primary hover:underline" href={safeLink(page)} target="_blank" rel="noreferrer" title={page}>{new URL(page).pathname}</a> : <span className="block max-w-56 truncate">{page}</span>) : <span className="text-muted-foreground">—</span>; } }) as ColumnDef<Row>,
      helper.accessor("savedAt", { header: ({ column }) => <SortableHeader column={column} label={$t('savedKeywords.saved')} align="right" />, cell: ({ getValue }) => day(getValue()), meta: right }) as ColumnDef<Row>,
    ],
    [anchorRef, ranks, tagById],
  );
  const table = useDataTable({
    data: rows, columns, withSorting: true, withPagination: true, enableRowSelection: true,
    state: { rowSelection, pagination, sorting }, onRowSelectionChange: setRowSelection, onPaginationChange: setPagination, onSortingChange: setSorting,
    getRowId: (r) => r.id,
  });
  const selected = (data?.items ?? []).filter((r) => rowSelection[r.id]);
  useHandOffSource("saved-keywords", tab === "saved" && data?.items.length ? { count: selected.length, open: () => setDialog("handoff"), noun: $t('common.keywordsSelected'), actions: <> <TableBulkActionButton icon={<TrendingUp className="size-3.5" />} onClick={() => setDialog("track")}>{$t('common.startTracking')}</TableBulkActionButton> <TableBulkActionButton icon={<Tags className="size-3.5" />} onClick={() => setDialog("tags")}>{$t('savedKeywords.tags')}</TableBulkActionButton> <TableBulkActionButton icon={<Copy className="size-3.5" />} onClick={() => void copy()}>{$t('savedKeywords.copy')}</TableBulkActionButton> <TableBulkActionButton icon={<Download className="size-3.5" />} onClick={() => csv(selected)}>{$t('common.export')}</TableBulkActionButton> <TableBulkActionButton icon={<Trash2 className="size-3.5 text-destructive" />} onClick={() => setDialog("delete")}>{$t('common.delete')}</TableBulkActionButton> </>, clear: () => setRowSelection({}) } : null);
  const handOffRows: HandOffKeyword[] = selected.map((r) => ({ keyword: r.keyword, market: r.market, volume: r.metrics?.volume ?? null, difficulty: r.metrics?.difficulty ?? null, intent: r.metrics?.intent ?? null, rank: rankOf(ranks, r.keyword) }));
  const csv = (list: SavedKeyword[]) =>
    downloadCsv($t('common.keywords'), [$t('common.keywords'), $t('common.market'), $t('common.monthlyVolume'), $t('common.difficulty'), "CPC", $t('common.intent'), $t('common.sitePosition'), $t('savedKeywords.page'), $t('savedKeywords.tags'), $t('savedKeywords.saved')], list.map((r): CsvValue[] => [r.keyword, r.market ? marketLabel(r.market) : r.source === "ai" ? $t('common.aiSuggestions') : $t('common.searchPerformance'), r.metrics?.volume, r.metrics?.difficulty, r.metrics?.cpc, r.metrics ? getIntentLabels()[toIntent(r.metrics.intent)] : "", rankOf(ranks, r.keyword)?.position ?? "", rankOf(ranks, r.keyword)?.page ?? "", r.tagIds.map((id) => tagById.get(id)?.name).filter(Boolean).join("、"), day(r.savedAt)])) || toast.error(() => ($t('common.noKeywordsExport')));
  const copy = async () => {
    try { await navigator.clipboard.writeText(selected.map((r) => normalizeExportValue(r.keyword)).join("\n")); toast.success(() => ($t('common.keywordsCopied',{0:selected.length}))); }
    catch { toast.error(() => ($t('common.notCopyClipboard'))); }
  };

  return (
    <PageContainer className="nr-data-page">
      <PageHeader
        title={$t('common.keywords')}
        description={$t('savedKeywords.aiSuggestsFirstBatchKeywords')}
        actions={data?.items.length && tab === "saved" ? <Button variant="outline" size="sm" onClick={() => csv(rows)}><Download data-icon="inline-start" />{$t('common.exportCsv')}</Button> : undefined}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line" className="h-auto! justify-start">
          <TabsTrigger value="suggest">{$t('common.aiSuggestions')}</TabsTrigger>
          <TabsTrigger value="research">{$t('common.findKeywords')}</TabsTrigger>
          <TabsTrigger value="saved">{$tj('savedKeywords.savedValue',{0:data ? ` ${data.items.length}` : ""})}</TabsTrigger>
          <TabsTrigger value="tracking">{$t('common.rankTracking')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "suggest" ? (data || explicit ? <KeywordSuggestions onSaved={() => void load()} /> : <ListSkeleton rows={6} />) : tab === "research" ? <KeywordResearch embedded /> : tab === "tracking" ? <RankTrackingTab ranks={ranks} /> : <>
      <HandOffNotice result={handOff} />
      {error ? <LoadError title={$t('savedKeywords.notLoadKeywords')} message={error} onRetry={() => void load()} /> : null}
      {!data && !error ? <ListSkeleton rows={6} /> : null}
      {data && !data.items.length ? (
        <EmptyState icon={<Bookmark />} title={$t('savedKeywords.noSavedKeywordsYet')} description={$t('savedKeywords.seeKeywordsAiSuggestsWebsite')} action={<Button onClick={() => setTab("suggest")}>{$t('savedKeywords.seeAiSuggestions')}</Button>} />
      ) : null}
      {data?.items.length ? (
        <Card className="gap-0 py-0">
          <DataTable
            table={table}
            isFiltered={activeCount(filters) > 0}
            onClearFilters={() => setFilters(EMPTY)}
            onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,[role=checkbox],a")) return; openKeyword(row.original.keyword, row.original.market); }}
            empty={{ title: $t('savedKeywords.noSavedKeywordsYet') }}
            toolbar={
              <>
                <DataTableToolbar>
                  <DataTableFilterToggle open={showFilters} activeCount={activeCount(filters)} onToggle={() => setShowFilters((v) => !v)} />
                  <TagFilter tags={tags} value={filters.tagIds} onChange={(tagIds) => setFilters((f) => ({ ...f, tagIds }))} onManage={() => setDialog("manage")} />
                  <span className="text-xs text-muted-foreground">{activeCount(filters) ? $t('common.showing',{0:rows.length,1:data.items.length}) : $t('common.keywordsTotal',{0:data.items.length})}</span>
                </DataTableToolbar>
                {showFilters ? <SavedFilters value={filters} onChange={setFilters} /> : null}
              </>
            }
            footer={rows.length > 0 ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={PAGE_SIZES} totalCount={rows.length} onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null}
          />
        </Card>
      ) : null}
      {dialog === "handoff" && project && selected.length ? (
        <KeywordHandOffDialog projectId={project.id} rows={handOffRows} onClose={() => setDialog(undefined)}
          onDone={(r) => { setDialog(undefined); setRowSelection({}); setHandOff({ ok: true, text: r.title, taskId: r.taskId }); }} />
      ) : null}
      {dialog === "tags" && selected.length ? <BulkTagsDialog tags={tags} selected={selected} onClose={() => setDialog(undefined)} onDone={() => { setDialog(undefined); setRowSelection({}); void load(); }} /> : null}
      {dialog === "track" && selected.length ? <StartTrackingDialog keywords={selected.map((r) => ({ keyword: r.keyword, market: r.market }))} onClose={() => setDialog(undefined)} onDone={() => { setDialog(undefined); setRowSelection({}); setTab("tracking"); }} /> : null}
      {dialog === "manage" ? <ManageTagsDialog tags={tags} onClose={() => setDialog(undefined)} onChanged={() => void load()} /> : null}
      {dialog === "delete" && selected.length ? (
        <Dialog open onOpenChange={(o) => { if (!o) setDialog(undefined); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{$tj('savedKeywords.deleteKeywords',{0:selected.length})}</DialogTitle><DialogDescription>{$t('savedKeywords.savedKeywordsTagsDeletedResearch')}</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="outline" onClick={() => setDialog(undefined)}>{$t('common.cancel')}</Button><Button variant="destructive" onClick={() => void keywordRequest<{ removed: number }>("removeSaved", { ids: selected.map((s) => s.id) }).then((r) => { toast.success(() => ($t('savedKeywords.keywordsDeleted',{0:r.removed}))); setRowSelection({}); setDialog(undefined); void load(); }).catch((e) => toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('savedKeywords.notDelete'))))}>{$t('common.delete')}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      </>}
      <HandOffBar projectId={project?.id} />
      <Outlet />
    </PageContainer>
  );
}

function SavedFilters({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  return (
    <DataTableFilterPanel activeCount={activeCount(value)} onReset={() => onChange(EMPTY)}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <DataTableFilterGroup label={$t('common.include')}><Input aria-label={$t('common.include')} className="h-7" placeholder={$t('common.containCommaSeparated')} value={value.include} onChange={(e) => set({ include: e.target.value })} /></DataTableFilterGroup>
        <DataTableFilterGroup label={$t('common.exclude')}><Input aria-label={$t('common.exclude')} className="h-7" placeholder={$t('common.excludeAny')} value={value.exclude} onChange={(e) => set({ exclude: e.target.value })} /></DataTableFilterGroup>
        <DataTableRangeFilter label={$t('common.monthlyVolume')} min={value.minVol} max={value.maxVol} onChange={(minVol, maxVol) => set({ minVol, maxVol })} />
        <DataTableRangeFilter label={$t('common.difficulty')} min={value.minKd} max={value.maxKd} onChange={(minKd, maxKd) => set({ minKd, maxKd })} />
      </div>
    </DataTableFilterPanel>
  );
}

// Tag chips to filter by (any of the chosen tags) and the way into 管理标签.
function TagFilter({ tags, value, onChange, onManage }: { tags: Tag[]; value: string[]; onChange: (ids: string[]) => void; onManage: () => void }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={$t('savedKeywords.filterTag')}>
      {tags.map((t) => <TagChip key={t.id} tag={t} selected={value.includes(t.id)} onClick={() => onChange(value.includes(t.id) ? value.filter((x) => x !== t.id) : [...value, t.id])} />)}
      <Button variant="ghost" size="icon-xs" aria-label={$t('savedKeywords.manageTags')} title={$t('savedKeywords.manageTags')} onClick={onManage}><Settings2 /></Button>
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
    try { await keywordRequest("tagSaved", { ids: selected.map((s) => s.id), add, remove }); toast.success(() => ($t('savedKeywords.tagsUpdated'))); onDone(); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('savedKeywords.tagsNotUpdated'))); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{$tj('savedKeywords.changeTagsKeywords',{0:selected.length})}</DialogTitle><DialogDescription>{$t('savedKeywords.pickExistingTagTypeNew')}</DialogDescription></DialogHeader>
        <div className="space-y-4 text-sm">
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">{$t('savedKeywords.addTag')}</p>
            {add.length ? <div className="flex flex-wrap gap-1.5">{add.map((name) => { const t = tags.find((x) => x.name === name); return <TagChip key={name} tag={t ?? { id: name, name, color: TAG_COLORS[(tags.length + add.indexOf(name)) % TAG_COLORS.length] }} onClick={() => setAdd((a) => a.filter((x) => x !== name))} trailing={<span aria-hidden>×</span>} />; })}</div> : null}
            <Input aria-label={$t('savedKeywords.searchCreateTag')} placeholder={$t('savedKeywords.searchCreateTag')} value={text} maxLength={40} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const exact = tags.find((t) => t.name.toLowerCase() === q.toLowerCase()); if (exact && !add.includes(exact.name)) pick(exact.name); else if (canCreate) pick(q); } }} />
            <div className="flex flex-wrap gap-1.5">
              {matches.slice(0, 20).map((t) => <TagChip key={t.id} tag={t} onClick={() => pick(t.name)} />)}
              {canCreate ? <Button variant="outline" size="xs" onClick={() => pick(q)}>{$tj('savedKeywords.create',{0:q})}</Button> : null}
            </div>
          </section>
          {present.length ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{$t('savedKeywords.removeTag')}</p>
              <div className="flex flex-wrap gap-1.5">{present.map((t) => <span key={t.id} className={cn(remove.includes(t.id) && "line-through opacity-50")}><TagChip tag={t} selected={remove.includes(t.id)} onClick={() => setRemove((r) => (r.includes(t.id) ? r.filter((x) => x !== t.id) : [...r, t.id]))} /></span>)}</div>
            </section>
          ) : null}
        </div>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>{$t('common.cancel')}</Button><Button disabled={busy || (!add.length && !remove.length)} onClick={() => void save()}>{busy ? $t('common.saving') : $t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Rename, recolor or delete tags (deleting removes the tag from every keyword).
function ManageTagsDialog({ tags, onClose, onChanged }: { tags: Tag[]; onClose: () => void; onChanged: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{$t('savedKeywords.manageTags')}</DialogTitle><DialogDescription>{$t('savedKeywords.renameRecolorDeleteDeletingRemoves')}</DialogDescription></DialogHeader>
        <div className="max-h-96 space-y-2 overflow-y-auto">{tags.map((t) => <ManageTagRow key={t.id + t.name + t.color} tag={t} onChanged={onChanged} />)}{!tags.length ? <p className="text-sm text-muted-foreground">{$t('savedKeywords.noTagsYet')}</p> : null}</div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{$t('common.complete')}</Button></DialogFooter>
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
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.saveFailed'))); }
    finally { setBusy(false); }
  };
  const changed = name.trim() !== tag.name || color !== tag.color;
  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5" data-tag={tag.name}>
      <div className="flex items-center gap-2">
        <TagDot color={color} />
        <Input aria-label={$t('savedKeywords.nameTag',{0:tag.name})} className="h-7 flex-1" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <Button size="xs" disabled={busy || !changed || !name.trim()} onClick={() => void act("updateTag", { ...(name.trim() !== tag.name ? { name } : {}), ...(color !== tag.color ? { color } : {}) })}>{$t('common.save')}</Button>
        <Button size="icon-xs" variant="ghost" aria-label={$t('savedKeywords.deleteTagValue',{0:tag.name})} disabled={busy} onClick={async() => { if (await confirmAction({ title: () => ($t('savedKeywords.deleteTagValueConfirmation',{0:tag.name})), description: () => ($t('savedKeywords.tagRemovedKeywordsToo')), action: 'common.delete' })) void act("deleteTag", {}); }}><Trash2 className="text-destructive" /></Button>
      </div>
      <div className="flex gap-1.5" role="group" aria-label={$t('savedKeywords.color')}>
        {TAG_COLORS.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={color === c} className={cn("rounded-full p-0.5", color === c && "ring-2 ring-ring")} onClick={() => setColor(c)}><TagDot color={c} /></button>)}
      </div>
    </div>
  );
}
