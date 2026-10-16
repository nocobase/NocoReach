import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
// 关键词 › AI 建议 (2026-10-04): keywords the online AI suggests from the website, 记忆, Search Console and competitors,
// in groups with why and which page could answer them; the site's own rank next to each, search volume and difficulty
// when DataForSEO is connected. Made the first time the tab opens; after that only on 重新建议. Ticked keywords are saved
// to 已保存 or go to the Agent.
// Market trends (2026-10-16) sits beside it as the other source, chosen by `from=market` in the address.
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Bookmark, LineChart, LoaderCircle, RefreshCw } from "lucide-react";
import { AiMark } from "#components/reach/actor";
import { toast } from "#lib/toast";
import { LoadError, InlineError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "#components/ui/tabs";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableTabs } from "#components/seo/data-table-toolbar";
import { TableBulkActionButton } from "#components/seo/table-bulk-action-bar";
import { SortableHeader } from "#components/seo/sortable-header";
import { ScoreBadge } from "#components/seo/score-badge";
import { IntentBadge } from "#components/seo/intent-badge";
import { useProject } from "./reach-data";
import { getMarkets, metric, useOpenKeyword } from "./keyword-api";
import { KeywordHandOffDialog } from "./keyword-hand-off";
import { KeywordTrends } from "./keyword-trends";
import { StartTrackingDialog } from "./rank-tracking-tab";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { WithInfo, InfoTip } from "#components/reach/info-tip";
import { help } from "./glossary";

type Metrics = { volume: number | null; difficulty: number | null; cpc: number | null; intent: string | null };
type Suggestion = { id: string; keyword: string; group: string; intent: string | null; reason: string; page: string | null; site: { position: number; clicks: number; impressions: number; page: string } | null; metrics: Metrics | null };
type View = { at?: string; market: { locationCode: number; language: string }; items: Suggestion[]; basis?: { pages: number; home: boolean; queries: number; competitors: number }; metricsAt?: string | null; metricsError?: string | null; dataforseo: boolean };
// Keep persisted group identities unchanged; display uses an explicit semantic-key map.
const GROUP_KEYS: Record<string, string> = {"产品与功能词": 'keywordSuggestions.groups.product', "使用场景与问题词": 'keywordSuggestions.groups.useCase', "对比与替代词": 'keywordSuggestions.groups.comparison', "品类与行业词": 'keywordSuggestions.groups.industry'};
const GROUPS = ['产品与功能词', '使用场景与问题词', '对比与替代词', '品类与行业词'] as const;
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrKeywordSuggest", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const helper = createColumnHelper<Suggestion>();
// DataForSEO's intent when looked up, otherwise the AI's (a comparison is a commercial search).
const intentOf = (s: Suggestion) => s.metrics?.intent || (s.intent === "comparison" ? "commercial" : s.intent);

export function KeywordSuggestions({ onSaved }: { onSaved: () => void }) {
  const [params, setParams] = useSearchParams();
  const from = params.get("from") === "market" ? "market" : "site";
  const setFrom = (v: string) => { const p = new URLSearchParams(params); if (v === "market") p.set("from", "market"); else p.delete("from"); setParams(p, { replace: true }); };
  const switcher = (
    <Tabs value={from} onValueChange={(v) => setFrom(String(v))}>
      <TabsList aria-label={$t('keywordTrends.source')}>
        <TabsTrigger value="site">{$t('keywordTrends.fromWebsite')}</TabsTrigger>
        <TabsTrigger value="market">{$t('keywordTrends.marketTrends')}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
  return from === "market" ? <KeywordTrends switcher={switcher} onSaved={onSaved} /> : <SiteSuggestions switcher={switcher} onSaved={onSaved} />;
}

function SiteSuggestions({ switcher, onSaved }: { switcher: ReactNode; onSaved: () => void }) {
  const { project } = useProject();
  const navigate = useNavigate();
  const [view, setView] = useState<View>();
  const openKeyword = useOpenKeyword();
  const [error, setError] = useMessageState("");
  const [busy, setBusy] = useState<"" | "suggest" | "lookup" | "save">("");
  const [group, setGroup] = useState("all");
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [handing, setHanding] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [handOff, setHandOff] = useState<HandOffResult>();
  const anchorRef = useSelectionAnchor();
  const run = async (action: "suggest" | "lookup", body: object = {}) => {
    if (!project) return;
    setBusy(action); setError("");
    try { setView(await call<View>(project.id, action, body)); setRowSelection({}); }
    catch (e) { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('keywordSuggestions.notCompleteTryAgain'))); }
    finally { setBusy(""); }
  };
  // The first time: nothing suggested yet, so suggest right away.
  useEffect(() => {
    if (!project) return;
    setView(undefined);
    void call<View>(project.id, "view").then((v) => { setView(v); if (!v.items.length) void run("suggest"); }).catch((e) => setError(() => (e instanceof Error ? $legacyText(e.message) : $t('keywordSuggestions.notLoad'))));
  }, [project?.id]);
  const rows = useMemo(() => (view?.items ?? []).filter((s) => group === "all" || s.group === group), [view, group]);
  const columns = useMemo<ColumnDef<Suggestion>[]>(() => [
    makeSelectionColumn<Suggestion>(anchorRef),
    helper.accessor("keyword", {
      header: ({ column }) => <SortableHeader column={column} label={$t('common.keywords')} />,
      cell: ({ row }) => <div className="min-w-0 max-w-sm"><span className="block truncate font-medium" title={row.original.keyword}>{row.original.keyword}</span><span className="block truncate text-xs text-muted-foreground" title={row.original.reason}>{row.original.reason}</span></div>,
    }) as ColumnDef<Suggestion>,
    helper.accessor("group", { enableSorting: false, header: () => $t('keywordSuggestions.group'), cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{$t(GROUP_KEYS[String(getValue())] ?? String(getValue()))}</span> }) as ColumnDef<Suggestion>,
    helper.display({ id: "intent", header: () => <WithInfo help={help($t('common.intent'))}>{$t('common.intent')}</WithInfo>, cell: ({ row }) => <IntentBadge intent={intentOf(row.original)} /> }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.metrics?.volume ?? undefined, { id: "volume", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.monthlyVolume')} align="right" />, cell: ({ row }) => metric(row.original.metrics?.volume), meta: right }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.metrics?.difficulty ?? undefined, { id: "difficulty", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.difficulty')} align="right" />, cell: ({ row }) => <ScoreBadge value={row.original.metrics?.difficulty ?? null} />, meta: right }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.site?.position ?? undefined, { id: "rank", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.sitePosition')} align="right" />, cell: ({ row }) => row.original.site ? <span title={$t('keywordSuggestions.clicksImpressions',{0:row.original.site.clicks,1:row.original.site.impressions})}>{row.original.site.position.toFixed(1)}</span> : <span className="text-muted-foreground">—</span>, meta: right }) as ColumnDef<Suggestion>,
    helper.display({ id: "page", header: () => $t('keywordSuggestions.matchingPage'), cell: ({ row }) => { const page = row.original.site?.page || row.original.page; return page ? <span className="block max-w-48 truncate text-xs" title={page}>{pathOf(page)}</span> : <span className="text-xs text-muted-foreground">{$t('keywordSuggestions.needsNewPage')}</span>; } }) as ColumnDef<Suggestion>,
  ], [anchorRef]);
  const table = useDataTable({ data: rows, columns, withSorting: true, enableRowSelection: true, state: { rowSelection }, onRowSelectionChange: setRowSelection, getRowId: (s) => s.id });
  const selected = (view?.items ?? []).filter((s) => rowSelection[s.id]);
  useHandOffSource("keyword-suggestions", view?.items.length ? { count: selected.length, open: () => setHanding(true), noun: $t('common.keywordsSelected'), actions: <> <TableBulkActionButton icon={<Bookmark className="size-3.5" />} onClick={() => void save()}>{busy === "save" ? $t('common.saving') : $t('common.save')}</TableBulkActionButton><TableBulkActionButton icon={<LineChart className="size-3.5" />} onClick={() => setTracking(true)}>{$t('keywordTrends.trackRank')}</TableBulkActionButton> </>, clear: () => setRowSelection({}) } : null);
  const save = async () => {
    if (!project || !selected.length) return;
    setBusy("save");
    try { const r = await call<{ saved: number; skipped: number }>(project.id, "save", { ids: selected.map((s) => s.id) }); toast.success(() => ($t('keywordSuggestions.saved',{0:r.saved,1:r.skipped ? $t('keywordSuggestions.alreadyThere',{0:r.skipped}) : ""}))); setRowSelection({}); onSaved(); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.notSaved'))); }
    finally { setBusy(""); }
  };
  if (error && !view?.items.length) return <><div className="flex flex-wrap items-center justify-between gap-2">{switcher}</div><LoadError title={$t('keywordSuggestions.keywordSuggestionsNotComplete')} message={error} /></>;
  if (!view || (busy === "suggest" && !view.items.length)) return <><div className="flex flex-wrap items-center justify-between gap-2">{switcher}</div><Card className="px-4"><p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{$t('keywordSuggestions.aiReadingWebsiteProjectMemory')}</p></Card></>;
  const b = view.basis;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {switcher}
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={$t('keywordSuggestions.targetMarket')} className="h-8 rounded-md border bg-background px-2 text-sm" value={`${view.market.locationCode}|${view.market.language}`} disabled={Boolean(busy)} onChange={(e) => { const [loc, lang] = e.target.value.split("|"); void run("suggest", { market: { locationCode: Number(loc), language: lang } }); }}>
            {getMarkets().map((m) => <option key={`${m.locationCode}|${m.language}`} value={`${m.locationCode}|${m.language}`}>{$t(m.label)}</option>)}
          </select>
          {view.dataforseo && !view.metricsAt ? <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void run("lookup")}>{busy === "lookup" ? $t('common.lookingUp') : $t('keywordSuggestions.checkVolume')}</Button> : null}
          <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void run("suggest", { force: true })}><RefreshCw data-icon="inline-start" />{busy === "suggest" ? $t('keywordSuggestions.suggestingAgain') : $t('common.suggestAgain')}</Button>
        </div>
      </div>
      <HandOffNotice result={handOff} />
      <p className="nr-footnote flex items-center" data-suggest-basis>{b ? $t('keywordSuggestions.generatedProjectMemory',{0:b.pages ? $t('keywordSuggestions.websitePages',{0:b.pages}) : $t('keywordSuggestions.homepage'),1:b.queries ? $t('keywordSuggestions.searchConsoleQueries',{0:b.queries}) : "",2:b.competitors ? $t('keywordSuggestions.competitors',{0:b.competitors}) : ""}) : ""}{view.at ? ` · ${new Date(view.at).toLocaleDateString(getCurrentLocale())}` : ""}<InfoTip label={$t('keywordSuggestions.whereAiSuggestionsCome')} className="ml-1">{$tj('keywordSuggestions.aiSuggestionsStartingPointSearch',{0:view.metricsAt ? `（${new Date(view.metricsAt).toLocaleDateString(getCurrentLocale())}）` : ""})}</InfoTip></p>
      {error ? <p className="nr-error" role="alert">{error}</p> : null}
      {view.metricsError ? <InlineError>{$tj('keywordSuggestions.searchVolumeNotFound',{0:view.metricsError})}</InlineError> : !view.dataforseo ? <p className="text-xs text-muted-foreground">{$t('keywordSuggestions.dataforseoConnectedSuggestionsComeSearch')}<button type="button" className="nr-link" onClick={() => navigate("/connections?source=keywords")}>{$t('common.openConnections')}</button></p> : null}
      <Card className="gap-0 py-0">
        <DataTableTabs value={group} onValueChange={(v) => { setGroup(v); setRowSelection({}); }}>
          <TabsTrigger value="all">{$tj('common.allCount',{0:view.items.length})}</TabsTrigger>
          {GROUPS.map((g) => { const n = view.items.filter((s) => s.group === g).length; return n ? <TabsTrigger key={g} value={g}>{$t(GROUP_KEYS[g] ?? g)} ({n})</TabsTrigger> : null; })}
        </DataTableTabs>
        <DataTable table={table} empty={{ title: $t('keywordSuggestions.noSuggestionsGroup') }} onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,[role=checkbox],a")) return; openKeyword(row.original.keyword, view.market); }} />
      </Card>
      {tracking && selected.length ? <StartTrackingDialog keywords={selected.map((s) => ({ keyword: s.keyword, market: view.market }))} onClose={() => setTracking(false)} onDone={() => { setTracking(false); setRowSelection({}); }} /> : null}
      {handing && project && selected.length ? (
        <KeywordHandOffDialog projectId={project.id} rows={selected.map((s) => ({ keyword: s.keyword, market: view.market, volume: s.metrics?.volume ?? null, difficulty: s.metrics?.difficulty ?? null, intent: intentOf(s) ?? null, ...(s.site ? { rank: s.site } : {}) }))}
          onClose={() => setHanding(false)} onDone={(r) => { setHanding(false); setRowSelection({}); setHandOff({ ok: true, text: r.title, taskId: r.taskId }); }} />
      ) : null}
    </>
  );
}
