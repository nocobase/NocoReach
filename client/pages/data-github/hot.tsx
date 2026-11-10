import { useMessageState, $t } from "#i18n";
// GitHub page · GitHub hot topics (2026-10-14, user request): what developers across GitHub look at, beside the
// project's own repository (server/nocoreach/github-trends.ts, read once a day). Followed topics (kept in Project
// knowledge › Memory since 2026-11-10) with their weeks, Gainers from the stars NocoReach records each day, the official
// GitHub Trending page, and the newest repositories with the most stars. Ticked topics go to the Agent as Content topic
// and outline, ticked repositories as a research playbook.
import { useEffect, useMemo, useState } from "react";
import { Flame, RefreshCw } from "lucide-react";
import { RefreshButton } from '#components/reach/refresh-button';
import { HeaderActions } from "#components/reach/page";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { toast } from "#lib/toast";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { InfoTip, NotesTip } from "#components/reach/info-tip";
import { AllCheck, RowCheck, useTickedList } from "#components/reach/hand-off-slot";
import { Tag } from "#components/reach/tag";
import { safeLink } from "../analytics";
import type { TaskDraft } from "../keyword-hand-off";
import { subjectOf } from '../task-subject';
import { Segmented } from "#components/reach/segmented";
import { num } from "./model";
import { formatDate, formatDateTime, joinList } from "#lib/format";
import { Delta } from '#components/reach/delta';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select';
import { EditTopicsLink } from "../followed-topics";
import { topicScopeText } from "../followed-topics-scope";

type Repo = { repo: string; url: string; description?: string; language?: string | null; topics?: string[]; stars: number | null; rival: boolean; own: boolean; matched: string[]; gained?: number | null; forks?: number | null; createdAt?: string | null };
type Topic = { name: string; mode: "topic" | "text"; url: string; read: boolean; total: number | null; new7: number | null; lastWeek: number | null; priorAverage: number | null; weeks: { week: string; count: number | null }[]; leaders: Repo[]; fresh: Repo[] };
type Hot = {
  ready: boolean; running: boolean; token: boolean; recordedSince?: string | null; day?: string;
  lastRun?: { at: string; day: string | null; ok: boolean; errors: string[]; limited: boolean; token: boolean } | null;
  topics: Topic[];
  gainers?: { day: Repo[]; week: Repo[]; month: Repo[] }; newHot?: { date: string | null; all: Repo[] };
  trending?: { date: string; daily: Repo[]; weekly: Repo[]; monthly: Repo[] } | null;
};
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrGitHubTrends", action, { method: "POST", body: { projectId: String(projectId), ...body }, unwrap: "data" });
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function topicsDraft(rows: Topic[]): TaskDraft {
  const lines = rows.map((t) => $t('githubHot.topicLine', { 0: t.name, 1: num(t.total), 2: num(t.new7), 3: num(t.lastWeek), 4: num(t.priorAverage, 1), 5: joinList(t.leaders.slice(0, 3).map((r) => r.repo)) }));
  return {
    title: clip(rows.length === 1 ? $t('githubHot.topicTaskTitle', { 0: rows[0].name }) : $t('githubHot.topicsTaskTitle', { 0: joinList(rows.map((t) => t.name)) }), 200),
    subject: clip(subjectOf(rows[0].name, rows.length, 'topics'), 160),
    objective: clip($t('githubHot.topicsObjective'), 1000),
    brief: clip([$t('githubHot.topicsBrief'), ...lines, "", $t('githubHot.topicsSuggestion')].join("\n"), 20000),
  };
}
function reposDraft(rows: Repo[], period: string): TaskDraft {
  // The Why card's one sentence, from the numbers rather than the list (2026-10-23 user request).
  const top = [...rows].sort((a, b) => (b.gained ?? -1) - (a.gained ?? -1))[0];
  const why = top?.gained != null ? rows.length === 1 ? $t('githubHot.repoWhy', { 0: top.repo, 1: period, 2: num(top.gained) }) : $t('githubHot.reposWhy', { 0: rows.length, 1: top.repo, 2: period, 3: num(top.gained) }) : undefined;
  const lines = rows.slice(0, 30).map((r) => $t('githubHot.repoLine', { 0: r.url, 1: num(r.stars), 2: r.gained != null ? `+${num(r.gained)}` : "—", 3: period, 4: r.description || "" }));
  return {
    title: clip(rows.length === 1 ? $t('githubHot.repoTaskTitle', { 0: rows[0].repo }) : $t('githubHot.reposTaskTitle', { 0: rows[0].repo, 1: rows.length }), 200),
    subject: clip(subjectOf(rows[0].repo, rows.length, 'repositories'), 160),
    objective: clip($t('githubHot.reposObjective'), 1000),
    brief: clip([$t('githubHot.reposBrief'), ...lines, "", $t('githubHot.reposSuggestion')].join("\n"), 20000),
    ...(why ? { why: clip(why, 300) } : {}),
  };
}

// One series, so --chart-3, as every trend line and single-series chart (UI review 2026-10-23).
function Spark({ weeks }: { weeks: Topic["weeks"] }) {
  const values = weeks.map((w) => w.count ?? 0), max = Math.max(1, ...values);
  return <span className="inline-flex h-5 items-end gap-px" role="img" aria-label={$t('githubHot.weeklyNew')}>{values.map((v, i) => <span key={i} className="w-1.5 rounded-[1px] bg-chart-3" style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />)}</span>;
}
const Marks = ({ r }: { r: Repo }) => <>{r.own ? <Tag tone="blue">{$t('githubHot.ours')}</Tag> : null}{r.rival ? <Tag tone="amber">{$t('githubHot.rival')}</Tag> : null}{r.matched.slice(0, 2).map((t) => <Tag key={t} tone="grey">{t}</Tag>)}</>;
function RepoName({ r }: { r: Repo }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex flex-wrap items-center gap-1.5">{safeLink(r.url) ? <a className="nr-link font-medium" href={safeLink(r.url)!} target="_blank" rel="noreferrer">{r.repo}</a> : r.repo}<Marks r={r} /></span>
      {r.description ? <span className="truncate text-xs text-muted-foreground" title={r.description}>{r.description}</span> : null}
    </span>
  );
}
function Frame({ title, info, actions, children, ...rest }: { title: string; info: string; actions?: React.ReactNode; children: React.ReactNode; [k: `data-${string}`]: unknown }) {
  return (
    <Card className="gap-0 py-0" {...rest}>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3"><div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{title}</h2><InfoTip label={$t('common.aboutData')}>{info}</InfoTip></div>{actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}</div>
      {children}
    </Card>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-6 text-sm text-muted-foreground">{children}</p>;

export function HotTab({ projectId }: { projectId: number }) {
  const [hot, setHot] = useState<Hot>(), [error, setError] = useMessageState("");
  const [period, setPeriod] = useState<"day" | "week" | "month">("week"), [topic, setTopic] = useState("all"), [language, setLanguage] = useState("all");
  const [trendingSince, setTrendingSince] = useState<"daily" | "weekly" | "monthly">("daily"), [freshScope, setFreshScope] = useState("all");
  const load = () => call<Hot>(projectId, "view").then((v) => { setHot(v); setError(""); }).catch((e) => setError(() => (e instanceof Error ? e.message : $t('common.tryAgainLater'))));
  useEffect(() => { void load(); }, [projectId]);
  // While a read runs (a few minutes the first time), look again every 30 seconds.
  useEffect(() => { if (!hot?.running) return; const t = window.setInterval(() => void load(), 30000); return () => window.clearInterval(t); }, [hot?.running]);
  const refresh = () => call<Hot>(projectId, "refresh").then((v) => { setHot(v); toast.success(() => $t('githubHot.readingStarted')); }).catch((e) => toast.error(() => (e instanceof Error ? e.message : $t('common.tryAgainLater'))));
  const topics = hot?.topics ?? [];
  const periodLabel = { day: $t('githubHot.today'), week: $t('githubHot.thisWeek'), month: $t('githubHot.thisMonth') }[period];
  const gainers = useMemo(() => (hot?.gainers?.[period] ?? []).filter((r) => (topic === "all" || r.matched.includes(topic)) && (language === "all" || r.language === language)).slice(0, 30), [hot, period, topic, language]);
  const languages = useMemo(() => [...new Set(Object.values(hot?.gainers ?? {}).flat().map((r) => r.language).filter(Boolean) as string[])].sort(), [hot]);
  const fresh = freshScope === "all" ? hot?.newHot?.all ?? [] : [...new Map(topics.flatMap((t) => t.fresh).map((r) => [r.repo, r])).values()].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
  const topicSelection = useTickedList("github-hot-topics", hot?.ready ? topics : undefined, (t) => t.name, (ticked) => ({ playbookId: "content-outline", description: $t('githubHot.topicsHandOff'), draft: () => topicsDraft(ticked) }));
  const repoSelection = useTickedList("github-hot-repos", hot?.ready ? gainers : undefined, (r) => r.repo, (ticked) => ({ playbookId: "change-research", description: $t('githubHot.reposHandOff'), draft: () => reposDraft(ticked, periodLabel) }));
  if (error && !hot) return <LoadError title={$t('githubHot.notLoaded')} message={error} onRetry={() => void load()} />;
  if (!hot) return <ListSkeleton rows={5} />;
  const notes = [...(hot.token ? [] : [$t('githubHot.noTokenNote')]), $t('githubHot.dataNote'), ...(hot.lastRun?.errors ?? [])];
  const status = hot.running ? $t('githubHot.reading') : hot.lastRun ? $t('githubHot.readAt', { 0: formatDateTime(hot.lastRun.at) }) : "";
  if (!hot.ready) return (
    <EmptyState icon={<Flame />} title={hot.running ? $t('githubHot.firstReading') : $t('githubHot.notReadYet')} description={$t('githubHot.notReadYetHelpMemory')} action={<Button onClick={() => void refresh()} disabled={hot.running}><RefreshCw data-icon="inline-start" />{$t('common.updateNow')}</Button>} />
  );
  return (
    <div className="flex flex-col gap-4" data-github-hot="">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground" data-topic-scope><span>{[topicScopeText({ topics: topics.length, cadence: 'daily' }), status].filter(Boolean).join(" · ")}</span><NotesTip notes={notes} /><EditTopicsLink /><HeaderActions><RefreshButton busy={hot.running} label={$t('common.updateNow')} onClick={() => void refresh()} /></HeaderActions></div>
      <Frame data-hot-topics="" title={$t('githubHot.topics')} info={$t('githubHot.topicsInfoMemory')}>
        {topics.length ? (
          <table className="w-full text-sm">
            <thead data-slot="table-header"><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="w-10 py-2 pl-4"><AllCheck selection={topicSelection} count={topics.length} /></th><th className="py-2 font-medium">{$t('githubHot.topic')}</th><th className="py-2 text-right font-medium">{$t('githubHot.repositories')}</th><th className="py-2 text-right font-medium">{$t('githubHot.new7')}</th><th className="py-2 text-right font-medium">{$t('githubHot.lastWeekVsBefore')}</th><th className="py-2 pl-4 font-medium">{$t('githubHot.weeklyNew')}</th><th className="py-2 pr-4 font-medium">{$t('githubHot.leaders')}</th></tr></thead>
            <tbody>{topics.map((t) => { const c = t.lastWeek != null && t.priorAverage ? (t.lastWeek - t.priorAverage) / t.priorAverage : null; return (
              <tr key={t.name} className="border-b border-border last:border-0" data-topic={t.name}>
                <td className="py-2 pl-4"><RowCheck selection={topicSelection} k={t.name} label={t.name} /></td>
                <td className="py-2"><span className="flex flex-wrap items-center gap-1.5"><a className="nr-link" href={safeLink(t.url) ?? undefined} target="_blank" rel="noreferrer">{t.name}</a>{t.mode === "text" ? <Tag tone="grey" title={$t('githubHot.textSearchHelp')}>{$t('githubHot.textSearch')}</Tag> : null}</span></td>
                <td className="py-2 text-right tabular-nums">{num(t.total)}</td><td className="py-2 text-right tabular-nums">{num(t.new7)}</td>
                <td className="py-2 text-right tabular-nums">{num(t.lastWeek)}{c != null ? <Delta value={c} className="ml-1.5 text-xs" /> : null}</td>
                <td className="py-2 pl-4"><Spark weeks={t.weeks} /></td>
                <td className="max-w-xs py-2 pr-4 text-xs text-muted-foreground"><span className="block truncate">{joinList(t.leaders.slice(0, 3).map((r) => r.repo)) || "—"}</span></td>
              </tr>); })}</tbody>
          </table>
        ) : <Empty>{$t('followedTopics.noTopics')} <EditTopicsLink /></Empty>}
      </Frame>
      <Frame data-hot-gainers="" title={$t('githubHot.gainers')} info={$t('githubHot.gainersInfo', { 0: hot.recordedSince ?? "—" })}
        actions={<>
          <Segmented label={$t('githubHot.gainers')} options={[{ id: "day", label: $t('githubHot.today') }, { id: "week", label: $t('githubHot.thisWeek') }, { id: "month", label: $t('githubHot.thisMonth') }]} value={period} onChange={(v) => setPeriod(v as typeof period)} />
          <Select value={topic} onValueChange={(v) => setTopic(String(v))}>
            <SelectTrigger size="sm" className="w-full sm:w-36" aria-label={$t('githubHot.topic')}><SelectValue>{(v: string) => (v === "all" ? $t('githubHot.allTopics') : v)}</SelectValue></SelectTrigger>
            <SelectContent align="end" className="w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal"><SelectItem value="all">{$t('githubHot.allTopics')}</SelectItem>{topics.map((t) => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={language} onValueChange={(v) => setLanguage(String(v))}>
            <SelectTrigger size="sm" className="w-full sm:w-36" aria-label={$t('githubHot.language')}><SelectValue>{(v: string) => (v === "all" ? $t('githubHot.allLanguages') : v)}</SelectValue></SelectTrigger>
            <SelectContent align="end" className="w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal"><SelectItem value="all">{$t('githubHot.allLanguages')}</SelectItem>{languages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </>}>
        {gainers.length ? (
          <table className="w-full table-fixed text-sm">
            <thead data-slot="table-header"><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="w-10 py-2 pl-4"><AllCheck selection={repoSelection} count={gainers.length} /></th><th className="py-2 font-medium">{$t('githubHot.repository')}</th><th className="w-28 py-2 font-medium">{$t('githubHot.language')}</th><th className="w-28 py-2 text-right font-medium">{$t('githubHot.totalStars')}</th><th className="w-28 py-2 pr-4 text-right font-medium">{$t('githubHot.gainedIn', { 0: periodLabel })}</th></tr></thead>
            <tbody>{gainers.map((r) => <tr key={r.repo} className="border-b border-border last:border-0" data-gainer={r.repo}><td className="py-2 pl-4 align-top"><RowCheck selection={repoSelection} k={r.repo} label={r.repo} /></td><td className="py-2"><RepoName r={r} /></td><td className="py-2 text-muted-foreground">{r.language || "—"}</td><td className="py-2 text-right tabular-nums">{num(r.stars)}</td><td className="py-2 pr-4 text-right tabular-nums nr-up">+{num(r.gained)}</td></tr>)}</tbody>
          </table>
        ) : <Empty>{$t('githubHot.gainersCollecting', { 0: formatDate(hot.recordedSince ?? hot.day), 1: periodLabel })}</Empty>}
      </Frame>
      <div className="grid gap-4 xl:grid-cols-2">
        <Frame data-hot-trending="" title="GitHub Trending" info={$t('githubHot.trendingInfo', { 0: formatDate(hot.trending?.date) })}
          actions={<Segmented label="GitHub Trending" options={[{ id: "daily", label: $t('githubHot.today') }, { id: "weekly", label: $t('githubHot.thisWeek') }, { id: "monthly", label: $t('githubHot.thisMonth') }]} value={trendingSince} onChange={(v) => setTrendingSince(v as typeof trendingSince)} />}>
          {hot.trending?.[trendingSince]?.length ? <ol className="divide-y divide-border">{hot.trending[trendingSince].map((r, i) => <li key={r.repo} className="flex items-start gap-3 px-4 py-2 text-sm" data-trending={r.repo}><span className="w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span><span className="min-w-0 flex-1"><RepoName r={r} /></span><span className="shrink-0 text-right text-xs tabular-nums"><span className="block nr-up">+{num(r.gained)}</span><span className="text-muted-foreground">★ {num(r.stars)}</span></span></li>)}</ol> : <Empty>{$t('githubHot.trendingEmpty')}</Empty>}
        </Frame>
        <Frame data-hot-fresh="" title={$t('githubHot.newHot')} info={$t('githubHot.newHotInfo', { 0: formatDate(hot.newHot?.date) })}
          actions={<Segmented label={$t('githubHot.newHot')} options={[{ id: "all", label: $t('githubHot.allGithub') }, { id: "topics", label: $t('githubHot.followedTopics') }]} value={freshScope} onChange={setFreshScope} />}>
          {fresh.length ? <ol className="divide-y divide-border">{fresh.slice(0, 15).map((r) => <li key={r.repo} className="flex items-start gap-3 px-4 py-2 text-sm" data-fresh={r.repo}><span className="min-w-0 flex-1"><RepoName r={r} /></span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">★ {num(r.stars)}</span></li>)}</ol> : <Empty>{$t('githubHot.newHotEmpty')}</Empty>}
        </Frame>
      </div>
    </div>
  );
}
