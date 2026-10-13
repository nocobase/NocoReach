import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { $t } from '#i18n';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { refreshNavBadges } from '#components/app-shell/nav-badges';
import { useUnsavedWarning } from '../reach-data.js';
import type { ResultDetail } from './types.js';
import { Comparison } from './comparison.js';
type Context = { data: ResultDetail; projectId: string; day: number };
export default function CreateFollowUp() {
  const context = useOutletContext<Context>(),
    dirtyRef = useRef(false),
    pendingRef = useRef(false);
  return (
    <RouteDialog
      title={$t('results.create')}
      description={$t('results.notStarted')}
      beforeClose={() =>
        !pendingRef.current &&
        (!dirtyRef.current || window.confirm($t('results.dirty')))
      }
    >
      <Form context={context} dirtyRef={dirtyRef} pendingRef={pendingRef} />
    </RouteDialog>
  );
}
function Form({
  context,
  dirtyRef,
  pendingRef,
}: {
  context: Context;
  dirtyRef: React.RefObject<boolean>;
  pendingRef: React.RefObject<boolean>;
}) {
  const { projectId, day } = context,
    navigate = useNavigate(),
    overlay = useRouteOverlay();
  const [kind, setKind] = useState<'opportunity' | 'task'>('opportunity'),
    [values, setValues] = useState<Record<string, string>>({
      priority: 'medium',
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [isDirty, setIsDirty] = useState(false);
  const submissionRef = useRef<{ key: string; body: object } | undefined>(
    undefined,
  );
  const [freshData, setFreshData] = useState<ResultDetail>();
  const data = freshData || context.data;
  const aliveRef = useRef(true);
  useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );
  useUnsavedWarning(isDirty);
  const result = data.results.find((r) => r.day === day),
    node = data.observeFrom ? day : null;
  const keys =
    kind === 'task'
      ? ['title', 'objective', 'brief']
      : [
          'title',
          'observation',
          'meaning',
          'evidenceText',
          'limitation',
          'suggestion',
          'objective',
        ];
  const labels: Record<string, string> = {
    title: 'results.titleField',
    objective: 'results.objective',
    brief: 'results.brief',
    observation: 'results.observation',
    meaning: 'results.meaning',
    evidenceText: 'results.evidence',
    limitation: 'results.limitation',
    suggestion: 'results.suggestion',
  };
  const limits: Record<string, number> = {
    title: 200,
    objective: 1000,
    brief: 20000,
    observation: 2000,
    meaning: 2000,
    evidenceText: 3000,
    limitation: 2000,
    suggestion: 3000,
  };
  const edit = (key: string, value: string) => {
    setValues((old) => ({ ...old, [key]: value }));
    dirtyRef.current = true;
    setIsDirty(true);
  };
  async function submit() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError(false);
    const body = {
      projectId,
      revision: data.strategyRevision,
      kind,
      source: {
        taskId: data.task.id,
        taskRevision: data.taskRevision,
        day: node,
        computedAt: node ? result?.computedAt || null : null,
      },
      fields:
        kind === 'task'
          ? Object.fromEntries(keys.map((key) => [key, values[key] || '']))
          : {
              ...Object.fromEntries(
                keys.map((key) => [key, values[key] || '']),
              ),
              priority: values.priority,
              source: 'mixed',
              category: 'unclassified',
              confidence: 'verify',
              effort: 'unknown',
            },
    };
    const key = JSON.stringify(body);
    if (submissionRef.current?.key !== key)
      submissionRef.current = {
        key,
        body: { ...body, requestId: crypto.randomUUID() },
      };
    try {
      const created = await api.action<{ kind: string; id: string }>(
        'nrStrategy',
        'createFromResult',
        { method: 'POST', body: submissionRef.current.body, unwrap: 'data' },
      );
      if (!aliveRef.current) return;
      dirtyRef.current = false;
      setIsDirty(false);
      refreshNavBadges();
      void navigate(
        created.kind === 'task'
          ? `/actions/${created.id}`
          : `/opportunities?item=${created.id}`,
      );
    } catch {
      setError(true);
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className='flex flex-col gap-4'
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className='rounded-lg border p-3 text-sm'>
        <b>
          {data.task.title} ·{' '}
          {node ? $t('results.day', { 0: node }) : $t('results.noSnapshot')}
        </b>
        {result ? (
          <details>
            <summary>{$t('results.evidence')}</summary>
            <Comparison result={result} observeFrom={data.observeFrom} />
          </details>
        ) : (
          <p>{$t('results.noSnapshot')}</p>
        )}
      </div>
      <label className='flex flex-col gap-1 text-sm'>
        {$t('results.kind')}
        <select
          aria-label={$t('results.kind')}
          className='h-9 rounded-md border bg-background px-2'
          value={kind}
          disabled={busy}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            dirtyRef.current = true;
            setIsDirty(true);
          }}
        >
          <option value='opportunity'>{$t('results.opportunity')}</option>
          <option value='task'>{$t('results.taskKind')}</option>
        </select>
      </label>
      {keys.map((key) => (
        <label key={key} className='flex flex-col gap-1 text-sm'>
          {$t(labels[key])}
          {key === 'title' || key === 'objective' ? (
            <Input
              required
              maxLength={limits[key]}
              disabled={busy}
              value={values[key] || ''}
              onChange={(e) => edit(key, e.target.value)}
            />
          ) : (
            <textarea
              className='rounded-md border bg-background p-2'
              rows={3}
              required
              maxLength={limits[key]}
              disabled={busy}
              value={values[key] || ''}
              onChange={(e) => edit(key, e.target.value)}
            />
          )}
        </label>
      ))}
      {kind === 'opportunity' && (
        <label className='flex flex-col gap-1 text-sm'>
          {$t('results.priority')}
          <select
            aria-label={$t('results.priority')}
            className='h-9 rounded-md border bg-background px-2'
            value={values.priority}
            disabled={busy}
            onChange={(e) => edit('priority', e.target.value)}
          >
            {['high', 'medium', 'low', 'unrated'].map((p) => (
              <option key={p} value={p}>
                {$t(`results.priority.${p}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <>
          <p role='alert'>{$t('results.createFailed')}</p>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void api
                .action<ResultDetail>('nrTaskWork', 'result', {
                  method: 'POST',
                  body: { projectId, taskId: data.task.id },
                  unwrap: 'data',
                })
                .then((next) => {
                  if (aliveRef.current) {
                    setFreshData(next);
                    setError(false);
                  }
                })
                .catch(() => {
                  if (aliveRef.current) setError(true);
                })
                .finally(() => {
                  if (aliveRef.current) setBusy(false);
                });
            }}
          >
            {$t('results.refresh')}
          </Button>
        </>
      )}
      <p className='text-xs text-muted-foreground'>
        {$t('results.description')}
      </p>
      <div className='flex justify-end gap-2'>
        <Button
          variant='outline'
          disabled={busy}
          onClick={() => void overlay.close()}
        >
          {$t('results.cancel')}
        </Button>
        <Button type='submit' disabled={busy}>
          {$t(
            kind === 'task'
              ? 'results.confirmTask'
              : 'results.confirmOpportunity',
          )}
        </Button>
      </div>
    </form>
  );
}
