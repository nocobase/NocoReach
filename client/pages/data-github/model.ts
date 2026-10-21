import { $t } from "#i18n";
import { formatCount, formatDate, formatPercent } from '#lib/format';
// GitHub page · 我们的仓库: what server/nocoreach/github-view.ts answers, and the eight figures at the top (as on 访问,
// a figure picks the daily line below it).

export type Row = {
  date: string; starsAdded?: number; forksAdded?: number; views?: number; uniques?: number; clones?: number; cloners?: number;
  commits?: number; externalCommits?: number; activeContributors?: number; newContributors?: number;
  issuesOpened?: number; issuesClosed?: number; prsOpened?: number; prsMerged?: number; prsClosed?: number; releases?: number;
};
export type Figures = {
  starsAdded: number | null; forksAdded: number | null; views: number | null; uniques: number | null; clones: number | null; cloners: number | null; trafficDays: number; cloneDays: number;
  commits: number | null; externalCommits: number | null; newContributors: number | null; activeContributors: number | null;
  issuesOpened: number | null; issuesClosed: number | null; prsOpened: number | null; prsMerged: number | null; prsClosed: number | null;
  externalPrsOpened: number | null; externalPrsMerged: number | null; externalPrsClosed: number | null; prMergeHours: number | null; issueCloseHours: number | null;
};
export type Kind = "own" | "ai" | "search" | "community" | "content" | "github" | "other";
export type Snapshot<T> = { date: string; comparedWith: string | null; dates: string[]; series: Record<string, (number | null)[]>; items: (T & { key: string; count: number; uniques: number; share: number | null; previous: number | null })[] };
export type Referrer = { referrer: string; kind: Kind };
export type PopularPath = { path: string; title: string; area: string };
export type Contributor = { login: string; anonymous: boolean; url: string | null; commits: number; previous: number | null; total: number | null; firstCommit: string | null; external: boolean | null };
export type Item = { number: number; title: string; url: string; comments: number | null; author: string | null; external: boolean; created: string; closed: string | null; merged: string | null; state: "open" | "closed" | "merged"; hours: number | null };
export type Release = { tag: string; name: string; date: string; url: string; downloads: number | null; files: number; prerelease?: boolean };
export type Discussion = { title: string; url: string; comments: number; upvotes: number; answered: boolean; answerable: boolean; category: string; createdAt?: string };
export type History = { state: "complete" | "running" | "pending" | "failed" | "token"; error: string | null; from: string | null; savedSince: string | null };
export type View = {
  connected: boolean; repo?: string; url?: string; cutoff?: string | null; notes?: string[];
  window?: { start: string; end: string; days: number; previousStart: string; previousEnd: string; all: boolean };
  history?: History;
  totals?: { stars: number | null; forks: number | null; watchers: number | null; contributors: number | null; releases: number | null; releaseDownloads: number | null; openIssues: number | null; openPrs: number | null };
  figures?: Figures; previous?: Figures | null; daily?: Row[]; previousDaily?: Row[];
  sources?: { date: string; total: number; ai: number; kinds: { kind: Kind; count: number; share: number | null }[] } | null;
  composition?: { languages: { name: string; bytes: number; share: number | null }[]; topics: string[] };
  tables?: {
    referrers: Snapshot<Referrer> | null; paths: Snapshot<PopularPath> | null; contributors: Contributor[]; issues: Item[]; pulls: Item[]; releases: Release[];
    discussions: Discussion[] | null; discussionsEnabled: boolean | null; topIssues: { title: string; url: string; comments: number; state: string }[];
  };
};

export const num = (v: number | null | undefined, digits = 0) => formatCount(v, digits);
export const pct = (v: number | null | undefined) => formatPercent(v);
export const ratio = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? a / b : null);
export const change = (now: number | null | undefined, before: number | null | undefined) => (now == null || before == null || !before ? null : (now - before) / before);
export const hours = (h: number | null | undefined) => (h == null ? "—" : h < 48 ? $t('dataGithub.hoursValue', { 0: h.toFixed(1) }) : $t('dataGithub.daysValue', { 0: (h / 24).toFixed(1) }));
export const dateOf = (d: string | null | undefined) => formatDate(d);

// The eight figures: what each counts, its daily line, whether it needs the full history (token) or saved Traffic,
// and the small line under it.
export type MetricKey = "stars" | "forks" | "views" | "clones" | "commits" | "contributors" | "issues" | "pulls";
export type Metric = { key: MetricKey; label: () => string; value: (f: Figures) => number | null; line: keyof Row; source: "always" | "history" | "traffic"; hint: (v: View) => string | undefined };
export const METRICS: Metric[] = [
  { key: "stars", label: () => $t('common.newStars'), value: (f) => f.starsAdded, line: "starsAdded", source: "always", hint: (v) => $t('dataGithub.totalValue', { 0: num(v.totals?.stars) }) },
  { key: "forks", label: () => $t('dataGithub.newForks'), value: (f) => f.forksAdded, line: "forksAdded", source: "always", hint: (v) => $t('dataGithub.totalValue', { 0: num(v.totals?.forks) }) },
  { key: "views", label: () => $t('common.views'), value: (f) => f.views, line: "views", source: "traffic", hint: (v) => (v.figures?.trafficDays ? $t('dataGithub.dailyUniqueVisitors', { 0: num((v.figures.uniques ?? 0) / v.figures.trafficDays) }) : undefined) },
  { key: "clones", label: () => $t('dataGithub.clones'), value: (f) => f.clones, line: "clones", source: "traffic", hint: (v) => (v.figures?.cloneDays ? $t('dataGithub.dailyUniqueCloners', { 0: num((v.figures.cloners ?? 0) / v.figures.cloneDays) }) : undefined) },
  { key: "commits", label: () => "Commits", value: (f) => f.commits, line: "commits", source: "history", hint: (v) => $t('dataGithub.outsideShare', { 0: pct(ratio(v.figures?.externalCommits, v.figures?.commits)) }) },
  { key: "contributors", label: () => $t('dataGithub.activeContributors'), value: (f) => f.activeContributors, line: "activeContributors", source: "history", hint: (v) => $t('dataGithub.firstTimeValue', { 0: num(v.figures?.newContributors) }) },
  { key: "issues", label: () => $t('dataGithub.issuesOpened'), value: (f) => f.issuesOpened, line: "issuesOpened", source: "history", hint: (v) => $t('dataGithub.closedAndOpen', { 0: num(v.figures?.issuesClosed), 1: num(v.totals?.openIssues) }) },
  { key: "pulls", label: () => $t('dataGithub.prsMerged'), value: (f) => f.prsMerged, line: "prsMerged", source: "history", hint: (v) => $t('dataGithub.mergeRateAndOpen', { 0: pct(ratio(v.figures?.prsMerged, v.figures?.prsClosed)), 1: num(v.totals?.openPrs) }) },
];
// Why a figure has no value yet: the history needs a token, is being read or failed; views and clones need a token.
export function waiting(m: Metric, h: History | undefined): { label: string; hint: string } | null {
  if (!h || m.source === "always" || (m.source === "traffic" && h.state !== "token") || h.state === "complete") return null;
  if (h.state === "token") return { label: $t('dataGithub.stateToken'), hint: m.source === "traffic" ? $t('dataGithub.trafficNeedsToken') : $t('dataGithub.historyNeedsTokenShort') };
  if (h.state === "failed") return { label: $t('dataGithub.stateFailed'), hint: $t('dataGithub.historyRetryNextSync') };
  return { label: $t('dataGithub.stateReading'), hint: $t('dataGithub.historyReadingShort') };
}
