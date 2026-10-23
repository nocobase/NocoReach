import { useEffect, useState } from 'react';
import { Segmented } from '#components/reach/segmented';
import { RefreshButton } from '#components/reach/refresh-button';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { $t } from '#i18n';
import { RouteDrawer } from '#components/route-drawer';
import { formatDate } from '#lib/format';
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
      {/* One text size: body text-sm, facts and notes in grey; the checkpoint switch and its refresh share a row
          (2026-10-23 user feedback: sizes differed, and Follow-ups with its full-width button made the flow too long). */}
      <div className='flex flex-col gap-5 text-sm'>
        {error && (
          <p role='alert'>
            {$t(data ? 'results.stale' : 'results.loadFailed')}
          </p>
        )}
        {data ? (
          <>
            <p className='line-clamp-4 whitespace-pre-wrap'>
              {data.task.summary || $t('results.noSummary')}
            </p>
            <div className='flex flex-col gap-1'>
              {data.pages.length ? (
                data.pages.map((page) => (
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
              ) : (
                <span className='text-muted-foreground'>
                  {$t('results.noPages')}
                </span>
              )}
              <span className='text-muted-foreground'>
                {$t('results.observeFrom', {
                  0: data.observeFrom ? formatDate(data.observeFrom) : '—',
                })}
                {data.task.simulated ? ` · ${$t('results.simulated')}` : ''}
              </span>
              <Link
                className='nr-link self-start'
                to={`/actions/${taskId}?resultDay=${day}&resultQuery=${encodeURIComponent(location.search)}`}
              >
                {$t('results.originalTask')}
              </Link>
            </div>
            <div className='flex items-center gap-3'>
              <Segmented
                label={$t('results.checkpoint')}
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
              <RefreshButton
                className='ml-auto'
                busy={loading}
                label={$t('results.refresh')}
                onClick={() => setRefresh((n) => n + 1)}
              />
            </div>
            {result ? (
              <Comparison result={result} observeFrom={data.observeFrom} />
            ) : (
              <p className='text-muted-foreground'>
                {$t(
                  data.observeFrom ? 'results.waiting' : 'results.unavailable',
                )}
                {data.observeFrom && (
                  <>
                    {' '}
                    {$t('results.expected', {
                      0: formatDate(
                        new Date(
                          Date.parse(
                            data.observeFrom.slice(0, 10) + 'T00:00:00Z',
                          ) +
                            (day + 3) * 86400000,
                        ).toISOString(),
                      ),
                    })}
                  </>
                )}
              </p>
            )}
          </>
        ) : (
          !error && <p role='status'>{$t('common.loading')}</p>
        )}
      </div>
    </RouteDrawer>
  );
}
