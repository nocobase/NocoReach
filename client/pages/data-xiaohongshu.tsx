import { $t, useNocoReachLocale } from '#i18n';
// 小红书 (社区): notes found by the project's manual browser search, counted by their estimated publication date.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BookHeart, RefreshCw, Settings2 } from 'lucide-react';
import { toast } from '#lib/toast';
import { useBusinessAccess } from '#hooks/use-business-access';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, ListSkeleton, LoadError } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { useProject } from './reach-data';
import { RangePicker } from './range-picker';
import { useRange } from './range-state';
import { safeLink } from './analytics';
import {
  useCollectorReport,
  windowSummary,
  type CollectorReport,
} from './collector-report';
import { ReportMetrics } from './collector-metrics';
import { xiaohongshuRequest } from './xiaohongshu-api';
import {
  xiaohongshuErrorMessage,
  xiaohongshuRunMessage,
} from './xiaohongshu-errors';
import type { XiaohongshuNote, XiaohongshuView } from './xiaohongshu-connect';
import './data-views.css';

type Report = XiaohongshuView & CollectorReport & { notes: XiaohongshuNote[] };

export default function DataXiaohongshu() {
  const { project } = useProject();
  const navigate = useNavigate();
  const locale = useNocoReachLocale();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(20);
  const { can: canSearch } = useBusinessAccess(
    'nrXiaohongshu.search',
    project?.id ?? null,
  );
  const { data, error, reload, valid } = useCollectorReport<Report>(
    'nrXiaohongshu',
    project?.id,
    range,
    (r) => Boolean(r.running),
  );
  const running = busy || Boolean(data?.running);
  const search = async () => {
    if (!project || !data) return;
    setBusy(true);
    try {
      await xiaohongshuRequest(project.id, 'search', {
        revision: data.revision,
      });
      toast.success(() => $t('xiaohongshu.xiaohongshuNotesCollectedSaved'));
    } catch (e) {
      toast.error(() =>
        e instanceof Error
          ? xiaohongshuErrorMessage(e)
          : $t('common.operationFailedRetry'),
      );
    } finally {
      setBusy(false);
      void reload();
    }
  };
  const settings = () => navigate('/connections?source=xiaohongshu');
  const hasData = Boolean(data && (data.connected || data.total > 0));
  return (
    <PageContainer className='nr-data-page'>
      <PageHeader
        title={$t('collectorPage.xiaohongshu')}
        description={$t('collectorPage.xiaohongshuDescription')}
        actions={
          hasData ? (
            <div className='flex flex-wrap gap-2'>
              {data?.connected && canSearch ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={running}
                  onClick={() => void search()}
                >
                  <RefreshCw data-icon='inline-start' />
                  {running
                    ? $t('xiaohongshu.collecting')
                    : $t('xiaohongshu.searchNow')}
                </Button>
              ) : null}
              <Button variant='ghost' size='sm' onClick={() => void settings()}>
                <Settings2 data-icon='inline-start' />
                {$t('collectorPage.connectionSettings')}
              </Button>
            </div>
          ) : undefined
        }
      />
      <RangePicker
        value={range}
        onChange={(r) => {
          setShown(20);
          setRange(r);
        }}
        summary={windowSummary(data?.window)}
      />
      {error ? (
        <LoadError
          title={$t('collectorPage.loadFailed')}
          message={
            error instanceof Error
              ? xiaohongshuErrorMessage(error)
              : $t('common.tryAgainLater')
          }
        />
      ) : null}
      {!data && !error && valid ? <ListSkeleton rows={4} /> : null}
      {data && !hasData ? (
        <EmptyState
          icon={<BookHeart />}
          title={$t('collectorPage.xiaohongshuEmpty')}
          description={$t('collectorPage.xiaohongshuEmptyHelp')}
          action={
            <Button onClick={() => void settings()}>
              {$t('collectorPage.connectXiaohongshu')}
            </Button>
          }
        />
      ) : null}
      {data && hasData ? (
        <>
          <p className='nr-footnote'>
            {data.query ? $t('common.search', { 0: data.query }) : null}
            {data.query ? ' · ' : null}
            {data.verifiedAt
              ? $t('xiaohongshu.lastSuccessfulCollection', {
                  0: new Date(data.verifiedAt).toLocaleString(locale),
                })
              : $t('xiaohongshu.browserXiaohongshuLoginNotYet')}
          </p>
          {!data.connected ? (
            <p role='status' className='nr-footnote'>
              {$t('collectorPage.disconnectedKept')}
            </p>
          ) : null}
          {running ? (
            <p role='status' className='nr-footnote'>
              {$t('xiaohongshu.searchingCollectorBrowserUpAbout')}
            </p>
          ) : null}
          {data.lastRun && !data.lastRun.ok ? (
            <p role='alert' className='nr-error'>
              {xiaohongshuRunMessage(data.lastRun.errorCode)}
            </p>
          ) : null}
          <ReportMetrics kpis={data.kpis} />
          <Card className='gap-0 py-0'>
            <h2 className='border-b border-border px-4 py-3 text-sm font-semibold'>
              {$t('collectorPage.notesInRange', { 0: data.notes.length })}
            </h2>
            {data.notes.length ? (
              data.notes.slice(0, shown).map((note) => (
                <div
                  key={note.id}
                  className='min-w-0 border-b border-border px-4 py-2.5 last:border-0'
                  data-note={note.id}
                >
                  <a
                    className='nr-link break-words font-medium'
                    href={safeLink(note.url)}
                    target='_blank'
                    rel='noreferrer'
                  >
                    {note.title}
                  </a>
                  <p className='text-xs text-muted-foreground'>
                    {$t('xiaohongshu.displayedLikes', {
                      0: note.likesText ?? $t('common.unknown'),
                    })}{' '}
                    ·{' '}
                    {note.estimatedPublishedAt
                      ? $t('xiaohongshu.estimatedPublicationDate', {
                          0: note.estimatedPublishedAt,
                        })
                      : $t('xiaohongshu.publicationTimeUnknown')}{' '}
                    ·{' '}
                    {$t('xiaohongshu.collected', {
                      0: new Date(note.lastSeenAt).toLocaleString(locale),
                    })}
                  </p>
                </div>
              ))
            ) : (
              <p className='px-4 py-3 text-sm text-muted-foreground'>
                {$t('collectorPage.noneInRange')}
              </p>
            )}
            {shown < data.notes.length ? (
              <div className='px-4 py-3'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setShown((n) => n + 20)}
                >
                  {$t('xiaohongshu.showMore')}
                </Button>
              </div>
            ) : null}
          </Card>
          <p className='nr-footnote'>{$t('collectorPage.xiaohongshuDates')}</p>
        </>
      ) : null}
    </PageContainer>
  );
}
