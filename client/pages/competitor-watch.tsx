import { useBusinessAccess } from '#hooks/use-business-access';
import { type Message, useMessageState, $t, $tj, $legacyText } from "#i18n";
// 竞品动态 (竞品 › 动态, and its panel in 数据接入): up to five competitors looked at once a week for free — new pages in their
// sitemaps, GitHub releases and stars. Picked updates go to the Agent as one 竞品对比 task. AI 识别 names candidates
// (websites and repositories checked) to tick; it runs by itself while the list is empty.
import { useEffect, useState } from "react";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { AlertCircle, ExternalLink, Github, Globe, LoaderCircle, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "#lib/toast";
import { ListSkeleton } from "#components/reach/states";
import { AiMark } from "#components/reach/actor";
import { NotesTip } from "#components/reach/info-tip";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Checkbox } from "#components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#components/ui/dialog";
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { competitorEventsDraft } from "./seo-hand-off";
import {confirmAction} from "#components/reach/confirm";
import { formatCount, formatDate, formatDateTime, formatSigned } from '#lib/format';

export type Competitor = { id: string; name: string; site: string; repo: string; addedAt: string; checkedAt: string | null; pages: number | null; stars: number | null; week: number | null; latestRelease: { name: string; tag: string; url: string; publishedAt: string } | null; errors: string[] };
export type CompetitorStatus = { connected: boolean; checking?: boolean; max: number; suggestions: string[]; lastRun: { at: string; ok: boolean; errors: string[] } | null; nextCheckAt: string | null; list: Competitor[] };
type Event = { id: string; competitorId: string; competitor: string; type: "page" | "release" | "site"; title: string; url: string; detail: string; at: string };
type View = CompetitorStatus & { events: Event[]; notes: string[] };
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrCompetitors", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const getType = (): Record<Event["type"], string> => ({ page: $t('common.newPages'), release: $t('common.newRelease'), site: $t('common.websiteChanges') });
const k = (n: number) => formatCount(n);
const host = (u: string) => u.replace(/^https:\/\//, "");

type Candidate = { name: string; site: string; repo: string; reason: string; exists: boolean };
// AI 识别: the candidates, those already followed shown but not tickable; the rest ticked up to the room left.
function SuggestList({ projectId, room, force = false, onAdded, onManual }: { projectId: number; room: number; force?: boolean; onAdded: (s: CompetitorStatus) => void; onManual?: () => void }) {
  const { can: canSuggest } = useBusinessAccess('nrCompetitors.suggest', projectId);
  const { can: canAdd } = useBusinessAccess('nrCompetitors.add', projectId);
  const [data, setData] = useState<{ at: string; candidates: Candidate[] }>(), [picked, setPicked] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useMessageState("");
  const ask = (again: boolean) => { setData(undefined); setError(""); void call<{ at: string; candidates: Candidate[] }>(projectId, "suggest", { force: again }).then((d) => { setData(d); setPicked(d.candidates.filter((c) => !c.exists).slice(0, room).map((c) => c.name)); }).catch((e) => setError(() => (e instanceof Error ? $legacyText(e.message) : $t('competitorWatch.nothingDetected')))); };
  useEffect(() => { if (canSuggest) ask(force); }, [projectId, canSuggest]);
  const add = async () => { setBusy(true); setError(""); try { onAdded(await call<CompetitorStatus>(projectId, "add", { items: data!.candidates.filter((c) => picked.includes(c.name)).map(({ name, site, repo }) => ({ name, site, repo })) })); } catch (e) { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('competitorWatch.notAddedTryAgain'))); } finally { setBusy(false); } };
  if (!canSuggest) return null;
  if (error) return <div className="flex flex-col gap-2"><p className="nr-error" role="alert">{error}</p>{onManual && canAdd ? <div><Button variant="outline" size="sm" onClick={onManual}>{$t('competitorWatch.addManually')}</Button></div> : null}</div>;
  if (!data) return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{$t('competitorWatch.aiFindingCompetitorsOpeningWebsites')}</p>;
  return (
    <div className="flex flex-col gap-1" data-suggestions>
      <p className="text-xs text-muted-foreground">{$tj('competitorWatch.foundMemoryWebsiteKnowledgeBase',{0:room < 5 ? $t('competitorWatch.moreAllowed',{0:room}) : ""})}</p>
      {data.candidates.length ? data.candidates.map((c) => (
        <label key={c.name} className={`flex items-start gap-3 border-b border-border py-2 text-sm last:border-0 ${c.exists ? "opacity-60" : ""}`} data-candidate={c.name}>
          <Checkbox className="mt-0.5" disabled={!canAdd || c.exists || (!picked.includes(c.name) && picked.length >= room)} checked={!c.exists && picked.includes(c.name)} onCheckedChange={(on) => setPicked((p) => (on === true ? [...p, c.name] : p.filter((x) => x !== c.name)))} />
          <span className="min-w-0 flex-1"><span className="font-medium">{c.name}</span><span className="text-muted-foreground"> · {[c.site ? host(c.site) : "", c.repo].filter(Boolean).join(" · ")}</span><span className="block text-xs text-muted-foreground">{c.exists ? $t('competitorWatch.alreadyList') : c.reason}</span></span>
        </label>
      )) : <p className="py-2 text-sm text-muted-foreground">{$t('competitorWatch.noCompetitorsVerifiedAddThem')}</p>}
      <div className="mt-2 flex flex-wrap gap-2">{canAdd&&<Button disabled={busy || !picked.length} onClick={() => void add()}>{busy ? $t('common.adding') : $t('competitorWatch.add',{0:picked.length})}</Button>}<Button variant="ghost" disabled={busy} onClick={() => ask(true)}>{$t('competitorWatch.detectAgain')}</Button>{onManual && canAdd ? <Button variant="ghost" disabled={busy} onClick={onManual}>{$t('competitorWatch.addManually')}</Button> : null}</div>
    </div>
  );
}
// Adding one competitor: a name (names written in 记忆 are offered), the website and/or the GitHub repository.
function AddForm({ projectId, suggestions, onAdded, onCancel }: { projectId: number; suggestions: string[]; onAdded: (s: CompetitorStatus) => void; onCancel?: () => void }) {
  const { can: canAdd } = useBusinessAccess('nrCompetitors.add', projectId);
  const [form, setForm] = useState({ name: "", site: "", repo: "" }), [busy, setBusy] = useState(false), [error, setError] = useMessageState("");
  const add = async () => { setBusy(true); setError(""); try { onAdded(await call<CompetitorStatus>(projectId, "add", form)); setForm({ name: "", site: "", repo: "" }); } catch (e) { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('competitorWatch.notAddedTryAgain'))); } finally { setBusy(false); } };
  if (!canAdd) return null;
  return (
    <div className="flex flex-col gap-3" data-add-competitor>
      {suggestions.length ? <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{$t('competitorWatch.competitorsMemory')}{suggestions.map((s) => <button key={s} type="button" className="rounded border px-1.5 py-0.5 hover:bg-muted" onClick={() => setForm((f) => ({ ...f, name: s }))}>{s}</button>)}</p> : null}
      <label className="nr-field">{$t('common.name')}<input aria-label={$t('common.competitorName')} value={form.name} maxLength={60} placeholder="Retool" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="nr-field">{$t('competitorWatch.website')}<input aria-label={$t('competitorWatch.competitorWebsite')} value={form.site} placeholder="https://retool.com" onChange={(e) => setForm({ ...form, site: e.target.value })} /></label>
      <label className="nr-field">{$t('competitorWatch.githubRepositoryOptional')}<input aria-label={$t('competitorWatch.competitorGithubRepository')} value={form.repo} placeholder="https://github.com/org/repo" onChange={(e) => setForm({ ...form, repo: e.target.value })} /></label>
      {error ? <p className="nr-error" role="alert">{error}</p> : null}
      <div className="flex gap-2"><Button disabled={busy || !form.name.trim() || !(form.site.trim() || form.repo.trim())} onClick={() => void add()}>{busy ? $t('common.adding') : $t('common.add')}</Button>{onCancel ? <Button variant="ghost" disabled={busy} onClick={onCancel}>{$t('common.cancel')}</Button> : null}</div>
    </div>
  );
}

// 编辑 (2026-10-05 user request): AI 识别 can miss a website (some do not open for robots); name, website and repository
// are corrected here.
function EditForm({ projectId, c, onSaved, onCancel }: { projectId: number; c: Competitor; onSaved: (s: CompetitorStatus) => void; onCancel: () => void }) {
  const { can: canEdit } = useBusinessAccess('nrCompetitors.edit', projectId);
  const [form, setForm] = useState({ name: c.name, site: c.site || "", repo: c.repo || "" }), [busy, setBusy] = useState(false), [error, setError] = useMessageState("");
  const save = async () => { setBusy(true); setError(""); try { onSaved(await call<CompetitorStatus>(projectId, "edit", { competitorId: c.id, ...form })); } catch (e) { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('common.notSavedTryAgain'))); } finally { setBusy(false); } };
  if (!canEdit) return null;
  return (
    <div className="flex flex-col gap-3" data-edit-competitor>
      <label className="nr-field">{$t('common.name')}<input aria-label={$t('common.competitorName')} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="nr-field">{$t('competitorWatch.website')}<input aria-label={$t('competitorWatch.competitorWebsite')} value={form.site} placeholder="https://retool.com" onChange={(e) => setForm({ ...form, site: e.target.value })} /></label>
      <label className="nr-field">{$t('competitorWatch.githubRepositoryOptional')}<input aria-label={$t('competitorWatch.competitorGithubRepository')} value={form.repo} placeholder="https://github.com/org/repo" onChange={(e) => setForm({ ...form, repo: e.target.value })} /></label>
      {error ? <p className="nr-error" role="alert">{error}</p> : null}
      <div className="flex gap-2"><Button disabled={busy || !form.name.trim() || !(form.site.trim() || form.repo.trim())} onClick={() => void save()}>{busy ? $t('common.saving') : $t('common.save')}</Button><Button variant="ghost" disabled={busy} onClick={onCancel}>{$t('common.cancel')}</Button></div>
    </div>
  );
}

function CompetitorCard({ c, projectId, onRemove, onSaved }: { c: Competitor; projectId: number; onRemove: () => void; onSaved: (s: CompetitorStatus) => void }) {
  const { can: canEdit } = useBusinessAccess('nrCompetitors.edit', projectId);
  const { can: canRemove } = useBusinessAccess('nrCompetitors.remove', projectId);
  const [editing, setEditing] = useState(false);
  return (
    <Card className="gap-1.5 p-4" data-competitor={c.name}>
      {editing && canEdit ? <Dialog open onOpenChange={(o) => { if (!o) setEditing(false); }}><DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{$tj('competitorWatch.editQuotedItem',{0:c.name})}</DialogTitle><DialogDescription>{$t('competitorWatch.websiteUsedNewPagesSearch')}</DialogDescription></DialogHeader>
        <EditForm projectId={projectId} c={c} onSaved={(s) => { setEditing(false); toast.success(() => ($t('competitorWatch.saved',{0:c.name}))); onSaved(s); }} onCancel={() => setEditing(false)} />
      </DialogContent></Dialog> : null}
      <div className="flex items-center gap-1"><h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</h3>{canEdit&&<Button size="icon-xs" variant="ghost" aria-label={$t('competitorWatch.editItem',{0:c.name})} onClick={() => setEditing(true)}><Pencil className="text-muted-foreground" /></Button>}{canRemove&&<Button size="icon-xs" variant="ghost" aria-label={$t('competitorWatch.stopWatchingValue',{0:c.name})} onClick={onRemove}><Trash2 className="text-muted-foreground" /></Button>}</div>
      <p className="flex flex-wrap gap-x-3 text-xs">{!c.site && canEdit ? <button type="button" className="nr-link inline-flex items-center gap-1" onClick={() => setEditing(true)}><Globe className="size-3" />{$t('competitorWatch.addWebsite')}</button> : null}{c.site ? <a className="nr-link inline-flex items-center gap-1" href={c.site} target="_blank" rel="noreferrer"><Globe className="size-3" />{host(c.site)}</a> : null}{c.repo ? <a className="nr-link inline-flex items-center gap-1" href={`https://github.com/${c.repo}`} target="_blank" rel="noreferrer"><Github className="size-3" />{c.repo}</a> : null}</p>
      <p className="text-xs text-muted-foreground">{[c.pages != null ? $t('competitorWatch.pages',{0:formatCount(c.pages)}) : "", c.stars != null ? `Star ${k(c.stars)}${c.week != null ? $t('competitorWatch.lastWeek',{0:formatSigned(c.week)}) : ""}` : "", c.latestRelease ? $t('competitorWatch.latestRelease',{0:c.latestRelease.name}) : ""].filter(Boolean).join(" · ") || (c.checkedAt ? $t('competitorWatch.noDataRead') : $t('competitorWatch.checkingFirstTime'))}</p>
      {c.errors.map((e) => <p key={e} className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />{$tj('competitorWatch.notRead',{0:e})}</p>)}
    </Card>
  );
}

// 数据接入's panel: the list and the form, nothing else.
export function CompetitorsConnect({ projectId, onChange }: { projectId: number; onChange: () => void }) {
  const { can: canSuggest } = useBusinessAccess('nrCompetitors.suggest', projectId);
  const { can: canAdd } = useBusinessAccess('nrCompetitors.add', projectId);
  const [status, setStatus] = useState<CompetitorStatus>(), [error, setError] = useMessageState(""), [suggesting, setSuggesting] = useState(false);
  const load = () => call<CompetitorStatus>(projectId, "status").then(setStatus).catch(() => setError(() => ($t('competitorWatch.notLoadCompetitors'))));
  useEffect(() => { void load(); }, [projectId]);
  useEffect(() => { if (!status?.checking) return; const t = setInterval(() => void load().then(onChange), 4000); return () => clearInterval(t); }, [status?.checking]);
  const remove = async (c: Competitor) => { if (!(await confirmAction({ title: () => ($t('common.stopWatching',{0:c.name})), description: () => ($t('competitorWatch.activityHistoryDeletedToo')), action: 'competitorWatch.stopWatching' }))) return; try { setStatus(await call<CompetitorStatus>(projectId, "remove", { competitorId: c.id })); onChange(); } catch (e) { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('common.notComplete'))); } };
  if (!status) return error ? <p className="nr-error" role="alert">{error}</p> : <p role="status" className="nr-footnote">{$t('common.loadingLoading')}</p>;
  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="nr-error" role="alert">{error}</p> : null}
      {status.list.map((c) => <CompetitorCard key={c.id} c={c} projectId={projectId} onRemove={() => void remove(c)} onSaved={(st) => { setStatus(st); onChange(); }} />)}
      {!status.list.length&&!canSuggest&&!canAdd&&<p className='nr-footnote'>{$t('common.noCompetitorsYet')}</p>}
      {status.lastRun ? <p className="nr-footnote">{$tj('competitorWatch.lastCheckedWeeklyAfterValueMessage',{0:formatDateTime(status.lastRun.at)})}</p> : null}
      {status.list.length < status.max ? (suggesting && canSuggest
        ? <SuggestList projectId={projectId} room={status.max - status.list.length} force={status.list.length > 0} onAdded={(s) => { setStatus(s); setSuggesting(false); onChange(); }} onManual={() => setSuggesting(false)} />
        : <>{canSuggest&&<Button size="sm" variant="outline" className="self-start" onClick={() => setSuggesting(true)}><Sparkles data-icon="inline-start" />{$t('competitorWatch.detectCompetitorsAi')}</Button>}{canAdd&&<AddForm projectId={projectId} suggestions={status.suggestions} onAdded={(s) => { setStatus(s); onChange(); }} />}</>) : <p className="nr-footnote">{$tj('competitorWatch.watchUpCompetitors',{0:status.max})}</p>}
    </div>
  );
}

// 竞品 › 动态.
export function CompetitorWatchTab({ projectId, onListChange }: { projectId: number; onListChange?: (count: number) => void }) {
  const { can: canSuggest } = useBusinessAccess('nrCompetitors.suggest', projectId);
  const { can: canAdd } = useBusinessAccess('nrCompetitors.add', projectId);
  const { can: canCheck } = useBusinessAccess('nrCompetitors.check', projectId);
  const [view, setView] = useState<View>(), [error, setError] = useMessageState(""), [adding, setAdding] = useState(false), [suggesting, setSuggesting] = useState(false), [manual, setManual] = useState(false), [busy, setBusy] = useState(false), [picked, setPicked] = useState<Record<string, boolean>>({});
  const load = () => call<View>(projectId, "view").then((v) => { setView(v); setError(""); }).catch((e) => setError(() => (e instanceof Error ? $legacyText(e.message) : $t('competitorWatch.notLoadCompetitorActivity'))));
  useEffect(() => { setView(undefined); void load(); }, [projectId]);
  useEffect(() => { if (view) onListChange?.(view.list.length); }, [view?.list.length]);
  useEffect(() => { if (!view?.checking) return; const t = setTimeout(() => void load(), 4000); return () => clearTimeout(t); }, [view]);
  // Ticked events go to the page's 交给 Agent (top right of 竞品).
  const ticked = view?.events.filter((e) => picked[e.id]) || [];
  useHandOffSource("competitor-events", view?.list.length ? { count: ticked.length, playbookId: "competitor-compare", description: $t('competitorWatch.selectedCompetitorActivityBecomesOne'), draft: () => competitorEventsDraft(ticked), clear: () => setPicked({}) } : null);
  const check = async () => { setBusy(true); try { const r = await call<{ events: number; errors: string[] }>(projectId, "check"); toast.success(() => (r.errors.length ? $t('competitorWatch.partlyNotRead',{0:$legacyText(r.errors[0])}) : r.events ? $t('competitorWatch.newActivitiesFound',{0:r.events}) : $t('competitorWatch.noNewActivity'))); await load(); } catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.notFullyChecked'))); } finally { setBusy(false); } };
  const remove = async (c: Competitor) => { if (!(await confirmAction({ title: () => ($t('common.stopWatching',{0:c.name})), description: () => ($t('competitorWatch.activityHistoryDeletedToo')), action: 'competitorWatch.stopWatching' }))) return; try { await call(projectId, "remove", { competitorId: c.id }); await load(); } catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.notComplete'))); } };
  if (error) return <p className="nr-error" role="alert">{error}</p>;
  if (!view) return <ListSkeleton rows={4} />;
  const chosen = view.events.filter((e) => picked[e.id]);
  const addDialog = adding && canAdd ? (
    <Dialog open onOpenChange={(o) => { if (!o) setAdding(false); }}><DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{$t('common.addCompetitor')}</DialogTitle><DialogDescription>{$t('competitorWatch.checksWebsiteNewPagesGithub')}</DialogDescription></DialogHeader>
      <AddForm projectId={projectId} suggestions={view.suggestions} onAdded={() => { setAdding(false); toast.success(() => ($t('competitorWatch.addedCheckingFirstTime'))); void load(); }} onCancel={() => setAdding(false)} />
    </DialogContent></Dialog>
  ) : null;
  const added = (msg: Message) => { setSuggesting(false); toast.success(msg); void load(); };
  const suggestDialog = suggesting && canSuggest ? (
    <Dialog open onOpenChange={(o) => { if (!o) setSuggesting(false); }}><DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>{$t('competitorWatch.competitorsAiDetected')}</DialogTitle><DialogDescription>{$t('competitorWatch.checksWebsitesNewPagesGithub')}</DialogDescription></DialogHeader>
      <SuggestList projectId={projectId} room={view.max - view.list.length} force onAdded={() => added(() => $t('competitorWatch.addedCheckingFirstTime'))} onManual={() => { setSuggesting(false); setAdding(true); }} />
    </DialogContent></Dialog>
  ) : null;
  // Nothing followed yet: AI 识别 runs by itself; adding by hand is one click away.
  if (!view.list.length && !canSuggest && !canAdd) return <p className='nr-footnote'>{$t('common.noCompetitorsYet')}</p>;
  if (!view.list.length) return (
    <>{addDialog}
      <Card className="gap-3 px-4" data-first-suggest>
        <div><h2 className="flex items-center gap-1.5 text-sm font-semibold">{canSuggest ? <><AiMark label={$t('competitorWatch.aiDetect')} />{$t('competitorWatch.competitorsAiDetected')}</> : $t('common.addCompetitor')}</h2><p className="text-xs text-muted-foreground">{$t('competitorWatch.watchUp5FreeWeekly')}</p></div>
        {canAdd && (manual || !canSuggest) ? <AddForm projectId={projectId} suggestions={view.suggestions} onAdded={() => added(() => $t('competitorWatch.addedCheckingFirstTime'))} onCancel={() => setManual(false)} /> : <SuggestList projectId={projectId} room={view.max} onAdded={() => added(() => $t('competitorWatch.addedCheckingFirstTime'))} onManual={() => setManual(true)} />}
      </Card>
    </>
  );
  return (
    <>
      {addDialog}{suggestDialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="nr-footnote flex items-center gap-1">{view.lastRun ? $t('competitorWatch.lastCheckedWeeklyAfterValue',{0:formatDateTime(view.lastRun.at)}) : $t('competitorWatch.checkingFirstTime')}<NotesTip notes={view.notes} label={$t('competitorWatch.howReadCompetitorActivity')} /></p>
        <div className="flex flex-wrap gap-2">{view.list.length < view.max ? <>{canSuggest&&<Button size="sm" variant="outline" onClick={() => setSuggesting(true)}><Sparkles data-icon="inline-start" />{$t('competitorWatch.aiDetect')}</Button>}{canAdd&&<Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus data-icon="inline-start" />{$t('common.addCompetitor')}</Button>}</> : null}{canCheck&&<Button size="sm" variant="outline" disabled={busy || view.checking} onClick={() => void check()}><RefreshCw data-icon="inline-start" />{busy ? $t('competitorWatch.checking') : $t('competitorWatch.checkNow')}</Button>}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{view.list.map((c) => <CompetitorCard key={c.id} c={c} projectId={projectId} onRemove={() => void remove(c)} onSaved={() => void load()} />)}</div>
      <Card className="gap-0 py-0">
        <div className="flex items-center gap-3 border-b border-border px-4 py-2"><Checkbox checked={view.events.length > 0 && chosen.length === view.events.length} indeterminate={chosen.length > 0 && chosen.length < view.events.length} disabled={!view.events.length} onCheckedChange={(on) => setPicked(on ? Object.fromEntries(view.events.map((e) => [e.id, true])) : {})} aria-label={$t('common.select')} data-all-check="" /><h2 className="text-sm font-semibold">{$tj('competitorWatch.activityLast90Days',{0:chosen.length ? $t('competitorWatch.selected',{0:chosen.length}) : ""})}</h2></div>
        {view.events.length ? view.events.map((e) => (
          <label key={e.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0 hover:bg-muted/50" data-event={e.type}>
            <Checkbox className="mt-0.5" checked={Boolean(picked[e.id])} onCheckedChange={(on) => setPicked((p) => ({ ...p, [e.id]: on === true }))} />
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground">{e.competitor} · {getType()[e.type]} · </span><a className="nr-link" href={e.url} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>{e.title}<ExternalLink className="ml-0.5 inline size-3" /></a>
              {e.detail ? <span className="block truncate text-xs text-muted-foreground">{e.detail}</span> : null}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDate(e.at.slice(0, 10))}</span>
          </label>
        )) : <p className="px-4 py-3 text-sm text-muted-foreground">{view.lastRun ? $t('competitorWatch.noNewActivityLast90') : $t('competitorWatch.checkingFirstTime')}</p>}
      </Card>
      
    </>
  );
}
