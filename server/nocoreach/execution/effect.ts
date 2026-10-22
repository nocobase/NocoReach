// @ts-nocheck
import { systemMessageText } from '../../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
// Effect observation (SPEC §8): on day 7 and day 28 after a change went live, the page's search and visit numbers
// after going live are compared with the same number of days before. Only the change is described, never its cause.
export type Range = { start: string; end: string };
export type Partition = { source: string; grain: string; date: string; payload: any[] };
export type Totals = { clicks: number; impressions: number; weight: number; views: number; conversions: number; gscDays: number; ga4Days: number };
export type Conclusion = 'insufficient' | 'flat' | 'up' | 'down';
/** One page's numbers before and after going live (2026-10-22): search clicks and average position, views. */
export type PageChange = { page: string; clicks?: [number, number]; position?: [number, number]; views?: [number, number] };
/** One page's numbers in a window: search clicks, average position, views. */
export type PageNumbers = { page: string; clicks?: number; position?: number; views?: number };
export type EffectResult = {
  day: number; baseline: Range; after: Range; pages: string[];
  /** Each page on its own, when the task changed more than one. */
  byPage?: PageChange[];
  gsc?: { clicks: [number, number]; impressions: [number, number]; ctr: [number, number]; position: [number, number] };
  ga4?: { views: [number, number]; conversions: [number, number] };
  primary: 'clicks' | 'views' | null; change: number | null; conclusion: Conclusion; notes: string[]; computedAt: string;
  coverage?: { gsc: { baselineDays: number; afterDays: number }; ga4: { baselineDays: number; afterDays: number } };
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
    if (p.date < range.start || p.date > range.end || !Array.isArray(p.payload)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(Date.parse(p.date + 'T00:00:00Z')) || new Date(p.date + 'T00:00:00Z').toISOString().slice(0, 10) !== p.date) continue;
    const fields = p.source === 'gsc' ? ['clicks', 'impressions', 'position'] : ['views', 'conversions'];
    if (!p.payload.every(row => row && typeof row.page === 'string' && row.page && fields.every(key => typeof row[key] === 'number' && Number.isFinite(row[key]) && row[key] >= 0))) continue;
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
const position = (t: Totals) => (t.impressions ? round(t.weight / t.impressions) : 0);
/** Each page's numbers over a window, for the task page before a change goes live (2026-10-22). */
export function pageNumbers(parts: Partition[], pages: string[], range: Range) {
  const all = totals(parts, pages, range), gsc = all.gscDays > 0, ga4 = all.ga4Days > 0;
  const rows: PageNumbers[] = pages.map(page => {
    const t = totals(parts, [page], range);
    return { page, ...(gsc ? { clicks: t.clicks, position: position(t) } : {}), ...(ga4 ? { views: t.views } : {}) };
  });
  return { range, pages: rows, gscDays: all.gscDays, ga4Days: all.ga4Days };
}
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
  else if (days[0] !== day || days[1] !== day) notes.push(systemMessageText('effect.tooManyMissingDaysJudge'));
  else if (before + now < 40) notes.push(systemMessageText('messages.tooLittleTotalJudge', { 0: primary === 'clicks' ? '点击' : '浏览', 1: before + now }));
  else { change = before === 0 ? null : round((now - before) / before, 3); conclusion = Math.abs(now - before) >= 10 && (change === null || Math.abs(change) >= 0.15) ? (now > before ? 'up' : 'down') : 'flat'; }
  const byPage: PageChange[] | undefined = pages.length > 1 ? pages.map(page => {
    const pb = totals(parts, [page], baseline), pa = totals(parts, [page], after);
    return { page, ...(hasGsc ? { clicks: [pb.clicks, pa.clicks] as [number, number], position: [position(pb), position(pa)] as [number, number] } : {}), ...(hasGa4 ? { views: [pb.views, pa.views] as [number, number] } : {}) };
  }) : undefined;
  return { day, baseline, after, pages, ...(byPage ? { byPage } : {}), ...(gsc ? { gsc } : {}), ...(ga4 ? { ga4 } : {}), primary, change, conclusion, notes, computedAt, coverage: { gsc: { baselineDays: b.gscDays, afterDays: a.gscDays }, ga4: { baselineDays: b.ga4Days, afterDays: a.ga4Days } } };
}
export const conclusionLabels: Record<Conclusion, string> = { insufficient: systemMessageText('effect.notEnoughData'), flat: systemMessageText('effect.noClearChange'), up: systemMessageText('effect.up'), down: systemMessageText('effect.down') };
export function summary(r: EffectResult) {
  if (r.conclusion === 'insufficient' || !r.primary) return systemMessageText('common.dayNotEnoughData', { 0: r.day });
  const [b, a] = r.primary === 'clicks' ? r.gsc!.clicks : r.ga4!.views;
  if (r.change === null) return systemMessageText('results.absoluteSummary', { 0: r.day, 1: conclusionLabels[r.conclusion], 2: b, 3: a, 4: a - b });
  return systemMessageText('messages.day', { 0: r.day, 1: conclusionLabels[r.conclusion], 2: r.primary === 'clicks' ? '搜索点击' : '浏览量', 3: b, 4: a, 5: pct(r.change) });
}
