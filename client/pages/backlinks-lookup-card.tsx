import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Loader2 } from 'lucide-react';
import { $t, $legacyText, useMessageState } from '#i18n';
import { formatDateTime, joinList } from '#lib/format';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { serviceUnavailable } from '#lib/transport-error';
import { Tag } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import { useBusinessAccess } from '#hooks/use-business-access';
import type { OnlineRun } from '../../shared/online-agent.js';
import {
  backlinksPath,
  type BacklinksLookupProposal,
  type BacklinksView,
} from '../../shared/backlinks.js';

type Run = {
  id: string | number;
  status: string;
  errorCode?: string | null;
  createdAt: string;
  completedAt?: string | null;
};
const call = <T,>(projectId: string, action: string, body: object = {}) =>
  api.action<T>('nrBacklinks', action, {
    method: 'POST',
    body: { projectId, ...body },
    unwrap: 'data',
  });
const requestKey = () => crypto.randomUUID().replace(/-/g, '');
const viewLabel = (view: BacklinksView) =>
  ({
    overview: $t('backlinks.profileTab'),
    links: $t('backlinks.backlinks'),
    domains: $t('backlinks.referringDomains'),
    pages: $t('backlinks.topPages'),
    broken: $t('backlinks.brokenPages'),
    gap: $t('backlinks.gapTab'),
  })[view];
const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;

/**
 * A backlinks lookup the online agent proposed (tool `backlinks`, when nothing was saved): the view, the target, a
 * gap's competitors, the estimated cost and this month's spending. Look up runs it through Search & market ›
 * Backlinks' own action under the user's permission and the budget; nothing is charged before that click. The card
 * reads whether the lookup is saved already, so a conversation opened again shows it done with a link to the page.
 */
export function BacklinksLookupCard({
  output,
}: {
  run: OnlineRun;
  output: unknown;
}) {
  const p = (output as { proposal: BacklinksLookupProposal }).proposal;
  const { projectId } = p;
  const { can } = useBusinessAccess('nrBacklinks.run', projectId);
  const query = {
    view: p.view,
    target: p.target,
    ...(p.competitors ? { competitors: p.competitors } : {}),
  };
  const [run, setRun] = useState<Run | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void call<{ run: Run | null }>(projectId, 'saved', query).then(
      (r) => alive.current && setRun(r?.run ?? null),
      () => alive.current && setRun(null),
    );
    return () => {
      alive.current = false;
    };
  }, [projectId]);
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await call<Run>(projectId, 'run', {
        ...query,
        requestKey: requestKey(),
      });
      if (alive.current) setRun(r);
    } catch (e) {
      if (!alive.current) return;
      const failure = e as { code?: string; message?: string };
      if (serviceUnavailable(e))
        setError(() => $t('common.serviceUnavailable'));
      else if (failure.code !== 'DEMO_READ_ONLY')
        setError(
          () =>
            $legacyText(failure.message || '') ||
            $t('common.lookupNotCompleteTryAgain'),
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const done = run?.status === 'completed';
  const state =
    run === undefined
      ? 'loading'
      : busy
        ? 'running'
        : done
          ? 'done'
          : run
            ? 'failed'
            : 'pending';
  return (
    <section
      className='flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground'
      aria-label={$t('backlinks.proposalTitle')}
      data-backlinks-lookup={state}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <h3 className='font-medium'>
          {$t('backlinks.proposalTitle')} · {viewLabel(p.view)}
        </h3>
        {done ? (
          <Tag tone='green' dot>
            {$t('keywordRun.done')}
          </Tag>
        ) : null}
      </div>
      <p>
        {p.target}
        {p.competitors?.length
          ? ` · ${$t('backlinks.proposalAgainst', { 0: joinList(p.competitors) })}`
          : ''}
      </p>
      <p className='text-xs text-muted-foreground' data-backlinks-lookup-cost>
        {$t('backlinks.proposalCost', {
          0: usd(p.estimatedUsd),
          1: p.monthUsd.toFixed(2),
          2: p.budgetUsd.toFixed(2),
        })}
      </p>
      {!p.withinBudget && state === 'pending' ? (
        <p className='nr-error' role='alert'>
          {$t('backlinks.proposalOverBudget')}
        </p>
      ) : null}
      {error && state === 'pending' ? (
        <p className='nr-error' role='alert'>
          {error}
        </p>
      ) : null}
      {state === 'running' ? (
        <p
          role='status'
          className='flex items-center gap-2 text-muted-foreground'
        >
          <Loader2 className='size-4 animate-spin' />
          {$t('common.querying')}
        </p>
      ) : state === 'done' || state === 'failed' ? (
        <p className='flex flex-wrap items-center justify-between gap-2'>
          <span className={done ? undefined : 'text-destructive'}>
            {done
              ? $t('backlinks.proposalDone', {
                  0: formatDateTime(run!.completedAt || run!.createdAt),
                })
              : $t('common.lookupNotComplete')}
          </span>
          <Link
            className='nr-link'
            to={backlinksPath(p.view, p.target, run!.id)}
          >
            {$t('common.view')}
          </Link>
        </p>
      ) : state === 'pending' && can && p.withinBudget ? (
        <div className='flex justify-end'>
          <Button size='sm' disabled={busy} onClick={() => void confirm()}>
            {$t('common.query')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
