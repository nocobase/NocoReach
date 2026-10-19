import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '#components/ui/button';
import { $t, getCurrentLocale, translateSystemError } from '#i18n';
import type { AnalysisStatus } from './service';

export function AnalysisAlert({
  status,
  busy,
  onRun,
}: {
  status?: AnalysisStatus;
  busy: boolean;
  onRun: () => void;
}) {
  const [today, setToday] = useState(() => new Date().toDateString());
  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(
      () => setToday(new Date().toDateString()),
      midnight.getTime() - Date.now(),
    );
    return () => clearTimeout(timer);
  }, [today]);
  const read = useCan({
    resource: { type: 'settings', id: 'agents.services' },
    action: 'read',
  });
  const manage = useCan({
    resource: { type: 'settings', id: 'agents.services' },
    action: 'manage',
  });
  const canConfigure =
    read.can &&
    manage.can &&
    !read.isPending &&
    !manage.isPending &&
    !read.error &&
    !manage.error;
  const run = status?.runs[0];
  if (
    !status ||
    status.running ||
    !run ||
    run.ok ||
    new Date(run.at).toDateString() !== today
  )
    return null;
  if (run.trigger === 'manual' && !status.retry && !run.failureKind)
    return null;
  const configuration = run.failureKind === 'model_configuration';
  if (status.retry && !configuration) {
    const time = new Date(status.retry.nextAt).toLocaleTimeString(
      getCurrentLocale(),
      { hour: '2-digit', minute: '2-digit' },
    );
    return (
      <p
        role='status'
        className='nr-health-alert flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm'
        data-analysis-retry=''
      >
        {$t('strategy.analysisRetryScheduled', {
          0: translateSystemError(status.retry.reason),
          1: time,
          2: status.retry.attempt,
        })}
      </p>
    );
  }
  const key = configuration
    ? 'strategy.analysisModelRequired'
    : run.failureKind === 'precondition'
      ? 'strategy.analysisPreconditionFailed'
      : run.failureKind === 'billing_unknown'
        ? 'strategy.analysisBillingRetryRequired'
        : run.failureKind === 'provider_unavailable'
          ? run.trigger === 'retry'
            ? 'strategy.analysisRetriesExhausted'
            : 'strategy.analysisProviderUnavailable'
          : 'strategy.analysisFailureUnknown';
  return (
    <p
      role='alert'
      className='nr-error nr-health-alert flex flex-wrap items-center gap-2'
      data-analysis-failed=''
    >
      <span>{$t(key, { 0: translateSystemError(run.error) })}</span>
      {configuration ? (
        canConfigure ? (
          <Button
            variant='outline'
            size='sm'
            render={<Link to='/agents/models' />}
            nativeButton={false}
          >
            {$t('strategy.configureAnalysisModel')}
          </Button>
        ) : (
          <span>{$t('strategy.analysisContactModelAdmin')}</span>
        )
      ) : (
        <Button variant='outline' size='sm' disabled={busy} onClick={onRun}>
          {$t('strategy.runAnalysisAgain')}
        </Button>
      )}
    </p>
  );
}
