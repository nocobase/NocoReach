import { $t, $tj } from "@/i18n";
// AI 搜索 › 问题 (2026-10-05): what people ask ChatGPT and Google AI Overviews about our topics, which answers name or cite
// us, which name competitors or other brands instead (the chances), and which name nobody. Topics are suggested by the
// online AI and confirmed before anything is paid; then monthly. A question opens with the AI's answer, the brands and
// the sources; ticked questions go to the Agent as one task. Below, the sites cited where we are missing (where to be).
import { useHandOffSource } from "@/components/reach/hand-off-slot";
import { useEffect, useMemo, useState } from "react";
import { nocobaseClient as api } from "@/lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Bot, LoaderCircle, Plus, Sparkles, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { InlineError, ListSkeleton, LoadError } from "@/components/reach/states";
import { AiMark } from "@/components/reach/actor";
import { InfoTip, NotesTip } from "@/components/reach/info-tip";
import { Tag } from "@/components/reach/tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsTrigger } from "@/components/ui/tabs";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "@/components/seo/data-table";
import { DataTableTabs } from "@/components/seo/data-table-toolbar";
import { SortableHeader } from "@/components/seo/sortable-header";
import { DetailDrawer } from "./detail-drawer";
import { DraftHandOffDialog, type TaskDraft } from "./keyword-hand-off";
import type { HandOffResult } from "./strategy/hand-off";
import { safeLink } from "./analytics";

type Source = { url: string; title: string; domain: string; own: boolean; rival: string | null };
type Question = { key: string; question: string; platform: "chat_gpt" | "google"; topics: string[]; volume: number | null; status: "ours" | "gap" | "open"; weNamed: boolean; weCited: boolean; rivals: string[]; brands: string[]; sources: Source[]; answer: string; at: string | null };
type Topic = { id: string; keyword: string; platforms: Record<string, { at: string; count: number; error: string | null } | null> };
type View = { dataforseo: boolean; aiReady: boolean; refreshing: boolean; topics: Topic[]; suggested: { topic: string; reason: string }[] | null; maxTopics: number; counts: { all: number; ours: number; gap: number; open: number }; questions: Question[]; citedDomains: { domain: string; count: number; own: boolean; rival: string | null }[]; notes: string[] };
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrAiQuestions", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const PLATFORM = { chat_gpt: "ChatGPT", google: $t("Google AI 概览") } as const;
const STATUS = { ours: { tone: "green", label: $t("已出现") }, gap: { tone: "amber", label: $t("没出现") }, open: { tone: "grey", label: $t("没有品牌") } } as const;
const n = (v: number | null) => (v === null ? "—" : v.toLocaleString());
const COST = 0.2;
const helper = createColumnHelper<Question>();

export function AiQuestions({ projectId, onHandOff }: { projectId: number; onHandOff: (r: HandOffResult) => void }) {
  const [view, setView] = useState<View>();
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"gap" | "ours" | "open" | "all">("gap");
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [openKey, setOpenKey] = useState<string>();
  const [handing, setHanding] = useState<Question[]>();
  const anchorRef = useSelectionAnchor();
  const load = () => call<View>(projectId, "view").then((v) => { setView(v); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : $t("AI 问题没有读出来")));
  useEffect(() => { setView(undefined); void load(); }, [projectId]);
  useEffect(() => { if (!view?.refreshing) return; const t = setTimeout(() => void load(), 5000); return () => clearTimeout(t); }, [view]);
  const rows = useMemo(() => (view?.questions ?? []).filter((q) => filter === "all" || q.status === filter), [view, filter]);
  const columns = useMemo<ColumnDef<Question>[]>(() => [
    makeSelectionColumn<Question>(anchorRef),
    helper.accessor("question", { header: ({ column }) => <SortableHeader column={column} label={$t("问题")} />, cell: ({ row }) => { const q = row.original; return <div className="min-w-0 max-w-xl"><span className="block truncate font-medium" title={q.question}>{q.question}</span><span className="block truncate text-xs text-muted-foreground">{PLATFORM[q.platform]} · {q.topics.join("、")}</span></div>; } }) as ColumnDef<Question>,
    helper.accessor((q) => q.volume ?? undefined, { id: "volume", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t("AI 搜索量")} align="right" />, cell: ({ row }) => n(row.original.volume), meta: { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } }) as ColumnDef<Question>,
    helper.display({ id: "us", header: () => $t("我们"), cell: ({ row }) => { const q = row.original; return q.status === "ours" ? <Tag tone="green">{[q.weNamed ? $t("提到") : "", q.weCited ? $t("引用") : ""].filter(Boolean).join(" · ")}</Tag> : <Tag tone={STATUS[q.status].tone}>{STATUS[q.status].label}</Tag>; } }) as ColumnDef<Question>,
    helper.display({ id: "brands", header: () => $t("提到的品牌"), cell: ({ row }) => { const q = row.original; return q.rivals.length || q.brands.length ? <span className="block max-w-56 truncate text-xs" title={[...q.rivals, ...q.brands].join("、")}>{q.rivals.length ? <b className="font-medium">{q.rivals.join(" · ")}</b> : null}{q.rivals.length && q.brands.length ? " · " : ""}<span className="text-muted-foreground">{q.brands.join(" · ")}</span></span> : <span className="text-muted-foreground">—</span>; } }) as ColumnDef<Question>,
    helper.display({ id: "sources", header: () => $t("AI 引用的网站"), cell: ({ row }) => { const d = [...new Set(row.original.sources.map((s) => s.domain))]; return d.length ? <span className="block max-w-56 truncate text-xs text-muted-foreground" title={d.join("、")}>{d.slice(0, 3).join(" · ")}{d.length > 3 ? $t(" 等 {0} 个",{0:d.length}) : ""}</span> : <span className="text-muted-foreground">—</span>; } }) as ColumnDef<Question>,
  ], [anchorRef]);
  const table = useDataTable({ data: rows, columns, withSorting: true, enableRowSelection: true, state: { rowSelection }, onRowSelectionChange: setRowSelection, getRowId: (q) => q.key });
  const selected = (view?.questions ?? []).filter((q) => rowSelection[q.key]);
  useHandOffSource("ai-questions", view?.topics.length ? { count: selected.length, open: () => setHanding(selected), noun: $t("个问题已选"), clear: () => setRowSelection({}) } : null);
  if (error) return <LoadError title={$t("AI 问题没有读出来")} message={error} onRetry={() => void load()} />;
  if (!view) return <ListSkeleton rows={5} />;
  if (!view.topics.length) return <TopicSetup projectId={projectId} view={view} onView={setView} />;
  const open = view.questions.find((q) => q.key === openKey);
  const pct = view.counts.all ? Math.round((view.counts.ours / view.counts.all) * 100) : 0;
  return (
    <>
      <Topics projectId={projectId} view={view} onView={(v) => { setView(v); setRowSelection({}); }} />
      {view.refreshing ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{$t("正在查 AI 里的问题，一般一两分钟…")}</p> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-question-counts>
        {([[$t("AI 里的问题"), n(view.counts.all), $t("这些主题下，DataForSEO 收集到的 ChatGPT 和 Google AI 概览里的问题（去重）。")], [$t("我们出现"), `${view.counts.ours} · ${pct}%`, $t("回答里提到项目名，或引用了本站的问题。")], [$t("机会：别人出现、我们没有"), n(view.counts.gap), $t("回答里提到了竞品或其他品牌，却没有提到我们的问题。最值得做。")], [$t("没有品牌被提到"), n(view.counts.open), $t("回答里没有提到任何品牌，先写出好的回答就有机会被引用。")]] as const).map(([label, value, tip]) => (
          <Card key={label} className="gap-1 p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground">{label}<InfoTip label={$t("{0}是什么",{0:label})}>{tip}</InfoTip></p><p className="text-2xl font-semibold tabular-nums">{value}</p></Card>
        ))}
      </div>
      <Card className="gap-0 py-0">
        <DataTableTabs value={filter} onValueChange={(v) => { setFilter(v as typeof filter); setRowSelection({}); }} actions={<NotesTip notes={view.notes} label={$t("问题从哪来")} />}>
          <TabsTrigger value="gap">{$tj("机会 ({0})",{0:view.counts.gap})}</TabsTrigger>
          <TabsTrigger value="ours">{$tj("已出现 ({0})",{0:view.counts.ours})}</TabsTrigger>
          <TabsTrigger value="open">{$tj("没有品牌 ({0})",{0:view.counts.open})}</TabsTrigger>
          <TabsTrigger value="all">{$tj("全部 ({0})",{0:view.counts.all})}</TabsTrigger>
        </DataTableTabs>
        <DataTable table={table} empty={{ title: view.refreshing ? $t("正在查") : $t("这一类没有问题") }} onRowClick={(row) => setOpenKey(row.original.key)} />
      </Card>
      {view.citedDomains.length ? (
        <Card className="gap-2 px-4" data-cited-domains>
          <h2 className="flex items-center gap-1 text-sm font-semibold">{$t("我们没出现的回答里，AI 最常引用的网站")}<InfoTip label={$t("这有什么用")}>{$t("想被 AI 提到：可以写页面直接回答这些问题，也可以争取出现在这些被引用的网站上（比如在 Reddit 讨论里回答、上评测网站的榜单）。")}</InfoTip></h2>
          <div className="flex flex-wrap gap-1.5">{view.citedDomains.map((d) => <span key={d.domain} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">{d.domain}<span className="tabular-nums text-muted-foreground">{d.count}</span>{d.own ? <Tag tone="blue">{$t("本站")}</Tag> : d.rival ? <Tag tone="grey">{$t("竞品")}</Tag> : null}</span>)}</div>
        </Card>
      ) : null}
      {open ? <QuestionDetail q={open} onClose={() => setOpenKey(undefined)} onHand={() => { setOpenKey(undefined); setHanding([open]); }} /> : null}
      {handing ? <DraftHandOffDialog projectId={projectId} draft={questionsDraft(handing)} playbookId="content-outline" description={$t("这 {0} 个问题合成一个任务：Agent 看 AI 现在怎么回答、引用了谁，决定新写或改哪一页，确认后立即开始。",{0:handing.length})} onClose={() => setHanding(undefined)} onDone={(r) => { setHanding(undefined); setRowSelection({}); onHandOff(r); }} /> : null}
    </>
  );
}

// First time: the online AI's topics, edited before 开始查询 (the only point where money is spent).
function TopicSetup({ projectId, view, onView }: { projectId: number; view: View; onView: (v: View) => void }) {
  const [topics, setTopics] = useState<string[]>(view.suggested?.map((t) => t.topic) ?? []);
  const [reasons, setReasons] = useState<Record<string, string>>(Object.fromEntries((view.suggested ?? []).map((t) => [t.topic, t.reason])));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "suggest" | "start">("");
  const [error, setError] = useState("");
  const suggest = async (force = false) => {
    setBusy("suggest"); setError("");
    try { const r = await call<{ topics: { topic: string; reason: string }[] }>(projectId, "suggest", { force }); setTopics(r.topics.map((t) => t.topic)); setReasons(Object.fromEntries(r.topics.map((t) => [t.topic, t.reason]))); }
    catch (e) { setError(e instanceof Error ? e.message : $t("没有建议出来")); }
    finally { setBusy(""); }
  };
  useEffect(() => { if (!view.suggested && view.aiReady && view.dataforseo) void suggest(); }, []);
  const add = () => { const t = text.trim().toLowerCase(); if (t && !topics.includes(t) && topics.length < view.maxTopics) setTopics([...topics, t]); setText(""); };
  const start = async () => {
    setBusy("start"); setError("");
    try { onView(await call<View>(projectId, "topics", { topics })); toast.success($t("已开始查询，一般一两分钟")); }
    catch (e) { setError(e instanceof Error ? e.message : $t("没有开始")); }
    finally { setBusy(""); }
  };
  if (!view.dataforseo) return <InlineError>{$t("AI 问题通过 DataForSEO 查，请先在数据接入里接入并验证 DataForSEO。")}</InlineError>;
  return (
    <Card className="gap-3 px-4" data-topic-setup>
      <div><h2 className="flex items-center gap-1.5 text-sm font-semibold"><AiMark label={$t("AI 建议")} />{$t("先定几个主题")}</h2><p className="text-xs text-muted-foreground">{$t("按主题词去找用户在 ChatGPT 和 Google AI 概览里问的问题。用英语，写品类、用途或要解决的问题，不写产品名。")}</p></div>
      {busy === "suggest" ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{$t("AI 正在根据官网、记忆和关键词想主题…")}</p> : null}
      <div className="flex flex-wrap gap-1.5">{topics.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-0.5 text-sm" title={reasons[t] || undefined}>{t}<button type="button" aria-label={$t("去掉 {0}",{0:t})} onClick={() => setTopics(topics.filter((x) => x !== t))}><X className="size-3" /></button></span>)}</div>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Input className="max-w-xs" aria-label={$t("添加主题")} value={text} placeholder={$t("例如 internal tool builder")} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="outline" disabled={!text.trim() || topics.length >= view.maxTopics}><Plus data-icon="inline-start" />{$t("添加")}</Button>
        {view.aiReady ? <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={() => void suggest(true)}><Sparkles data-icon="inline-start" />{$t("重新建议")}</Button> : null}
      </form>
      {error ? <InlineError>{error}</InlineError> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!topics.length || Boolean(busy)} onClick={() => void start()}>{busy === "start" ? $t("正在开始…") : $t("开始查询（约 ${0}）",{0:(topics.length * 2 * COST).toFixed(1)})}</Button>
        <span className="text-xs text-muted-foreground">{$t("每个主题查 ChatGPT 和 Google AI 概览各 100 个问题，之后每月自动更新一次。")}</span>
      </div>
    </Card>
  );
}

// The topics row once set: add (looked up at once) or remove.
function Topics({ projectId, view, onView }: { projectId: number; view: View; onView: (v: View) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (topics: string[], done: string) => {
    setBusy(true);
    try { onView(await call<View>(projectId, "topics", { topics })); toast.success(done); setText(""); }
    catch (e) { toast.error(e instanceof Error ? e.message : $t("没有保存")); }
    finally { setBusy(false); }
  };
  const list = view.topics.map((t) => t.keyword);
  const failed = view.topics.flatMap((t) => Object.values(t.platforms).filter((x) => x?.error).map((x) => `${t.keyword}：${$t(x!.error)}`));
  return (
    <div className="space-y-1.5" data-topics>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-muted-foreground">{$t("主题：")}</span>
        {view.topics.map((t) => <span key={t.id} className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-0.5 text-sm">{t.keyword}<button type="button" aria-label={$t("去掉主题 {0}",{0:t.keyword})} disabled={busy || list.length <= 1} onClick={() => void save(list.filter((x) => x !== t.keyword), $t("已去掉“{0}”",{0:t.keyword}))}><X className="size-3" /></button></span>)}
        {list.length < view.maxTopics ? (
          <form className="inline-flex gap-1.5" onSubmit={(e) => { e.preventDefault(); const t = text.trim().toLowerCase(); if (t && !list.includes(t)) void save([...list, t], $t("已添加“{0}”，正在查询",{0:t})); }}>
            <Input className="h-7 w-48" aria-label={$t("添加主题")} value={text} disabled={busy} placeholder={$t("添加主题")} onChange={(e) => setText(e.target.value)} />
            <Button type="submit" size="sm" variant="outline" disabled={busy || !text.trim()}>{$t("添加")}</Button>
          </form>
        ) : null}
        <InfoTip label={$t("主题怎么用")}>{$tj("每个主题查 ChatGPT 和 Google AI 概览里包含这个词的问题，各 100 个（约 ${0}），之后每月自动更新；最多 {1} 个。",{0:(2 * COST).toFixed(1),1:view.maxTopics})}</InfoTip>
      </div>
      {failed.length ? <InlineError>{$tj("这次没有查全：{0}",{0:failed[0]})}</InlineError> : null}
    </div>
  );
}

// One question: the AI's answer, who it names, what it cites.
function QuestionDetail({ q, onClose, onHand }: { q: Question; onClose: () => void; onHand: () => void }) {
  return (
    <DetailDrawer open onClose={onClose} title={q.question} description={$t("{0} · AI 搜索量 {1}{2}",{0:PLATFORM[q.platform],1:n(q.volume),2:q.at ? $t(" · 回答于 {0}",{0:q.at.slice(0, 10)}) : ""})}
      actions={<Button size="sm" onClick={onHand}><Bot data-icon="inline-start" />{$t("交给 Agent")}</Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Tag tone={STATUS[q.status].tone} dot>{q.status === "ours" ? [q.weNamed ? $t("提到我们") : "", q.weCited ? $t("引用了本站") : ""].filter(Boolean).join("、") : STATUS[q.status].label}</Tag>{q.rivals.map((r) => <Tag key={r} tone="grey">{r}</Tag>)}{q.brands.map((b) => <span key={b} className="text-xs text-muted-foreground">{b}</span>)}</div>
        <section className="space-y-1"><h3 className="text-sm font-semibold">{$t("AI 的回答（开头）")}</h3><p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm leading-relaxed">{q.answer || $t("没有回答文字。")}{q.answer.length >= 900 ? "…" : ""}</p></section>
        <section className="space-y-1"><h3 className="text-sm font-semibold">{$t("引用的网页")}</h3>
          {q.sources.length ? q.sources.map((s) => { const href = safeLink(s.url); return <p key={s.url || s.domain} className="flex items-center gap-2 text-sm">{href ? <a className="nr-link min-w-0 flex-1 truncate" href={href} target="_blank" rel="noreferrer" title={s.url}>{s.title || s.domain}</a> : <span className="min-w-0 flex-1 truncate">{s.title || s.domain}</span>}<span className="shrink-0 text-xs text-muted-foreground">{s.domain}</span>{s.own ? <Tag tone="blue">{$t("本站")}</Tag> : s.rival ? <Tag tone="grey">{s.rival}</Tag> : null}</p>; }) : <p className="text-sm text-muted-foreground">{$t("这条回答没有引用网页。")}</p>}
        </section>
      </div>
    </DetailDrawer>
  );
}

// The questions picked become one task: how AI answers now, who it names and cites, and what to do.
function questionsDraft(rows: Question[]): TaskDraft {
  const head = rows[0].question;
  const lines = rows.slice(0, 30).map((q) => $t("- {0}（{1}，AI 搜索量 {2}；{3}{4}{5}）{6}",{0:q.question,1:PLATFORM[q.platform],2:n(q.volume),3:q.status === "ours" ? $t("已经{0}{1}我们",{0:q.weNamed ? $t("提到") : "",1:q.weCited ? $t("引用") : ""}) : $t("没有提到我们"),4:q.rivals.length || q.brands.length ? $t("；提到：{0}",{0:[...q.rivals, ...q.brands].slice(0, 6).join("、")}) : "",5:q.sources.length ? $t("；引用：{0}",{0:[...new Set(q.sources.map((s) => s.domain))].slice(0, 5).join("、")}) : "",6:q.answer ? $t("\n  回答开头：{0}",{0:q.answer.slice(0, 240).replace(/\s+/g, " ")}) : ""}));
  return {
    title: (rows.length === 1 ? $t("让 AI 回答「{0}」时提到我们",{0:head}) : $t("让 AI 回答「{0}」等 {1} 个问题时提到我们",{0:head,1:rows.length})).slice(0, 200),
    objective: $t("AI（ChatGPT、Google AI 概览）回答这些问题时提到我们、引用本站页面").slice(0, 1000),
    brief: [$t("用户在 AI 里问的这些问题："), ...lines, "", $t("依据：DataForSEO 收集的 AI 问答（ChatGPT 为美国英语），按月更新。"), $t("建议：先看 AI 现在引用的网页写了什么、提到了谁；本站有合适页面就改得更直接地回答这些问题，没有就新写；也可以争取出现在被引用的第三方网站上（讨论区、评测、榜单）。")].join("\n").slice(0, 20000),
  };
}
