import { useEffect, useState } from 'react';
import { Segmented } from '#components/reach/segmented';
import { RefreshButton } from '#components/reach/refresh-button';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { ExternalLinkIcon } from 'lucide-react';
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
// A delivered article's summary is its Markdown; the drawer shows it as plain sentences, without heading, quote or
// list markers and blank lines.
const plainSummary = (text: string) =>
  text
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/, '')
        .replace(/[*_`]{1,3}([^*_`]+)[*_`]{1,3}/g, '$1')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
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
      {/* Facts first, then what changed, then what was done (2026-10-23/24 user feedback: one size of text, and not a
          paragraph dropped into the drawer). Labels as in an opportunity's drawer: small grey above or beside. */}
      <div className='flex flex-col gap-6 text-sm'>
        {error && (
          <p role='alert'>
            {$t(data ? 'results.stale' : 'results.loadFailed')}
          </p>
        )}
        {data ? (
          <>
            <dl className='grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2'>
              <dt className='text-muted-foreground'>
                {$t('results.board.status')}
              </dt>
              <dd>
                {[
                  $t(`results.taskState.${data.task.state}`),
                  data.task.archived ? $t('results.archived') : '',
                  data.task.simulated ? $t('results.simulated') : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </dd>
              {data.observeFrom && (
                <>
                  <dt className='text-muted-foreground'>
                    {$t('results.board.wentLive')}
                  </dt>
                  <dd>{formatDate(data.observeFrom)}</dd>
                </>
              )}
              <dt className='text-muted-foreground'>
                {$t('results.pagesLabel')}
              </dt>
              <dd className='flex min-w-0 flex-col gap-0.5'>
                {data.pages.length
                  ? data.pages.map((page) => (
                      <a
                        key={page}
                        href={page}
                        target='_blank'
                        rel='noreferrer'
                        className='nr-link inline-flex min-w-0 items-center gap-1'
                      >
                        <span className='truncate'>
                          {page.replace(/^https?:\/\//, '')}
                        </span>
                        <ExternalLinkIcon
                          aria-hidden='true'
                          className='size-3.5 shrink-0'
                        />
                      </a>
                    ))
                  : $t('results.noPages')}
              </dd>
              <dt className='text-muted-foreground'>{$t('results.task')}</dt>
              <dd>
                <Link
                  className='nr-link'
                  to={`/actions/${taskId}?resultDay=${day}&resultQuery=${encodeURIComponent(location.search)}`}
                >
                  {$t('results.originalTask')}
                </Link>
              </dd>
            </dl>
            <section className='flex flex-col gap-2'>
              <div className='flex items-center gap-3'>
                <h3 className='text-xs font-medium text-muted-foreground'>
                  {$t('results.change')}
                </h3>
                <Segmented
                  label={$t('results.checkpoint')}
                  className='ml-auto'
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
                  busy={loading}
                  label={$t('results.refresh')}
                  onClick={() => setRefresh((n) => n + 1)}
                />
              </div>
              {result ? (
                <Comparison result={result} observeFrom={data.observeFrom} />
              ) : (
                <p className='rounded-lg bg-muted/50 px-3 py-2.5 text-muted-foreground'>
                  {$t(
                    data.observeFrom
                      ? 'results.waiting'
                      : 'results.unavailable',
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
            </section>
            <section className='flex flex-col gap-1.5'>
              <h3 className='text-xs font-medium text-muted-foreground'>
                {$t('results.whatWasDone')}
              </h3>
              <p className='line-clamp-6 leading-relaxed whitespace-pre-wrap'>
                {plainSummary(data.task.summary) || $t('results.noSummary')}
              </p>
            </section>
          </>
        ) : (
          !error && <p role='status'>{$t('common.loading')}</p>
        )}
      </div>
    </RouteDrawer>
  );
}
