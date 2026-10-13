import { useEffect, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router';
import { $t } from '#i18n';
import { RouteDrawer } from '#components/route-drawer';
import { Button } from '#components/ui/button';
import { nocobaseClient as api, NocoReachHttpError } from '#lib/nocoreach-api';
import { useProject } from '../reach-data.js';
import type { ResultDetail } from './types.js';
import { Comparison } from './comparison.js';
export default function ResultDetailPage() {
  const { project } = useProject(),
    { taskId } = useParams();
  return project && taskId ? (
    <Detail
      key={`${project.id}:${taskId}`}
      projectId={String(project.id)}
      taskId={taskId}
    />
  ) : null;
}
function Detail({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [data, setData] = useState<ResultDetail>(),
    [error, setError] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [params, setParams] = useSearchParams(),
    location = useLocation();
  useEffect(() => {
    let alive = true;
    void api
      .action<ResultDetail>('nrTaskWork', 'result', {
        method: 'POST',
        body: { projectId, taskId },
        unwrap: 'data',
      })
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
  }, [projectId, taskId, refresh]);
  const day =
      params.get('day') === '28'
        ? 28
        : params.get('day') === '7'
          ? 7
          : data?.results.at(-1)?.day || 7,
    result = data?.results.find((r) => r.day === day);
  return (
    <RouteDrawer
      title={
        data
          ? `${data.task.no ? `T-${data.task.no} · ` : ''}${data.task.title}`
          : $t('results.title')
      }
      description={$t('results.description')}
      className='sm:max-w-2xl'
    >
      <div className='flex flex-col gap-5'>
        {error && (
          <p role='alert'>
            {$t(data ? 'results.stale' : 'results.loadFailed')}
          </p>
        )}
        <Button variant='outline' onClick={() => setRefresh((n) => n + 1)}>
          {$t('results.refresh')}
        </Button>
        {data ? (
          <>
            <Link
              className='nr-link'
              to={`/actions/${taskId}?resultDay=${day}&resultQuery=${encodeURIComponent(location.search)}`}
            >
              {$t('results.originalTask')}
            </Link>
            {data.task.simulated && <p>{$t('results.simulated')}</p>}
            <p className='line-clamp-4 whitespace-pre-wrap text-sm'>
              {data.task.summary || $t('results.noSummary')}
            </p>
            <div className='flex flex-col gap-1 text-sm'>
              {data.pages.length
                ? data.pages.map((page) => (
                    <a
                      key={page}
                      href={page}
                      target='_blank'
                      rel='noreferrer'
                      className='nr-link break-all'
                    >
                      {page}
                    </a>
                  ))
                : $t('results.noPages')}
            </div>
            <p className='text-sm'>
              {$t('results.observeFrom', { 0: data.observeFrom || '—' })}
            </p>
            <nav className='flex gap-2' aria-label={$t('results.checkpoint')}>
              {[7, 28].map((d) => (
                <Button
                  key={d}
                  variant='outline'
                  aria-pressed={day === d}
                  className='aria-pressed:border-primary aria-pressed:bg-muted aria-pressed:text-primary'
                  onClick={() => {
                    const p = new URLSearchParams(params);
                    p.set('day', String(d));
                    setParams(p);
                  }}
                >
                  {$t('results.day', { 0: d })}
                </Button>
              ))}
            </nav>
            {result ? (
              <Comparison result={result} observeFrom={data.observeFrom} />
            ) : (
              <p>
                {$t(
                  data.observeFrom ? 'results.waiting' : 'results.unavailable',
                )}
                {data.observeFrom && (
                  <>
                    {' '}
                    {$t('results.expected', {
                      0: new Date(
                        Date.parse(
                          data.observeFrom.slice(0, 10) + 'T00:00:00Z',
                        ) +
                          (day + 3) * 86400000,
                      )
                        .toISOString()
                        .slice(0, 10),
                    })}
                  </>
                )}
              </p>
            )}
            <section className='flex flex-col gap-2'>
              <h3 className='font-semibold'>{$t('results.followUps')}</h3>
              {data.followUps.length ? (
                data.followUps.map((f) => (
                  <Link
                    key={`${f.kind}:${f.id}`}
                    className='nr-link'
                    to={
                      f.kind === 'task'
                        ? `/actions/${f.id}`
                        : `/opportunities?item=${f.id}`
                    }
                  >
                    {$t(
                      f.kind === 'task'
                        ? 'results.taskKind'
                        : 'results.opportunity',
                    )}{' '}
                    · {f.title}
                  </Link>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {$t('results.noFollowUps')}
                </p>
              )}
            </section>
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: 'create', search: location.search }} />
              }
            >
              {$t('results.create')}
            </Button>
            <Outlet context={{ data, projectId, day }} />
          </>
        ) : (
          !error && <p role='status'>{$t('common.loading')}</p>
        )}
      </div>
    </RouteDrawer>
  );
}
