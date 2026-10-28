import { useMessageState, $t, $legacyText } from "#i18n";
// Keywords › AI suggestions, demand first (2026-10-27): every keyword comes from Google's search data through
// DataForSEO with at least the server's minimum monthly volume. The AI chooses seed words, the real keywords found for
// them are filtered and the AI picks and explains the most relevant. The top reads like a keyword tool's (2026-10-28,
// after Google Keyword Planner, Semrush and Ahrefs): the query bar with the seed words and market, then a results
// summary whose Selection rules say why the others were not picked. What needs a conversation goes through the chat
// panel: Ask AI to find keywords and a row's Expand from this keyword open it; a lookup the chat proposes runs only when
// Confirm is clicked in the chat, and the page then reads itself again.
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Bookmark, LoaderCircle, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "#lib/toast";
import { LoadError, InlineError, EmptyState } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableTabs } from "#components/seo/data-table-toolbar";
import { TableBulkActionButton } from "#components/seo/table-bulk-action-bar";
import { SortableHeader } from "#components/seo/sortable-header";
import { ScoreBadge } from "#components/seo/score-badge";
import { IntentBadge } from "#components/seo/intent-badge";
import { useProject } from "./reach-data";
import { metric, useOpenKeyword, usdUpTo } from "./keyword-api";
import { KeywordHandOffDialog } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { WithInfo } from "#components/reach/info-tip";
import { help } from "./glossary";
import { formatDate } from '#lib/format';
import { RowAiEntry } from "../online-agent/page-entry";
import { EditGroupsDialog, GroupTabs, type GroupTab, type NewGroup } from "./keyword-groups";
import { EditSeedsDialog } from "./keyword-seed-editor";
import { KeywordQueryBar, type SeedNote, type SeedStat } from "./keyword-query-bar";
import { NotPickedDialog, SelectionSummary, summaryWhen, type Selection } from "./keyword-selection";
import { useBusinessAccess } from "#hooks/use-business-access";
import { usePageChange } from "../online-agent/page-changes";

type Market = { locationCode: number; language: string };
type Metrics = { volume: number | null; difficulty: number | null; cpc: number | null; intent: string | null };
type Suggestion = { id: string; keyword: string; group: string; intent: string | null; reason: string; by?: "person"; seeds?: string[]; seed?: string | null; page: string | null; site: { position: number; clicks: number; impressions: number; page: string } | null; metrics: Metrics; dig?: string };
type Dig = { id: string; direction: string; name?: string | null; seeds: string[]; at: string; found: number; items: Suggestion[] };
type SuggestionView = {
  at?: string; market: Market; seeds: string[]; seedsBy?: "ai" | "person"; stats?: { found: number; picked: number; minVolume: number }; costUsd?: number;
  seedNotes?: SeedNote[]; seedStats?: SeedStat[]; selection?: Selection;
  items: Suggestion[]; digs: Dig[]; missedSeeds?: string[]; lastError?: { message: string; at?: string; mode?: "list" | "dig" } | null;
  pendingSeeds?: string[] | null; groupNames?: Record<string, string>; deletedGroups?: string[];
  running: { stage: "seeds" | "lookup" | "curate"; mode: "list" | "dig"; direction: string | null } | null; naming?: boolean; dataforseo: boolean; maxUsd: number; minVolume: number;
};
// Keep persisted group identities unchanged; display uses an explicit semantic-key map.
// A group's name: a built-in one as the person renamed it, or its default in the reader's language; a dug group by its
// name, which the server makes once with the AI (while it does, "Naming…"; if it could not, the direction itself).
const groupName = (view: Pick<SuggestionView, "groupNames"> | undefined, id: string) => view?.groupNames?.[id] || $t(GROUP_KEYS[id] ?? id);
const digName = (d: Pick<Dig, "name" | "direction">, naming?: boolean) => d.name || (naming ? $t('keywordSuggestions.naming') : d.direction);
const GROUP_KEYS: Record<string, string> = {"产品与功能词": 'keywordSuggestions.groups.product', "使用场景与问题词": 'keywordSuggestions.groups.useCase', "对比与替代词": 'keywordSuggestions.groups.comparison', "品类与行业词": 'keywordSuggestions.groups.industry'};
const GROUPS = ['产品与功能词', '使用场景与问题词', '对比与替代词', '品类与行业词'] as const;
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrKeywordSuggest", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;
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
  const [editing, setEditing] = useState<"" | "groups" | "seeds" | "notPicked">("");
  // Another market chosen in the query bar: Edit seed words finds the list again there.
  const [marketPick, setMarketPick] = useState<Market>();
  const [group, setGroup] = useState(() => params.get("group") || "all");
  // A seed's Show only these: the list narrowed to the keywords that seed brought.
  const [seedFilter, setSeedFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [handing, setHanding] = useState(false);
  const [handOff, setHandOff] = useState<HandOffResult>();
  const anchorRef = useSelectionAnchor();
  const projectId = project?.id;
  const { can: canEdit } = useBusinessAccess("nrKeywordSuggest.removeItems", projectId);
  const { can: canDig } = useBusinessAccess("nrKeywordSuggest.dig", projectId);
  const { can: canAdd } = useBusinessAccess("nrKeywordSuggest.addItems", projectId);
  const load = async () => {
    if (!projectId) return;
    try { setView(await call<SuggestionView>(projectId, "view")); }
    catch (e) { setError(() => failure(e, $t('keywordSuggestions.notLoad'))); }
  };
  useEffect(() => { setView(undefined); void load(); }, [projectId]);
  // A run, or the naming of groups dug before names existed, goes on in the background: read the page again until done.
  useEffect(() => {
    if (!view?.running && !view?.naming) return;
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
  const rows = useMemo(() => {
    const inGroup = group === "all" ? all : view?.digs.some((d) => d.id === group) ? all.filter((s) => s.dig === group) : (view?.items ?? []).filter((s) => s.group === group);
    // A seed's keywords are those counted for it, as its chip counts them: one seed each.
    return seedFilter ? inGroup.filter((s) => s.seed === seedFilter) : inGroup;
  }, [all, view, group, seedFilter]);
  const columns = useMemo<ColumnDef<Suggestion>[]>(() => [
    makeSelectionColumn<Suggestion>(anchorRef),
    helper.accessor("keyword", {
      header: ({ column }) => <SortableHeader column={column} label={$t('common.keywords')} />,
      // Expand from this keyword sits beside the keyword, where it stays in view when the table scrolls sideways. A
      // keyword added from those not picked has no AI reason: it says the person added it.
      cell: ({ row }) => { const reason = row.original.reason || (row.original.by === "person" ? $t('keywordSuggestions.addedByYou') : ""); return <div className="flex max-w-md items-start gap-2"><div className="min-w-0 flex-1"><span className="block truncate font-medium" title={row.original.keyword}>{row.original.keyword}</span><span className="block truncate text-xs text-muted-foreground" title={reason}>{reason}</span></div><RowAiEntry className="shrink-0" subject={{ kind: "page", page: "keywords", item: row.original.keyword }} label={$t('keywordSuggestions.digFromKeyword')} description={$t('keywordSuggestions.aiEntryDescription')} presets={[$t('keywordSuggestions.presetFromKeyword')]} /></div>; },
    }) as ColumnDef<Suggestion>,
    // The group a row is listed under: its dug group if it came from a dig, otherwise its built-in group.
    helper.accessor("group", { enableSorting: false, header: () => $t('keywordSuggestions.group'), cell: ({ row }) => { const d = row.original.dig ? view?.digs.find((x) => x.id === row.original.dig) : undefined; return <span className="block min-w-28 max-w-40 text-xs whitespace-normal text-muted-foreground">{d ? digName(d, view?.naming) : row.original.group ? groupName(view, row.original.group) : "—"}</span>; } }) as ColumnDef<Suggestion>,
    helper.display({ id: "intent", header: () => <WithInfo help={help($t('common.intent'))}>{$t('common.intent')}</WithInfo>, cell: ({ row }) => <IntentBadge intent={intentOf(row.original)} /> }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.metrics?.volume ?? undefined, { id: "volume", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.monthlyVolume')} align="right" />, cell: ({ row }) => metric(row.original.metrics?.volume), meta: right }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.metrics?.difficulty ?? undefined, { id: "difficulty", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.difficulty')} align="right" />, cell: ({ row }) => <ScoreBadge value={row.original.metrics?.difficulty ?? null} />, meta: right }) as ColumnDef<Suggestion>,
    helper.accessor((s) => s.site?.position ?? undefined, { id: "rank", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.sitePosition')} align="right" />, cell: ({ row }) => row.original.site ? <span title={$t('keywordSuggestions.clicksImpressions',{0:row.original.site.clicks,1:row.original.site.impressions})}>{row.original.site.position.toFixed(1)}</span> : <span className="text-muted-foreground">—</span>, meta: right }) as ColumnDef<Suggestion>,
    helper.display({ id: "page", header: () => $t('keywordSuggestions.matchingPage'), cell: ({ row }) => { const page = row.original.site?.page || row.original.page; return page ? <span className="block max-w-48 truncate text-xs" title={page}>{pathOf(page)}</span> : <span className="text-xs text-muted-foreground">{$t('keywordSuggestions.noMatchingPage')}</span>; } }) as ColumnDef<Suggestion>,
  ], [anchorRef, view]);
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
  // Edit groups › Save: renames and deletions first, then a new group's expansion, which runs in the background.
  const saveGroups = async (changes: { id: string; name?: string; deleted?: boolean }[], added?: NewGroup) => {
    if (changes.length) {
      const ok = await edit("editGroups", { groups: changes }, () => $t('keywordSuggestions.groupsSaved'));
      if (!ok) return false;
      if (changes.some((c) => c.deleted && c.id === group)) setGroup("all");
    }
    if (added && projectId) {
      try { setView(await call<SuggestionView>(projectId, "dig", { direction: added.direction, name: added.name, by: "person" })); toast.success(() => $t('keywordSuggestions.expanding', { 0: added.name ?? added.direction })); }
      catch (e) { toast.error(() => failure(e, $t('keywordSuggestions.notCompleteTryAgain'))); }
    }
    return true;
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
  const runningGroup = running?.mode === "dig" ? view.digs.find((d) => d.direction === running.direction) : undefined;
  const status = running ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{runningGroup?.name ? $t('keywordSuggestions.runningDig', { 0: stage, 1: runningGroup.name }) : stage}</p> : null;
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
  const tabs: GroupTab[] = [
    { value: "all", label: $t('keywordSuggestions.allTab'), count: all.length },
    ...GROUPS.filter((g) => !view.deletedGroups?.includes(g)).map((g) => ({ value: g, label: groupName(view, g), count: view.items.filter((s) => s.group === g).length })).filter((t) => t.count),
    ...view.digs.map((d) => ({ value: d.id, label: digName(d, view.naming), count: d.items.length, title: $t('keywordSuggestions.dugDirection', { 0: d.direction }) })),
  ];
  // Edit groups lists every group, the built-in ones with no keywords now included, so a renamed or emptied one can be edited too.
  const editable = [
    ...GROUPS.filter((g) => !view.deletedGroups?.includes(g)).map((g) => ({ id: g, name: groupName(view, g), count: view.items.filter((s) => s.group === g).length })),
    ...view.digs.map((d) => ({ id: d.id, name: digName(d), count: d.items.length })),
  ];
  const shownSeeds = view.pendingSeeds?.length ? view.pendingSeeds : view.seeds;
  const selectGroup = (v: string) => { setGroup(v); setSeedFilter(""); setRowSelection({}); };
  const shownDig = view.digs.find((d) => d.id === group);
  return (
    <>
      <HandOffNotice result={handOff} />
      <KeywordQueryBar seeds={shownSeeds} stats={view.seedStats ?? []} notes={view.seedNotes ?? []} market={view.market} pending={Boolean(view.pendingSeeds?.length)} missed={view.missedSeeds ?? []}
        canEdit={canEdit} running={Boolean(running)}
        onMarket={(m) => { setMarketPick(m); setEditing("seeds"); }} onEdit={() => { setMarketPick(undefined); setEditing("seeds"); }}
        onOnly={(seed) => { setGroup("all"); setSeedFilter(seed); setRowSelection({}); }}
        onRemove={(seed) => edit("saveSeeds", { seeds: shownSeeds.filter((x) => x !== seed) }, () => $t('keywordSuggestions.seedRemoved', { 0: seed }))} />
      {status}{problem}
      <SelectionSummary rows={rows} selection={view.selection} market={view.market} minVolume={view.minVolume} product={project?.name ?? ""}
        right={shownDig ? summaryWhen(shownDig.at, digName(shownDig, view.naming)) : summaryWhen(view.at!)}
        seedFilter={seedFilter} onClearSeed={() => setSeedFilter("")} onViewNotPicked={() => setEditing("notPicked")} />
      <Card className="gap-0 py-0">
        <DataTableTabs value={group} onValueChange={selectGroup}
          actions={canEdit ? <Button variant="outline" size="sm" data-group-actions onClick={() => setEditing("groups")}><Pencil data-icon="inline-start" />{$t('keywordSuggestions.editGroups')}</Button> : undefined}>
          <GroupTabs tabs={tabs} value={group} onSelect={selectGroup} />
        </DataTableTabs>
        <DataTable table={table} rowClassName="group" empty={{ title: $t('keywordSuggestions.noSuggestionsGroup') }} onRowClick={(row, e) => { if ((e.target as HTMLElement).closest("button,[role=checkbox],a")) return; openKeyword(row.original.keyword, view.market); }} />
      </Card>
      {editing === "groups" ? <EditGroupsDialog projectId={projectId} groups={editable} canAdd={canDig && !running} onClose={() => setEditing("")} onSave={saveGroups} /> : null}
      {editing === "seeds" ? <EditSeedsDialog projectId={projectId} seeds={shownSeeds} market={marketPick ?? view.market} marketChanged={Boolean(marketPick)} onClose={() => { setEditing(""); setMarketPick(undefined); }}
        onSaveOnly={(seeds) => edit("saveSeeds", { seeds }, () => $t('keywordSuggestions.seedsSaved'))}
        onFind={async (seeds) => (await start({ seeds, market: marketPick ?? view.market, by: "person" })) ?? false} /> : null}
      {editing === "notPicked" ? <NotPickedDialog projectId={projectId} selection={view.selection} groups={editable.map(({ id, name }) => ({ id, name }))} canAdd={canAdd && !running} onAdded={(next) => setView(next as SuggestionView)} onClose={() => setEditing("")} /> : null}
      {handing && selected.length ? (
        <KeywordHandOffDialog projectId={projectId} rows={selected.map((s) => ({ keyword: s.keyword, market: view.market, volume: s.metrics?.volume ?? null, difficulty: s.metrics?.difficulty ?? null, intent: intentOf(s) ?? null, ...(s.site ? { rank: s.site } : {}) }))}
          onClose={() => setHanding(false)} onDone={(r) => { setHanding(false); setRowSelection({}); setHandOff({ ok: true, text: r.title, taskId: r.taskId }); }} />
      ) : null}
    </>
  );
}
