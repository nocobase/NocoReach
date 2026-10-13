import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { $t, getCurrentLocale } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Tag } from '#components/reach/tag';
import { nocobaseClient as api, NocoReachHttpError } from '#lib/nocoreach-api';
import { useProject } from '../reach-data.js';
import { PrimaryComparison } from './comparison.js';
import { resultStatus } from './format.js';
import type { ResultSummary } from './types.js';

export default function ResultsPage() {
  const { project } = useProject();
  return project ? (
    <ResultsList key={project.id} projectId={String(project.id)} />
  ) : null;
}
function ResultsList({ projectId }: { projectId: string }) {
  const [params, setParams] = useSearchParams(),
    location = useLocation();
  const [data, setData] = useState<{ items: ResultSummary[]; total: number }>(),
    [error, setError] = useState(false),
    [refresh, setRefresh] = useState(0),
    [query, setQuery] = useState(params.get('q') || '');
  const page = Number(params.get('page')) || 1,
    q = params.get('q') || '',
    status = params.get('status') || '',
    from = params.get('from') || '',
    to = params.get('to') || '';
  useEffect(() => {
    let alive = true;
    void api
      .action<{ items: ResultSummary[]; total: number }>(
        'nrTaskWork',
        'results',
        {
          method: 'POST',
          body: {
            projectId,
            page,
            q,
            ...(status ? { status } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          },
          unwrap: 'data',
        },
      )
      .then((next) => {
        if (alive) {
          setData(next);
          setError(false);
        }
      })
      .catch((failure: unknown) => {
        if (alive) {
          if (
            failure instanceof NocoReachHttpError &&
            [401, 403, 404].includes(failure.status)
          )
            setData(undefined);
          setError(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [projectId, page, q, status, from, to, refresh]);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  return (
    <PageContainer className='nr-page'>
      <PageHeader
        title={$t('results.title')}
        description={$t('results.description')}
        actions={
          <Button variant='outline' onClick={() => setRefresh((n) => n + 1)}>
            {$t('results.refresh')}
          </Button>
        }
      />
      <form
        className='flex flex-wrap items-end gap-2'
        onSubmit={(e) => {
          e.preventDefault();
          change('q', query);
        }}
      >
        <Input
          className='w-64'
          aria-label={$t('results.search')}
          placeholder={$t('results.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant='outline' type='submit'>
          {$t('results.searchButton')}
        </Button>
        <label className='flex flex-col gap-1 text-xs'>
          {$t('results.statusLabel')}
          <select
            className='h-9 rounded-md border bg-background px-2'
            value={status}
            onChange={(e) => change('status', e.target.value)}
          >
            <option value=''>{$t('results.all')}</option>
            {[
              'up',
              'down',
              'flat',
              'waiting',
              'insufficient',
              'unavailable',
            ].map((s) => (
              <option key={s} value={s}>
                {resultStatus(s)}
              </option>
            ))}
          </select>
        </label>
        {(['from', 'to'] as const).map((k) => (
          <label key={k} className='flex flex-col gap-1 text-xs'>
            {$t(`results.${k}`)}
            <Input
              type='date'
              value={k === 'from' ? from : to}
              onChange={(e) => change(k, e.target.value)}
            />
          </label>
        ))}
        {(q || status || from || to) && (
          <Button
            variant='ghost'
            onClick={() => {
              setParams({});
              setQuery('');
            }}
          >
            {$t('results.clear')}
          </Button>
        )}
      </form>
      {error && (
        <p role='alert'>{$t(data ? 'results.stale' : 'results.loadFailed')}</p>
      )}
      {!data && !error ? (
        <p role='status'>{$t('common.loading')}</p>
      ) : data && !data.items.length ? (
        <p>
          {$t(
            q || status || from || to ? 'results.noMatches' : 'results.empty',
          )}
        </p>
      ) : (
        data && (
          <>
            <div className='overflow-x-auto rounded-lg border'>
              <table className='w-full min-w-[50rem] text-sm [&_th]:px-4 [&_td]:px-4 [&_th]:py-3 [&_td]:py-3 [&_th]:text-left [&_th]:font-medium [&_tbody_tr]:border-t'>
                <thead>
                  <tr>
                    <th>{$t('results.change')}</th>
                    <th>{$t('results.task')}</th>
                    <th>{$t('results.windowsLabel')}</th>
                    <th>{$t('results.occurred')}</th>
                    <th>{$t('results.statusLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.taskId}>
                      <td>
                        {item.latest ? (
                          <PrimaryComparison result={item.latest} />
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td>
                        <Link
                          className='nr-link'
                          to={{
                            pathname: item.taskId,
                            search: location.search,
                          }}
                        >
                          {item.taskNo ? `T-${item.taskNo} · ` : ''}
                          {item.title}
                        </Link>
                        <p className='text-xs text-muted-foreground'>
                          {$t(`results.taskState.${item.taskState}`)}
                          {item.closed ? ` · ${$t('common.closed')}` : ''}
                          {item.simulated
                            ? ` · ${$t('results.simulated')}`
                            : ''}
                        </p>
                      </td>
                      <td className='text-xs'>
                        {item.latest ? (
                          <>
                            <b>{$t('results.day', { 0: item.latest.day })}</b>
                            <p>
                              {item.latest.baseline.start} –{' '}
                              {item.latest.baseline.end}
                            </p>
                            <p>
                              {item.latest.after.start} –{' '}
                              {item.latest.after.end}
                            </p>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {item.occurredAt
                          ? new Date(item.occurredAt).toLocaleDateString(
                              getCurrentLocale(),
                            )
                          : $t('results.timeUnknown')}
                      </td>
                      <td>
                        <Tag tone='grey'>{resultStatus(item.status)}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className='flex items-center justify-end gap-3'>
              <span className='text-sm'>
                {$t('results.total', { 0: data.total })}
              </span>
              <Button
                variant='outline'
                disabled={page <= 1}
                onClick={() => {
                  const p = new URLSearchParams(params);
                  p.set('page', String(page - 1));
                  setParams(p);
                }}
              >
                {$t('results.previous')}
              </Button>
              <Button
                variant='outline'
                disabled={page * 20 >= data.total}
                onClick={() => {
                  const p = new URLSearchParams(params);
                  p.set('page', String(page + 1));
                  setParams(p);
                }}
              >
                {$t('results.next')}
              </Button>
            </div>
          </>
        )
      )}
      <Outlet />
    </PageContainer>
  );
}
