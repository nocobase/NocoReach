import { useMessageState, getCurrentLocale, $t, $legacyText } from "#i18n";
// Keywords › AI suggestions, demand first (2026-10-27): every keyword comes from Google's search data through
// DataForSEO with at least the server's minimum monthly volume. The AI chooses seed words, the real keywords found for
// them are filtered and the AI picks and explains the most relevant; the line above the list says how, with the seeds
// read-only. Everything that needs a conversation goes through the chat panel (2026-10-28 user decision): Ask AI to dig
// for keywords, a row's Dig from this keyword, Adjust seed words with AI and a seed chip each open it on what they are
// about; a lookup the chat proposes runs only when Confirm is clicked in the chat, and the page then reads itself again.
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Bookmark, LoaderCircle, Search, Trash2 } from "lucide-react";
import { toast } from "#lib/toast";
import { LoadError, InlineError, EmptyState } from "#components/reach/states";
import { chipClass, chipButtonClass } from "#components/reach/chip";
import { cn } from "#lib/utils";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableTabs } from "#components/seo/data-table-toolbar";
import { TableBulkActionButton } from "#components/seo/table-bulk-action-bar";
import { SortableHeader } from "#components/seo/sortable-header";
import { ScoreBadge } from "#components/seo/score-badge";
import { IntentBadge } from "#components/seo/intent-badge";
import { useProject } from "./reach-data";
import { marketLabel, metric, useOpenKeyword, usdUpTo } from "./keyword-api";
import { KeywordHandOffDialog } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { WithInfo, InfoTip } from "#components/reach/info-tip";
import { help } from "./glossary";
import { formatDate } from '#lib/format';
import { PageAiEntry, RowAiEntry, usePageAi } from "../online-agent/page-entry";
import { seedsItem } from "../../shared/keyword-subject";
import { GroupTabs, RenameGroupDialog, digName, type GroupTab } from "./keyword-groups";
import { confirmAction } from "#components/reach/confirm";
import { useBusinessAccess } from "#hooks/use-business-access";
import { usePageChange } from "../online-agent/page-changes";

type Market = { locationCode: number; language: string };
type Metrics = { volume: number | null; difficulty: number | null; cpc: number | null; intent: string | null };
type Suggestion = { id: string; keyword: string; group: string; intent: string | null; reason: string; page: string | null; site: { position: number; clicks: number; impressions: number; page: string } | null; metrics: Metrics; dig?: string };
type Dig = { id: string; direction: string; name?: string | null; seeds: string[]; at: string; found: number; items: Suggestion[] };
type SuggestionView = {
  at?: string; market: Market; seeds: string[]; seedsBy?: "ai" | "person"; stats?: { found: number; picked: number; minVolume: number }; costUsd?: number;
  items: Suggestion[]; digs: Dig[]; missedSeeds?: string[]; lastError?: { message: string; at?: string; mode?: "list" | "dig" } | null;
  running: { stage: "seeds" | "lookup" | "curate"; mode: "list" | "dig"; direction: string | null } | null; dataforseo: boolean; maxUsd: number; minVolume: number;
};
// Keep persisted group identities unchanged; display uses an explicit semantic-key map.
const GROUP_KEYS: Record<string, string> = {"产品与功能词": 'keywordSuggestions.groups.product', "使用场景与问题词": 'keywordSuggestions.groups.useCase', "对比与替代词": 'keywordSuggestions.groups.comparison', "品类与行业词": 'keywordSuggestions.groups.industry'};
const GROUPS = ['产品与功能词', '使用场景与问题词', '对比与替代词', '品类与行业词'] as const;
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrKeywordSuggest", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
const usd = (n: number) => n.toFixed(2);
const helper = createColumnHelper<Suggestion>();
const intentOf = (s: Suggestion) => s.metrics?.intent || s.intent;
const failure = (e: unknown, fallback: string) => (e instanceof Error ? $legacyText(e.message) : fallback);

export function KeywordSuggestions({ onSaved }: { onSaved: () => void }) {
  const { project } = useProject();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [view, setView] = useState<SuggestionView>();
  const openKeyword = useOpenKeyword();
  const [error, setError] = useMessageState("");
  const [busy, setBusy] = useState<"" | "start" | "save" | "remove">("");
  const [renaming, setRenaming] = useState<{ id: string; name: string }>();
  const [group, setGroup] = useState(() => params.get("group") || "all");
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [handing, setHanding] = useState(false);
  const [handOff, setHandOff] = useState<HandOffResult>();
  const anchorRef = useSelectionAnchor();
  const projectId = project?.id;
  const openAi = usePageAi();
  const { can: canEdit } = useBusinessAccess("nrKeywordSuggest.removeItems", projectId);
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
  // A lookup confirmed in the chat panel shows here at once.
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
  useHandOffSource("keyword-suggestions", all.length ? { count: selected.length, open: () => setHanding(true), noun: $t('common.keywordsSelected'), actions: <> <TableBulkActionButton icon={<Bookmark className="size-3.5" />} onClick={() => void save()}>{busy === "save" ? $t('common.saving') : $t('common.save')}</TableBulkActionButton>{canEdit ? <> <TableBulkActionButton icon={<Trash2 className="size-3.5" />} onClick={() => void remove()}>{$t('common.remove')}</TableBulkActionButton></> : null} </>, clear: () => setRowSelection({}) } : null);
  // Editing the list by hand (2026-10-28): remove keywords, rename or delete a dug group. A removed keyword stays out
  // of later lookups unless the person asks for it back in the chat; saved keywords are not touched.
  const edit = async (action: string, body: object, done: () => string) => {
    if (!projectId) return false;
    try { setView(await call<SuggestionView>(projectId, action, body)); toast.success(done); return true; }
    catch (e) { toast.error(() => failure(e, $t('common.notSaved'))); return false; }
  };
  const remove = async () => {
    if (!selected.length) return;
    setBusy("remove");
    const n = selected.length;
    if (await edit("removeItems", { ids: selected.map((s) => s.id) }, () => $t('keywordSuggestions.removedKeywords', { 0: n }))) setRowSelection({});
    setBusy("");
  };
  const deleteGroup = async (dig: { id: string; name: string }) => {
    const n = view?.digs.find((d) => d.id === dig.id)?.items.length ?? 0;
    if (!(await confirmAction({ title: () => $t('keywordSuggestions.deleteGroupTitle', { 0: dig.name }), description: () => $t('keywordSuggestions.deleteGroupDescription', { 0: n }), action: () => $t('common.delete'), destructive: true }))) return;
    if (await edit("deleteDig", { digId: dig.id }, () => $t('keywordSuggestions.groupDeleted', { 0: dig.name })) && group === dig.id) setGroup("all");
  };
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
  const status = running ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{running.mode === "dig" && running.direction ? $t('keywordSuggestions.runningDig', { 0: stage, 1: running.direction }) : stage}</p> : null;
  // A failed re-find of the list shows until the next run starts, saying the list below is the earlier one; a dig's
  // failure belongs to its chat card, and an error older than the list is no longer news (2026-10-28: a failed dig's
  // "nothing found" sat above a full list).
  const listFailed = !running && view.lastError?.message && view.lastError.mode !== "dig" && (!view.at || !view.lastError.at || view.lastError.at > view.at) ? view.lastError : null;
  const problem = error ? <InlineError>{error}</InlineError> : listFailed ? <InlineError>{view.at && view.items.length ? $t('keywordSuggestions.lastRunFailed', { 0: $legacyText(listFailed.message), 1: formatDate(view.at) }) : $legacyText(listFailed.message)}</InlineError> : null;
  if (!has) return (
    <>
      {problem}
      {running ? <Card className="px-4 py-6">{status}</Card> : (
        <EmptyState icon={<Search />} title={$t('keywordSuggestions.startTitle')} description={view.dataforseo ? $t('keywordSuggestions.startDescription', { 0: view.minVolume }) : $t('keywordSuggestions.needsDataforseo')}
          action={view.dataforseo ? <div className="flex flex-col items-center gap-2"><Button disabled={Boolean(busy)} onClick={() => void start()}>{busy === "start" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}{$t('keywordSuggestions.startButton')}</Button><p className="text-xs text-muted-foreground">{$t('keywordSuggestions.costNote', { 0: usdUpTo(view.maxUsd) })}</p></div> : <Button onClick={() => void navigate("/connections?source=keywords")}>{$t('common.openConnections')}</Button>} />
      )}
    </>
  );
  const dug = view.digs.reduce((n, d) => n + d.items.length, 0);
  const made = $t(view.seedsBy === "person" ? 'keywordSuggestions.madeByPerson' : 'keywordSuggestions.madeByAi', { 0: view.seeds.length, 1: view.stats?.found ?? view.items.length, 2: view.items.length, 3: dug ? $t('keywordSuggestions.dugLater', { 0: dug }) : "", 4: view.minVolume });
  const seedHint = view.seeds[Math.min(2, view.seeds.length - 1)];
  const tabs: GroupTab[] = [
    { value: "all", label: $t('keywordSuggestions.allTab'), count: all.length },
    ...GROUPS.map((g) => ({ value: g, label: $t(GROUP_KEYS[g] ?? g), count: view.items.filter((s) => s.group === g).length })).filter((t) => t.count),
    ...view.digs.map((d) => { const name = digName(d); return { value: d.id, label: $t('keywordSuggestions.digTab', { 0: name }), count: d.items.length, title: $t('keywordSuggestions.digTab', { 0: d.direction }), dig: { id: d.id, name } }; }),
  ];
  // The seed words are adjusted in the chat: as a whole, or one seed from its chip.
  const adjustSeeds = () => openAi?.({ subject: { kind: "page", page: "keywords", item: seedsItem() }, label: $t('keywordSuggestions.adjustSeeds'), description: $t('keywordSuggestions.seedsEntryDescription'),
    presets: [$t('keywordSuggestions.presetExplainSeeds'), $t('keywordSuggestions.presetLeanSeeds'), $t('keywordSuggestions.presetAddRemoveSeed'), $t('keywordSuggestions.presetFindAgain'), $t('keywordSuggestions.presetOtherMarket')] });
  const openSeed = (seed: string) => openAi?.({ subject: { kind: "page", page: "keywords", item: seedsItem(seed) }, label: $t('keywordSuggestions.seedEntry', { 0: seed }), description: $t('keywordSuggestions.seedsEntryDescription'),
    presets: [$t('keywordSuggestions.presetSeedFound'), $t('keywordSuggestions.presetSeedReplace')] });
  return (
    <>
      <HandOffNotice result={handOff} />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2" data-suggest-basis>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {made} · {$t(marketLabel(view.market))} · <span className="whitespace-nowrap">{formatDate(view.at!)}</span>
            <InfoTip label={$t('keywordSuggestions.whereAiSuggestionsCome')} className="ml-1">{$t('keywordSuggestions.howMadeInfo', { 0: view.minVolume, 1: usd(view.costUsd ?? 0) })}</InfoTip>
            {openAi ? <button type="button" className="nr-link ml-2" onClick={adjustSeeds}>{$t('keywordSuggestions.adjustSeeds')}</button> : null}
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label={$t('keywordSuggestions.seedsTitle')}>{view.seeds.map((s) => <li key={s}>{openAi ? <button type="button" className={cn(chipClass, chipButtonClass)} title={$t('keywordSuggestions.seedEntry', { 0: s })} onClick={() => openSeed(s)}>{s}</button> : <span className={chipClass}>{s}</span>}</li>)}</ul>
          {view.missedSeeds?.length ? <p className="text-xs text-muted-foreground">{$t('keywordSuggestions.missedSeeds', { 0: view.missedSeeds.join(getCurrentLocale().startsWith('zh') ? '、' : ', ') })}</p> : null}
        </div>
        <PageAiEntry subject={{ kind: "page", page: "keywords" }} label={$t('keywordSuggestions.aiEntry')} description={$t('keywordSuggestions.aiEntryDescription')}
          presets={[...(seedHint ? [$t('keywordSuggestions.presetMore', { 0: seedHint })] : []), $t('keywordSuggestions.presetCompetitors'), $t(view.market.locationCode === 2392 ? 'keywordSuggestions.presetUnitedStates' : 'keywordSuggestions.presetJapan'), $t('keywordSuggestions.presetExplain')]} />
      </div>
      {status}{problem}
      <Card className="gap-0 py-0">
        <DataTableTabs value={group} onValueChange={(v) => { setGroup(v); setRowSelection({}); }}>
          <GroupTabs tabs={tabs} value={group} canEdit={canEdit} onSelect={(v) => { setGroup(v); setRowSelection({}); }} onRename={setRenaming} onDelete={(d) => void deleteGroup(d)} />
        </DataTableTabs>
        <DataTable table={table} rowClassName="group" empty={{ title: $t('keywordSuggestions.noSuggestionsGroup') }} onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,[role=checkbox],a")) return; openKeyword(row.original.keyword, view.market); }} />
      </Card>
      {renaming ? <RenameGroupDialog dig={renaming} onClose={() => setRenaming(undefined)} onSave={async (name) => { if (await edit("renameDig", { digId: renaming.id, name }, () => $t('keywordSuggestions.groupRenamed', { 0: name }))) setRenaming(undefined); }} /> : null}
      {handing && selected.length ? (
        <KeywordHandOffDialog projectId={projectId} rows={selected.map((s) => ({ keyword: s.keyword, market: view.market, volume: s.metrics?.volume ?? null, difficulty: s.metrics?.difficulty ?? null, intent: intentOf(s) ?? null, ...(s.site ? { rank: s.site } : {}) }))}
          onClose={() => setHanding(false)} onDone={(r) => { setHanding(false); setRowSelection({}); setHandOff({ ok: true, text: r.title, taskId: r.taskId }); }} />
      ) : null}
    </>
  );
}
