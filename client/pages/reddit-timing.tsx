import { $t } from '#i18n';
import { formatDateTime } from '#lib/format';
import { InfoTip } from '#components/reach/info-tip';

export type RedditTimingState = {
  lastRun?: { at: string; ok: boolean; lastSuccessAt?: string | null } | null;
  schedule?: { kind: string; nextAt: string | null };
  diagnostics?: {
    term: string;
    reason: string;
    providerCode?: number | null;
    taskCode?: number | null;
    taskId?: string | null;
  }[];
};

// One line under the search terms (UI review 2026-10-21): when the last search succeeded and when the next may run, the
// last attempt and the scan rhythm in its ⓘ. A search that did not complete says which term and why, in plain words;
// the provider's codes and task id, which only an administrator reconciling DataForSEO needs, sit in its own ⓘ.
export function RedditTiming({ state }: { state: RedditTimingState }) {
  const date = (value?: string | null) =>
    value ? formatDateTime(value) : $t('redditTiming.never');
  const success =
    state.lastRun?.lastSuccessAt ||
    (state.lastRun?.ok ? state.lastRun.at : null);
  const next = state.schedule?.nextAt
    ? $t(
        state.schedule.kind === 'weekly'
          ? 'redditTiming.nextQuery'
          : state.schedule.kind === 'budget'
            ? 'redditTiming.nextBudgetCheck'
            : 'redditTiming.nextRetry',
        { 0: date(state.schedule.nextAt) },
      )
    : null;
  const failed = (state.diagnostics ?? []).filter(
    (d) => d.reason !== 'success',
  );
  return (
    <div className='flex flex-col gap-2'>
      <p className='nr-footnote flex flex-wrap items-center gap-1'>
        {$t('redditTiming.lastSuccess', { 0: date(success) })}
        {next ? <> · {next}</> : null}
        <InfoTip label={$t('redditTiming.details')}>
          <span className='flex flex-col gap-1'>
            <span>
              {$t('redditTiming.lastAttempt', { 0: date(state.lastRun?.at) })}
            </span>
            <span>{$t('redditTiming.hourlyScan')}</span>
          </span>
        </InfoTip>
      </p>
      {!next ? (
        <p className='nr-error' role='alert'>
          {$t('redditTiming.attention')}
        </p>
      ) : null}
      {failed.length ? (
        <div className='nr-error' role='alert'>
          {failed.map((d) => (
            <p key={d.term} className='flex flex-wrap items-center gap-1'>
              {$t('reddit.searchIncompleteFor', {
                0: d.term,
                1: $t(`redditDiagnostic.${d.reason}`),
              })}
              {d.providerCode != null || d.taskCode != null || d.taskId ? (
                <InfoTip label={$t('redditTiming.diagnostics')}>
                  {$t('redditTiming.diagnosticCodes', {
                    0: `${d.providerCode ?? '—'} / ${d.taskCode ?? '—'}`,
                    1: d.taskId ?? '—',
                  })}
                </InfoTip>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
