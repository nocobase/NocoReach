import type { EffectResult } from '../server/nocoreach/execution/effect.js';

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
  return result.primary &&
    complete(result, result.primary === 'clicks' ? 'gsc' : 'ga4')
    ? result.conclusion
    : 'insufficient';
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
