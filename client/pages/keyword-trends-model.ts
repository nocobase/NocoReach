import { getCurrentLocale, $t } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { metric } from './keyword-api';
// What Keywords › AI suggestions › Market trends reads from nrKeywordTrends (server/nocoreach/keyword-trends.ts) and how
// its numbers are said, shared by the view and the task handed to the Agent.

export type Market = { locationCode: number; language: string };
export type Metrics = {
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  competition: number | null;
  intent: string | null;
  monthlySearches: { year: number; month: number; volume: number | null }[];
};
export type Growth = {
  pct: number;
  from: number | null;
  to: number | null;
  months: number;
};
export type TrendItem = {
  id: string;
  keyword: string;
  topicId: string;
  reason: string;
  page: string | null;
  seed: string | null;
  growth: Growth | null;
  trends: { rise: number | null; term: string | null } | null;
  metrics: Metrics | null;
  site: {
    position: number;
    clicks: number;
    impressions: number;
    page: string;
  } | null;
};
export type Topic = {
  id: string;
  name: string;
  why: string;
  github: {
    topic: string;
    lastWeek: number;
    priorAverage: number;
    total: number | null;
  } | null;
  count: number;
  volume: number | null;
  fastest: number | null;
  rise: number | null;
};
export type TrendsView = {
  at?: string;
  market: Market;
  seeds: string[];
  seedsBy?: 'ai' | 'user';
  topics: Topic[];
  items: TrendItem[];
  partial?: string | null;
  basis?: { candidates: number; rising: number; github: number };
  dataforseo: boolean;
};

export const MAX_SEEDS = 4;
export const trendsRequest = <T>(
  projectId: number,
  action: string,
  body: object = {},
) =>
  api.action<T>('nrKeywordTrends', action, {
    method: 'POST',
    body: { projectId, ...body },
    unwrap: 'data',
  });
export const percent = (v: number) =>
  `${v > 0 ? '+' : ''}${new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 0 }).format(v)}%`;
// Growth over the twelve months DataForSEO lists (or its quarter).
export const growthLabel = (g: Growth) =>
  $t(
    g.months <= 3 ? 'keywordTrends.growthQuarter' : 'keywordTrends.growthYear',
    { 0: percent(g.pct) },
  );
export const fromTo = (g: Growth) =>
  g.from != null && g.to != null ? `${metric(g.from)} → ${metric(g.to)}` : '';
export const riseLabel = (rise: number) =>
  $t('keywordTrends.trendsRise', { 0: percent(rise) });
// One line on why a keyword is worth doing now, for the task handed to the Agent.
export const whyHot = (i: TrendItem, topic?: string) =>
  [
    topic,
    i.growth
      ? `${growthLabel(i.growth)}${fromTo(i.growth) ? ` (${fromTo(i.growth)})` : ''}`
      : '',
    i.trends?.rise != null ? riseLabel(i.trends.rise) : '',
    i.reason,
  ]
    .filter(Boolean)
    .join(' · ');
// Category terms as typed: split by commas, 1–4 of 2–40 characters (the server checks the same).
export function parseSeeds(text: string): string[] | null {
  const list = [
    ...new Set(
      text
        .split(/[,，、\n]/)
        .map((t) => t.trim().replace(/\s+/g, ' ').toLowerCase())
        .filter(Boolean),
    ),
  ];
  return list.length &&
    list.length <= MAX_SEEDS &&
    list.every((t) => t.length >= 2 && t.length <= 40 && !/["\\:%]/.test(t))
    ? list
    : null;
}
