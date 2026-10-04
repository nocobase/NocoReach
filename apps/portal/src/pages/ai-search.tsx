// AI 搜索: after every-app/open-seo db8bde1 src/client/features/ai-search/ (BrandLookupPage, PromptExplorerPage and their
// components; MIT). Changes: the brand defaults to the project and our pages are marked from its domains; ChatGPT and
// Google AI 概览 are looked up together and shown side by side; 问 AI asks the chosen models at once and shows each
// answer as it arrives; questions and answers that leave us out can be handed to the Agent; no per-query cost (spending
// is in 数据接入); Chinese copy.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Bot, MessageSquareText, Sparkles, X } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton } from "@/components/reach/states";
import { Tag } from "@/components/reach/tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatTile } from "@/components/seo/stat-tile";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "@/components/seo/data-table";
import { DataTableToolbar } from "@/components/seo/data-table-toolbar";
import { TablePagination } from "@/components/seo/table-pagination";
import { TableBulkActionBar, TableBulkActionButton } from "@/components/seo/table-bulk-action-bar";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { DraftHandOffDialog, type TaskDraft } from "./keyword-hand-off";
import { DocReader } from "./doc-view";
import { useProject } from "./reach-data";
import { currentProjectId } from "./current-project";
import { keywordRequest, markets, marketLabel, metric, type KeywordConnectionState } from "./keyword-api";
import { safeLink } from "./analytics";
import "./data-views.css";
import {InfoTip,WithInfo} from "@/components/reach/info-tip";
import { help } from "./glossary";

type Platform = "chat_gpt" | "google";
type Model = "chat_gpt" | "claude" | "gemini" | "perplexity";
type Source = { url: string; title: string; domain: string; own: boolean };
type Question = { question: string; volume: number | null; sources: Source[]; ownCited: boolean; brands: string[]; excerpt: string; at: string | null };
type BrandResult = { platform: Platform; mentions: number | null; aiSearchVolume: number | null; questions: Question[]; pages: (Source & { count: number })[]; share: { key: string; mentions: number | null; own: boolean }[] | null };
type AnswerResult = { model: Model; modelName: string; text: string; citations: Source[]; mentioned: boolean; ownCited: number; webSearch: boolean; fanOut: string[] };
type BrandSpec = { kind: "ai-brand"; platform: Platform; target: string; competitors: string[]; locationCode: number; language: string; group: string };
type AnswerSpec = { kind: "ai-answer"; model: Model; modelName: string; question: string; group: string };
type Run<S, R> = { id: string | number; status: string; spec: S; result?: R | null; errorCode?: string | null; createdAt: string; completedAt?: string | null };
type BrandRun = Run<BrandSpec, BrandResult>;
type AnswerRun = Run<AnswerSpec, AnswerResult>;
type Recent = { kind: "brand" | "answer"; group: string; label: string; competitors: string[]; createdAt: string; runs: Record<string, { id: string; status: string; mentioned: boolean | null }> };

const PLATFORMS: Platform[] = ["chat_gpt", "google"];
const MODELS: Model[] = ["chat_gpt", "claude", "gemini", "perplexity"];
const PLATFORM: Record<Platform, string> = { chat_gpt: "ChatGPT", google: "Google AI 概览" };
const MODEL: Record<Model, string> = { chat_gpt: "ChatGPT", claude: "Claude", gemini: "Gemini", perplexity: "Perplexity" };
const ai = <T,>(action: string, body: object = {}) => api.action<T>("nrAiSearch", action, { method: "POST", body: { projectId: String(currentProjectId()), ...body }, unwrap: "data" });
const requestKey = () => crypto.randomUUID().replace(/-/g, "");
const message = (e: unknown) => (e instanceof Error ? e.message : "没有完成，请稍后再试");
const when = (v?: string | null) => (v ? new Date(v).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
// A run that did not complete: uncertain ones may be billed and are never asked again by themselves.
const runProblem = (r: { status: string; errorCode?: string | null }) => (r.status === "unknown" ? r.errorCode || "结果不确定：可能已计费，已阻止重复查询" : r.status === "failed" ? `DataForSEO 没有返回结果（${r.errorCode || "原因未知"}）` : r.status === "running" ? "还在查询" : "");

export default function AiSearch() {
  const navigate = useNavigate();
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "ask" ? "ask" : "brand";
  const group = params.get("g");
  const [connection, setConnection] = useState<KeywordConnectionState>();
  const [recent, setRecent] = useState<Recent[]>();
  const [handOff, setHandOff] = useState<HandOffResult>();
  const loadRecent = () => ai<Recent[]>("list").then(setRecent).catch(() => setRecent([]));
  useEffect(() => {
    void keywordRequest<KeywordConnectionState>("status").then(setConnection).catch(() => setConnection({ configured: false, verifiedAt: null, monthlyBudgetUsd: 5 }));
    void loadRecent();
  }, []);
  const go = (next: { tab?: "brand" | "ask"; g?: string | null }) => {
    const p = new URLSearchParams();
    if ((next.tab ?? tab) === "ask") p.set("tab", "ask");
    if (next.g) p.set("g", next.g);
    setParams(p, { replace: true });
  };
  const ran = (g: string) => { go({ g }); void loadRecent(); };
  const notConnected = connection && !connection.verifiedAt;
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<InfoTip label="数据说明" side="bottom">问题是 DataForSEO 收集的 AI 回答样本（每个平台最多 100 个）；提及次数和 AI 搜索量是 DataForSEO 的估算，按月更新。</InfoTip>} title="AI 搜索" description="看 ChatGPT、Google AI 概览等 AI 的回答里有没有提到你、引用了谁。数据来自 DataForSEO，按查询收费，30 天内同样的查询直接打开已有结果。" />
      <HandOffNotice result={handOff} />
      <Tabs value={tab} onValueChange={(v) => go({ tab: v === "ask" ? "ask" : "brand", g: null })}>
        <TabsList variant="line" className="h-auto! justify-start">
          <TabsTrigger value="brand">品牌提及</TabsTrigger>
          <TabsTrigger value="ask">问 AI</TabsTrigger>
        </TabsList>
      </Tabs>
      {notConnected ? (
        <EmptyState icon={<Sparkles />} title="先接入 DataForSEO" description="AI 搜索用 DataForSEO 的数据，按查询收费；接入时设好每月预算，花了多少在数据接入里看。" action={<Button onClick={() => navigate("/connections?source=keywords")}>去数据接入</Button>} />
      ) : !connection ? <ListSkeleton rows={3} /> : tab === "brand" ? (
        <BrandTab group={group} brand={project?.name ?? ""} projectId={project?.id} recent={recent?.filter((r) => r.kind === "brand")} onOpen={(g) => go({ g })} onRan={ran} onHandOff={setHandOff} />
      ) : (
        <AskTab group={group} projectId={project?.id} brand={project?.name ?? ""} domains={project?.domains ?? []} recent={recent?.filter((r) => r.kind === "answer")} onOpen={(g) => go({ g })} onRan={ran} onHandOff={setHandOff} />
      )}
    </PageContainer>
  );
}

type TabProps = { group: string | null; projectId?: number; recent?: Recent[]; onOpen: (g: string) => void; onRan: (g: string) => void; onHandOff: (r: HandOffResult) => void };

function BrandTab({ group, brand, projectId, recent, onOpen, onRan, onHandOff }: TabProps & { brand: string }) {
  const [form, setForm] = useState({ target: brand, competitors: [] as string[], market: markets[0] });
  const [competitor, setCompetitor] = useState("");
  const [runs, setRuns] = useState<Partial<Record<Platform, BrandRun>>>({});
  const [errors, setErrors] = useState<Partial<Record<Platform, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reused, setReused] = useState(false);
  const shownGroup = useRef<string | null>(null);
  useEffect(() => { if (!form.target && brand) setForm((f) => ({ ...f, target: brand })); }, [brand]);
  // The open lookup lives in the URL (?g=), so a reload or a recent entry reopens it without a new query.
  useEffect(() => {
    if (!group) { setRuns({}); setErrors({}); shownGroup.current = null; return; }
    if (shownGroup.current === group) return;
    shownGroup.current = group;
    void ai<{ runs: BrandRun[] }>("open", { kind: "brand", group }).then(({ runs: list }) => {
      const by: Partial<Record<Platform, BrandRun>> = {};
      for (const r of list) by[r.spec.platform] = r;
      setRuns(by); setErrors({}); setReused(false);
      const s = list[0]?.spec;
      if (s) setForm((f) => ({ target: s.target, competitors: s.competitors, market: markets.find((m) => m.locationCode === by.google?.spec.locationCode && m.language === by.google?.spec.language) ?? f.market }));
    }).catch((e) => setError(message(e)));
  }, [group]);
  const addCompetitor = () => {
    const v = competitor.trim();
    if (v.length < 2 || form.competitors.length >= 5 || [form.target, ...form.competitors].some((c) => c.toLowerCase() === v.toLowerCase())) return;
    setForm((f) => ({ ...f, competitors: [...f.competitors, v] })); setCompetitor("");
  };
  const search = async (forceRefresh = false, what: { target: string; competitors: string[] } = form) => {
    const target = what.target.trim();
    if (target.length < 2) { setError("请填写品牌名或域名"); return; }
    setBusy(true); setError(""); setErrors({});
    const started = Date.now();
    const settled = await Promise.allSettled(PLATFORMS.map((platform) => ai<BrandRun>("brand", { target, competitors: what.competitors, platform, locationCode: form.market.locationCode, language: form.market.language, requestKey: requestKey(), ...(forceRefresh ? { forceRefresh: true } : {}) })));
    const next: Partial<Record<Platform, BrandRun>> = {}, errs: Partial<Record<Platform, string>> = {};
    settled.forEach((r, i) => { if (r.status === "fulfilled") next[PLATFORMS[i]] = r.value; else errs[PLATFORMS[i]] = message(r.reason); });
    setRuns(next); setErrors(errs); setReused(Object.values(next).some((r) => Date.parse(r.createdAt) < started - 5000)); setBusy(false);
    const g = Object.values(next)[0]?.spec.group;
    if (g) { shownGroup.current = g; onRan(g); }
  };
  const open = PLATFORMS.some((p) => runs[p] || errors[p]);
  const shown = PLATFORMS.map((p) => runs[p]?.spec).find(Boolean);
  return (
    <>
      <Card className="px-4">
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void search(); }}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Input className="lg:max-w-56" aria-label="品牌或域名" placeholder="品牌名或域名，例如 NocoBase" maxLength={100} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {form.competitors.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">{c}<button type="button" aria-label={`去掉 ${c}`} onClick={() => setForm((f) => ({ ...f, competitors: f.competitors.filter((x) => x !== c) }))}><X className="size-3" /></button></span>
              ))}
              {form.competitors.length < 5 ? <Input className="h-8 w-44" aria-label="添加竞品" placeholder="添加竞品，回车确认" maxLength={100} value={competitor} onChange={(e) => setCompetitor(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompetitor(); } }} onBlur={addCompetitor} /> : null}
            </div>
            <Select value={`${form.market.locationCode}:${form.market.language}`} onValueChange={(v) => { const m = markets.find((x) => `${x.locationCode}:${x.language}` === v); if (m) setForm((f) => ({ ...f, market: m })); }}>
              <SelectTrigger className="w-full lg:w-44" aria-label="Google AI 概览的市场"><SelectValue>{(v: string) => markets.find((x) => `${x.locationCode}:${x.language}` === v)?.label}</SelectValue></SelectTrigger>
              <SelectContent>{markets.map((m) => <SelectItem key={`${m.locationCode}:${m.language}`} value={`${m.locationCode}:${m.language}`}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="submit" disabled={busy} className="lg:px-6">{busy ? "正在查询…" : "查询"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">同时查 ChatGPT 和 Google AI 概览；市场只对 Google AI 概览有效，ChatGPT 只有美国英语的数据。加竞品会多比较一项“提及份额”（最多 5 个）。</p>
          {error ? <p role="alert" className="nr-error">{error}</p> : null}
        </form>
      </Card>
      {open ? (
        <>
          {shown ? (
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">「{shown.target}」的品牌提及{shown.competitors.length ? <span className="ml-2 font-normal text-muted-foreground">对比 {shown.competitors.join("、")}</span> : null}</h2>
              {reused ? <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">已有结果，没有再收费<InfoTip>30 天内查过同样的品牌和竞品，直接显示那次的结果。</InfoTip><Button variant="link" size="sm" className="h-auto p-0" disabled={busy} onClick={() => void search(true, shown)}>重新查询</Button></p> : null}
            </div>
          ) : null}
          <BrandResults runs={runs} errors={errors} projectId={projectId} onHandOff={onHandOff} />
        </>
      ) : null}
      {/* Lookups made before stay listed under the results; one click shows them again, without a new charge. */}
      <RecentList recent={recent} empty="还没有查过品牌提及" current={open ? group : null} showing={open} onOpen={onOpen} />
    </>
  );
}

type QuestionRow = Question & { id: string; platform: Platform };
const helper = createColumnHelper<QuestionRow>();
function BrandResults({ runs, errors, projectId, onHandOff }: { runs: Partial<Record<Platform, BrandRun>>; errors: Partial<Record<Platform, string>>; projectId?: number; onHandOff: (r: HandOffResult) => void }) {
  const [uncitedOnly, setUncitedOnly] = useState(false);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [handing, setHanding] = useState<QuestionRow[]>();
  const anchorRef = useSelectionAnchor();
  const done = PLATFORMS.filter((p) => runs[p]?.status === "completed" && runs[p]?.result).map((p) => runs[p]!);
  const all = useMemo(() => done.flatMap((r) => r.result!.questions.map((q, i) => ({ ...q, id: `${r.spec.platform}:${i}`, platform: r.spec.platform }))), [runs]);
  const rows = useMemo(() => (uncitedOnly ? all.filter((q) => !q.ownCited) : all), [all, uncitedOnly]);
  useEffect(() => { setPagination((p) => ({ ...p, pageIndex: 0 })); setRowSelection({}); }, [uncitedOnly, runs]);
  const columns = useMemo<ColumnDef<QuestionRow>[]>(() => [
    makeSelectionColumn<QuestionRow>(anchorRef),
    helper.accessor("question", { header: "问题", cell: ({ row }) => <div className="min-w-0 max-w-xl"><p className="truncate font-medium" title={row.original.question}>{row.original.question}</p>{row.original.excerpt ? <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.excerpt}</p> : null}</div> }) as ColumnDef<QuestionRow>,
    helper.accessor("platform", { header: "平台", cell: ({ getValue }) => <span className="whitespace-nowrap text-sm">{PLATFORM[getValue()]}</span> }) as ColumnDef<QuestionRow>,
    helper.accessor("volume", { header: () => <WithInfo help={help("AI 搜索量")}>AI 搜索量</WithInfo>, cell: ({ getValue }) => metric(getValue()), meta: { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } }) as ColumnDef<QuestionRow>,
    helper.accessor("ownCited", { header: "引用本站", cell: ({ getValue }) => (getValue() ? <Tag tone="green">引用了</Tag> : <Tag tone="amber">没引用</Tag>) }) as ColumnDef<QuestionRow>,
  ], [anchorRef]);
  const table = useDataTable({ data: rows, columns, withPagination: true, enableRowSelection: true, state: { rowSelection, pagination }, onRowSelectionChange: setRowSelection, onPaginationChange: setPagination, getRowId: (r) => r.id });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const pages = useMemo(() => {
    const by = new Map<string, Source & { count: number }>();
    for (const r of done) for (const p of r.result!.pages) { const k = p.url || p.domain, o = by.get(k); by.set(k, o ? { ...o, count: o.count + p.count } : { ...p }); }
    return [...by.values()].sort((a, b) => b.count - a.count || Number(b.own) - Number(a.own)).slice(0, 15);
  }, [runs]);
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {PLATFORMS.map((p) => <PlatformCard key={p} platform={p} run={runs[p]} error={errors[p]} />)}
      </div>
      {done.length ? (
        <>
          <Card className="gap-0 py-0">
            <DataTable
              table={table}
              empty={{ title: uncitedOnly ? "提到你的回答都引用了本站" : "没有找到提到你的回答", description: uncitedOnly ? "去掉“只看没引用本站的”看全部。" : "换个写法（品牌名或域名）再查。" }}
              toolbar={
                <DataTableToolbar actions={<Button variant={uncitedOnly ? "secondary" : "outline"} size="sm" aria-pressed={uncitedOnly} onClick={() => setUncitedOnly((v) => !v)}>只看没引用本站的</Button>}>
                  <span className="text-sm font-medium">提到你的问题</span>
                  <span className="text-xs text-muted-foreground">{uncitedOnly ? `${rows.length} 个没引用本站，共 ${all.length} 个` : `共 ${all.length} 个`}，按 AI 搜索量排序</span>
                </DataTableToolbar>
              }
              footer={rows.length > pagination.pageSize ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={[25, 50, 100]} totalCount={rows.length} onPageChange={(n) => setPagination((s) => ({ ...s, pageIndex: n - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null}
            />
          </Card>
          <Card className="gap-2 px-4">
            <h2 className="text-sm font-semibold">这些回答引用最多的网页</h2>
            {pages.length ? (
              <ul className="divide-y divide-border text-sm">
                {pages.map((p) => (
                  <li key={p.url || p.domain} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{p.url ? <a className="nr-link" href={safeLink(p.url)} target="_blank" rel="noreferrer" title={p.url}>{p.title || p.url}</a> : p.domain}<span className="ml-2 text-xs text-muted-foreground">{p.domain}</span></span>
                    <span className="flex shrink-0 items-center gap-2">{p.own ? <Tag tone="green">本站</Tag> : null}<span className="tabular-nums text-muted-foreground">{p.count} 次</span></span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">这些回答没有给出引用。</p>}
          </Card>
        </>
      ) : null}
      <TableBulkActionBar selectedCount={selected.length} selectedLabel="个问题已选" onClear={() => setRowSelection({})} actions={<TableBulkActionButton icon={<Bot className="size-3.5" />} onClick={() => setHanding(selected)}>交给 Agent</TableBulkActionButton>} />
      {handing && projectId ? <DraftHandOffDialog projectId={projectId} draft={brandDraft(handing, done)} playbookId="content-outline" description={`这 ${handing.length} 个问题合成一个任务，确认后立即开始。`} onClose={() => setHanding(undefined)} onDone={(r) => { setHanding(undefined); setRowSelection({}); onHandOff(r); }} /> : null}
    </>
  );
}

function PlatformCard({ platform, run, error }: { platform: Platform; run?: BrandRun; error?: string }) {
  const r = run?.status === "completed" ? run.result : null;
  const problem = error || (run ? runProblem(run) : "");
  const share = r?.share?.filter((s) => s.mentions !== null) ?? [];
  const total = share.reduce((n, s) => n + (s.mentions || 0), 0);
  return (
    <Card className="gap-3 px-4" data-platform={platform}>
      <div className="flex items-baseline justify-between gap-2"><h2 className="font-heading text-base font-medium">{PLATFORM[platform]}</h2><span className="text-xs text-muted-foreground">{run ? `${platform === "google" ? marketLabel(run.spec) : "美国 · 英语"} · ${when(run.completedAt || run.createdAt)}` : ""}</span></div>
      {problem ? <p className="nr-error">{problem}</p> : !r ? <p className="text-sm text-muted-foreground">没有结果</p> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="AI 回答里提到" value={metric(r.mentions)} />
            <StatTile label="AI 搜索量" help={help("AI 搜索量")} value={metric(r.aiSearchVolume)} />
            <StatTile label="引用本站的回答" value={r.questions.length ? `${r.questions.filter((q) => q.ownCited).length} / ${r.questions.length}` : "—"} />
          </div>
          {share.length > 1 && total > 0 ? (
            <div className="space-y-1.5" aria-label="提及份额">
              <p className="text-xs font-medium text-muted-foreground"><WithInfo help={help("提及份额")}>提及份额</WithInfo></p>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">{share.map((s, i) => <div key={s.key} style={{ width: `${(100 * (s.mentions || 0)) / total}%`, background: s.own ? "var(--chart-3)" : `color-mix(in oklch, var(--muted-foreground) ${55 - i * 12}%, transparent)` }} />)}</div>
              <p className="text-xs text-muted-foreground">{share.map((s) => `${s.own ? "你" : s.key} ${Math.round((100 * (s.mentions || 0)) / total)}%`).join(" · ")}</p>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function brandDraft(rows: QuestionRow[], runs: BrandRun[]): TaskDraft {
  const head = rows[0].question, brand = runs[0]?.spec.target ?? "";
  const lines = rows.slice(0, 30).map((q) => `- ${q.question}（${PLATFORM[q.platform]}，AI 搜索量 ${metric(q.volume)}，${q.ownCited ? "引用了本站" : "没引用本站"}${q.sources.length ? `；引用了：${[...new Set(q.sources.map((s) => s.domain))].slice(0, 5).join("、")}` : ""}）${q.excerpt ? `\n  回答片段：${q.excerpt}` : ""}`);
  return {
    title: (rows.length === 1 ? `让 AI 回答「${head}」时引用本站` : `让 AI 回答「${head}」等 ${rows.length} 个问题时引用本站`).slice(0, 200),
    objective: `AI 回答这些问题时提到 ${brand} 并引用本站页面`.slice(0, 1000),
    brief: [`AI 搜索里提到 ${brand} 的回答：`, ...lines, "", "依据：DataForSEO 收集的 AI 回答样本（ChatGPT 为美国英语，Google AI 概览按查询的市场），按月更新。", "建议：先看 AI 现在引用的网页写了什么，再决定新写或改哪一页，让内容直接回答这些问题、方便被引用。"].join("\n").slice(0, 20000),
  };
}

function AskTab({ group, projectId, brand, domains, recent, onOpen, onRan, onHandOff }: TabProps & { brand: string; domains: string[] }) {
  const [question, setQuestion] = useState("");
  // The question the answers below belong to (the box may already hold the next one).
  const [asked, setAsked] = useState("");
  const [models, setModels] = useState<Model[]>([...MODELS]);
  const [runs, setRuns] = useState<Partial<Record<Model, AnswerRun | { error: string } | "loading">>>({});
  const [error, setError] = useState("");
  const [reused, setReused] = useState(false);
  const [handing, setHanding] = useState(false);
  const shownGroup = useRef<string | null>(null);
  useEffect(() => {
    if (!group) { setRuns({}); shownGroup.current = null; return; }
    if (shownGroup.current === group) return;
    shownGroup.current = group;
    void ai<{ runs: AnswerRun[] }>("open", { kind: "answer", group }).then(({ runs: list }) => {
      setRuns(Object.fromEntries(list.map((r) => [r.spec.model, r]))); setReused(false);
      if (list[0]) { setQuestion(list[0].spec.question); setAsked(list[0].spec.question); setModels(MODELS.filter((m) => list.some((r) => r.spec.model === m))); }
    }).catch((e) => setError(message(e)));
  }, [group]);
  const busy = Object.values(runs).some((r) => r === "loading");
  const ask = async (forceRefresh = false, text = question) => {
    const q = text.trim();
    if (q.length < 5) { setError("请填写一个问题"); return; }
    if (!models.length) { setError("至少选一个模型"); return; }
    setError(""); setReused(false);
    setRuns(Object.fromEntries(models.map((m) => [m, "loading"]))); setAsked(q);
    const started = Date.now();
    // Each model is its own query, asked at once; each answer shows as it arrives.
    const settled = await Promise.allSettled(models.map((m) => ai<AnswerRun>("ask", { question: q, model: m, requestKey: requestKey(), ...(forceRefresh ? { forceRefresh: true } : {}) }).then((r) => { setRuns((s) => ({ ...s, [m]: r })); return r; }).catch((e) => { setRuns((s) => ({ ...s, [m]: { error: message(e) } })); throw e; })));
    const done = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    setReused(done.some((r) => Date.parse(r.createdAt) < started - 5000));
    if (done[0]) { shownGroup.current = done[0].spec.group; onRan(done[0].spec.group); }
  };
  const answers = MODELS.flatMap((m) => { const r = runs[m]; return r && r !== "loading" && !("error" in r) && r.status === "completed" && r.result ? [r] : []; });
  const missing = answers.filter((r) => !r.result!.mentioned);
  const shown = MODELS.filter((m) => runs[m]);
  return (
    <>
      <Card className="px-4">
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Input className="flex-1" aria-label="问题" placeholder="输入一个用户会问 AI 的问题，例如 What is the best open source no-code platform?" maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} />
            <Button type="submit" disabled={busy} className="lg:px-6">{busy ? "正在提问…" : "提问"}</Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm" role="group" aria-label="模型">
            {MODELS.map((m) => <label key={m} className="flex items-center gap-1.5"><Checkbox checked={models.includes(m)} onCheckedChange={(on) => setModels((list) => (on ? MODELS.filter((x) => x === m || list.includes(x)) : list.filter((x) => x !== m)))} aria-label={MODEL[m]} />{MODEL[m]}</label>)}
          </div>
          <p className="text-xs text-muted-foreground">每个模型单独查询、联网回答，回答里有没有提到你按项目名称和官网域名判断。</p>
          {error ? <p role="alert" className="nr-error">{error}</p> : null}
        </form>
      </Card>
      {shown.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold" title={asked}>「{asked}」的回答{answers.length ? <span className="ml-2 font-normal text-muted-foreground">{when(answers.map((r) => r.createdAt).sort().at(-1))}</span> : null}</h2>
              {reused ? <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">已有回答，没有再收费<InfoTip>30 天内问过同样的问题，直接显示那次的回答。</InfoTip><Button variant="link" size="sm" className="h-auto p-0" disabled={busy} onClick={() => void ask(true, asked)}>重新问</Button></p> : null}
            </div>
            {missing.length && projectId ? <Button size="sm" onClick={() => setHanding(true)}><Bot data-icon="inline-start" />交给 Agent</Button> : null}
          </div>
          <AnswerTable models={shown} runs={runs} terms={brandTerms(brand, domains)} domains={domains} />
        </>
      ) : null}
      {/* Questions asked before stay listed under the answers; one click shows their answers again, without a new charge. */}
      <RecentList recent={recent} empty="还没有问过 AI" current={shown.length ? group : null} showing={shown.length > 0} onOpen={onOpen} />
      {handing && projectId ? <DraftHandOffDialog projectId={projectId} draft={answerDraft(asked, answers)} playbookId="content-outline" description="这个问题合成一个任务，确认后立即开始。" onClose={() => setHanding(false)} onDone={(r) => { setHanding(false); onHandOff(r); }} /> : null}
    </>
  );
}

// Who mentions us is told by the project's name and site domains (as on the server); old answers are read the same way.
function brandTerms(brand: string, domains: string[]) {
  const bare = domains.map((d) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase()).filter(Boolean);
  return [...new Set([brand, ...bare, ...bare.map((d) => d.split(".")[0])].map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3))];
}
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`#>|]+/g, " ").replace(/\s+/g, " ").trim();
// The first sentence of the answer that names us, without markdown.
function mentionLine(text: string, terms: string[]) {
  const parts = text.split(/\n+/).flatMap((l) => l.split(/(?<=[.!?。！？])\s+/));
  const hit = parts.find((l) => terms.some((t) => l.toLowerCase().includes(t)));
  return hit ? plain(hit).slice(0, 240) : "";
}
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="rounded-sm bg-transparent font-semibold text-foreground">{part}</mark> : part))}</>;
}
// Cited sites, one per site with how often it was cited; Google's redirect links count as the site in their title.
function citedSites(citations: Source[], domains: string[]) {
  const own = domains.map((d) => d.replace(/^www\./, "").toLowerCase());
  const by = new Map<string, { site: string; count: number; own: boolean; url: string }>();
  for (const c of citations) {
    const site = /vertexaisearch\.cloud\.google\.com$/.test(c.domain) && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(c.title.trim()) ? c.title.trim().toLowerCase() : c.domain.replace(/^www\./, "");
    const o = by.get(site);
    by.set(site, o ? { ...o, count: o.count + 1 } : { site, count: 1, url: c.url, own: c.own || own.some((d) => site === d || site.endsWith(`.${d}`)) });
  }
  return [...by.values()].sort((a, b) => Number(b.own) - Number(a.own) || b.count - a.count);
}

// One row per model, side by side: whether it names us, the sentence that does, the sites it cites; the full answer
// opens in the reading window.
function AnswerTable({ models, runs, terms, domains }: { models: Model[]; runs: Partial<Record<Model, AnswerRun | { error: string } | "loading">>; terms: string[]; domains: string[] }) {
  const [reading, setReading] = useState<AnswerRun>();
  const cols = "lg:grid lg:grid-cols-[150px_96px_minmax(0,1.3fr)_minmax(0,1fr)_88px] lg:items-start lg:gap-4";
  return (
    <Card className="gap-0 py-0">
      <div className={`hidden border-b border-border px-4 py-2.5 text-xs text-muted-foreground ${cols}`}><span>模型</span><span>提到你</span><span>提到你的那句</span><span>引用的网站</span><span /></div>
      {models.map((m) => {
        const st = runs[m]!;
        const name = <div className="font-medium">{MODEL[m]}{st !== "loading" && !("error" in st) && st.result ? <span className="block text-xs font-normal text-muted-foreground">{st.result.modelName}</span> : null}</div>;
        if (st === "loading") return <div key={m} data-model={m} className={`border-b border-border px-4 py-3 last:border-0 ${cols}`}>{name}<span className="text-sm text-muted-foreground lg:col-span-4">正在等它回答…</span></div>;
        const problem = "error" in st ? st.error : !st.result ? runProblem(st) : "";
        if (problem) return <div key={m} data-model={m} className={`border-b border-border px-4 py-3 last:border-0 ${cols}`}>{name}<p className="nr-error lg:col-span-4">{problem}</p></div>;
        const run = st as AnswerRun, r = run.result!, line = r.mentioned ? mentionLine(r.text, terms) : "", sites = citedSites(r.citations, domains);
        return (
          <div key={m} data-model={m} className={`flex flex-col gap-2 border-b border-border px-4 py-3 last:border-0 ${cols}`}>
            {name}
            <div>{r.mentioned ? <Tag tone="green">提到了</Tag> : <Tag tone="amber">没提到</Tag>}</div>
            <p className="line-clamp-3 text-sm text-muted-foreground">{line ? <>“<Highlight text={line} terms={terms} />”</> : r.mentioned ? "提到了，但不在正文句子里（可能在表格或标题中）。" : "回答里没有出现你的名称或网站。"}</p>
            <div className="flex flex-wrap gap-1.5 text-xs" aria-label="引用的网站">
              {sites.length ? <>{sites.slice(0, 5).map((x) => <a key={x.site} href={safeLink(x.url)} target="_blank" rel="noreferrer" className={`rounded-md px-1.5 py-0.5 ${x.own ? "bg-nr-tint-green font-medium text-foreground" : "bg-muted"}`}>{x.site}{x.count > 1 ? ` ×${x.count}` : ""}</a>)}{sites.length > 5 ? <span className="px-1 py-0.5 text-muted-foreground">等 {sites.length} 个</span> : null}</>
                : <span className="text-muted-foreground">{r.webSearch ? "没有给出引用" : "没有联网，没有引用"}</span>}
            </div>
            <div className="lg:text-right"><Button variant="outline" size="sm" onClick={() => setReading(run)}>看回答</Button></div>
          </div>
        );
      })}
      {reading?.result ? (
        <DocReader open onClose={() => setReading(undefined)} title={`${MODEL[reading.spec.model]} 的回答`} meta={`${reading.result.modelName} · ${reading.result.mentioned ? "提到了你" : "没提到你"}${reading.result.webSearch ? " · 联网回答" : ""}`} content={reading.result.text || "（没有回答内容）"}>
          {reading.result.citations.length ? (
            <div className="flex flex-wrap gap-1.5 text-xs" aria-label="全部引用">
              {citedSites(reading.result.citations, domains).map((x) => <a key={x.site} href={safeLink(x.url)} target="_blank" rel="noreferrer" className={`rounded-md px-1.5 py-0.5 ${x.own ? "bg-nr-tint-green font-medium" : "bg-muted"}`}>{x.site}{x.count > 1 ? ` ×${x.count}` : ""}</a>)}
            </div>
          ) : null}
        </DocReader>
      ) : null}
    </Card>
  );
}

function answerDraft(question: string, answers: AnswerRun[]): TaskDraft {
  const lines = answers.map((r) => { const a = r.result!; const cited = [...new Set(a.citations.filter((c) => !c.own).map((c) => c.domain))].slice(0, 6); return `- ${MODEL[a.model]}：${a.mentioned ? "提到了" : "没提到"}${a.ownCited ? `，引用本站 ${a.ownCited} 页` : ""}${cited.length ? `；引用了：${cited.join("、")}` : ""}\n  回答开头：${a.text.replace(/\s+/g, " ").slice(0, 300)}`; });
  const no = answers.filter((r) => !r.result!.mentioned).map((r) => MODEL[r.spec.model]);
  return {
    title: `让 AI 回答「${question}」时提到我们`.slice(0, 200),
    objective: `${no.join("、")} 回答「${question}」时提到我们并引用本站`.slice(0, 1000),
    brief: [`问题：${question}`, "", "各模型的回答：", ...lines, "", "依据：通过 DataForSEO 实际询问各模型（联网回答）。", "建议：先看它们引用的网页写了什么，再决定新写或改哪一页，让内容直接回答这个问题、方便被引用。"].join("\n").slice(0, 20000),
  };
}

function RecentList({ recent, empty, current = null, showing = false, onOpen }: { recent?: Recent[]; empty: string; current?: string | null; showing?: boolean; onOpen: (g: string) => void }) {
  if (!recent) return showing ? null : <ListSkeleton rows={4} />;
  if (!recent.length) return showing ? null : <EmptyState icon={<MessageSquareText />} title={empty} description="查过的结果可以直接打开，不再收费。" />;
  return (
    <Card className="gap-0 py-0">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{recent[0].kind === "brand" ? "查过的品牌" : "问过的问题"}</h2>
      {recent.map((r) => (
        <button key={r.group} type="button" aria-current={r.group === current || undefined} className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/50 aria-[current]:bg-muted" onClick={() => { if (r.group !== current) onOpen(r.group); }}>
          <span className="min-w-0"><span className="block truncate font-medium">{r.label}{r.group === current ? <span className="ml-2 text-xs font-normal text-muted-foreground">正在看</span> : null}</span>{r.competitors.length ? <span className="block text-xs text-muted-foreground">对比 {r.competitors.join("、")}</span> : null}</span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {Object.entries(r.runs).map(([k, v]) => <span key={k}>{(PLATFORM as Record<string, string>)[k] && r.kind === "brand" ? PLATFORM[k as Platform] : MODEL[k as Model]}{r.kind === "answer" && v.mentioned !== null ? (v.mentioned ? " 提到了" : " 没提到") : v.status === "completed" ? "" : " 没有结果"}</span>)}
            <span>{when(r.createdAt)}</span>
          </span>
        </button>
      ))}
    </Card>
  );
}
