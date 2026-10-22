import { useEffect, useState } from 'react';
import { Segmented } from '#components/reach/segmented';
import { RefreshButton } from '#components/reach/refresh-button';
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
const withoutDay = (search: string) => {
  const params = new URLSearchParams(search);
  params.delete('day');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
};
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
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true);
  const [params, setParams] = useSearchParams(),
    location = useLocation();
  useEffect(() => {
    let alive = true;
    setLoading(true);
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
          setLoading(false);
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
          setLoading(false);
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
      // The checkpoint (`day`) belongs to the drawer: closing returns to the view exactly as it was opened (I9).
      closeTo={{ pathname: '..', search: withoutDay(location.search) }}
      title={
        data
          ? `${data.task.no ? `T-${data.task.no} · ` : ''}${data.task.title}`
          : $t('results.title')
      }
      description={$t('results.description')}
      className='sm:max-w-2xl'
    >
      <div className='flex flex-col gap-5'>
        <div className='flex items-start gap-3'>
          {error && (
            <p role='alert' className='flex-1'>
              {$t(data ? 'results.stale' : 'results.loadFailed')}
            </p>
          )}
          <RefreshButton
            className='ml-auto'
            busy={loading}
            label={$t('results.refresh')}
            onClick={() => setRefresh((n) => n + 1)}
          />
        </div>
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
            <Segmented
              label={$t('results.checkpoint')}
              className='self-start'
              options={[7, 28].map((d) => ({
                id: String(d),
                label: $t('results.day', { 0: d }),
              }))}
              value={String(day)}
              onChange={(d) => {
                const p = new URLSearchParams(params);
                p.set('day', d);
                setParams(p);
              }}
            />
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
