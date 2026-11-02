import type { EffectResult } from '../server/nocoreach/execution/effect.js';

export type EffectMetric = NonNullable<EffectResult['primary']>;
/**
 * How a change is judged (2026-11-02 user decision): by the first of these metrics with enough data, that is with every
 * day of both windows covered and at least `enough` in the two windows together. A change under `FLAT_BELOW`, or under
 * `floor` in absolute terms, is no clear change. Results › Changes explains the rule from these numbers.
 */
export const JUDGED_METRICS: readonly {
  metric: EffectMetric;
  source: 'gsc' | 'ga4';
  enough: number;
  floor: number;
}[] = [
  { metric: 'clicks', source: 'gsc', enough: 40, floor: 10 },
  { metric: 'impressions', source: 'gsc', enough: 200, floor: 50 },
  { metric: 'views', source: 'ga4', enough: 40, floor: 10 },
];
export const FLAT_BELOW = 0.15;
export const sourceOf = (metric: EffectMetric): 'gsc' | 'ga4' =>
  metric === 'views' ? 'ga4' : 'gsc';

export function matchesObservation(
  result: EffectResult,
  observeFrom: string | null | undefined,
) {
  if (!observeFrom || !Number.isFinite(Date.parse(observeFrom))) return false;
  const date = new Date(observeFrom).toISOString().slice(0, 10);
  const shift = (days: number) =>
    new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000)
      .toISOString()
      .slice(0, 10);
  return (
    result.baseline.start === shift(-result.day) &&
    result.baseline.end === shift(-1) &&
    result.after.start === shift(1) &&
    result.after.end === shift(result.day)
  );
}

export function complete(
  result: EffectResult,
  source: 'gsc' | 'ga4',
  side?: 'baselineDays' | 'afterDays',
) {
  const coverage = result.coverage?.[source];
  return side
    ? coverage?.[side] === result.day
    : coverage?.baselineDays === result.day &&
        coverage?.afterDays === result.day;
}
export function safeConclusion(
  result: EffectResult,
): EffectResult['conclusion'] {
  return result.primary && complete(result, sourceOf(result.primary))
    ? result.conclusion
    : 'insufficient';
}
/**
 * Why a result has too little to judge: the two windows' totals of search impressions and views where every day is
 * covered, so the reader sees how little there was; otherwise whether days are missing or there is no data at all.
 */
export type Lacking = {
  day: number;
  impressions?: number;
  views?: number;
  missingDays?: boolean;
};
export function lacking(result: EffectResult): Lacking {
  const total = (source: 'gsc' | 'ga4', metric: 'impressions' | 'views') => {
    const pair = (
      result[source] as Record<string, [number, number]> | undefined
    )?.[metric];
    return pair && complete(result, source) ? pair[0] + pair[1] : undefined;
  };
  const impressions = total('gsc', 'impressions'),
    views = total('ga4', 'views');
  if (impressions !== undefined || views !== undefined)
    return {
      day: result.day,
      ...(impressions !== undefined ? { impressions } : {}),
      ...(views !== undefined ? { views } : {}),
    };
  return {
    day: result.day,
    ...(result.gsc || result.ga4 ? { missingDays: true } : {}),
  };
}
export function metricValues(
  result: EffectResult,
  source: 'gsc' | 'ga4',
  metric: string,
) {
  const pair = (
    result[source] as unknown as Record<string, [number, number]> | undefined
  )?.[metric];
  const value = (index: 0 | 1) => {
    if (
      !pair ||
      !Number.isFinite(pair[index]) ||
      !complete(result, source, index === 0 ? 'baselineDays' : 'afterDays')
    )
      return null;
    if (
      source === 'gsc' &&
      ['ctr', 'position'].includes(metric) &&
      !result.gsc?.impressions[index]
    )
      return null;
    return pair[index];
  };
  const before = value(0),
    after = value(1);
  return {
    before,
    after,
    difference: before !== null && after !== null ? after - before : null,
    percent:
      before !== null && before > 0 && after !== null
        ? ((after - before) / before) * 100
        : null,
  };
}
