import { $t, getCurrentLocale } from '#i18n';
// YouTube (社区): public videos found by the project's terms and links, counted by publication date,
// with the same parts as the other 社区 pages (collector-content.tsx).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { RefreshCw, Youtube } from 'lucide-react';
import { toast } from '#lib/toast';
import { useBusinessAccess } from '#hooks/use-business-access';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, LoadError } from '#components/reach/states';
import { NotesTip } from '#components/reach/info-tip';
import { Button } from '#components/ui/button';
import { useProject } from './reach-data';
import { RangePicker } from './range-picker';
import { useRange } from './range-state';
import { safeLink } from './analytics';
import {
  useCollectorReport,
  useCollectorSort,
  windowSummary,
  type CollectorReport,
} from './collector-report';
import { ReportMetrics } from './collector-metrics';
import {
  CollectorBody,
  CollectorGroupsCard,
  CollectorSkeleton,
  CollectorTable,
  CollectorTrendCard,
  TitleLink,
} from './collector-content';
import {
  countColumn,
  countText,
  dateColumn,
  retryable,
  titleColumn,
} from './collector-columns';
import { HandOffBar } from './hand-off-bar';
import { discussionsDraft } from './seo-hand-off';
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
const summary = (v: YouTubeVideo) =>
  $t('bilibili.viewsLikesComments', {
    0: countText(v.views),
    1: countText(v.likes),
    2: countText(v.comments),
  });
const SORTS = ['views', 'likes', 'comments'] as const;

// The title cell: the channel and description stay with the video.
function VideoCell({ v }: { v: YouTubeVideo }) {
  return (
    <div className='flex min-w-0 flex-col' data-video={v.id}>
      <TitleLink href={safeLink(v.url)}>{v.title}</TitleLink>
      <p className='mt-1 text-xs text-muted-foreground'>
        {v.channel} · {$t('youtube.sourceRetrieved', { 0: time(v.fetchedAt) })}
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
        <p className='mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground'>
          {v.description}
        </p>
      ) : null}
    </div>
  );
}

export default function DataYouTube() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(20);
  const [sort, setSort] = useCollectorSort(SORTS);
  const { can: canSync } = useBusinessAccess(
    'nrYouTube.sync',
    project?.id ?? null,
  );
  const { data, error, loading, reload, valid } = useCollectorReport<Report>(
    'nrYouTube',
    project?.id,
    range,
    shown,
    (r) => r.syncing,
    sort,
  );
  const columns = useMemo(
    () => [
      titleColumn<YouTubeVideo>(
        $t('collectorPage.title'),
        (v) => <VideoCell v={v} />,
        (v) => `${summary(v)} · ${v.publishedAt || '—'}`,
      ),
      ...SORTS.map((key) =>
        countColumn<YouTubeVideo>(key, $t(`collectorView.${key}`), (v) =>
          countText(v[key]),
        ),
      ),
      dateColumn<YouTubeVideo>(
        $t('collectorPage.publishedDate'),
        (v) => v.publishedAt || '—',
      ),
    ],
    [],
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
        info={
          hasData ? (
            <NotesTip
              notes={[
                $t('youtube.researchLimits'),
                $t('collectorPage.datesNote'),
                $t('collectorPage.unknownNote'),
              ]}
            />
          ) : undefined
        }
        actions={
          data?.connected && canSync ? (
            <Button
              variant='outline'
              size='sm'
              disabled={running}
              onClick={() => void sync()}
            >
              <RefreshCw data-icon='inline-start' />
              {running ? $t('youtube.reading') : $t('common.readNow')}
            </Button>
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
          title={
            data
              ? $t('collectorPage.reloadFailed')
              : $t('collectorPage.loadFailed')
          }
          message={
            error instanceof Error
              ? youtubeErrorMessage(error)
              : $t('common.tryAgainLater')
          }
          onRetry={retryable(error) ? () => void reload() : undefined}
        />
      ) : null}
      {!data && !error && valid ? <CollectorSkeleton /> : null}
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
          <CollectorTrendCard trend={data.trend} matched={data.matched} />
          <CollectorBody
            list={
              <CollectorTable
                id='youtube-videos'
                title={$t('collectorPage.videosInRange', { 0: data.matched })}
                rows={data.videos}
                rowId={(v) => v.id}
                columns={columns}
                sort={sort}
                onSort={(next) => {
                  setShown(20);
                  setSort(next);
                }}
                loading={loading}
                more={shown < data.matched}
                onMore={() => setShown((n) => n + 20)}
                handOff={(ticked) => ({
                  playbookId: 'community-summary',
                  description: $t('collectorPage.videosHandOff'),
                  draft: () =>
                    discussionsDraft(
                      'YouTube',
                      $t('collectorPage.videos'),
                      ticked.map((v) => ({
                        title: v.title,
                        url: v.url,
                        meta: `${v.channel} · ${summary(v)} · ${v.publishedAt || '—'}`,
                        excerpt: v.description.slice(0, 300),
                      })),
                    ),
                })}
              />
            }
            side={
              <CollectorGroupsCard
                title={$t('collectorPage.channels')}
                groups={data.groups}
              />
            }
          />
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
