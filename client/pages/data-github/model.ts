import { getCurrentLocale, $t } from "#i18n";
// GitHub page: what server/nocoreach/github-view.ts answers, and the chart groups of 社区增长趋势 and 仓库流量趋势
// (after the first NocoReach's GitHub page: a group's figures share one chart, the period before is dashed).

export type Day = {
  date: string;
  starsAdded?: number | null; starsTotal?: number | null; forksAdded?: number | null; forksTotal?: number | null;
  issuesOpened?: number; issuesClosed?: number; prsOpened?: number; prsMerged?: number; prsClosed?: number;
  commits?: number; externalCommits?: number; activeContributors?: number; newContributors?: number; releases?: number;
  views?: number; uniques?: number; clones?: number; cloners?: number;
};
export type Figures = {
  starsAdded: number | null; forksAdded: number | null; views: number | null; uniques: number | null; clones: number | null; cloners: number | null; trafficDays: number; cloneDays: number;
  newContributors: number | null; commits: number | null; externalCommits: number | null; prsOpened: number | null; prsMerged: number | null; prsClosed: number | null;
  externalPrsOpened: number | null; externalPrsMerged: number | null; externalPrsClosed: number | null; issuesOpened: number | null; issuesClosed: number | null;
  prMergeHours: number | null; issueCloseHours: number | null;
};
export type Snapshot<T> = { dates: string[]; series: { key: string; values: (number | null)[] }[]; latest: { date: string; items: (T & { count: number; uniques: number; share: number | null })[] } };
export type Referrer = { referrer: string; kind: "own" | "ai" | "search" | "community" | "content" | "github" | "other" };
export type PopularPath = { path: string; title: string; area: string };
export type Discussion = { title: string; url: string; comments: number; upvotes: number; answered: boolean; answerable: boolean; category: string };
export type View = {
  connected: boolean; repo?: string; url?: string; description?: string; cutoff?: string | null; notes?: string[];
  window?: { start: string; end: string; days: number; previousStart: string; previousEnd: string; all: boolean };
  history?: { token: boolean; running: boolean; activity: "complete" | "failed" | "pending"; from: string | null; stars: boolean; savedSince: string | null };
  totals?: { stars: number | null; forks: number | null; watchers: number | null; contributors: number | null; releases: number | null; releaseDownloads: number | null; openIssues: number | null; openPrs: number | null; aiReferrals: number | null; aiReferralsDate: string | null };
  figures?: Figures; previous?: Figures | null;
  community?: Day[]; previousCommunity?: Day[]; traffic?: Day[]; previousTraffic?: Day[];
  referrers?: Snapshot<Referrer> | null; paths?: Snapshot<PopularPath> | null;
  composition?: {
    languages: { name: string; bytes: number; share: number | null }[]; topics: string[];
    contributors: { login: string; contributions: number; url?: string | null; external: boolean | null }[];
    labels: { name: string; count: number }[];
    releases: { tag: string; name: string; date: string; url: string; downloads: number | null; prerelease?: boolean }[];
    assets: { name: string; downloads: number; size: number; release: string }[];
  };
  issues?: { total: number; top: { title: string; url: string; comments: number; state: string }[] } | null;
  discussions?: { enabled?: boolean; total?: number; answered?: number; categories?: Record<string, number>; top?: Discussion[] } | null;
};

type Series = { key: keyof Day; label: () => string; color: string };
// A cumulative group (累计 Star) is read at its end, not added up.
export type Group = { id: string; label: () => string; series: Series[]; cumulative?: boolean };
const C = ["var(--chart-3)", "var(--chart-2)", "var(--chart-1)"];
export const COMMUNITY: Group[] = [
  { id: "starsAdded", label: () => "Star", series: [{ key: "starsAdded", label: () => $t('common.newStars'), color: C[0] }] },
  { id: "starsTotal", label: () => $t('dataGithub.totalStars'), cumulative: true, series: [{ key: "starsTotal", label: () => $t('dataGithub.totalStars'), color: C[0] }] },
  { id: "forks", label: () => "Fork", series: [{ key: "forksAdded", label: () => $t('dataGithub.newForks'), color: C[0] }] },
  { id: "contributors", label: () => $t('dataGithub.contributors'), series: [{ key: "activeContributors", label: () => $t('dataGithub.activeContributors'), color: C[0] }, { key: "newContributors", label: () => $t('dataGithub.firstTimeContributors'), color: C[1] }] },
  { id: "commits", label: () => "Commits", series: [{ key: "commits", label: () => "Commits", color: C[0] }, { key: "externalCommits", label: () => $t('dataGithub.externalCommits'), color: C[1] }] },
  { id: "issues", label: () => "Issues", series: [{ key: "issuesOpened", label: () => $t('dataGithub.issuesOpened'), color: C[0] }, { key: "issuesClosed", label: () => $t('dataGithub.issuesClosed'), color: C[1] }] },
  { id: "pullRequests", label: () => "Pull requests", series: [{ key: "prsOpened", label: () => $t('dataGithub.prsOpened'), color: C[0] }, { key: "prsMerged", label: () => $t('dataGithub.prsMerged'), color: C[1] }, { key: "prsClosed", label: () => $t('dataGithub.prsClosed'), color: C[2] }] },
  { id: "releases", label: () => "Releases", series: [{ key: "releases", label: () => $t('dataGithub.releasesPublished'), color: C[0] }] },
];
export const TRAFFIC: Group[] = [
  { id: "visits", label: () => $t('dataGithub.visits'), series: [{ key: "views", label: () => $t('common.views'), color: C[0] }, { key: "uniques", label: () => $t('dataGithub.uniqueVisitorsDay'), color: C[1] }] },
  { id: "clones", label: () => $t('dataGithub.clones'), series: [{ key: "clones", label: () => $t('dataGithub.clones'), color: C[0] }, { key: "cloners", label: () => $t('dataGithub.uniqueCloners'), color: C[1] }] },
];

export const num = (v: number | null | undefined, digits = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString(getCurrentLocale(), { maximumFractionDigits: digits }));
export const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`);
export const change = (now: number | null | undefined, before: number | null | undefined) => (now == null || before == null || !before ? null : (now - before) / before);
export const hours = (h: number | null | undefined) => (h == null ? "—" : h < 48 ? $t('dataGithub.hoursValue', { 0: h.toFixed(1) }) : $t('dataGithub.daysValue', { 0: (h / 24).toFixed(1) }));
export const bytes = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`);

// 日均, 较上期日均, 本期峰值 and 近 7 日动量 of one figure, over the days where it is known (a cumulative figure: its
// value at the end and how much it grew).
export type Stats = { average: number | null; previousAverage: number | null; peak: number | null; peakDate: string | null; recent: number | null; momentum: number | null; end?: number | null; grown?: number | null };
export function stats(rows: Day[], previous: Day[], key: keyof Day, cumulative = false): Stats | null {
  const known = rows.filter((r) => typeof r[key] === "number") as (Day & Record<string, number>)[];
  if (!known.length) return null;
  const v = (r: Day) => r[key] as number;
  const avg = (l: Day[]) => (l.length ? l.reduce((n, r) => n + v(r), 0) / l.length : null);
  if (cumulative) return { average: null, previousAverage: null, peak: null, peakDate: null, recent: null, momentum: null, end: v(known.at(-1)!), grown: v(known.at(-1)!) - v(known[0]) };
  const peak = known.reduce((m, r) => (v(r) > v(m) ? r : m), known[0]);
  const last7 = known.slice(-7), prior7 = known.slice(-14, -7);
  const prevKnown = previous.filter((r) => typeof r[key] === "number");
  return { average: avg(known), previousAverage: prevKnown.length ? avg(prevKnown) : null, peak: v(peak), peakDate: peak.date, recent: avg(last7), momentum: prior7.length === 7 ? change(avg(last7), avg(prior7)) : null };
}
