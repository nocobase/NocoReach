import { number, resultStatus, signed, signedPercent } from './format.js';
import { $t, $legacyText } from '#i18n';
import {
  metricValues,
  safeConclusion,
  matchesObservation,
} from '../../../shared/result-comparison.js';
import type { EffectResult } from '../effect-model.js';
import { formatDateTime } from '#lib/format';
const metrics = [
  ['gsc', 'clicks', 'common.searchClicks'],
  ['gsc', 'impressions', 'common.searchImpressions'],
  ['gsc', 'ctr', 'common.ctr'],
  ['gsc', 'position', 'common.averagePosition'],
  ['ga4', 'views', 'common.viewCount'],
  ['ga4', 'conversions', 'results.keyEvents'],
] as const;
export function PrimaryComparison({ result }: { result: EffectResult }) {
  if (!result.primary) return <span>{resultStatus('insufficient')}</span>;
  const v = metricValues(
    result,
    result.primary === 'clicks' ? 'gsc' : 'ga4',
    result.primary,
  );
  return (
    <div>
      <strong className='tabular-nums'>
        {number(v.before)} → {number(v.after)}
      </strong>
      <p className='text-sm text-muted-foreground'>
        {result.primary === 'clicks'
          ? $t('common.searchClicks')
          : $t('common.viewCount')}{' '}
        · Δ {v.difference === null ? '—' : signed(v.difference)} ·{' '}
        {v.percent === null
          ? v.before === 0
            ? $t('results.zeroBaseline')
            : '—'
          : signedPercent(v.percent)}
      </p>
    </div>
  );
}
export function Comparison({
  result: original,
  observeFrom,
}: {
  result: EffectResult;
  observeFrom?: string | null;
}) {
  const unverified =
    observeFrom !== undefined && !matchesObservation(original, observeFrom);
  const result = unverified ? { ...original, coverage: undefined } : original;
  return (
    <div className='flex flex-col gap-3'>
      {unverified && <p>{$t('results.batchUnverified')}</p>}
      <strong>{resultStatus(safeConclusion(result))}</strong>
      <p className='text-sm'>
        {$t('results.windows', {
          0: `${result.baseline.start} – ${result.baseline.end}`,
          1: `${result.after.start} – ${result.after.end}`,
        })}
      </p>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[36rem] text-sm [&_th]:px-2 [&_td]:px-2 [&_th]:py-2 [&_td]:py-2 [&_th]:font-medium [&_tbody_tr]:border-t'>
          <thead>
            <tr>
              <th>{$t('results.metric')}</th>
              <th>{$t('results.before')}</th>
              <th>{$t('results.after')}</th>
              <th>{$t('results.difference')}</th>
              <th>{$t('results.relative')}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(([source, metric, label]) => {
              const v = metricValues(result, source, metric);
              return (
                <tr key={metric}>
                  <th className='text-left'>{$t(label)}</th>
                  <td className='text-right tabular-nums'>
                    {number(v.before)}
                  </td>
                  <td className='text-right tabular-nums'>{number(v.after)}</td>
                  <td className='text-right tabular-nums'>
                    {number(v.difference)}
                    {metric === 'ctr' && v.difference !== null
                      ? ` ${$t('results.points')}`
                      : ''}
                  </td>
                  <td className='text-right tabular-nums'>
                    {['ctr', 'position'].includes(metric)
                      ? '—'
                      : v.percent !== null
                        ? `${number(v.percent)}%`
                        : v.before === 0
                          ? $t('results.zeroBaseline')
                          : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className='text-xs text-muted-foreground'>{$t('results.rankNote')}</p>
      {(['gsc', 'ga4'] as const).map((source) => (
        <p className='text-sm text-muted-foreground' key={source}>
          {source === 'gsc' ? 'Search Console' : 'GA4'} ·{' '}
          {result.coverage?.[source]
            ? $t('results.coverage', {
                0: result.coverage[source].baselineDays,
                1: result.coverage[source].afterDays,
                2: result.day,
              })
            : $t('results.coverageUnknown')}
        </p>
      ))}
      <p className='text-xs text-muted-foreground'>
        {$t('results.computed', {
          0: formatDateTime(result.computedAt),
        })}
      </p>
      {[...new Set(result.notes)].map((note) => (
        <p key={note} className='text-sm text-muted-foreground'>
          {$legacyText(note)}
        </p>
      ))}
    </div>
  );
}
