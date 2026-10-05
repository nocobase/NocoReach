// 竞品动态 (竞品 › 动态, and its panel in 数据接入): up to five competitors looked at once a week for free — new pages in their
// sitemaps, GitHub releases and stars. Picked updates go to the Agent as one 竞品对比 task. AI 识别 names candidates
// (websites and repositories checked) to tick; it runs by itself while the list is empty.
import { useEffect, useState } from "react";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { AlertCircle, ExternalLink, Github, Globe, LoaderCircle, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ListSkeleton } from "@/components/reach/states";
import { AiMark } from "@/components/reach/actor";
import { NotesTip } from "@/components/reach/info-tip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionHandOff } from "./section-hand-off";
import { competitorEventsDraft } from "./seo-hand-off";
import {confirmAction} from "@/components/reach/confirm";

export type Competitor = { id: string; name: string; site: string; repo: string; addedAt: string; checkedAt: string | null; pages: number | null; stars: number | null; week: number | null; latestRelease: { name: string; tag: string; url: string; publishedAt: string } | null; errors: string[] };
export type CompetitorStatus = { connected: boolean; checking?: boolean; max: number; suggestions: string[]; lastRun: { at: string; ok: boolean; errors: string[] } | null; nextCheckAt: string | null; list: Competitor[] };
type Event = { id: string; competitorId: string; competitor: string; type: "page" | "release" | "site"; title: string; url: string; detail: string; at: string };
type View = CompetitorStatus & { events: Event[]; notes: string[] };
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrCompetitors", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const TYPE: Record<Event["type"], string> = { page: "新页面", release: "新版本", site: "网站变化" };
const k = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString());
const host = (u: string) => u.replace(/^https:\/\//, "");

type Candidate = { name: string; site: string; repo: string; reason: string; exists: boolean };
// AI 识别: the candidates, those already followed shown but not tickable; the rest ticked up to the room left.
function SuggestList({ projectId, room, force = false, onAdded, onManual }: { projectId: number; room: number; force?: boolean; onAdded: (s: CompetitorStatus) => void; onManual?: () => void }) {
  const [data, setData] = useState<{ at: string; candidates: Candidate[] }>(), [picked, setPicked] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const ask = (again: boolean) => { setData(undefined); setError(""); void call<{ at: string; candidates: Candidate[] }>(projectId, "suggest", { force: again }).then((d) => { setData(d); setPicked(d.candidates.filter((c) => !c.exists).slice(0, room).map((c) => c.name)); }).catch((e) => setError(e instanceof Error ? e.message : "没有识别出来")); };
  useEffect(() => ask(force), [projectId]);
  const add = async () => { setBusy(true); setError(""); try { onAdded(await call<CompetitorStatus>(projectId, "add", { items: data!.candidates.filter((c) => picked.includes(c.name)).map(({ name, site, repo }) => ({ name, site, repo })) })); } catch (e) { setError(e instanceof Error ? e.message : "没有添加，请重试。"); } finally { setBusy(false); } };
  if (error) return <div className="flex flex-col gap-2"><p className="nr-error" role="alert">{error}</p>{onManual ? <div><Button variant="outline" size="sm" onClick={onManual}>手动添加</Button></div> : null}</div>;
  if (!data) return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />AI 正在找竞品，并打开官网和 GitHub 核对，一般半分钟…</p>;
  return (
    <div className="flex flex-col gap-1" data-suggestions>
      <p className="text-xs text-muted-foreground">根据记忆、官网和知识库找的，官网和 GitHub 都打开核对过。勾选后添加{room < 5 ? `（还能加 ${room} 个）` : ""}。</p>
      {data.candidates.length ? data.candidates.map((c) => (
        <label key={c.name} className={`flex items-start gap-3 border-b border-border py-2 text-sm last:border-0 ${c.exists ? "opacity-60" : ""}`} data-candidate={c.name}>
          <Checkbox className="mt-0.5" disabled={c.exists || (!picked.includes(c.name) && picked.length >= room)} checked={!c.exists && picked.includes(c.name)} onCheckedChange={(on) => setPicked((p) => (on === true ? [...p, c.name] : p.filter((x) => x !== c.name)))} />
          <span className="min-w-0 flex-1"><span className="font-medium">{c.name}</span><span className="text-muted-foreground"> · {[c.site ? host(c.site) : "", c.repo].filter(Boolean).join(" · ")}</span><span className="block text-xs text-muted-foreground">{c.exists ? "已经在列表里" : c.reason}</span></span>
        </label>
      )) : <p className="py-2 text-sm text-muted-foreground">没有找到能核对上的竞品，可以手动添加。</p>}
      <div className="mt-2 flex flex-wrap gap-2"><Button disabled={busy || !picked.length} onClick={() => void add()}>{busy ? "正在添加…" : `添加 ${picked.length} 个`}</Button><Button variant="ghost" disabled={busy} onClick={() => ask(true)}>重新识别</Button>{onManual ? <Button variant="ghost" disabled={busy} onClick={onManual}>手动添加</Button> : null}</div>
    </div>
  );
}
// Adding one competitor: a name (names written in 记忆 are offered), the website and/or the GitHub repository.
function AddForm({ projectId, suggestions, onAdded, onCancel }: { projectId: number; suggestions: string[]; onAdded: (s: CompetitorStatus) => void; onCancel?: () => void }) {
  const [form, setForm] = useState({ name: "", site: "", repo: "" }), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const add = async () => { setBusy(true); setError(""); try { onAdded(await call<CompetitorStatus>(projectId, "add", form)); setForm({ name: "", site: "", repo: "" }); } catch (e) { setError(e instanceof Error ? e.message : "没有添加，请重试。"); } finally { setBusy(false); } };
  return (
    <div className="flex flex-col gap-3" data-add-competitor>
      {suggestions.length ? <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">记忆里写的竞品：{suggestions.map((s) => <button key={s} type="button" className="rounded border px-1.5 py-0.5 hover:bg-muted" onClick={() => setForm((f) => ({ ...f, name: s }))}>{s}</button>)}</p> : null}
      <label className="nr-field">名称<input aria-label="竞品名称" value={form.name} maxLength={60} placeholder="Retool" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="nr-field">官网<input aria-label="竞品官网" value={form.site} placeholder="https://retool.com" onChange={(e) => setForm({ ...form, site: e.target.value })} /></label>
      <label className="nr-field">GitHub 仓库（可选）<input aria-label="竞品 GitHub 仓库" value={form.repo} placeholder="https://github.com/org/repo" onChange={(e) => setForm({ ...form, repo: e.target.value })} /></label>
      {error ? <p className="nr-error" role="alert">{error}</p> : null}
      <div className="flex gap-2"><Button disabled={busy || !form.name.trim() || !(form.site.trim() || form.repo.trim())} onClick={() => void add()}>{busy ? "正在添加…" : "添加"}</Button>{onCancel ? <Button variant="ghost" disabled={busy} onClick={onCancel}>取消</Button> : null}</div>
    </div>
  );
}

function CompetitorCard({ c, onRemove }: { c: Competitor; onRemove: () => void }) {
  return (
    <Card className="gap-1.5 p-4" data-competitor={c.name}>
      <div className="flex items-center gap-2"><h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</h3><Button size="icon-xs" variant="ghost" aria-label={`不再关注 ${c.name}`} onClick={onRemove}><Trash2 className="text-muted-foreground" /></Button></div>
      <p className="flex flex-wrap gap-x-3 text-xs">{c.site ? <a className="nr-link inline-flex items-center gap-1" href={c.site} target="_blank" rel="noreferrer"><Globe className="size-3" />{host(c.site)}</a> : null}{c.repo ? <a className="nr-link inline-flex items-center gap-1" href={`https://github.com/${c.repo}`} target="_blank" rel="noreferrer"><Github className="size-3" />{c.repo}</a> : null}</p>
      <p className="text-xs text-muted-foreground">{[c.pages != null ? `${c.pages.toLocaleString()} 个页面` : "", c.stars != null ? `Star ${k(c.stars)}${c.week != null ? `（近一周 ${c.week >= 0 ? "+" : ""}${c.week.toLocaleString()}）` : ""}` : "", c.latestRelease ? `最新版本 ${c.latestRelease.name}` : ""].filter(Boolean).join(" · ") || (c.checkedAt ? "没有读到数据" : "正在第一次查看…")}</p>
      {c.errors.map((e) => <p key={e} className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />没有读到：{e}</p>)}
    </Card>
  );
}

// 数据接入's panel: the list and the form, nothing else.
export function CompetitorsConnect({ projectId, onChange }: { projectId: number; onChange: () => void }) {
  const [status, setStatus] = useState<CompetitorStatus>(), [error, setError] = useState(""), [suggesting, setSuggesting] = useState(false);
  const load = () => call<CompetitorStatus>(projectId, "status").then(setStatus).catch(() => setError("读取竞品失败。"));
  useEffect(() => { void load(); }, [projectId]);
  useEffect(() => { if (!status?.checking) return; const t = setInterval(() => void load().then(onChange), 4000); return () => clearInterval(t); }, [status?.checking]);
  const remove = async (c: Competitor) => { if (!(await confirmAction({ title: `不再关注“${c.name}”？`, description: '它的动态记录一起删除。', action: '不再关注' }))) return; try { setStatus(await call<CompetitorStatus>(projectId, "remove", { competitorId: c.id })); onChange(); } catch (e) { setError(e instanceof Error ? e.message : "没有完成"); } };
  if (!status) return error ? <p className="nr-error" role="alert">{error}</p> : <p role="status" className="nr-footnote">正在读取…</p>;
  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="nr-error" role="alert">{error}</p> : null}
      {status.list.map((c) => <CompetitorCard key={c.id} c={c} onRemove={() => void remove(c)} />)}
      {status.lastRun ? <p className="nr-footnote">上次查看 {new Date(status.lastRun.at).toLocaleString()}，之后每周一次。</p> : null}
      {status.list.length < status.max ? (suggesting
        ? <SuggestList projectId={projectId} room={status.max - status.list.length} force={status.list.length > 0} onAdded={(s) => { setStatus(s); setSuggesting(false); onChange(); }} onManual={() => setSuggesting(false)} />
        : <><Button size="sm" variant="outline" className="self-start" onClick={() => setSuggesting(true)}><Sparkles data-icon="inline-start" />AI 识别竞品</Button><AddForm projectId={projectId} suggestions={status.suggestions} onAdded={(s) => { setStatus(s); onChange(); }} /></>) : <p className="nr-footnote">最多关注 {status.max} 个竞品。</p>}
    </div>
  );
}

// 竞品 › 动态.
export function CompetitorWatchTab({ projectId, onListChange }: { projectId: number; onListChange?: (count: number) => void }) {
  const [view, setView] = useState<View>(), [error, setError] = useState(""), [adding, setAdding] = useState(false), [suggesting, setSuggesting] = useState(false), [manual, setManual] = useState(false), [busy, setBusy] = useState(false), [picked, setPicked] = useState<Record<string, boolean>>({});
  const load = () => call<View>(projectId, "view").then((v) => { setView(v); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "竞品动态没有读出来"));
  useEffect(() => { setView(undefined); void load(); }, [projectId]);
  useEffect(() => { if (view) onListChange?.(view.list.length); }, [view?.list.length]);
  useEffect(() => { if (!view?.checking) return; const t = setTimeout(() => void load(), 4000); return () => clearTimeout(t); }, [view]);
  const check = async () => { setBusy(true); try { const r = await call<{ events: number; errors: string[] }>(projectId, "check"); toast.success(r.errors.length ? `部分没有读到：${r.errors[0]}` : r.events ? `新发现 ${r.events} 条动态` : "没有新动态"); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "没有查完"); } finally { setBusy(false); } };
  const remove = async (c: Competitor) => { if (!(await confirmAction({ title: `不再关注“${c.name}”？`, description: '它的动态记录一起删除。', action: '不再关注' }))) return; try { await call(projectId, "remove", { competitorId: c.id }); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "没有完成"); } };
  if (error) return <p className="nr-error" role="alert">{error}</p>;
  if (!view) return <ListSkeleton rows={4} />;
  const chosen = view.events.filter((e) => picked[e.id]);
  const addDialog = adding ? (
    <Dialog open onOpenChange={(o) => { if (!o) setAdding(false); }}><DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>添加竞品</DialogTitle><DialogDescription>每周看一次它的官网新页面和 GitHub 新版本，免费。</DialogDescription></DialogHeader>
      <AddForm projectId={projectId} suggestions={view.suggestions} onAdded={() => { setAdding(false); toast.success("已添加，正在第一次查看"); void load(); }} onCancel={() => setAdding(false)} />
    </DialogContent></Dialog>
  ) : null;
  const added = (msg: string) => { setSuggesting(false); toast.success(msg); void load(); };
  const suggestDialog = suggesting ? (
    <Dialog open onOpenChange={(o) => { if (!o) setSuggesting(false); }}><DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>AI 识别的竞品</DialogTitle><DialogDescription>每周看一次它们的官网新页面和 GitHub 新版本，免费。</DialogDescription></DialogHeader>
      <SuggestList projectId={projectId} room={view.max - view.list.length} force onAdded={() => added("已添加，正在第一次查看")} onManual={() => { setSuggesting(false); setAdding(true); }} />
    </DialogContent></Dialog>
  ) : null;
  // Nothing followed yet: AI 识别 runs by itself; adding by hand is one click away.
  if (!view.list.length) return (
    <>{addDialog}
      <Card className="gap-3 px-4" data-first-suggest>
        <div><h2 className="flex items-center gap-1.5 text-sm font-semibold"><AiMark label="AI 识别" />AI 识别的竞品</h2><p className="text-xs text-muted-foreground">最多关注 5 个，每周免费看一次它们的官网新页面和 GitHub 新版本。</p></div>
        {manual ? <AddForm projectId={projectId} suggestions={view.suggestions} onAdded={() => added("已添加，正在第一次查看")} onCancel={() => setManual(false)} /> : <SuggestList projectId={projectId} room={view.max} onAdded={() => added("已添加，正在第一次查看")} onManual={() => setManual(true)} />}
      </Card>
    </>
  );
  return (
    <>
      {addDialog}{suggestDialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="nr-footnote flex items-center gap-1">{view.lastRun ? `上次查看 ${new Date(view.lastRun.at).toLocaleString("zh-CN")}，之后每周一次` : "正在第一次查看…"}<NotesTip notes={view.notes} label="竞品动态怎么看" /></p>
        <div className="flex flex-wrap gap-2">{view.list.length < view.max ? <><Button size="sm" variant="outline" onClick={() => setSuggesting(true)}><Sparkles data-icon="inline-start" />AI 识别</Button><Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus data-icon="inline-start" />添加竞品</Button></> : null}<Button size="sm" variant="outline" disabled={busy || view.checking} onClick={() => void check()}><RefreshCw data-icon="inline-start" />{busy ? "正在查看…" : "立即查看"}</Button></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{view.list.map((c) => <CompetitorCard key={c.id} c={c} onRemove={() => void remove(c)} />)}</div>
      <Card className="gap-0 py-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2"><h2 className="text-sm font-semibold">动态 · 近 90 天{chosen.length ? `（已选 ${chosen.length}）` : ""}</h2><SectionHandOff projectId={projectId} disabled={!chosen.length} playbookId="competitor-compare" label={chosen.length ? `交给 Agent（${chosen.length}）` : "交给 Agent"} description="选中的竞品动态合成一个任务，让 Agent 对比我们有没有对应的内容或功能，确认后立即开始。" draft={() => competitorEventsDraft(chosen)} /></div>
        {view.events.length ? view.events.map((e) => (
          <label key={e.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0 hover:bg-muted/50" data-event={e.type}>
            <Checkbox className="mt-0.5" checked={Boolean(picked[e.id])} onCheckedChange={(on) => setPicked((p) => ({ ...p, [e.id]: on === true }))} />
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground">{e.competitor} · {TYPE[e.type]} · </span><a className="nr-link" href={e.url} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>{e.title}<ExternalLink className="ml-0.5 inline size-3" /></a>
              {e.detail ? <span className="block truncate text-xs text-muted-foreground">{e.detail}</span> : null}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{e.at.slice(5, 10)}</span>
          </label>
        )) : <p className="px-4 py-3 text-sm text-muted-foreground">{view.lastRun ? "近 90 天没有新动态。第一次查看只记下现状，之后记录新页面和新版本。" : "正在第一次查看…"}</p>}
      </Card>
      
    </>
  );
}
