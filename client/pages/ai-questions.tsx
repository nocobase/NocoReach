import { questionBrandEvidence } from './ai-question-evidence.js';
import { StatTile } from "#components/seo/stat-tile";
import { useMessageState, $t, $tj, $legacyText } from "#i18n";
// AI 搜索 › 问题 (2026-10-05): what people ask ChatGPT and Google AI Overviews about our topics, which answers name or cite
// us, which name competitors or other brands instead (the chances), and which name nobody. The topics are the project's
// followed topics in Project knowledge › Memory (2026-11-10), looked up when added, then monthly. A question opens with
// the AI's answer, the brands and the sources; ticked questions go to the Agent as one task. Below, the sites cited
// where we are missing (where to be).
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { useEffect, useMemo, useState } from "react";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Bot, LoaderCircle, MessagesSquare } from "lucide-react";
import { useNavigate } from "react-router";
import { EmptyState, InlineError, ListSkeleton, LoadError } from "#components/reach/states";
import { InfoTip, NotesTip } from "#components/reach/info-tip";
import { Tag } from "#components/reach/tag";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { TabsTrigger } from "#components/ui/tabs";
import { DataTable, makeSelectionColumn, useDataTable, useSelectionAnchor } from "#components/seo/data-table";
import { DataTableTabs } from "#components/seo/data-table-toolbar";
import { SortableHeader } from "#components/seo/sortable-header";
import { DetailDrawer } from "./detail-drawer";
import { DraftHandOffDialog, type TaskDraft } from "./keyword-hand-off";
import { subjectOf } from './task-subject';
import type { HandOffResult } from "./strategy/hand-off";
import { safeLink } from "./analytics";
import { formatCount, formatDate, joinList, labelValue } from '#lib/format';
import { EditTopicsLink } from './followed-topics';
import { TOPICS_EDIT_PATH, topicScopeText } from './followed-topics-scope';

type Source = { url: string; title: string; domain: string; own: boolean; rival: string | null };
type Question = { key: string; question: string; platform: "chat_gpt" | "google"; topics: string[]; volume: number | null; status: "ours" | "gap" | "open"; weNamed: boolean; weCited: boolean; rivals: string[]; brands: string[]; sources: Source[]; answer: string; at: string | null };
type Topic = { id: string; keyword: string; platforms: Record<string, { at: string; count: number; error: string | null } | null> };
type View = { dataforseo: boolean; refreshing: boolean; topics: Topic[]; maxTopics: number; counts: { all: number; ours: number; gap: number; open: number }; questions: Question[]; citedDomains: { domain: string; count: number; own: boolean; rival: string | null }[]; notes: string[] };
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrAiQuestions", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const getPlatform = () => ({ chat_gpt: "ChatGPT", google: $t('common.googleAiOverviews') } as const);
const getStatus = () => ({ ours: { tone: "green", label: $t('aiQuestions.appears') }, gap: { tone: "amber", label: $t('aiQuestions.notAppearing') }, open: { tone: "grey", label: $t('aiQuestions.noBrands') } } as const);
const n = (v: number | null) => formatCount(v);
const COST = 0.2;
const helper = createColumnHelper<Question>();

export function AiQuestions({ projectId, onHandOff }: { projectId: number; onHandOff: (r: HandOffResult) => void }) {
  const [view, setView] = useState<View>();
  const [error, setError] = useMessageState("");
  const [filter, setFilter] = useState<"gap" | "ours" | "open" | "all">("gap");
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [openKey, setOpenKey] = useState<string>();
  const [handing, setHanding] = useState<Question[]>();
  const anchorRef = useSelectionAnchor();
  const load = () => call<View>(projectId, "view").then((v) => { setView(v); setError(""); }).catch((e) => setError(() => (e instanceof Error ? $legacyText(e.message) : $t('aiQuestions.notLoadAiQuestions'))));
  useEffect(() => { setView(undefined); void load(); }, [projectId]);
  useEffect(() => { if (!view?.refreshing) return; const t = setTimeout(() => void load(), 5000); return () => clearTimeout(t); }, [view]);
  const rows = useMemo(() => (view?.questions ?? []).filter((q) => filter === "all" || q.status === filter), [view, filter]);
  const columns = useMemo<ColumnDef<Question>[]>(() => [
    makeSelectionColumn<Question>(anchorRef),
    helper.accessor("question", { header: ({ column }) => <SortableHeader column={column} label={$t('common.question')} />, cell: ({ row }) => { const q = row.original; return <div className="min-w-0 max-w-xl"><span className="block truncate font-medium" title={q.question}>{q.question}</span><span className="block truncate text-xs text-muted-foreground">{getPlatform()[q.platform]} · {joinList(q.topics)}</span></div>; } }) as ColumnDef<Question>,
    helper.accessor((q) => q.volume ?? undefined, { id: "volume", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label={$t('common.aiSearchVolume')} align="right" />, cell: ({ row }) => n(row.original.volume), meta: { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } }) as ColumnDef<Question>,
    helper.display({ id: "us", header: () => $t('common.us'), cell: ({ row }) => { const q = row.original; return q.status === "ours" ? <Tag tone="green">{[q.weNamed ? $t('aiQuestions.mentioned') : "", q.weCited ? $t('aiQuestions.cited') : ""].filter(Boolean).join(" · ")}</Tag> : <Tag tone={getStatus()[q.status].tone}>{getStatus()[q.status].label}</Tag>; } }) as ColumnDef<Question>,
    helper.display({ id: "brands", header: () => $t('aiQuestions.brandsMentioned'), cell: ({ row }) => { const q = row.original; return q.rivals.length || q.brands.length ? <span className="block max-w-56 truncate text-xs" title={joinList([...q.rivals, ...q.brands])}>{q.rivals.length ? <b className="font-medium">{q.rivals.join(" · ")}</b> : null}{q.rivals.length && q.brands.length ? " · " : ""}<span className="text-muted-foreground">{q.brands.join(" · ")}</span></span> : <span className="text-muted-foreground">—</span>; } }) as ColumnDef<Question>,
    helper.display({ id: "sources", header: () => $t('aiQuestions.sitesAiCites'), cell: ({ row }) => { const d = [...new Set(row.original.sources.map((s) => s.domain))]; return d.length ? <span className="block max-w-56 truncate text-xs text-muted-foreground" title={joinList(d)}>{d.slice(0, 3).join(" · ")}{d.length > 3 ? $t('common.moreSuffixValue',{0:d.length}) : ""}</span> : <span className="text-muted-foreground">—</span>; } }) as ColumnDef<Question>,
  ], [anchorRef]);
  const table = useDataTable({ data: rows, columns, withSorting: true, enableRowSelection: true, state: { rowSelection }, onRowSelectionChange: setRowSelection, getRowId: (q) => q.key });
  const selected = (view?.questions ?? []).filter((q) => rowSelection[q.key]);
  useHandOffSource("ai-questions", view?.topics.length ? { count: selected.length, open: () => setHanding(selected), noun: $t('common.questionsSelected'), clear: () => setRowSelection({}) } : null);
  if (error) return <LoadError title={$t('aiQuestions.notLoadAiQuestions')} message={error} onRetry={() => void load()} />;
  if (!view) return <ListSkeleton rows={5} />;
  if (!view.topics.length) return <NoTopics view={view} />;
  const open = view.questions.find((q) => q.key === openKey);
  const pct = view.counts.all ? Math.round((view.counts.ours / view.counts.all) * 100) : 0;
  return (
    <>
      <Topics view={view} />
      {view.refreshing ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{$t('aiQuestions.checkingQuestionsAiUsuallyMinute')}</p> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-question-counts>
        {/* The data pages' tile (UI review 2026-10-22): a share is the line under the number, not brackets beside it. */}
        {([[$t('aiQuestions.questionsAi'), n(view.counts.all), $t('aiQuestions.questionsDataforseoCollectedChatgptGoogle'), undefined], [$t('aiQuestions.appear'), n(view.counts.ours), $t('aiQuestions.questionsWhoseAnswerMentionsProject'), $t('aiQuestions.shareOfAll', { 0: `${pct}%` })], [$t('aiQuestions.opportunityOthersAppearNot'), n(view.counts.gap), $t('aiQuestions.questionsWhoseAnswerMentionsCompetitors'), undefined], [$t('aiQuestions.noBrandMentioned'), n(view.counts.open), $t('aiQuestions.answerMentionsNoBrandsGood'), undefined]] as const).map(([label, value, tip, hint]) => (
          <Card key={label} className="gap-0 p-4"><StatTile label={label} value={value} help={tip} hint={hint} /></Card>
        ))}
      </div>
      <Card className="gap-0 py-0">
        <DataTableTabs value={filter} onValueChange={(v) => { setFilter(v as typeof filter); setRowSelection({}); }} actions={<NotesTip notes={view.notes} label={$t('aiQuestions.whereQuestionsCome')} />}>
          <TabsTrigger value="gap">{$tj('aiQuestions.opportunities',{0:view.counts.gap})}</TabsTrigger>
          <TabsTrigger value="ours">{$tj('aiQuestions.appearsValue',{0:view.counts.ours})}</TabsTrigger>
          <TabsTrigger value="open">{$tj('aiQuestions.noBrandsValue',{0:view.counts.open})}</TabsTrigger>
          <TabsTrigger value="all">{$tj('common.allCount',{0:view.counts.all})}</TabsTrigger>
        </DataTableTabs>
        <DataTable table={table} empty={{ title: view.refreshing ? $t('aiQuestions.checking') : $t('aiQuestions.noQuestionsGroup') }} onRowClick={(row) => setOpenKey(row.original.key)} />
      </Card>
      {view.citedDomains.length ? (
        <Card className="gap-2 px-4" data-cited-domains>
          <h2 className="flex items-center gap-1 text-sm font-semibold">{$t('aiQuestions.sitesAiCitesMostAnswers')}<InfoTip label={$t('aiQuestions.whyMatters')}>{$t('aiQuestions.getMentionedAiWritePages')}</InfoTip></h2>
          <div className="flex flex-wrap gap-1.5">{view.citedDomains.map((d) => <span key={d.domain} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">{d.domain}<span className="tabular-nums text-muted-foreground">{d.count}</span>{d.own ? <Tag tone="blue">{$t('common.site')}</Tag> : d.rival ? <Tag tone="grey">{$t('common.competitor')}</Tag> : null}</span>)}</div>
        </Card>
      ) : null}
      {open ? <QuestionDetail q={open} onClose={() => setOpenKey(undefined)} onHand={() => { setOpenKey(undefined); setHanding([open]); }} /> : null}
      {handing ? <DraftHandOffDialog projectId={projectId} draft={questionsDraft(handing)} playbookId="content-outline" description={$t('aiQuestions.questionsBecomeOneTaskAgent',{0:handing.length})} onClose={() => setHanding(undefined)} onDone={(r) => { setHanding(undefined); setRowSelection({}); onHandOff(r); }} /> : null}
    </>
  );
}

// No followed topics yet: they are kept in Memory, where the AI drafts them with the rest.
function NoTopics({ view }: { view: View }) {
  const navigate = useNavigate();
  if (!view.dataforseo) return <InlineError>{$t('aiQuestions.aiQuestionsComeDataforseoConnectMessage')}</InlineError>;
  return <EmptyState icon={<MessagesSquare />} title={$t('followedTopics.noTopicsTitle')} description={$t('aiQuestions.topicsEmptyHelp')} action={<Button onClick={() => void navigate(TOPICS_EDIT_PATH)}>{$t('followedTopics.addInMemory')}</Button>} />;
}

// What is looked up: the followed topics, monthly, with the cost in the ⓘ and the link to change them in Memory.
function Topics({ view }: { view: View }) {
  const failed = view.topics.flatMap((t) => Object.values(t.platforms).filter((x) => x?.error).map((x) => labelValue(t.keyword, $legacyText(x!.error))));
  return (
    <div className="space-y-1.5" data-topics>
      <p className="nr-footnote flex flex-wrap items-center gap-x-1.5" data-topic-scope>
        <span>{topicScopeText({ topics: view.topics.length, cadence: 'monthly' })}</span>
        <InfoTip label={$t('aiQuestions.howTopicsWork')}>{$tj('aiQuestions.topicChecksQuestionsContainingTerm',{0:(2 * COST).toFixed(1),1:view.maxTopics})}</InfoTip>
        <EditTopicsLink />
      </p>
      {failed.length ? <InlineError>{$tj('common.checkIncomplete',{0:failed[0]})}</InlineError> : null}
    </div>
  );
}

// One question: the AI's answer, who it names, what it cites.
function QuestionDetail({ q, onClose, onHand }: { q: Question; onClose: () => void; onHand: () => void }) {
  return (
    <DetailDrawer open onClose={onClose} title={q.question} description={$t('aiQuestions.questionVolume',{0:getPlatform()[q.platform],1:n(q.volume),2:q.at ? $t('aiQuestions.answered',{0:formatDate(q.at)}) : ""})}
      actions={<Button size="sm" onClick={onHand}><Bot data-icon="inline-start" />{$t('common.handOffAgent')}</Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Tag tone={getStatus()[q.status].tone} dot>{q.status === "ours" ? joinList([q.weNamed ? $t('aiQuestions.mentionsUs') : "", q.weCited ? $t('common.citesSite') : ""].filter(Boolean)) : getStatus()[q.status].label}</Tag>{q.rivals.map((r) => <Tag key={r} tone="grey">{r}</Tag>)}{q.brands.map((b) => <span key={b} className="text-xs text-muted-foreground">{b}</span>)}</div>
        <section className="space-y-1"><h3 className="text-sm font-semibold">{$t('aiQuestions.aiAnswerBeginning')}</h3><p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm leading-relaxed">{q.answer || $t('aiQuestions.noAnswerText')}{q.answer.length >= 900 ? "…" : ""}</p></section>
        <section className="space-y-1"><h3 className="text-sm font-semibold">{$t('aiQuestions.citedPages')}</h3>
          {q.sources.length ? q.sources.map((s) => { const href = safeLink(s.url); return <p key={s.url || s.domain} className="flex items-center gap-2 text-sm">{href ? <a className="nr-link min-w-0 flex-1 truncate" href={href} target="_blank" rel="noreferrer" title={s.url}>{s.title || s.domain}</a> : <span className="min-w-0 flex-1 truncate">{s.title || s.domain}</span>}<span className="shrink-0 text-xs text-muted-foreground">{s.domain}</span>{s.own ? <Tag tone="blue">{$t('common.site')}</Tag> : s.rival ? <Tag tone="grey">{s.rival}</Tag> : null}</p>; }) : <p className="text-sm text-muted-foreground">{$t('aiQuestions.answerNotCitePages')}</p>}
        </section>
      </div>
    </DetailDrawer>
  );
}

// The questions picked become one task: how AI answers now, who it names and cites, and what to do.
function questionsDraft(rows: Question[]): TaskDraft {
  const head = rows[0].question;
  const lines = rows.slice(0, 30).map((q) => $t('aiQuestions.questionEvidence',{0:q.question,1:getPlatform()[q.platform],2:n(q.volume),3:q.status === "ours" ? questionBrandEvidence(q.weNamed, q.weCited) : $t('aiQuestions.notMentionUs'),4:q.rivals.length || q.brands.length ? $t('aiQuestions.mentions',{0:joinList([...q.rivals, ...q.brands].slice(0, 6))}) : "",5:q.sources.length ? $t('aiQuestions.cites',{0:joinList([...new Set(q.sources.map((s) => s.domain))].slice(0, 5))}) : "",6:q.answer ? $t('aiQuestions.answerBegins',{0:q.answer.slice(0, 240).replace(/\s+/g, " ")}) : ""}));
  return {
    title: (rows.length === 1 ? $t('common.getAiMentionUsWhen',{0:head}) : $t('aiQuestions.getAiMentionUsWhen',{0:head,1:rows.length})).slice(0, 200),
    subject: subjectOf(head, rows.length, 'questions').slice(0, 160),
    objective: $t('aiQuestions.aiChatgptGoogleAiOverviews').slice(0, 1000),
    brief: [$t('aiQuestions.questionsPeopleAskAi'), ...lines, "", $t('aiQuestions.evidenceAiQCollectedDataforseo'), $t('aiQuestions.citationAdvice')].join("\n").slice(0, 20000),
  };
}
