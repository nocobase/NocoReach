import { $t, getCurrentLocale, isChinese } from '#i18n';
// Bilibili (社区): public videos found by the project's search terms and BV IDs, counted by publication date.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { RefreshCw, Settings2, TvMinimalPlay } from 'lucide-react';
import { toast } from '#lib/toast';
import { useBusinessAccess } from '#hooks/use-business-access';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, ListSkeleton, LoadError } from '#components/reach/states';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { useProject } from './reach-data';
import { RangePicker } from './range-picker';
import { useRange } from './range-state';
import {
  useCollectorReport,
  windowSummary,
  type CollectorReport,
} from './collector-report';
import { ReportMetrics } from './collector-metrics';
import {
  bilibiliErrorMessage,
  bilibiliMessage,
  bilibiliRequest,
  isBilibiliCancellation,
  type BilibiliStatus,
  type BilibiliVideo,
} from './bilibili-api';
import './data-views.css';

type Report = Omit<BilibiliStatus, 'recent'> &
  CollectorReport & { videos: BilibiliVideo[] };

// Unknown counts stay unknown; Bilibili's search summaries never report a missing count as zero.
const count = (value: number | null) =>
  value === null
    ? $t('common.unknown')
    : value.toLocaleString(getCurrentLocale());
const stamp = (value: string | null) =>
  value ? new Date(value).toLocaleString(getCurrentLocale()) : '—';

export default function DataBilibili() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(20);
  const { can: canSync } = useBusinessAccess(
    'nrBilibili.sync',
    project?.id ?? null,
  );
  const { data, error, reload, valid } = useCollectorReport<Report>(
    'nrBilibili',
    project?.id,
    range,
    (r) => r.checking,
  );
  const running = busy || Boolean(data?.checking);
  const retryAt = data?.lastRun?.retryAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!retryAt) return;
    // Re-render when Bilibili's rate-limit wait ends so reading can start again.
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Date.parse(retryAt) - Date.now()) + 20,
    );
    return () => clearTimeout(timer);
  }, [retryAt]);
  const cooling = !!retryAt && Date.parse(retryAt) > now;
  const sync = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const next = await bilibiliRequest<BilibiliStatus>(project.id, 'sync');
      if (next.lastRun?.ok)
        toast.success(() => $t('bilibili.bilibiliCollectionCompleted'));
      else if (next.lastRun?.partial)
        toast.info(() => $t('bilibili.verifiablePartialResultsSaved'));
      else
        toast.warning(() =>
          bilibiliMessage(next.lastRun?.errorCode || 'invalid_response'),
        );
    } catch (e) {
      if (!isBilibiliCancellation(e))
        toast.error(() =>
          e instanceof Error
            ? bilibiliErrorMessage(e)
            : $t('common.operationFailedRetry'),
        );
    } finally {
      setBusy(false);
      void reload();
    }
  };
  const settings = () => navigate('/connections?source=bilibili');
  const hasData = Boolean(data && (data.connected || data.total > 0));
  return (
    <PageContainer className='nr-data-page'>
      <PageHeader
        title='Bilibili'
        description={$t('collectorPage.bilibiliDescription')}
        actions={
          hasData ? (
            <div className='flex flex-wrap gap-2'>
              {data?.connected && canSync ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={running || cooling}
                  onClick={() => void sync()}
                >
                  <RefreshCw data-icon='inline-start' />
                  {running ? $t('common.loadingLoading') : $t('common.readNow')}
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
              ? bilibiliErrorMessage(error)
              : $t('common.tryAgainLater')
          }
        />
      ) : null}
      {!data && !error && valid ? <ListSkeleton rows={4} /> : null}
      {data && !hasData ? (
        <EmptyState
          icon={<TvMinimalPlay />}
          title={$t('collectorPage.bilibiliEmpty')}
          description={$t('collectorPage.bilibiliEmptyHelp')}
          action={
            <Button onClick={() => void settings()}>
              {$t('collectorPage.connectBilibili')}
            </Button>
          }
        />
      ) : null}
      {data && hasData ? (
        <>
          <p className='nr-footnote break-words'>
            {$t('common.searchTermValue', {
              0: data.terms.join('、') || '—',
            })}{' '}
            · {$t('bilibili.bvIdsVideoLinks')}
            {isChinese() ? '：' : ': '}
            {data.bvids.join('、') || '—'} ·{' '}
            {$t('bilibili.lastSuccessfulCollection', {
              0: stamp(data.verifiedAt),
            })}
          </p>
          {!data.connected ? (
            <p role='status' className='nr-footnote'>
              {$t('collectorPage.disconnectedKept')}
            </p>
          ) : null}
          {running ? (
            <p role='status' className='nr-footnote'>
              {$t('collectorPage.collecting')}
            </p>
          ) : null}
          {cooling ? (
            <p role='status' className='nr-footnote'>
              {$t('bilibili.tryAgainAfter', {
                0: stamp(data.lastRun?.retryAt || null),
              })}
            </p>
          ) : null}
          {data.lastRun && !data.lastRun.ok ? (
            <p role='alert' className='nr-error'>
              {bilibiliMessage(data.lastRun.errorCode || 'invalid_response')}
            </p>
          ) : null}
          <ReportMetrics kpis={data.kpis} />
          <Card className='gap-0 py-0'>
            <h2 className='border-b border-border px-4 py-3 text-sm font-semibold'>
              {$t('collectorPage.videosInRange', { 0: data.videos.length })}
            </h2>
            {data.videos.length ? (
              data.videos.slice(0, shown).map((video) => (
                <div
                  key={video.id}
                  className='flex min-w-0 flex-col gap-1 border-b border-border px-4 py-2.5 last:border-0'
                  data-video={video.id}
                >
                  <a
                    className='nr-link break-words font-medium'
                    href={`https://www.bilibili.com/video/${encodeURIComponent(video.id)}`}
                    target='_blank'
                    rel='noreferrer'
                  >
                    {video.title || video.id}
                  </a>
                  {video.fromEarlierConfig ? (
                    <Badge variant='outline' className='self-start'>
                      {$t('bilibili.earlierConfiguration')}
                    </Badge>
                  ) : null}
                  <p className='text-xs text-muted-foreground'>
                    {$t('bilibili.viewsLikesComments', {
                      0: count(video.views),
                      1: count(video.likes),
                      2: count(video.comments),
                    })}{' '}
                    ·{' '}
                    {$t('bilibili.published', {
                      0: video.publishedAt
                        ? `${video.publishedAt.slice(0, 16).replace('T', ' ')} UTC (${$t('bilibili.minutePrecision')})`
                        : $t('common.unknown'),
                    })}{' '}
                    ·{' '}
                    {$t('bilibili.collected', { 0: stamp(video.collectedAt) })}
                  </p>
                </div>
              ))
            ) : (
              <p className='px-4 py-3 text-sm text-muted-foreground'>
                {$t('collectorPage.noneInRange')}
              </p>
            )}
            {shown < data.videos.length ? (
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
            {$t('bilibili.searchCoversReturnedFirstPage')}{' '}
            {$t('collectorPage.datesNote')}
          </p>
        </>
      ) : null}
    </PageContainer>
  );
}
