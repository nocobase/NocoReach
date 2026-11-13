import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { History } from 'lucide-react';
import { $t } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, ListSkeleton, LoadError } from '#components/reach/states';
import { SourceLogo } from '#components/reach/source-logo';
import { Tag } from '#components/reach/tag';
import { DataTableTabs } from '#components/seo/data-table-toolbar';
import { Button } from '#components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { formatDateTime } from '#lib/format';
import { useProject } from '../reach-data.js';
import { getWorkColumns } from '../task-execution-types';
import { TaskStandingTag } from '../task-status-tag';
import {
  errorText,
  fromLine,
  logoOf,
  outputLabel,
  runNote,
  taskNo,
  workshopRequest,
  type WorkshopRecord,
  type WorkshopView,
} from './model.js';
import { Library } from './library.js';
import { HotTopics } from './recommend.js';

/** What the dialogs under this page read from it: the view it loaded, and a way to load it again after a change. */
export type WorkshopOutlet = { view?: WorkshopView; reload: () => void };

type Filter = 'all' | 'review' | 'doing' | 'done';

// Content workshop (homepage v5, 2026-11-13 user decision, ui-references/content-workshop-2026-11-12/homepage-v5.png):
// Trending now when there is anything to show (recommend.tsx), then two tabs, Library (every blog article, library.tsx)
// and the adaptation records. Adapt on either opens step 2 with it chosen; Adapt a new topic writes about a topic of
// one's own.
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
  const [tab, setTab] = useState<'library' | 'records'>('library');
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
              {$t('workshop.newTopic')}
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
          <HotTopics view={view} projectId={projectId} onChange={reload} />
          <div className='space-y-3'>
            <Tabs
              value={tab}
              onValueChange={(v) =>
                setTab(v === 'records' ? 'records' : 'library')
              }
            >
              <TabsList variant='line' className='h-auto! justify-start'>
                <TabsTrigger value='library'>
                  {$t('workshop.library')}
                  <span className='text-xs text-muted-foreground tabular-nums'>
                    {view.articles.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value='records'>
                  {$t('workshop.records')}
                  <span className='text-xs text-muted-foreground tabular-nums'>
                    {view.recordCount}
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === 'library' ? (
              <Library view={view} />
            ) : (
              <Records view={view} />
            )}
          </div>
        </>
      )}
      <Outlet context={{ view, reload } satisfies WorkshopOutlet} />
    </PageContainer>
  );
}

function Records({ view }: { view: WorkshopView }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  // The board's columns: a stopped run or one waiting for a restart needs you too.
  const of = (f: Filter) => (r: WorkshopRecord) =>
    f === 'all' || r.standing === f;
  const columns = getWorkColumns();
  const counts = {
    review: view.records.filter(of('review')).length,
    doing: view.records.filter(of('doing')).length,
    done: view.records.filter(of('done')).length,
  };
  const rows = view.records.filter(of(filter));
  return (
    <section aria-label={$t('workshop.records')}>
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
            {(['review', 'doing', 'done'] as const).map((f) => (
              <TabsTrigger key={f} value={f}>
                {columns[f]} {counts[f]}
              </TabsTrigger>
            ))}
          </DataTableTabs>
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-10' />
                  <TableHead>{$t('workshop.outputColumn')}</TableHead>
                  <TableHead className='w-36'>{$t('common.status')}</TableHead>
                  <TableHead className='w-32'>
                    {$t('workshop.updated')}
                  </TableHead>
                  <TableHead className='w-20' />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const note = runNote(r),
                    review = r.standing === 'review' && !note;
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
                          {[fromLine(r.source), taskNo(r.no)]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-wrap items-center gap-1'>
                          <TaskStandingTag state={r.standing} />
                          {note ? (
                            <Tag tone={note.tone}>{note.text}</Tag>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground tabular-nums'>
                        {formatDateTime(r.updatedAt)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {/* Every row opens its task, one the Agent is still writing too (v4). */}
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => void navigate(`/actions/${r.taskId}`)}
                        >
                          {review ? $t('workshop.review') : $t('common.view')}
                        </Button>
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
