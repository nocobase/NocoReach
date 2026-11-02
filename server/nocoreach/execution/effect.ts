// @ts-nocheck
import { systemMessageText } from '../../../shared/i18n/messages.js';
import { FLAT_BELOW, JUDGED_METRICS, complete, lacking } from '../../../shared/result-comparison.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
// Effect observation (SPEC §8): on day 7 and day 28 after a change went live, the page's search and visit numbers
// after going live are compared with the same number of days before. Only the change is described, never its cause.
export type Range = { start: string; end: string };
export type Partition = { source: string; grain: string; date: string; payload: any[] };
export type Totals = { clicks: number; impressions: number; weight: number; views: number; conversions: number; gscDays: number; ga4Days: number };
export type Conclusion = 'insufficient' | 'flat' | 'up' | 'down';
/** One page's numbers before and after going live (2026-10-22): search clicks, impressions and average position, views. */
export type PageChange = { page: string; clicks?: [number, number]; impressions?: [number, number]; position?: [number, number]; views?: [number, number] };
/** One page's numbers in a window: search clicks, average position, views. */
export type PageNumbers = { page: string; clicks?: number; position?: number; views?: number };
export type EffectResult = {
  day: number; baseline: Range; after: Range; pages: string[];
  /** Each page on its own, when the task changed more than one. */
  byPage?: PageChange[];
  gsc?: { clicks: [number, number]; impressions: [number, number]; ctr: [number, number]; position: [number, number] };
  ga4?: { views: [number, number]; conversions: [number, number] };
  /** The metric the conclusion rests on; null when none had enough data. */
  primary: 'clicks' | 'impressions' | 'views' | null; change: number | null; conclusion: Conclusion; notes: string[]; computedAt: string;
  coverage?: { gsc: { baselineDays: number; afterDays: number }; ga4: { baselineDays: number; afterDays: number } };
  /** The rule the conclusion was reached by: EFFECT_RULE. Results without it were judged by clicks or else views. */
  rule?: number;
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
const count = (n: number) => n.toLocaleString('en-US');
// How much it changed, as the pages write it (client/pages/effect-model.ts changeText): "↑ 208%", "↓ 9.8%", from nothing "↑ 240".
function changeText(before: number, after: number) {
  const arrow = after > before ? '↑ ' : after < before ? '↓ ' : '';
  if (!before) return arrow + count(Math.abs(after - before));
  const percent = Math.abs((after - before) / before * 100);
  return `${arrow}${percent.toLocaleString('en-US', { maximumFractionDigits: percent < 10 ? 1 : 0 })}%`;
}
const METRIC_NAMES = { clicks: 'common.searchClicks', impressions: 'common.searchImpressions', views: 'common.viewCount' } as const;
export const EFFECT_RULE = 2;
type Judgment = Pick<EffectResult, 'primary' | 'change' | 'conclusion' | 'notes' | 'rule'>;
// The first metric with enough data decides (JUDGED_METRICS: search clicks, then search impressions, then views; 2026-11-02 user
// decision, as clicks alone or else views left almost every change “not enough data”). Missing days rule a source out, as before.
// When no metric qualifies the note says why, in the numbers the reader can check, as Results and the task page write it.
export function judge(r: Omit<EffectResult, keyof Judgment>): Judgment {
  const result = r as EffectResult;
  for (const { metric, source, enough, floor } of JUDGED_METRICS) {
    const pair = (r[source] as Record<string, [number, number]> | undefined)?.[metric];
    if (!pair || !complete(result, source)) continue;
    const [before, now] = pair;
    if (before + now < enough) continue;
    const change = before === 0 ? null : round((now - before) / before, 3);
    const conclusion: Conclusion = Math.abs(now - before) >= floor && (change === null || Math.abs(change) >= FLAT_BELOW) ? (now > before ? 'up' : 'down') : 'flat';
    return { primary: metric, change, conclusion, notes: [], rule: EFFECT_RULE };
  }
  const l = lacking(result), totals = JUDGED_METRICS.filter(({ metric }) => l[metric] !== undefined).map(({ metric }) => `${systemMessageText(METRIC_NAMES[metric])} ${count(l[metric])}`);
  const note = totals.length ? systemMessageText('effect.tooLittleTotals', { 0: r.day, 1: totals.join('、') }) : systemMessageText(l.missingDays ? 'effect.tooManyMissingDaysJudge' : 'effect.noSearchTrafficDataPage');
  return { primary: null, change: null, conclusion: 'insufficient', notes: [note], rule: EFFECT_RULE };
}
export function compare(day: number, from: string, pages: string[], parts: Partition[], computedAt: string): EffectResult {
  const { baseline, after } = windows(from, day), b = totals(parts, pages, baseline), a = totals(parts, pages, after);
  const hasGsc = b.gscDays + a.gscDays > 0, hasGa4 = b.ga4Days + a.ga4Days > 0;
  const gsc = hasGsc ? { clicks: [b.clicks, a.clicks] as [number, number], impressions: [b.impressions, a.impressions] as [number, number], ctr: [b.impressions ? round(b.clicks / b.impressions * 100) : 0, a.impressions ? round(a.clicks / a.impressions * 100) : 0] as [number, number], position: [b.impressions ? round(b.weight / b.impressions) : 0, a.impressions ? round(a.weight / a.impressions) : 0] as [number, number] } : undefined;
  const ga4 = hasGa4 ? { views: [b.views, a.views] as [number, number], conversions: [b.conversions, a.conversions] as [number, number] } : undefined;
  const byPage: PageChange[] | undefined = pages.length > 1 ? pages.map(page => {
    const pb = totals(parts, [page], baseline), pa = totals(parts, [page], after);
    return { page, ...(hasGsc ? { clicks: [pb.clicks, pa.clicks] as [number, number], impressions: [pb.impressions, pa.impressions] as [number, number], position: [position(pb), position(pa)] as [number, number] } : {}), ...(hasGa4 ? { views: [pb.views, pa.views] as [number, number] } : {}) };
  }) : undefined;
  const measured = { day, baseline, after, pages, ...(byPage ? { byPage } : {}), ...(gsc ? { gsc } : {}), ...(ga4 ? { ga4 } : {}), computedAt, coverage: { gsc: { baselineDays: b.gscDays, afterDays: a.gscDays }, ga4: { baselineDays: b.ga4Days, afterDays: a.ga4Days } } };
  return { ...measured, ...judge(measured) };
}
// A result judged before EFFECT_RULE, judged again from its stored numbers: the same windows, pages, numbers and computedAt.
// The notes the old rule wrote about its judgment (stored in Chinese, as systemMessageText writes them) give way to the new
// ones; any other note, such as another task changing the page in the same days, stays.
export function rejudge(r: EffectResult): EffectResult {
  if (r.rule === EFFECT_RULE) return r;
  const old = new Set([systemMessageText('effect.noSearchTrafficDataPage'), systemMessageText('effect.tooManyMissingDaysJudge')]);
  for (const [label, pair] of [['点击', r.gsc?.clicks], ['浏览', r.ga4?.views]] as const) if (pair) old.add(systemMessageText('messages.tooLittleTotalJudge', { 0: label, 1: pair[0] + pair[1] }));
  for (const when of ['effect.beforeGoingLive', 'effect.afterGoingLive']) for (let n = 1; n <= r.day; n++) old.add(systemMessageText('messages.missingDaysData', { 0: systemMessageText(when), 1: n }));
  const { notes, ...judgment } = judge(r);
  return { ...r, ...judgment, notes: [...notes, ...(r.notes || []).filter(note => !old.has(note))] };
}
export const conclusionLabels: Record<Conclusion, string> = { insufficient: systemMessageText('effect.notEnoughData'), flat: systemMessageText('effect.noClearChange'), up: systemMessageText('effect.up'), down: systemMessageText('effect.down') };
// A checkpoint in one line, worded as the task page writes it (effect-model.ts effectLine), for the Agent's and the daily
// analysis's task summaries (task-data.ts): "Day 7: Up · Search impressions 170 → 524 · ↑ 208%", in Chinese.
export function summary(r: EffectResult) {
  const pair = r.primary === 'views' ? r.ga4?.views : r.primary ? r.gsc?.[r.primary] : undefined;
  if (r.conclusion === 'insufficient' || !r.primary || !pair) return systemMessageText('common.dayNotEnoughData', { 0: r.day });
  const [b, a] = pair;
  return systemMessageText('effect.dayLine', { 0: r.day, 1: conclusionLabels[r.conclusion], 2: systemMessageText(METRIC_NAMES[r.primary]), 3: count(b), 4: count(a), 5: changeText(b, a) });
}
