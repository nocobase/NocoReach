import { $t, getCurrentLocale } from '#i18n';
// YouTube (社区): public videos found by the project's terms and links, counted by publication date.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { RefreshCw, Settings2, Youtube } from 'lucide-react';
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
import {
  youtubeErrorMessage,
  youtubeMessage,
  youtubeRequest,
  type YouTubeStatus,
  type YouTubeVideo,
} from './youtube-api';
import './data-views.css';

type Report = Omit<YouTubeStatus, 'page' | 'pageSize'> & CollectorReport;

const time = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString(getCurrentLocale()) : '—';
const count = (value: number | null) =>
  value?.toLocaleString(getCurrentLocale()) ?? '—';

function VideoRow({ v }: { v: YouTubeVideo }) {
  return (
    <article
      className='min-w-0 border-b border-border px-4 py-3 last:border-0'
      data-video={v.id}
    >
      <a
        href={safeLink(v.url)}
        target='_blank'
        rel='noreferrer'
        className='nr-link break-words font-medium'
      >
        {v.title}
      </a>
      <p className='mt-1 break-words text-xs text-muted-foreground'>
        {v.channel} · {v.publishedAt || '—'} ·{' '}
        {$t('bilibili.viewsLikesComments', {
          0: count(v.views),
          1: count(v.likes),
          2: count(v.comments),
        })}
      </p>
      <p className='mt-1 text-xs text-muted-foreground'>
        {$t('youtube.sourceRetrieved', { 0: time(v.fetchedAt) })}
        {v.metricFetchedAt &&
        Object.values(v.metricFetchedAt).some(
          (at) => at !== null && at !== v.fetchedAt,
        )
          ? ` · ${$t('youtube.metricsReadAt', {
              0: time(v.metricFetchedAt.views),
              1: time(v.metricFetchedAt.likes),
              2: time(v.metricFetchedAt.comments),
            })}`
          : null}
      </p>
      {v.description ? (
        <p className='mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm'>
          {v.description}
        </p>
      ) : null}
    </article>
  );
}

export default function DataYouTube() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(20);
  const { can: canSync } = useBusinessAccess(
    'nrYouTube.sync',
    project?.id ?? null,
  );
  const { data, error, reload, valid } = useCollectorReport<Report>(
    'nrYouTube',
    project?.id,
    range,
    shown,
    (r) => r.syncing,
  );
  const running = busy || Boolean(data?.syncing);
  const sync = async () => {
    if (!project) return;
    setBusy(true);
    try {
      await youtubeRequest(project.id, 'sync');
      toast.success(() => $t('youtube.readingStarted'));
    } catch (e) {
      toast.error(() =>
        e instanceof Error
          ? youtubeErrorMessage(e)
          : $t('common.operationFailedRetry'),
      );
    } finally {
      setBusy(false);
      void reload();
    }
  };
  const settings = () => navigate('/connections?source=youtube');
  const hasData = Boolean(data && (data.connected || data.total > 0));
  return (
    <PageContainer className='nr-data-page'>
      <PageHeader
        title='YouTube'
        description={$t('collectorPage.youtubeDescription')}
        actions={
          hasData ? (
            <div className='flex flex-wrap gap-2'>
              {data?.connected && canSync ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={running}
                  onClick={() => void sync()}
                >
                  <RefreshCw data-icon='inline-start' />
                  {running ? $t('youtube.reading') : $t('common.readNow')}
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
              ? youtubeErrorMessage(error)
              : $t('common.tryAgainLater')
          }
        />
      ) : null}
      {!data && !error && valid ? <ListSkeleton rows={4} /> : null}
      {data && !hasData ? (
        <EmptyState
          icon={<Youtube />}
          title={$t('youtube.empty')}
          description={$t('collectorPage.youtubeEmptyHelp')}
          action={
            <Button onClick={() => void settings()}>
              {$t('collectorPage.connectYouTube')}
            </Button>
          }
        />
      ) : null}
      {data && hasData ? (
        <>
          <p className='nr-footnote break-words'>
            {data.terms.length
              ? $t('common.searchTermValue', { 0: data.terms.join('、') })
              : null}
            {data.terms.length && data.fetchedAt ? ' · ' : null}
            {data.fetchedAt
              ? $t('youtube.sourceRetrieved', { 0: time(data.fetchedAt) })
              : null}
          </p>
          {!data.connected ? (
            <p role='status' className='nr-footnote'>
              {$t('collectorPage.disconnectedKept')}
            </p>
          ) : null}
          {running ? (
            <p role='status' className='nr-footnote'>
              {$t('youtube.resultsUpdating')}
            </p>
          ) : null}
          {data.lastSync && !data.lastSync.ok ? (
            <div role='alert' className='nr-error'>
              {(data.lastSync.errors.length
                ? data.lastSync.errors
                : [$t('youtube.lastReadFailed')]
              ).map((message) => (
                <p key={message}>{youtubeMessage(message)}</p>
              ))}
            </div>
          ) : null}
          <ReportMetrics kpis={data.kpis} />
          <Card className='gap-0 py-0'>
            <h2 className='border-b border-border px-4 py-3 text-sm font-semibold'>
              {$t('collectorPage.videosInRange', { 0: data.matched })}
            </h2>
            {data.videos.length ? (
              data.videos.map((v) => <VideoRow key={v.id} v={v} />)
            ) : (
              <p className='px-4 py-3 text-sm text-muted-foreground'>
                {$t('collectorPage.noneInRange')}
              </p>
            )}
            {shown < data.matched ? (
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
          <p className='nr-footnote'>
            {$t('youtube.researchLimits')} {$t('collectorPage.datesNote')}
          </p>
        </>
      ) : null}
    </PageContainer>
  );
}
