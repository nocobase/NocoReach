import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
// Keywords › AI suggestions, demand first (2026-10-27): every keyword comes from Google's search data through
// DataForSEO with at least the server's minimum monthly volume. The AI chooses seed words, the real keywords found for
// them are filtered and the AI picks and explains the most relevant; the line above the list says how, with the seeds
// and Edit seed words. Digging further goes through the chat panel (Ask AI to dig for keywords, or a row's Dig from
// this keyword); a dig adds a group tab. A paid run shows its most possible cost before it starts.
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Bookmark, LoaderCircle, Search } from "lucide-react";
import { RefreshButton } from '#components/reach/refresh-button';
import { HeaderActions } from "#components/reach/page";
import { toast } from "#lib/toast";
import { LoadError, InlineError, EmptyState } from "#components/reach/states";
import { chipClass } from "#components/reach/chip";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { TabsTrigger } from "#components/ui/tabs";
import { Textarea } from "#components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#components/ui/dialog";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableTabs } from "#components/seo/data-table-toolbar";
import { TableBulkActionButton } from "#components/seo/table-bulk-action-bar";
import { SortableHeader } from "#components/seo/sortable-header";
import { ScoreBadge } from "#components/seo/score-badge";
import { IntentBadge } from "#components/seo/intent-badge";
import { useProject } from "./reach-data";
import { getMarkets, marketLabel, metric, useOpenKeyword } from "./keyword-api";
import { KeywordHandOffDialog } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { WithInfo, InfoTip } from "#components/reach/info-tip";
import { help } from "./glossary";
import { formatDate } from '#lib/format';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select';
import { PageAiEntry, RowAiEntry } from "../online-agent/page-entry";
import { usePageChange } from "../online-agent/page-changes";

type Market = { locationCode: number; language: string };
type Metrics = { volume: number | null; difficulty: number | null; cpc: number | null; intent: string | null };
type Suggestion = { id: string; keyword: string; group: string; intent: string | null; reason: string; page: string | null; site: { position: number; clicks: number; impressions: number; page: string } | null; metrics: Metrics; dig?: string };
type Dig = { id: string; direction: string; seeds: string[]; at: string; found: number; items: Suggestion[] };
type SuggestionView = {
  at?: string; market: Market; seeds: string[]; seedsBy?: "ai" | "person"; stats?: { found: number; picked: number; minVolume: number }; costUsd?: number;
  items: Suggestion[]; digs: Dig[]; missedSeeds?: string[]; lastError?: { message: string } | null;
  running: { stage: "seeds" | "lookup" | "curate"; mode: "list" | "dig"; direction: string | null } | null; dataforseo: boolean; maxUsd: number; minVolume: number;
};
type Estimate = { maxUsd: number; reused: number; monthUsd: number; budgetUsd: number };
// Keep persisted group identities unchanged; display uses an explicit semantic-key map.
const GROUP_KEYS: Record<string, string> = {"产品与功能词": 'keywordSuggestions.groups.product', "使用场景与问题词": 'keywordSuggestions.groups.useCase', "对比与替代词": 'keywordSuggestions.groups.comparison', "品类与行业词": 'keywordSuggestions.groups.industry'};
const GROUPS = ['产品与功能词', '使用场景与问题词', '对比与替代词', '品类与行业词'] as const;
const MAX_SEEDS = 15;
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrKeywordSuggest", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const usd = (n: number) => n.toFixed(2);
// A most possible cost, rounded up to the cent so it never reads lower than it can be.
const upTo = (n: number) => (Math.ceil(Number((n * 100).toFixed(6))) / 100).toFixed(2);
const helper = createColumnHelper<Suggestion>();
const intentOf = (s: Suggestion) => s.metrics?.intent || s.intent;
const failure = (e: unknown, fallback: string) => (e instanceof Error ? $legacyText(e.message) : fallback);
const seedsOf = (text: string) => [...new Set(text.split(/\n|,|，|、/).map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 2))].slice(0, MAX_SEEDS);

export function KeywordSuggestions({ onSaved }: { onSaved: () => void }) {
  const { project } = useProject();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [view, setView] = useState<SuggestionView>();
  const openKeyword = useOpenKeyword();
  const [error, setError] = useMessageState("");
  const [busy, setBusy] = useState<"" | "start" | "save">("");
  const [group, setGroup] = useState(() => params.get("group") || "all");
  const [editing, setEditing] = useState(false);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [handing, setHanding] = useState(false);
  const [handOff, setHandOff] = useState<HandOffResult>();
  const anchorRef = useSelectionAnchor();
  const projectId = project?.id;
  const load = async () => {
    if (!projectId) return;
    try { setView(await call<SuggestionView>(projectId, "view")); }
    catch (e) { setError(() => failure(e, $t('keywordSuggestions.notLoad'))); }
  };
  useEffect(() => { setView(undefined); void load(); }, [projectId]);
  // A run goes on in the background: read the page again until it is done.
  useEffect(() => {
    if (!view?.running) return;
    const timer = setTimeout(() => void load(), 3000);
    return () => clearTimeout(timer);
  }, [view]);
  // A group dug in the chat panel shows here at once.
  usePageChange("keywords", projectId ?? "", () => void load());
  // The chat's link to a new group selects its tab.
  const linked = params.get("group");
  useEffect(() => { if (linked) setGroup(linked); }, [linked]);
  const start = async (body: object = {}) => {
    if (!projectId) return;
    setBusy("start"); setError("");
    try { setView(await call<SuggestionView>(projectId, "suggest", body)); setRowSelection({}); return true; }
    catch (e) { setError(() => failure(e, $t('keywordSuggestions.notCompleteTryAgain'))); return false; }
    finally { setBusy(""); }
  };
  const all = useMemo(() => [...(view?.items ?? []), ...(view?.digs ?? []).flatMap((d) => d.items)], [view]);
  const rows = useMemo(() => group === "all" ? all : view?.digs.some((d) => d.id === group) ? all.filter((s) => s.dig === group) : (view?.items ?? []).filter((s) => s.group === group), [all, view, group]);
  const columns = useMemo<ColumnDef<Suggestion>[]>(() => [
    makeSelectionColumn<Suggestion>(anchorRef),
    helper.accessor("keyword", {
      header: ({ column }) => <SortableHeader column={column} label={$t('common.keywords')} />,
      // Dig from this keyword sits beside the keyword, where it stays in view when the table scrolls sideways.
      cell: ({ row }) => <div className="flex max-w-md items-start gap-2"><div className="min-w-0 flex-1"><span className="block truncate font-medium" title={row.original.keyword}>{row.original.keyword}</span><span className="block truncate text-xs text-muted-foreground" title={row.original.reason}>{row.original.reason}</span></div><RowAiEntry className="shrink-0" subject={{ kind: "page", page: "keywords", item: row.original.keyword }} label={$t('keywordSuggestions.digFromKeyword')} description={$t('keywordSuggestions.aiEntryDescription')} presets={[$t('keywordSuggestions.presetFromKeyword')]} /></div>,
    }) as ColumnDef<Suggestion>,
    helper.accessor("group", { enableSorting: false, header: () => $t('keywordSuggestions.group'), cell: ({ getValue }) => <span className="block min-w-28 max-w-40 text-xs whitespace-normal text-muted-foreground">{$t(GROUP_KEYS[String(getValue())] ?? String(getValue()))}</span> }) as ColumnDef<Suggestion>,
    helper.display({ id: "intent", header: () => <WithInfo help={help($t('common.intent'))}>{$t('common.intent')}</WithInfo>, cell: ({ row }) => <IntentBadge intent={intentOf(row.original)} /> }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.metrics?.volume ?? undefined, { id: "volume", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.monthlyVolume')} align="right" />, cell: ({ row }) => metric(row.original.metrics?.volume), meta: right }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.metrics?.difficulty ?? undefined, { id: "difficulty", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.difficulty')} align="right" />, cell: ({ row }) => <ScoreBadge value={row.original.metrics?.difficulty ?? null} />, meta: right }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.site?.position ?? undefined, { id: "rank", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.sitePosition')} align="right" />, cell: ({ row }) => row.original.site ? <span title={$t('keywordSuggestions.clicksImpressions',{0:row.original.site.clicks,1:row.original.site.impressions})}>{row.original.site.position.toFixed(1)}</span> : <span className="text-muted-foreground">—</span>, meta: right }) as ColumnDef<Suggestion>,
    helper.display({ id: "page", header: () => $t('keywordSuggestions.matchingPage'), cell: ({ row }) => { const page = row.original.site?.page || row.original.page; return page ? <span className="block max-w-48 truncate text-xs" title={page}>{pathOf(page)}</span> : <span className="text-xs text-muted-foreground">{$t('keywordSuggestions.noMatchingPage')}</span>; } }) as ColumnDef<Suggestion>,
  ], [anchorRef]);
  const table = useDataTable({ data: rows, columns, withSorting: true, enableRowSelection: true, state: { rowSelection }, onRowSelectionChange: setRowSelection, getRowId: (s) => s.id });
  const selected = all.filter((s) => rowSelection[s.id]);
  useHandOffSource("keyword-suggestions", all.length ? { count: selected.length, open: () => setHanding(true), noun: $t('common.keywordsSelected'), actions: <> <TableBulkActionButton icon={<Bookmark className="size-3.5" />} onClick={() => void save()}>{busy === "save" ? $t('common.saving') : $t('common.save')}</TableBulkActionButton> </>, clear: () => setRowSelection({}) } : null);
  const save = async () => {
    if (!projectId || !selected.length) return;
    setBusy("save");
    try { const r = await call<{ saved: number; skipped: number }>(projectId, "save", { ids: selected.map((s) => s.id) }); toast.success(() => ($t('keywordSuggestions.saved',{0:r.saved,1:r.skipped ? $t('keywordSuggestions.alreadyThere',{0:r.skipped}) : ""}))); setRowSelection({}); onSaved(); }
    catch (e) { toast.error(() => failure(e, $t('common.notSaved'))); }
    finally { setBusy(""); }
  };
  if (error && !view) return <LoadError title={$t('keywordSuggestions.keywordSuggestionsNotComplete')} message={error} onRetry={() => void load()} />;
  if (!view || !projectId) return <Card className="px-4"><p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{$t('common.loading')}</p></Card>;
  const has = Boolean(view.at && view.items.length);
  const running = view.running;
  const stage = running ? $t(`keywordSuggestions.stage.${running.stage}`) : "";
  const refresh = <HeaderActions><RefreshButton busy={Boolean(running) || busy === "start"} disabled={Boolean(running) || Boolean(busy) || !view.dataforseo} label={$t('keywordSuggestions.findAgain')} onClick={() => setEditing(true)} /></HeaderActions>;
  const status = running ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{running.mode === "dig" && running.direction ? $t('keywordSuggestions.runningDig', { 0: stage, 1: running.direction }) : stage}</p> : null;
  // The last run's failure stays until the next run starts.
  const problem = error || (!running && view.lastError?.message) ? <InlineError>{error || $legacyText(view.lastError!.message)}</InlineError> : null;
  const seedsDialog = editing ? <SeedsDialog projectId={projectId} view={view} onClose={() => setEditing(false)} onRun={async (body) => { if (await start(body)) setEditing(false); }} busy={busy === "start"} /> : null;
  if (!has) return (
    <>
      {refresh}{seedsDialog}{problem}
      {running ? <Card className="px-4 py-6">{status}</Card> : (
        <EmptyState icon={<Search />} title={$t('keywordSuggestions.startTitle')} description={view.dataforseo ? $t('keywordSuggestions.startDescription', { 0: view.minVolume }) : $t('keywordSuggestions.needsDataforseo')}
          action={view.dataforseo ? <div className="flex flex-col items-center gap-2"><Button disabled={Boolean(busy)} onClick={() => void start()}>{busy === "start" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}{$t('keywordSuggestions.startButton')}</Button><p className="text-xs text-muted-foreground">{$t('keywordSuggestions.costNote', { 0: upTo(view.maxUsd) })}</p></div> : <Button onClick={() => void navigate("/connections?source=keywords")}>{$t('common.openConnections')}</Button>} />
      )}
    </>
  );
  const dug = view.digs.reduce((n, d) => n + d.items.length, 0);
  const made = $t(view.seedsBy === "person" ? 'keywordSuggestions.madeByPerson' : 'keywordSuggestions.madeByAi', { 0: view.seeds.length, 1: view.stats?.found ?? view.items.length, 2: view.items.length, 3: dug ? $t('keywordSuggestions.dugLater', { 0: dug }) : "", 4: view.minVolume });
  const seedHint = view.seeds[Math.min(2, view.seeds.length - 1)];
  return (
    <>
      {refresh}{seedsDialog}
      <HandOffNotice result={handOff} />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2" data-suggest-basis>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {made} · {$t(marketLabel(view.market))} · <span className="whitespace-nowrap">{formatDate(view.at!)}</span>
            <InfoTip label={$t('keywordSuggestions.whereAiSuggestionsCome')} className="ml-1">{$t('keywordSuggestions.howMadeInfo', { 0: view.minVolume, 1: usd(view.costUsd ?? 0) })}</InfoTip>
            <button type="button" className="nr-link ml-2" disabled={Boolean(running) || !view.dataforseo} onClick={() => setEditing(true)}>{$t('keywordSuggestions.editSeeds')}</button>
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label={$t('keywordSuggestions.seedsTitle')}>{view.seeds.map((s) => <li key={s} className={chipClass}>{s}</li>)}</ul>
          {view.missedSeeds?.length ? <p className="text-xs text-muted-foreground">{$t('keywordSuggestions.missedSeeds', { 0: view.missedSeeds.join(getCurrentLocale().startsWith('zh') ? '、' : ', ') })}</p> : null}
        </div>
        <PageAiEntry subject={{ kind: "page", page: "keywords" }} label={$t('keywordSuggestions.aiEntry')} description={$t('keywordSuggestions.aiEntryDescription')}
          presets={[...(seedHint ? [$t('keywordSuggestions.presetMore', { 0: seedHint })] : []), $t('keywordSuggestions.presetCompetitors'), $t(view.market.locationCode === 2392 ? 'keywordSuggestions.presetUnitedStates' : 'keywordSuggestions.presetJapan'), $t('keywordSuggestions.presetExplain')]} />
      </div>
      {status}{problem}
      <Card className="gap-0 py-0">
        <DataTableTabs value={group} onValueChange={(v) => { setGroup(v); setRowSelection({}); }}>
          <TabsTrigger value="all">{$tj('common.allCount',{0:all.length})}</TabsTrigger>
          {GROUPS.map((g) => { const n = view.items.filter((s) => s.group === g).length; return n ? <TabsTrigger key={g} value={g}>{$t(GROUP_KEYS[g] ?? g)} {n}</TabsTrigger> : null; })}
          {view.digs.map((d) => <TabsTrigger key={d.id} value={d.id} data-dig-group={d.id}>{$t('keywordSuggestions.digTab', { 0: d.direction })} {d.items.length}</TabsTrigger>)}
        </DataTableTabs>
        <DataTable table={table} rowClassName="group" empty={{ title: $t('keywordSuggestions.noSuggestionsGroup') }} onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,[role=checkbox],a")) return; openKeyword(row.original.keyword, view.market); }} />
      </Card>
      {handing && selected.length ? (
        <KeywordHandOffDialog projectId={projectId} rows={selected.map((s) => ({ keyword: s.keyword, market: view.market, volume: s.metrics?.volume ?? null, difficulty: s.metrics?.difficulty ?? null, intent: intentOf(s) ?? null, ...(s.site ? { rank: s.site } : {}) }))}
          onClose={() => setHanding(false)} onDone={(r) => { setHanding(false); setRowSelection({}); setHandOff({ ok: true, text: r.title, taskId: r.taskId }); }} />
      ) : null}
    </>
  );
}

// Edit seed words (also Find again): the seeds and market of the next run, what it may cost at most and this month's
// spending, before anything is looked up. Let AI choose again asks the AI for seeds only, which costs no DataForSEO.
function SeedsDialog({ projectId, view, busy, onClose, onRun }: { projectId: number; view: SuggestionView; busy: boolean; onClose: () => void; onRun: (body: object) => Promise<void> }) {
  const [text, setText] = useState(view.seeds.join("\n"));
  const [market, setMarket] = useState<Market>(view.market);
  const [estimate, setEstimate] = useState<Estimate>();
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useMessageState("");
  const seeds = seedsOf(text);
  const key = JSON.stringify([seeds, market]);
  const askedRef = useRef(0);
  useEffect(() => {
    if (!seeds.length) { setEstimate(undefined); return; }
    const n = ++askedRef.current;
    const timer = setTimeout(() => void call<Estimate>(projectId, "estimate", { seeds, market }).then((e) => { if (n === askedRef.current) setEstimate(e); }, () => undefined), 300);
    return () => clearTimeout(timer);
  }, [key]);
  const choose = async (next: Market) => {
    setChoosing(true); setError("");
    try { const r = await call<{ seeds: string[] }>(projectId, "seeds", { market: next }); setText(r.seeds.join("\n")); }
    catch (e) { setError(() => failure(e, $t('keywordSuggestions.notCompleteTryAgain'))); }
    finally { setChoosing(false); }
  };
  const value = `${market.locationCode}|${market.language}`;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{$t('keywordSuggestions.seedsTitle')}</DialogTitle><DialogDescription>{$t('keywordSuggestions.seedsDescription', { 0: MAX_SEEDS })}</DialogDescription></DialogHeader>
        <div className="flex flex-col gap-3">
          <Select value={value} disabled={choosing || busy} onValueChange={(v) => { const [loc, lang] = String(v).split("|"); const next = { locationCode: Number(loc), language: lang }; setMarket(next); void choose(next); }}>
            <SelectTrigger size="sm" className="w-full sm:w-56" aria-label={$t('keywordSuggestions.targetMarket')}><SelectValue>{(v: string) => $t(getMarkets().find((m) => `${m.locationCode}|${m.language}` === v)?.label ?? "")}</SelectValue></SelectTrigger>
            <SelectContent className="w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal">{getMarkets().map((m) => <SelectItem key={`${m.locationCode}|${m.language}`} value={`${m.locationCode}|${m.language}`}>{$t(m.label)}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea rows={8} value={text} disabled={choosing || busy} onChange={(e) => setText(e.target.value)} aria-label={$t('keywordSuggestions.seedsTitle')} />
          <p className="text-xs text-muted-foreground" data-seeds-cost>{seeds.length ? estimate ? <>{$t('keywordSuggestions.seedsCost', { 0: upTo(estimate.maxUsd) })}{estimate.reused ? $t('keywordSuggestions.seedsReused', { 0: estimate.reused }) : ""} · {$t('keywordSuggestions.seedsMonth', { 0: usd(estimate.monthUsd), 1: usd(estimate.budgetUsd) })}</> : " " : $t('keywordSuggestions.seedsEmpty')}</p>
          {error ? <p className="nr-error" role="alert">{error}</p> : null}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" disabled={choosing || busy} onClick={() => void choose(market)}>{choosing ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}{choosing ? $t('keywordSuggestions.stage.seeds') : $t('keywordSuggestions.seedsAi')}</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{$t('common.cancel')}</Button>
            <Button disabled={!seeds.length || choosing || busy} onClick={() => void onRun({ seeds, market })}>{busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}{$t('keywordSuggestions.findAgain')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
