import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Loader2 } from 'lucide-react';
import { $t, $legacyText, getCurrentLocale, useMessageState } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { cn } from '#lib/utils';
import { Tag } from '#components/reach/tag';
import { chipClass } from '#components/reach/chip';
import { Button } from '#components/ui/button';
import { useBusinessAccess } from '#hooks/use-business-access';
import {
  notifyPageChange,
  usePageChange,
} from '../online-agent/page-changes.js';
import type { OnlineRun } from '../../shared/online-agent.js';
import type { KeywordRunProposal } from '../../shared/keyword-run.js';
import { marketLabel, usdUpTo } from './keyword-api';

type View = {
  at?: string;
  market: KeywordRunProposal['market'];
  seeds: string[];
  stats?: { found: number; picked: number };
  items: unknown[];
  digs: {
    id: string;
    direction: string;
    name?: string | null;
    seeds: string[];
    at: string;
    items: unknown[];
  }[];
  running: { stage: string; mode: string } | null;
  lastError?: { message: string } | null;
};
const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));
const directionKey = (v: string | null | undefined) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const call = <T,>(projectId: string, action: string, body: object = {}) =>
  api.action<T>('nrKeywordSuggest', action, {
    method: 'POST',
    body: { projectId, ...body },
    unwrap: 'data',
  });

/** Whether the list already reads as the proposal would leave it: its seeds and market, or its dug group. */
function doneIn(p: KeywordRunProposal, view: View) {
  if (p.kind === 'dig')
    // A dig in a direction already dug lands in that group, whose seeds then include these.
    return view.digs.find(
      (d) =>
        directionKey(d.direction) === directionKey(p.direction) &&
        p.after.every((seed) => d.seeds.includes(seed)) &&
        d.at > (p.revision ?? ''),
    );
  return view.at !== p.revision &&
    same(view.seeds, p.after) &&
    view.market.locationCode === p.market.locationCode &&
    view.market.language === p.market.language
    ? { id: '' }
    : undefined;
}

/**
 * A keyword lookup the AI proposed in the chat (`propose_keyword_run`): the seed words before and after, the market,
 * why the AI chose new ones, and the most it may cost with this month's spending. Confirm runs it through the page's
 * own action (suggest for the list, dig for a group) against the current budget; the card then follows the run and
 * Keywords › AI suggestions reads itself again. Its state comes from the list as it is now: waiting while the list is
 * the one it was proposed on, done once the list reads as proposed, out of date otherwise.
 */
export function KeywordRunCard({
  output,
}: {
  run: OnlineRun;
  output: unknown;
}) {
  const p = (output as { proposal: KeywordRunProposal }).proposal;
  const { projectId } = p;
  const { can } = useBusinessAccess(
    `nrKeywordSuggest.${p.kind === 'dig' ? 'dig' : 'suggest'}`,
    projectId,
  );
  const [view, setView] = useState<View>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useMessageState(''),
    [version, setVersion] = useState(0);
  const aliveRef = useRef(true),
    followingRef = useRef(false);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    call<View>(projectId, 'view').then(
      (next) => {
        if (live) setView(next);
      },
      // Without the list the card still shows the proposal.
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [projectId, version]);
  const reload = () => setVersion((v) => v + 1);
  usePageChange('keywords', projectId, reload);
  // A run goes on in the background: follow it; once the one confirmed here ends, the page reads itself again and a
  // failure is said here.
  useEffect(() => {
    if (!view) return;
    if (view.running) {
      const timer = setTimeout(reload, 3000);
      return () => clearTimeout(timer);
    }
    if (!followingRef.current) return;
    followingRef.current = false;
    notifyPageChange('keywords', projectId);
    if (!doneIn(p, view) && view.lastError?.message)
      setError(() => $legacyText(view.lastError!.message));
  }, [view, projectId, p]);
  const found = view ? doneIn(p, view) : undefined;
  const state = !view
    ? undefined
    : busy || view.running
      ? 'running'
      : found
        ? 'done'
        : view.at !== p.revision
          ? 'outdated'
          : 'pending';
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const next = await call<View>(
        projectId,
        p.kind === 'dig' ? 'dig' : 'suggest',
        {
          seeds: p.after,
          notes: p.notes,
          by: p.by,
          ...(p.restore?.length ? { restore: p.restore } : {}),
          ...(p.kind === 'dig'
            ? { direction: p.direction, name: p.name }
            : { market: p.market }),
        },
      );
      if (!aliveRef.current) return;
      followingRef.current = true;
      setView(next);
      notifyPageChange('keywords', projectId);
    } catch (e) {
      if (!aliveRef.current) return;
      const failure = e as { code?: string; message?: string };
      // Demo Mode explains its refusal in its own toast.
      if (failure.code !== 'DEMO_READ_ONLY')
        setError(
          () =>
            $legacyText(failure.message || '') ||
            $t('keywordSuggestions.notCompleteTryAgain'),
        );
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };
  const chips = (list: string[], mark: string[], marked: string) => (
    <ul className='flex flex-wrap gap-1.5'>
      {list.map((seed) => (
        <li key={seed} className={cn(chipClass, mark.includes(seed) && marked)}>
          {seed}
        </li>
      ))}
    </ul>
  );
  const why = p.by === 'ai' ? p.notes.filter((n) => n.why) : [];
  const kept = p.after.filter((seed) => !p.added.includes(seed));
  const dug =
    p.kind === 'dig' ? view?.digs.find((d) => d.id === found?.id) : undefined;
  const groupLink = dug
    ? `/keywords?tab=suggest&group=${dug.id}`
    : '/keywords?tab=suggest';
  return (
    <section
      className='flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground'
      aria-label={$t('keywordRun.proposal')}
      data-keyword-run={state ?? 'loading'}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <h3 className='font-medium'>
          {p.kind === 'dig'
            ? $t('keywordSuggestions.digTab', {
                0: p.mergesInto?.name ?? p.name ?? p.direction ?? '',
              })
            : $t('keywordRun.findAgain')}
        </h3>
        <Tag tone='grey'>{$t(marketLabel(p.market))}</Tag>
        {state === 'done' ? (
          <Tag tone='green' dot>
            {$t('keywordRun.done')}
          </Tag>
        ) : state === 'outdated' ? (
          <Tag tone='slate' dot>
            {$t('keywordRun.outdated')}
          </Tag>
        ) : null}
      </div>
      {p.kind === 'list' && !p.same && !p.marketChanged ? (
        // The change at a glance: what is added and removed, and the rest in one line, so a 15-seed list stays short.
        <dl className='grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2'>
          {p.added.length ? (
            <>
              <dt className='pt-0.5 text-muted-foreground'>
                {$t('keywordRun.added')}
              </dt>
              <dd>
                {chips(
                  p.added,
                  p.added,
                  'border-primary/40 bg-primary/10 text-primary',
                )}
              </dd>
            </>
          ) : null}
          {p.removed.length ? (
            <>
              <dt className='pt-0.5 text-muted-foreground'>
                {$t('keywordRun.removed')}
              </dt>
              <dd>
                {chips(
                  p.removed,
                  p.removed,
                  'text-muted-foreground line-through',
                )}
              </dd>
            </>
          ) : null}
          {kept.length ? (
            <>
              <dt className='text-muted-foreground'>{$t('keywordRun.kept')}</dt>
              <dd className='text-xs leading-5 text-muted-foreground'>
                {kept.join(getCurrentLocale().startsWith('zh') ? '、' : ', ')}
              </dd>
            </>
          ) : null}
        </dl>
      ) : (
        chips(p.after, [], '')
      )}
      {p.mergesInto ? (
        <p className='text-muted-foreground'>
          {$t('keywordRun.mergeInto', { 0: p.mergesInto.name })}
        </p>
      ) : null}
      {p.restore?.length ? (
        <p className='text-muted-foreground'>
          {$t('keywordRun.restore', {
            0: p.restore.join(
              getCurrentLocale().startsWith('zh') ? '、' : ', ',
            ),
          })}
        </p>
      ) : null}
      {p.same ? (
        <p className='text-muted-foreground'>{$t('keywordRun.same')}</p>
      ) : null}
      {why.length ? (
        <ul className='flex flex-col gap-1 text-xs text-muted-foreground'>
          {why.map((n) => (
            <li key={n.seed}>
              <span className='text-foreground'>{n.seed}</span>
              {$t('keywordRun.because', { 0: n.why })}
            </li>
          ))}
        </ul>
      ) : null}
      <p className='text-xs text-muted-foreground' data-keyword-run-cost>
        {$t('keywordSuggestions.seedsCost', { 0: usdUpTo(p.maxUsd) })}
        {p.reused ? $t('keywordSuggestions.seedsReused', { 0: p.reused }) : ''}
        {' · '}
        {$t('keywordSuggestions.seedsMonth', {
          0: p.monthUsd.toFixed(2),
          1: p.budgetUsd.toFixed(2),
        })}
      </p>
      {!p.withinBudget && state === 'pending' ? (
        <p className='nr-error' role='alert'>
          {$t('keywordSuggest.budgetTooLow', {
            0: Math.max(0, p.budgetUsd - p.monthUsd).toFixed(2),
            1: usdUpTo(p.maxUsd),
          })}
        </p>
      ) : null}
      {error ? (
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
          {view?.running
            ? $t(`keywordSuggestions.stage.${view.running.stage}`)
            : $t('keywordSuggestions.stage.seeds')}
        </p>
      ) : state === 'done' ? (
        <p className='flex flex-wrap items-center justify-between gap-2'>
          <span>
            {p.kind === 'dig'
              ? $t('keywordRun.dug', { 0: dug?.items.length ?? 0 })
              : $t('keywordRun.found', {
                  0: view?.stats?.found ?? 0,
                  1: view?.items.length ?? 0,
                })}
          </span>
          <Link className='nr-link' to={groupLink}>
            {$t('common.view')}
          </Link>
        </p>
      ) : state === 'pending' && can && p.withinBudget ? (
        <div className='flex justify-end'>
          <Button size='sm' disabled={busy} onClick={() => void confirm()}>
            {$t('keywordRun.confirm')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
