import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { FileText, History } from 'lucide-react';
import { $t, $tj } from '#i18n';
import {
  PageContainer,
  PageHeader,
  SectionHeading,
} from '#components/reach/page';
import { EmptyState, ListSkeleton, LoadError } from '#components/reach/states';
import { SourceLogo } from '#components/reach/source-logo';
import { Tag } from '#components/reach/tag';
import { DataTableTabs } from '#components/seo/data-table-toolbar';
import { Button } from '#components/ui/button';
import { TabsTrigger } from '#components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  formatChangeSize,
  formatCount,
  formatDate,
  formatDateTime,
  formatMonth,
  joinList,
} from '#lib/format';
import { useProject } from '../reach-data.js';
import {
  errorText,
  logoOf,
  madeList,
  outputLabel,
  recordState,
  taskNo,
  workshopRequest,
  type Article,
  type WorkshopRecord,
  type WorkshopView,
} from './model.js';

/** What the dialogs under this page read from it: the view it loaded, and a way to load it again after a change. */
export type WorkshopOutlet = { view?: WorkshopView; reload: () => void };

type Filter = 'all' | 'review' | 'doing' | 'done';

// Content workshop (mockup v3, 2026-11-12): recommendations picked by the site's own figures in two columns (recently
// strong, earlier traffic), then the adaptation records. Each recommendation says its figures, not an AI's opinion;
// its Adapt opens step 2 of Pick content with the article chosen.
export default function WorkshopPage() {
  const { project } = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = project ? String(project.id) : '';
  const [state, setState] = useState<{
    projectId: string;
    view?: WorkshopView;
    error?: string;
  }>();
  const [count, setCount] = useState(0);
  const reload = useCallback(() => setCount((n) => n + 1), []);
  // Loaded again whenever the page comes back from one of its dialogs, so a new task shows in the records at once.
  const atPage = /\/workshop\/?$/.test(location.pathname);
  const back = atPage ? location.key : 'dialog';
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    void workshopRequest<WorkshopView>('view', projectId).then(
      (view) => alive && setState({ projectId, view }),
      (e: unknown) =>
        alive &&
        setState((s) => ({
          projectId,
          view: s?.projectId === projectId ? s.view : undefined,
          error: errorText(e, $t('workshop.loadFailed')),
        })),
    );
    return () => {
      alive = false;
    };
  }, [projectId, back, count]);
  const view = state?.projectId === projectId ? state.view : undefined;
  const error = state?.projectId === projectId ? state.error : undefined;
  return (
    <PageContainer>
      <PageHeader
        title={$t('workshop.title')}
        description={$t('workshop.description')}
        actions={
          <>
            <Button variant='outline' onClick={() => void navigate('brand')}>
              {$t('workshop.brandKit')}
            </Button>
            <Button onClick={() => void navigate('new')}>
              {$t('workshop.pick')}
            </Button>
          </>
        }
      />
      {error && !view ? (
        <LoadError
          title={$t('workshop.loadFailed')}
          message={error}
          onRetry={reload}
        />
      ) : !view ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <Recommendations view={view} />
          <Records view={view} />
        </>
      )}
      <Outlet context={{ view, reload } satisfies WorkshopOutlet} />
    </PageContainer>
  );
}

function Recommendations({ view }: { view: WorkshopView }) {
  const navigate = useNavigate();
  const adapt = (a: Article) =>
    void navigate({
      pathname: 'new',
      search: `?${new URLSearchParams({ url: a.url, title: a.title })}`,
    });
  const notes = [
    $t('workshop.recommendedInfo'),
    view.dataThrough
      ? $t('workshop.dataThrough', { 0: formatDate(view.dataThrough) })
      : $t('workshop.noSearchData'),
  ];
  return (
    <section className='space-y-3' aria-labelledby='workshop-recommended'>
      <SectionHeading
        id='workshop-recommended'
        title={$t('workshop.recommended')}
        description={
          <span className='flex flex-col gap-1'>
            {notes.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        }
      />
      {!view.articles.length ? (
        <EmptyState
          icon={<FileText />}
          title={$t('workshop.noArticles')}
          description={$t('workshop.noArticlesHint')}
          action={
            <Button
              variant='outline'
              onClick={() => void navigate('/connections?source=site')}
            >
              {$t('common.connectWebsiteContent')}
            </Button>
          }
        />
      ) : (
        <div className='grid gap-3 lg:grid-cols-2'>
          <Column
            title={$t('workshop.recent')}
            criteria={$t('workshop.recentCriteria')}
            rows={view.recent}
            empty={$t('workshop.recentEmpty')}
            line={(a) => recentLine(a, view.searchConnected)}
            onAdapt={adapt}
          />
          <Column
            title={$t('workshop.earlier')}
            criteria={$t('workshop.earlierCriteria')}
            rows={view.earlier}
            empty={
              !view.searchConnected
                ? $t('workshop.earlierNeedsSearch')
                : view.articles.some((a) => a.made.length && a.clicks12m > 0)
                  ? $t('workshop.earlierEmpty')
                  : $t('workshop.earlierNone')
            }
            line={earlierLine}
            onAdapt={adapt}
          />
        </div>
      )}
    </section>
  );
}

const strong = (v: ReactNode) => (
  <b className='font-semibold text-foreground tabular-nums'>{v}</b>
);

// "11-04 published · 860 clicks in the last 7 days, +240% on the 7 days before · cited in 3 AI answers"
function recentLine(a: Article, searchConnected: boolean): ReactNode[] {
  const parts: ReactNode[] = [];
  if (a.published)
    parts.push($t('workshop.publishedOn', { 0: formatDate(a.published) }));
  if (searchConnected)
    parts.push(
      a.previous7 > 0
        ? $tj('workshop.clicks7Change', {
            0: strong(formatCount(a.clicks7)),
            1: strong(
              `${a.clicks7 >= a.previous7 ? '+' : '−'}${formatChangeSize((a.clicks7 - a.previous7) / a.previous7)}`,
            ),
          })
        : $tj('workshop.clicks7', { 0: strong(formatCount(a.clicks7)) }),
    );
  if (a.cited) parts.push($tj('workshop.cited', { 0: strong(a.cited) }));
  return parts;
}

// "2025-06 published · 18,600 clicks in the past 12 months"
function earlierLine(a: Article): ReactNode[] {
  return [
    ...(a.published
      ? [$t('workshop.publishedOn', { 0: formatMonth(a.published) })]
      : []),
    $tj('workshop.clicks12m', { 0: strong(formatCount(a.clicks12m)) }),
  ];
}

function Column({
  title,
  criteria,
  rows,
  empty,
  line,
  onAdapt,
}: {
  title: string;
  criteria: string;
  rows: Article[];
  empty: string;
  line: (a: Article) => ReactNode[];
  onAdapt: (a: Article) => void;
}) {
  return (
    <div className='min-w-0 rounded-lg border bg-card text-card-foreground'>
      <div className='flex items-baseline justify-between gap-3 border-b px-4 py-2.5'>
        <h3 className='text-sm font-semibold'>{title}</h3>
        <span className='truncate text-xs text-muted-foreground'>
          {criteria}
        </span>
      </div>
      {rows.length ? (
        <ul className='divide-y'>
          {rows.map((a) => {
            const made = madeList(a.made);
            return (
              <li
                key={a.url}
                className='flex items-center gap-3 px-4 py-2.5'
                data-recommended=''
              >
                <div className='min-w-0 flex-1'>
                  <a
                    href={a.url}
                    target='_blank'
                    rel='noreferrer'
                    className='block truncate text-sm font-medium hover:underline'
                    title={a.title}
                  >
                    {a.title}
                  </a>
                  <p className='mt-0.5 text-xs text-muted-foreground'>
                    {line(a).map((part, i) => (
                      <span key={i}>
                        {i ? ' · ' : null}
                        {part}
                      </span>
                    ))}
                  </p>
                  <p className='mt-0.5 text-xs text-muted-foreground'>
                    {made.length
                      ? $t('workshop.madeList', { 0: joinList(made) })
                      : $t('workshop.notMade')}
                  </p>
                </div>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => onAdapt(a)}
                >
                  {$t('workshop.adapt')}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className='px-4 py-6 text-center text-sm text-muted-foreground'>
          {empty}
        </p>
      )}
    </div>
  );
}

function Records({ view }: { view: WorkshopView }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const of = (f: Filter) => (r: WorkshopRecord) =>
    f === 'all' ||
    (f === 'review'
      ? r.standing === 'review' && !r.failed && !r.restart
      : f === 'doing'
        ? r.standing === 'doing'
        : r.standing === 'done');
  const counts = {
    review: view.records.filter(of('review')).length,
    doing: view.records.filter(of('doing')).length,
    done: view.records.filter(of('done')).length,
  };
  const rows = view.records.filter(of(filter));
  return (
    <section className='space-y-3' aria-labelledby='workshop-records'>
      <SectionHeading id='workshop-records' title={$t('workshop.records')} />
      {!view.records.length ? (
        <EmptyState
          icon={<History />}
          title={$t('workshop.noRecords')}
          description={$t('workshop.noRecordsHint')}
        />
      ) : (
        <div className='overflow-hidden rounded-lg border bg-card'>
          <DataTableTabs
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
          >
            <TabsTrigger value='all'>
              {$t('common.allCount', { 0: view.recordCount })}
            </TabsTrigger>
            <TabsTrigger value='review'>
              {$t('workshop.filterReview', { 0: counts.review })}
            </TabsTrigger>
            <TabsTrigger value='doing'>
              {$t('workshop.filterDoing', { 0: counts.doing })}
            </TabsTrigger>
            <TabsTrigger value='done'>
              {$t('workshop.filterDone', { 0: counts.done })}
            </TabsTrigger>
          </DataTableTabs>
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-10' />
                  <TableHead>{$t('workshop.outputColumn')}</TableHead>
                  <TableHead className='w-36'>{$t('common.status')}</TableHead>
                  <TableHead className='w-32'>{$t('workshop.updated')}</TableHead>
                  <TableHead className='w-20' />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const st = recordState(r),
                    review = of('review')(r);
                  return (
                    <TableRow key={r.taskId} data-record={r.standing}>
                      <TableCell>
                        <SourceLogo
                          source={logoOf(r.form, r.destination)}
                          size='sm'
                        />
                      </TableCell>
                      <TableCell className='max-w-0'>
                        <div className='truncate'>
                          {outputLabel(r.form, r.destination)}
                        </div>
                        <div className='truncate text-xs text-muted-foreground'>
                          {[
                            r.source.kind === 'article'
                              ? $t('workshop.fromArticle', {
                                  0: r.source.title,
                                })
                              : $t('workshop.fromTopic', { 0: r.source.topic }),
                            taskNo(r.no),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Tag tone={st.tone}>{st.text}</Tag>
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground tabular-nums'>
                        {formatDateTime(r.updatedAt)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {/* While the Agent writes there is nothing to do here (mockup v3). */}
                        {r.standing === 'doing' && !r.failed && !r.restart ? null : (
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => void navigate(`/actions/${r.taskId}`)}
                          >
                            {review
                              ? $t('workshop.review')
                              : $t('common.view')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className='px-4 py-6 text-center text-sm text-muted-foreground'>
              {$t('workshop.noRecordsFiltered')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
