import { type Message, renderMessage, useMessageState, $t, $tj, $legacyText } from "#i18n";
import { usePageTab } from '#hooks/use-page-tab';
// AI 搜索: after every-app/open-seo db8bde1 src/client/features/ai-search/ (BrandLookupPage, PromptExplorerPage and their
// components; MIT). Changes: the brand defaults to the project and our pages are marked from its domains; ChatGPT and
// Google AI 概览 are looked up together and shown side by side; 问 AI asks the chosen models at once and shows each
// answer as it arrives; questions and answers that leave us out can be handed to the Agent; no per-query cost (spending
// is in 数据接入); Chinese copy.
import { HandOffBar } from "./hand-off-bar";
import { AllCheck, RowCheck, useHandOffSource, useTickedList, type Selection } from "#components/reach/hand-off-slot";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { MessageSquareText, Sparkles, X } from "lucide-react";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton } from "#components/reach/states";
import { Tag } from "#components/reach/tag";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Checkbox } from "#components/ui/checkbox";
import { Input } from "#components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "#components/ui/tabs";
import { StatTile } from "#components/seo/stat-tile";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableToolbar } from "#components/seo/data-table-toolbar";
import { TablePagination } from "#components/seo/table-pagination";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { DraftHandOffDialog, type TaskDraft } from "./keyword-hand-off";
import { DocReader } from "./doc-view";
import { useProject } from "./reach-data";
import { currentProjectId } from "./current-project";
import { keywordRequest, getMarkets, marketLabel, metric, type KeywordConnectionState } from "./keyword-api";
import { safeLink } from "./analytics";
import "./data-views.css";
import {InfoTip,WithInfo} from "#components/reach/info-tip";
import { help } from "./glossary";
import { AiQuestions } from "./ai-questions";
import { formatDate, formatDateTime } from '#lib/format';

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
const getPlatform = (): Record<Platform, string> => ({ chat_gpt: "ChatGPT", google: $t('common.googleAiOverviews') });
const MODEL: Record<Model, string> = { chat_gpt: "ChatGPT", claude: "Claude", gemini: "Gemini", perplexity: "Perplexity" };
const ai = <T,>(action: string, body: object = {}) => api.action<T>("nrAiSearch", action, { method: "POST", body: { projectId: String(currentProjectId()), ...body }, unwrap: "data" });
const requestKey = () => crypto.randomUUID().replace(/-/g, "");
const message = (e: unknown) => (e instanceof Error ? $legacyText(e.message) : $t('aiSearch.notCompleteTryAgainLater'));
const when = (v?: string | null) => (v ? formatDateTime(v) : "");
// A run that did not complete: uncertain ones may be billed and are never asked again by themselves.
const runProblem = (r: { status: string; errorCode?: string | null }) => (r.status === "unknown" ? r.errorCode || $t('common.resultUncertainMayChargedRepeat') : r.status === "failed" ? $t('aiSearch.dataforseoReturnedNoResults',{0:r.errorCode || $t('errors.unknownReason')}) : r.status === "running" ? $t('aiSearch.stillChecking') : "");

export default function AiSearch() {
  const navigate = useNavigate();
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "ask" ? "ask" : params.get("tab") === "brand" ? "brand" : "questions";
  usePageTab($t(tab === 'ask' ? 'aiSearch.askAi' : tab === 'brand' ? 'aiSearch.brandMentions' : 'common.question'));
  const group = params.get("g");
  const [connection, setConnection] = useState<KeywordConnectionState>();
  const [recent, setRecent] = useState<Recent[]>();
  const [handOff, setHandOff] = useState<HandOffResult>();
  const loadRecent = () => ai<Recent[]>("list").then(setRecent).catch(() => setRecent([]));
  useEffect(() => {
    void keywordRequest<KeywordConnectionState>("status").then(setConnection).catch(() => setConnection({ configured: false, verifiedAt: null, monthlyBudgetUsd: 5 }));
    void loadRecent();
  }, []);
  const go = (next: { tab?: "questions" | "brand" | "ask"; g?: string | null }) => {
    const p = new URLSearchParams(), t = next.tab ?? tab;
    if (t !== "questions") p.set("tab", t);
    if (next.g) p.set("g", next.g);
    setParams(p, { replace: true });
  };
  const ran = (g: string) => { go({ g }); void loadRecent(); };
  const notConnected = connection && !connection.verifiedAt;
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<InfoTip label={$t('common.aboutData')} side="bottom"><p>{$t('aiSearch.questionsAiAnswerSamplesDataforseo')}</p><p>{$t('aiSearch.billingNote')}</p></InfoTip>} title={$t('common.aiSearch')} description={$t('aiSearch.whatPeopleAskChatgptGoogle')} />
      <HandOffNotice result={handOff} />
      <Tabs value={tab} onValueChange={(v) => go({ tab: v === "ask" ? "ask" : v === "brand" ? "brand" : "questions", g: null })}>
        <TabsList variant="line" className="h-auto! justify-start">
          <TabsTrigger value="questions">{$t('common.question')}</TabsTrigger>
          <TabsTrigger value="brand">{$t('aiSearch.brandMentions')}</TabsTrigger>
          <TabsTrigger value="ask">{$t('aiSearch.askAi')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {notConnected ? (
        <EmptyState icon={<Sparkles />} title={$t('common.connectDataforseoFirst')} description={$t('aiSearch.aiSearchUsesDataforseoData')} action={<Button onClick={() => navigate("/connections?source=keywords")}>{$t('common.goDataSources')}</Button>} />
      ) : !connection ? <ListSkeleton rows={3} /> : tab === "questions" ? (project ? <AiQuestions projectId={project.id} onHandOff={setHandOff} /> : null) : tab === "brand" ? (
        <BrandTab group={group} brand={project?.name ?? ""} projectId={project?.id} recent={recent?.filter((r) => r.kind === "brand")} onOpen={(g) => go({ g })} onRan={ran} onHandOff={setHandOff} />
      ) : (
        <AskTab group={group} projectId={project?.id} brand={project?.name ?? ""} domains={project?.domains ?? []} recent={recent?.filter((r) => r.kind === "answer")} onOpen={(g) => go({ g })} onRan={ran} onHandOff={setHandOff} />
      )}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

type TabProps = { group: string | null; projectId?: number; recent?: Recent[]; onOpen: (g: string) => void; onRan: (g: string) => void; onHandOff: (r: HandOffResult) => void };

function BrandTab({ group, brand, projectId, recent, onOpen, onRan, onHandOff }: TabProps & { brand: string }) {
  const [form, setForm] = useState(() => ({ target: brand, competitors: [] as string[], market: getMarkets()[0] }));
  const [competitor, setCompetitor] = useState("");
  const [runs, setRuns] = useState<Partial<Record<Platform, BrandRun>>>({});
  const [errors, setErrors] = useState<Partial<Record<Platform, Message>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState("");
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
      if (s) setForm((f) => ({ target: s.target, competitors: s.competitors, market: getMarkets().find((m) => m.locationCode === by.google?.spec.locationCode && m.language === by.google?.spec.language) ?? f.market }));
    }).catch((e) => setError(() => (message(e))));
  }, [group, setError]);
  const addCompetitor = () => {
    const v = competitor.trim();
    if (v.length < 2 || form.competitors.length >= 5 || [form.target, ...form.competitors].some((c) => c.toLowerCase() === v.toLowerCase())) return;
    setForm((f) => ({ ...f, competitors: [...f.competitors, v] })); setCompetitor("");
  };
  const search = async (forceRefresh = false, what: { target: string; competitors: string[] } = form) => {
    const target = what.target.trim();
    if (target.length < 2) { setError(() => ($t('aiSearch.enterBrandNameDomain'))); return; }
    setBusy(true); setError(""); setErrors({});
    const started = Date.now();
    const settled = await Promise.allSettled(PLATFORMS.map((platform) => ai<BrandRun>("brand", { target, competitors: what.competitors, platform, locationCode: form.market.locationCode, language: form.market.language, requestKey: requestKey(), ...(forceRefresh ? { forceRefresh: true } : {}) })));
    const next: Partial<Record<Platform, BrandRun>> = {}, errs: Partial<Record<Platform, Message>> = {};
    settled.forEach((r, i) => { if (r.status === "fulfilled") next[PLATFORMS[i]] = r.value; else errs[PLATFORMS[i]] = () => message(r.reason); });
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
            <Input className="lg:max-w-56" aria-label={$t('aiSearch.brandDomain')} placeholder={$t('aiSearch.brandNameDomainExampleNocobase')} maxLength={100} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {form.competitors.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">{c}<button type="button" aria-label={$t('common.removeValue',{0:c})} onClick={() => setForm((f) => ({ ...f, competitors: f.competitors.filter((x) => x !== c) }))}><X className="size-3" /></button></span>
              ))}
              {form.competitors.length < 5 ? <Input className="h-8 w-44" aria-label={$t('common.addCompetitor')} placeholder={$t('aiSearch.addCompetitorPressEnter')} maxLength={100} value={competitor} onChange={(e) => setCompetitor(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompetitor(); } }} onBlur={addCompetitor} /> : null}
            </div>
            <Select value={`${form.market.locationCode}:${form.market.language}`} onValueChange={(v) => { const m = getMarkets().find((x) => `${x.locationCode}:${x.language}` === v); if (m) setForm((f) => ({ ...f, market: m })); }}>
              <SelectTrigger className="w-full lg:w-44" aria-label={$t('aiSearch.googleAiOverviewsMarket')}><SelectValue>{(v: string) => $t(getMarkets().find((x) => `${x.locationCode}:${x.language}` === v)?.label ?? "")}</SelectValue></SelectTrigger>
              <SelectContent className="w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal">{getMarkets().map((m) => <SelectItem key={`${m.locationCode}:${m.language}`} value={`${m.locationCode}:${m.language}`}>{$t(m.label)}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="submit" disabled={busy} className="lg:px-6">{busy ? $t('common.querying') : $t('common.query')}</Button>
            <InfoTip label={$t('common.info')}>{$t('aiSearch.platformCoverageHelp')}</InfoTip>
          </div>
          {error ? <p role="alert" className="nr-error">{error}</p> : null}
        </form>
      </Card>
      {open ? (
        <>
          {shown ? (
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{$tj('aiSearch.brandMentionsValue',{0:shown.target})}{shown.competitors.length ? <span className="ml-2 font-normal text-muted-foreground">{$tj('aiSearch.compared',{0:shown.competitors.join("、")})}</span> : null}</h2>
              {reused ? <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{$t('aiSearch.existingResultNoNewCharge')}<InfoTip>{$t('aiSearch.sameBrandCompetitorsCheckedLast')}</InfoTip><Button variant="link" size="sm" className="h-auto p-0" disabled={busy} onClick={() => void search(true, shown)}>{$t('common.queryAgain')}</Button></p> : null}
            </div>
          ) : null}
          <BrandResults runs={runs} errors={errors} projectId={projectId} onHandOff={onHandOff} />
          {shown && shown.competitors.length ? <CompetitorGaps spec={shown} projectId={projectId} /> : null}
        </>
      ) : null}
      {/* Lookups made before stay listed under the results; one click shows them again, without a new charge. */}
      <RecentList recent={recent} empty={$t('aiSearch.noBrandMentionsCheckedYet')} current={open ? group : null} showing={open} onOpen={onOpen} />
    </>
  );
}

// 提到竞品、没提到你 (2026-10-09 user decision, ROADMAP ③): for each competitor of the lookup, a button asks DataForSEO
// for the AI answers that mention that competitor and not you, on both platforms (about $0.3; kept 30 days). The paid
// test that day showed several competitors in one request must all be mentioned, so each competitor is asked on its own;
// answers that still name you are left out on the server and counted. Ticked questions go to the Agent (竞品对比).
type GapQuestion = { question: string; volume: number | null; sources: { url: string; title: string; domain: string }[]; brands: string[]; excerpt: string; at: string | null };
type GapRun = Run<{ kind: "ai-competitor-gap"; platform: Platform; target: string; competitor: string }, { platform: Platform; competitor: string; totalCount: number | null; questions: GapQuestion[]; removed: number }>;
type GapRow = GapQuestion & { id: string; platform: Platform };
function CompetitorGaps({ spec, projectId }: { spec: BrandSpec; projectId?: number }) {
  const [runs, setRuns] = useState<Record<string, Partial<Record<Platform, GapRun>>>>({});
  useEffect(() => {
    let alive = true;
    void ai<{ runs: GapRun[] }>("gaps", { target: spec.target, competitors: spec.competitors }).then((r) => {
      if (!alive) return; const next: Record<string, Partial<Record<Platform, GapRun>>> = {};
      for (const run of r?.runs ?? []) { const k = run.spec.competitor.toLowerCase(); next[k] = { ...next[k], [run.spec.platform]: run }; }
      setRuns(next);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [spec.group]);
  return (
    <Card className="gap-3 px-4" data-gaps="">
      <div className="flex items-center gap-1.5"><h3 className="text-sm font-semibold">{$t('aiSearch.competitorsMentionedNot')}</h3><InfoTip>{$t('aiSearch.competitorGapDescription')}</InfoTip></div>
      {spec.competitors.map((c) => <GapBlock key={c} spec={spec} competitor={c} runs={runs[c.toLowerCase()] ?? {}} projectId={projectId} onRuns={(r) => setRuns((all) => ({ ...all, [c.toLowerCase()]: r }))} />)}
    </Card>
  );
}
function GapBlock({ spec, competitor, runs, projectId, onRuns }: { spec: BrandSpec; competitor: string; runs: Partial<Record<Platform, GapRun>>; projectId?: number; onRuns: (r: Partial<Record<Platform, GapRun>>) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useMessageState("");
  const done = PLATFORMS.flatMap((p) => { const r = runs[p]; return r?.status === "completed" && r.result ? [r] : []; });
  const rows: GapRow[] = done.flatMap((r) => r.result!.questions.map((q, i) => ({ ...q, id: `${r.spec.platform}:${i}`, platform: r.spec.platform }))).sort((a, b) => (b.volume || 0) - (a.volume || 0));
  const removed = done.reduce((n, r) => n + (r.result!.removed || 0), 0);
  const picked = useTickedList(`ai-gap-${competitor}`, projectId && rows.length ? rows : undefined, (r) => r.id, (ticked) => ({ playbookId: "competitor-compare", noun: $t('common.questionsSelected'), description: $t('aiSearch.questionsBecomeOneTaskAgent'), draft: () => gapDraft(spec.target, competitor, ticked) }));
  const ask = async () => {
    setBusy(true); setError("");
    const settled = await Promise.allSettled(PLATFORMS.map((platform) => ai<GapRun>("gap", { target: spec.target, competitors: [competitor], competitor, platform, locationCode: spec.locationCode, language: spec.language, requestKey: requestKey() })));
    const next: Partial<Record<Platform, GapRun>> = { ...runs }; const errs: Message[] = [];
    settled.forEach((r, i) => { if (r.status === "fulfilled") next[PLATFORMS[i]] = r.value; else errs.push(() => `${getPlatform()[PLATFORMS[i]]}：${message(r.reason)}`); });
    onRuns(next); setError(() => (errs.map(renderMessage).join("; "))); setBusy(false);
  };
  const failed = PLATFORMS.flatMap((p) => { const r = runs[p]; return r && r.status !== "completed" ? [`${getPlatform()[p]}：${runProblem(r)}`] : []; });
  return (
    <section className="flex flex-col gap-2 border-t pt-3 first-of-type:border-0 first-of-type:pt-0" data-gap={competitor}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{$t('aiSearch.mentionedNot', { 0: competitor })}</span>
        {done.length ? <span className="text-xs text-muted-foreground">{$t('aiSearch.questionsChecked', { 0: rows.length, 1: formatDate(done[0].createdAt) })}</span> : null}
        <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => void ask()}>{busy ? $t('common.lookingUp') : done.length ? $t('aiSearch.checkAgainAbout03') : $t('aiSearch.checkAbout03')}</Button>
      </div>
      {error || failed.length ? <p role="alert" className="nr-error">{error || failed.join("；")}</p> : null}
      {rows.length ? (
        <div className="rounded-md border">
          <div className="hidden border-b px-3 py-2 text-xs text-muted-foreground lg:grid lg:grid-cols-[16px_minmax(0,1fr)_110px_80px] lg:gap-3"><span><AllCheck selection={picked} count={rows.length} /></span><span>{$t('common.question')}</span><span>{$t('common.platform')}</span><span className="text-right">{$t('common.aiSearchVolume')}</span></div>
          <ul className="max-h-[28rem] divide-y overflow-y-auto">
            {rows.map((q) => (
              <li key={q.id} className="flex flex-col gap-1 px-3 py-2 text-sm lg:grid lg:grid-cols-[16px_minmax(0,1fr)_110px_80px] lg:gap-3" data-gap-question={q.id}>
                <span className="pt-0.5"><RowCheck selection={picked} k={q.id} label={$t('common.selectValue', { 0: q.question })} /></span>
                <span className="min-w-0"><span className="block">{q.question}</span>{q.excerpt ? <span className="block truncate text-xs text-muted-foreground">“{q.excerpt}”</span> : null}
                  {q.sources.length ? <span className="block truncate text-xs text-muted-foreground">{$t('common.references', { 0: [...new Set(q.sources.map((x) => x.domain))].slice(0, 4).join("、") })}</span> : null}</span>
                <span className="text-xs text-muted-foreground">{getPlatform()[q.platform]}</span>
                <span className="text-right tabular-nums">{metric(q.volume)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : done.length ? <p className="text-sm text-muted-foreground">{$t('aiSearch.noAnswersMentionWithout', { 0: competitor })}</p> : null}
      {removed ? <p className="text-xs text-muted-foreground">{$t('aiSearch.leftOutAnswersActuallyMention', { 0: removed })}</p> : null}
    </section>
  );
}
function gapDraft(brand: string, competitor: string, rows: GapRow[]): TaskDraft {
  const head = rows[0].question;
  const lines = rows.slice(0, 30).map((q) => $t('aiSearch.questionEvidence', { 0: q.question, 1: getPlatform()[q.platform], 2: metric(q.volume), 3: q.sources.length ? $t('aiSearch.citedValueSuffix', { 0: [...new Set(q.sources.map((s) => s.domain))].slice(0, 5).join("、") }) : "", 4: q.excerpt ? $t('aiSearch.answerExcerpt', { 0: q.excerpt }) : "" }));
  return {
    title: (rows.length === 1 ? $t('aiSearch.aiRecommendsNot', { 0: head, 1: competitor, 2: brand }) : $t('aiSearch.aiRecommendsNotQuestions', { 0: head, 1: rows.length, 2: competitor, 3: brand })).slice(0, 200),
    objective: $t('aiSearch.getAiMentionWhenAnswering', { 0: brand }).slice(0, 1000),
    brief: [$t('aiSearch.aiAnswersMentionNot', { 0: competitor, 1: brand }), ...lines, "", $t('aiSearch.evidenceAiAnswerSamplesCollected'), $t('aiSearch.suggestionComparePagesCitedContent', { 0: competitor })].join("\n").slice(0, 20000),
  };
}

type QuestionRow = Question & { id: string; platform: Platform };
const helper = createColumnHelper<QuestionRow>();
function BrandResults({ runs, errors, projectId, onHandOff }: { runs: Partial<Record<Platform, BrandRun>>; errors: Partial<Record<Platform, Message>>; projectId?: number; onHandOff: (r: HandOffResult) => void }) {
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
    helper.accessor("question", { header: () => $t('common.question'), cell: ({ row }) => <div className="min-w-0 max-w-xl"><p className="truncate font-medium" title={row.original.question}>{row.original.question}</p>{row.original.excerpt ? <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.excerpt}</p> : null}</div> }) as ColumnDef<QuestionRow>,
    helper.accessor("platform", { header: () => $t('common.platform'), cell: ({ getValue }) => <span className="whitespace-nowrap text-sm">{getPlatform()[getValue()]}</span> }) as ColumnDef<QuestionRow>,
    helper.accessor("volume", { header: () => <WithInfo help={help($t('common.aiSearchVolume'))}>{$t('common.aiSearchVolume')}</WithInfo>, cell: ({ getValue }) => metric(getValue()), meta: { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } }) as ColumnDef<QuestionRow>,
    helper.accessor("ownCited", { header: () => $t('aiSearch.citesSite'), cell: ({ getValue }) => (getValue() ? <Tag tone="green">{$t('aiSearch.cited')}</Tag> : <Tag tone="amber">{$t('aiSearch.notCited')}</Tag>) }) as ColumnDef<QuestionRow>,
  ], [anchorRef]);
  const table = useDataTable({ data: rows, columns, withPagination: true, enableRowSelection: true, state: { rowSelection, pagination }, onRowSelectionChange: setRowSelection, onPaginationChange: setPagination, getRowId: (r) => r.id });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  useHandOffSource("ai-brand-questions", projectId && rows.length ? { count: selected.length, open: () => setHanding(selected), noun: $t('common.questionsSelected'), clear: () => setRowSelection({}) } : null);
  const pages = useMemo(() => {
    const by = new Map<string, Source & { count: number }>();
    for (const r of done) for (const p of r.result!.pages) { const k = p.url || p.domain, o = by.get(k); by.set(k, o ? { ...o, count: o.count + p.count } : { ...p }); }
    return [...by.values()].sort((a, b) => b.count - a.count || Number(b.own) - Number(a.own)).slice(0, 15);
  }, [runs]);
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {PLATFORMS.map((p) => <PlatformCard key={p} platform={p} run={runs[p]} error={errors[p] ? renderMessage(errors[p]) : undefined} />)}
      </div>
      {done.length ? (
        <>
          <Card className="gap-0 py-0">
            <DataTable
              table={table}
              empty={{ title: uncitedOnly ? $t('aiSearch.everyAnswerMentionsCitesSite') : $t('aiSearch.noAnswersMention'), description: uncitedOnly ? $t('aiSearch.turnOffAnswersNotCiting') : $t('aiSearch.tryAnotherSpellingBrandName') }}
              toolbar={
                <DataTableToolbar actions={<Button variant={uncitedOnly ? "secondary" : "outline"} size="sm" aria-pressed={uncitedOnly} onClick={() => setUncitedOnly((v) => !v)}>{$t('aiSearch.answersNotCitingSite')}</Button>}>
                  <span className="text-sm font-medium">{$t('aiSearch.questionsMention')}</span>
                  <span className="text-xs text-muted-foreground">{$tj('aiSearch.sortedAiSearchVolume',{0:uncitedOnly ? $t('aiSearch.notCiteSiteValue',{0:rows.length,1:all.length}) : $t('common.total',{0:all.length})})}</span>
                </DataTableToolbar>
              }
              footer={rows.length > pagination.pageSize ? <TablePagination page={pagination.pageIndex + 1} pageSize={pagination.pageSize} pageSizes={[25, 50, 100]} totalCount={rows.length} onPageChange={(n) => setPagination((s) => ({ ...s, pageIndex: n - 1 }))} onPageSizeChange={(size) => setPagination({ pageIndex: 0, pageSize: size })} /> : null}
            />
          </Card>
          <Card className="gap-2 px-4">
            <h2 className="text-sm font-semibold">{$t('aiSearch.pagesAnswersCiteMost')}</h2>
            {pages.length ? (
              <ul className="divide-y divide-border text-sm">
                {pages.map((p) => (
                  <li key={p.url || p.domain} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{p.url ? <a className="nr-link" href={safeLink(p.url)} target="_blank" rel="noreferrer" title={p.url}>{p.title || p.url}</a> : p.domain}<span className="ml-2 text-xs text-muted-foreground">{p.domain}</span></span>
                    <span className="flex shrink-0 items-center gap-2">{p.own ? <Tag tone="green">{$t('common.site')}</Tag> : null}<span className="tabular-nums text-muted-foreground">{$tj('aiSearch.times',{0:p.count})}</span></span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">{$t('aiSearch.answersGiveNoCitations')}</p>}
          </Card>
        </>
      ) : null}
      {handing && projectId ? <DraftHandOffDialog projectId={projectId} draft={brandDraft(handing, done)} playbookId="content-outline" description={$t('aiSearch.questionsBecomeOneTaskStart',{0:handing.length})} onClose={() => setHanding(undefined)} onDone={(r) => { setHanding(undefined); setRowSelection({}); onHandOff(r); }} /> : null}
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
      <div className="flex items-baseline justify-between gap-2"><h2 className="font-heading text-base font-medium">{getPlatform()[platform]}</h2><span className="text-xs text-muted-foreground">{run ? `${platform === "google" ? marketLabel(run.spec) : $t('common.unitedStatesEnglish')} · ${when(run.completedAt || run.createdAt)}` : ""}</span></div>
      {problem ? <p className="nr-error">{problem}</p> : !r ? <p className="text-sm text-muted-foreground">{$t('common.noResults')}</p> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label={$t('aiSearch.mentionedAiAnswers')} value={metric(r.mentions)} />
            <StatTile label={$t('common.aiSearchVolume')} help={help($t('common.aiSearchVolume'))} value={metric(r.aiSearchVolume)} />
            <StatTile label={$t('aiSearch.answersCitingSite')} value={r.questions.length ? `${r.questions.filter((q) => q.ownCited).length} / ${r.questions.length}` : "—"} />
          </div>
          {share.length > 1 && total > 0 ? (
            <div className="space-y-1.5" aria-label={$t('aiSearch.shareVoice')}>
              <p className="text-xs font-medium text-muted-foreground"><WithInfo help={help($t('aiSearch.shareVoice'))}>{$t('aiSearch.shareVoice')}</WithInfo></p>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">{share.map((s, i) => <div key={s.key} style={{ width: `${(100 * (s.mentions || 0)) / total}%`, background: s.own ? "var(--chart-3)" : `color-mix(in oklch, var(--muted-foreground) ${55 - i * 12}%, transparent)` }} />)}</div>
              <p className="text-xs text-muted-foreground">{share.map((s) => `${s.own ? $t('common.you') : s.key} ${Math.round((100 * (s.mentions || 0)) / total)}%`).join(" · ")}</p>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function brandDraft(rows: QuestionRow[], runs: BrandRun[]): TaskDraft {
  const head = rows[0].question, brand = runs[0]?.spec.target ?? "";
  const lines = rows.slice(0, 30).map((q) => $t('aiSearch.questionEvidenceWithBrand',{0:q.question,1:getPlatform()[q.platform],2:metric(q.volume),3:q.ownCited ? $t('common.citesSite') : $t('aiSearch.notCiteSite'),4:q.sources.length ? $t('aiSearch.citedValueSuffix',{0:[...new Set(q.sources.map((s) => s.domain))].slice(0, 5).join("、")}) : "",5:q.excerpt ? $t('aiSearch.answerExcerpt',{0:q.excerpt}) : ""}));
  return {
    title: (rows.length === 1 ? $t('aiSearch.singleQuestionGoal',{0:head}) : $t('aiSearch.multipleQuestionsGoal',{0:head,1:rows.length})).slice(0, 200),
    objective: $t('aiSearch.aiMentionsCitesPagesWhen',{0:brand}).slice(0, 1000),
    brief: [$t('aiSearch.answersAiSearchMention',{0:brand}), ...lines, "", $t('aiSearch.evidenceAiAnswerSamplesCollected'), $t('aiSearch.multipleQuestionsAdvice')].join("\n").slice(0, 20000),
  };
}

function AskTab({ group, projectId, brand, domains, recent, onOpen, onRan }: TabProps & { brand: string; domains: string[] }) {
  const [question, setQuestion] = useState("");
  // The question the answers below belong to (the box may already hold the next one).
  const [asked, setAsked] = useState("");
  const [models, setModels] = useState<Model[]>([...MODELS]);
  const [runs, setRuns] = useState<Partial<Record<Model, AnswerRun | { error: string } | "loading">>>({});
  const [error, setError] = useMessageState("");
  const [reused, setReused] = useState(false);
  const shownGroup = useRef<string | null>(null);
  useEffect(() => {
    if (!group) { setRuns({}); shownGroup.current = null; return; }
    if (shownGroup.current === group) return;
    shownGroup.current = group;
    void ai<{ runs: AnswerRun[] }>("open", { kind: "answer", group }).then(({ runs: list }) => {
      setRuns(Object.fromEntries(list.map((r) => [r.spec.model, r]))); setReused(false);
      if (list[0]) { setQuestion(list[0].spec.question); setAsked(list[0].spec.question); setModels(MODELS.filter((m) => list.some((r) => r.spec.model === m))); }
    }).catch((e) => setError(() => (message(e))));
  }, [group, setError]);
  const busy = Object.values(runs).some((r) => r === "loading");
  const ask = async (forceRefresh = false, text = question) => {
    const q = text.trim();
    if (q.length < 5) { setError(() => ($t('aiSearch.enterQuestion'))); return; }
    if (!models.length) { setError(() => ($t('aiSearch.pickLeastOneModel'))); return; }
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
  // Answers can be ticked like any list; the ticked ones go to the Agent with the question.
  const picked = useTickedList("ai-answers", projectId && answers.length ? answers : undefined, (r) => r.spec.model, (ticked) => ({ playbookId: "content-outline", noun: $t('aiSearch.answersSelected'), description: $t('aiSearch.questionBecomesOneTaskStarts'), draft: () => answerDraft(asked, ticked) }));
  return (
    <>
      <Card className="px-4">
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Input className="flex-1" aria-label={$t('common.question')} placeholder={$t('aiSearch.enterQuestionPeopleAskAi')} maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} />
            <Button type="submit" disabled={busy} className="lg:px-6">{busy ? $t('aiSearch.asking') : $t('aiSearch.question')}</Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm" role="group" aria-label={$t('aiSearch.model')}>
            {MODELS.map((m) => <label key={m} className="flex items-center gap-1.5"><Checkbox checked={models.includes(m)} onCheckedChange={(on) => setModels((list) => (on ? MODELS.filter((x) => x === m || list.includes(x)) : list.filter((x) => x !== m)))} aria-label={MODEL[m]} />{MODEL[m]}</label>)}
          </div>
          <p className="text-xs text-muted-foreground">{$t('aiSearch.modelAskedSeparatelyWebAccess')}</p>
          {error ? <p role="alert" className="nr-error">{error}</p> : null}
        </form>
      </Card>
      {shown.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold" title={asked}>{$tj('aiSearch.answers',{0:asked})}{answers.length ? <span className="ml-2 font-normal text-muted-foreground">{when(answers.map((r) => r.createdAt).sort().at(-1))}</span> : null}</h2>
              {reused ? <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{$t('aiSearch.existingAnswerNoNewCharge')}<InfoTip>{$t('aiSearch.sameQuestionAskedLast30')}</InfoTip><Button variant="link" size="sm" className="h-auto p-0" disabled={busy} onClick={() => void ask(true, asked)}>{$t('aiSearch.askAgain')}</Button></p> : null}
            </div>
          </div>
          <AnswerTable models={shown} runs={runs} terms={brandTerms(brand, domains)} domains={domains} selection={picked} />
        </>
      ) : null}
      {/* Questions asked before stay listed under the answers; one click shows their answers again, without a new charge. */}
      <RecentList recent={recent} empty={$t('aiSearch.notAskedAiYet')} current={shown.length ? group : null} showing={shown.length > 0} onOpen={onOpen} />
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
function AnswerTable({ models, runs, terms, domains, selection }: { models: Model[]; runs: Partial<Record<Model, AnswerRun | { error: string } | "loading">>; terms: string[]; domains: string[]; selection: Selection }) {
  const [reading, setReading] = useState<AnswerRun>();
  const cols = "lg:grid lg:grid-cols-[16px_150px_96px_minmax(0,1.3fr)_minmax(0,1fr)_88px] lg:items-start lg:gap-4";
  const done = models.filter((m) => { const st = runs[m]; return st && st !== "loading" && !("error" in st) && st.result; });
  return (
    <Card className="gap-0 py-0">
      <div className={`hidden border-b border-border px-4 py-2.5 text-xs text-muted-foreground ${cols}`}><span className="pt-0.5"><AllCheck selection={selection} count={done.length} /></span><span>{$t('aiSearch.model')}</span><span>{$t('aiSearch.mentions')}</span><span>{$t('aiSearch.whereMentions')}</span><span>{$t('aiSearch.citedSites')}</span><span /></div>
      {models.map((m) => {
        const st = runs[m]!;
        const name = <div className="font-medium">{MODEL[m]}{st !== "loading" && !("error" in st) && st.result ? <span className="block text-xs font-normal text-muted-foreground">{st.result.modelName}</span> : null}</div>;
        if (st === "loading") return <div key={m} data-model={m} className={`border-b border-border px-4 py-3 last:border-0 ${cols}`}><span />{name}<span className="text-sm text-muted-foreground lg:col-span-4">{$t('aiSearch.waitingAnswer')}</span></div>;
        const problem = "error" in st ? st.error : !st.result ? runProblem(st) : "";
        if (problem) return <div key={m} data-model={m} className={`border-b border-border px-4 py-3 last:border-0 ${cols}`}><span />{name}<p className="nr-error lg:col-span-4">{problem}</p></div>;
        const run = st as AnswerRun, r = run.result!, line = r.mentioned ? mentionLine(r.text, terms) : "", sites = citedSites(r.citations, domains);
        return (
          <div key={m} data-model={m} className={`flex flex-col gap-2 border-b border-border px-4 py-3 last:border-0 ${cols}`}>
            <span className="pt-0.5"><RowCheck selection={selection} k={m} label={$t('common.selectValue',{0:MODEL[m]})} /></span>
            {name}
            <div>{r.mentioned ? <Tag tone="green">{$t('aiSearch.mentioned')}</Tag> : <Tag tone="amber">{$t('aiSearch.notMentioned')}</Tag>}</div>
            <p className="line-clamp-3 text-sm text-muted-foreground">{line ? <>“<Highlight text={line} terms={terms} />”</> : r.mentioned ? $t('aiSearch.mentionedNotSentenceAnswerMaybe') : $t('aiSearch.nameWebsiteNotAppearAnswer')}</p>
            <div className="flex flex-wrap gap-1.5 text-xs" aria-label={$t('aiSearch.citedSites')}>
              {sites.length ? <>{sites.slice(0, 5).map((x) => <a key={x.site} href={safeLink(x.url)} target="_blank" rel="noreferrer" className={`rounded-md px-1.5 py-0.5 ${x.own ? "bg-nr-tint-green font-medium text-foreground" : "bg-muted"}`}>{x.site}{x.count > 1 ? ` ×${x.count}` : ""}</a>)}{sites.length > 5 ? <span className="px-1 py-0.5 text-muted-foreground">{$tj('common.moreValue',{0:sites.length})}</span> : null}</>
                : <span className="text-muted-foreground">{r.webSearch ? $t('aiSearch.noCitationsGiven') : $t('aiSearch.noWebAccessNoCitations')}</span>}
            </div>
            <div className="lg:text-right"><Button variant="outline" size="sm" onClick={() => setReading(run)}>{$t('aiSearch.viewAnswer')}</Button></div>
          </div>
        );
      })}
      {reading?.result ? (
        <DocReader open onClose={() => setReading(undefined)} title={$t('aiSearch.answer',{0:MODEL[reading.spec.model]})} meta={`${reading.result.modelName} · ${reading.result.mentioned ? $t('aiSearch.siteMentioned') : $t('aiSearch.notMention')}${reading.result.webSearch ? $t('aiSearch.webAnswer') : ""}`} content={reading.result.text || $t('aiSearch.noAnswer')}>
          {reading.result.citations.length ? (
            <div className="flex flex-wrap gap-1.5 text-xs" aria-label={$t('aiSearch.citations')}>
              {citedSites(reading.result.citations, domains).map((x) => <a key={x.site} href={safeLink(x.url)} target="_blank" rel="noreferrer" className={`rounded-md px-1.5 py-0.5 ${x.own ? "bg-nr-tint-green font-medium" : "bg-muted"}`}>{x.site}{x.count > 1 ? ` ×${x.count}` : ""}</a>)}
            </div>
          ) : null}
        </DocReader>
      ) : null}
    </Card>
  );
}

function answerDraft(question: string, answers: AnswerRun[]): TaskDraft {
  const lines = answers.map((r) => { const a = r.result!; const cited = [...new Set(a.citations.filter((c) => !c.own).map((c) => c.domain))].slice(0, 6); return $t('aiSearch.answerBegins',{0:MODEL[a.model],1:a.mentioned ? $t('aiSearch.mentioned') : $t('aiSearch.notMentioned'),2:a.ownCited ? $t('aiSearch.pagesSiteCited',{0:a.ownCited}) : "",3:cited.length ? $t('aiSearch.citedValueSuffix',{0:cited.join("、")}) : "",4:a.text.replace(/\s+/g, " ").slice(0, 300)}); });
  const no = answers.filter((r) => !r.result!.mentioned).map((r) => MODEL[r.spec.model]);
  return {
    title: $t('common.getAiMentionUsWhen',{0:question}).slice(0, 200),
    objective: $t('aiSearch.mentionsUsCitesSiteWhen',{0:no.join("、"),1:question}).slice(0, 1000),
    brief: [$t('aiSearch.questionValue',{0:question}), "", $t('aiSearch.answersModel'), ...lines, "", $t('aiSearch.evidenceModelActuallyAskedThrough'), $t('aiSearch.singleQuestionAdvice')].join("\n").slice(0, 20000),
  };
}

function RecentList({ recent, empty, current = null, showing = false, onOpen }: { recent?: Recent[]; empty: string; current?: string | null; showing?: boolean; onOpen: (g: string) => void }) {
  if (!recent) return showing ? null : <ListSkeleton rows={4} />;
  if (!recent.length) return showing ? null : <EmptyState icon={<MessageSquareText />} title={empty} description={$t('aiSearch.earlierResultsOpenDirectlyNo')} />;
  return (
    <Card className="gap-0 py-0">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{recent[0].kind === "brand" ? $t('aiSearch.brandsChecked') : $t('aiSearch.questionsAsked')}</h2>
      {recent.map((r) => (
        <button key={r.group} type="button" aria-current={r.group === current || undefined} className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/50 aria-[current]:bg-muted" onClick={() => { if (r.group !== current) onOpen(r.group); }}>
          <span className="min-w-0"><span className="block truncate font-medium">{r.label}{r.group === current ? <span className="ml-2 text-xs font-normal text-muted-foreground">{$t('aiSearch.viewing')}</span> : null}</span>{r.competitors.length ? <span className="block text-xs text-muted-foreground">{$tj('aiSearch.compared',{0:r.competitors.join("、")})}</span> : null}</span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {Object.entries(r.runs).map(([k, v]) => <span key={k}>{(getPlatform() as Record<string, string>)[k] && r.kind === "brand" ? getPlatform()[k as Platform] : MODEL[k as Model]}{r.kind === "answer" && v.mentioned !== null ? (v.mentioned ? $t('aiSearch.mentionedSuffix') : $t('aiSearch.notMentionedSuffix')) : v.status === "completed" ? "" : $t('aiSearch.noResults')}</span>)}
            <span>{when(r.createdAt)}</span>
          </span>
        </button>
      ))}
    </Card>
  );
}
