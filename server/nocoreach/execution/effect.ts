// @ts-nocheck
import { systemMessageText } from '../../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
// Effect observation (SPEC §8): on day 7 and day 28 after a change went live, the page's search and visit numbers
// after going live are compared with the same number of days before. Only the change is described, never its cause.
export type Range = { start: string; end: string };
export type Partition = { source: string; grain: string; date: string; payload: any[] };
export type Totals = { clicks: number; impressions: number; weight: number; views: number; conversions: number; gscDays: number; ga4Days: number };
export type Conclusion = 'insufficient' | 'flat' | 'up' | 'down';
export type EffectResult = {
  day: number; baseline: Range; after: Range; pages: string[];
  gsc?: { clicks: [number, number]; impressions: [number, number]; ctr: [number, number]; position: [number, number] };
  ga4?: { views: [number, number]; conversions: [number, number] };
  primary: 'clicks' | 'views' | null; change: number | null; conclusion: Conclusion; notes: string[]; computedAt: string;
};
export const CHECKPOINTS = [7, 28];
const DAY = 86400000;
export const shift = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
export const dateOf = (iso: string) => new Date(iso).toISOString().slice(0, 10);
// Same page whatever the scheme, trailing slash, query or fragment; GA4 reports paths only.
export function pageKey(u: string) { try { const x = new URL(u); return `${x.host.toLowerCase().replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '') || '/'}`; } catch { return ''; } }
export function pathKey(u: string) { try { return new URL(u).pathname.replace(/\/+$/, '') || '/'; } catch { return (u.split(/[?#]/)[0].replace(/\/+$/, '') || '/'); } }
// The go-live day itself is left out: baseline is the `day` days before it, after is the `day` days after it.
export function windows(from: string, day: number) { return { baseline: { start: shift(from, -day), end: shift(from, -1) }, after: { start: shift(from, 1), end: shift(from, day) } }; }
export function totals(parts: Partition[], pages: string[], range: Range): Totals {
  const urls = new Set(pages.map(pageKey).filter(Boolean)), paths = new Set(pages.map(pathKey));
  const t: Totals = { clicks: 0, impressions: 0, weight: 0, views: 0, conversions: 0, gscDays: 0, ga4Days: 0 };
  const gscDays = new Set<string>(), ga4Days = new Set<string>();
  for (const p of parts) {
    if (p.date < range.start || p.date > range.end) continue;
    if (p.source === 'gsc' && p.grain === 'query_page') {
      gscDays.add(p.date);
      for (const r of p.payload || []) if (urls.has(pageKey(String(r.page || '')))) { t.clicks += Number(r.clicks) || 0; t.impressions += Number(r.impressions) || 0; t.weight += (Number(r.position) || 0) * (Number(r.impressions) || 0); }
    } else if (p.source === 'ga4' && p.grain === 'page') {
      ga4Days.add(p.date);
      for (const r of p.payload || []) if (paths.has(pathKey(String(r.page || '')))) { t.views += Number(r.views) || 0; t.conversions += Number(r.conversions) || 0; }
    }
  }
  t.gscDays = gscDays.size; t.ga4Days = ga4Days.size;
  return t;
}
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const pct = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`;
// Clicks when the page gets enough of them (40 in both windows together), otherwise views. Too little data or too many missing days is
// “数据不足”; a change needs at least 15% and 10 in absolute terms, otherwise it is “无明显变化”.
export function compare(day: number, from: string, pages: string[], parts: Partition[], computedAt: string): EffectResult {
  const { baseline, after } = windows(from, day), b = totals(parts, pages, baseline), a = totals(parts, pages, after), notes: string[] = [];
  const hasGsc = b.gscDays + a.gscDays > 0, hasGa4 = b.ga4Days + a.ga4Days > 0;
  const gsc = hasGsc ? { clicks: [b.clicks, a.clicks] as [number, number], impressions: [b.impressions, a.impressions] as [number, number], ctr: [b.impressions ? round(b.clicks / b.impressions * 100) : 0, a.impressions ? round(a.clicks / a.impressions * 100) : 0] as [number, number], position: [b.impressions ? round(b.weight / b.impressions) : 0, a.impressions ? round(a.weight / a.impressions) : 0] as [number, number] } : undefined;
  const ga4 = hasGa4 ? { views: [b.views, a.views] as [number, number], conversions: [b.conversions, a.conversions] as [number, number] } : undefined;
  const primary = hasGsc && b.clicks + a.clicks >= 40 ? 'clicks' : hasGa4 ? 'views' : hasGsc ? 'clicks' : null;
  const days = primary === 'clicks' ? [b.gscDays, a.gscDays] : [b.ga4Days, a.ga4Days];
  for (const [label, n] of [[systemMessageText('effect.beforeGoingLive'), days[0]], [systemMessageText('effect.afterGoingLive'), days[1]]] as [string, number][]) if (primary && n < day) notes.push(systemMessageText('messages.missingDaysData', { 0: label, 1: day - n }));
  const [before, now] = primary === 'clicks' ? [b.clicks, a.clicks] : primary === 'views' ? [b.views, a.views] : [0, 0];
  let conclusion: Conclusion = 'insufficient', change: number | null = null;
  if (!primary) notes.push(systemMessageText('effect.noSearchTrafficDataPage'));
  else if (days[0] < day * 0.7 || days[1] < day * 0.7) notes.push(systemMessageText('effect.tooManyMissingDaysJudge'));
  else if (before + now < 40) notes.push(systemMessageText('messages.tooLittleTotalJudge', { 0: primary === 'clicks' ? '点击' : '浏览', 1: before + now }));
  else { change = round((now - before) / Math.max(before, 1), 3); conclusion = Math.abs(now - before) >= 10 && Math.abs(change) >= 0.15 ? (change > 0 ? 'up' : 'down') : 'flat'; }
  return { day, baseline, after, pages, ...(gsc ? { gsc } : {}), ...(ga4 ? { ga4 } : {}), primary, change, conclusion, notes, computedAt };
}
export const conclusionLabels: Record<Conclusion, string> = { insufficient: systemMessageText('effect.notEnoughData'), flat: systemMessageText('effect.noClearChange'), up: systemMessageText('effect.up'), down: systemMessageText('effect.down') };
export function summary(r: EffectResult) {
  if (r.conclusion === 'insufficient' || !r.primary || r.change === null) return systemMessageText('common.dayNotEnoughData', { 0: r.day });
  const [b, a] = r.primary === 'clicks' ? r.gsc!.clicks : r.ga4!.views;
  return systemMessageText('messages.day', { 0: r.day, 1: conclusionLabels[r.conclusion], 2: r.primary === 'clicks' ? '搜索点击' : '浏览量', 3: b, 4: a, 5: pct(r.change) });
}
