import { $t, getCurrentLocale } from '#i18n';

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

export function RedditTiming({ state }: { state: RedditTimingState }) {
  const date = (value?: string | null) =>
    value
      ? new Date(value).toLocaleString(getCurrentLocale(), {
          timeZoneName: 'short',
        })
      : $t('redditTiming.never');
  const success =
    state.lastRun?.lastSuccessAt ||
    (state.lastRun?.ok ? state.lastRun.at : null);
  return (
    <div className='nr-footnote'>
      <p>{$t('redditTiming.lastAttempt', { 0: date(state.lastRun?.at) })}</p>
      <p>{$t('redditTiming.lastSuccess', { 0: date(success) })}</p>
      <p>
        {state.schedule?.nextAt
          ? $t(
              state.schedule.kind === 'weekly'
                ? 'redditTiming.nextQuery'
                : state.schedule.kind === 'budget'
                  ? 'redditTiming.nextBudgetCheck'
                  : 'redditTiming.nextRetry',
              { 0: date(state.schedule.nextAt) },
            )
          : $t('redditTiming.attention')}
      </p>
      {state.diagnostics?.some((d) => d.reason !== 'success') ? (
        <div className='nr-error' role='alert'>
          {state.diagnostics
            .filter((d) => d.reason !== 'success')
            .map((d) => (
              <p key={d.term}>
                {$t('reddit.searchIncomplete', {
                  0: `${d.term}: ${$t(`redditDiagnostic.${d.reason}`)}`,
                })}
                {d.providerCode != null || d.taskCode != null
                  ? ` (${d.providerCode ?? '—'} / ${d.taskCode ?? '—'})`
                  : ''}
                {d.taskId ? ` · ${d.taskId}` : ''}
              </p>
            ))}
        </div>
      ) : null}
    </div>
  );
}
