import { $t, getCurrentLocale } from '#i18n';
// YouTube (社区): public videos found by the project's terms and links, counted by publication date,
// with the same parts as the other 社区 pages (collector-content.tsx). Since 2026-11-10 also the videos on the followed
// topics, searched weekly, in their own group (Topic discussions) beside the mentions; the most viewed first.
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Youtube } from 'lucide-react';
import { RefreshButton } from '#components/reach/refresh-button';
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
  CollectorSourceLine,
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
  youtubeRequest,
  type YouTubeStatus,
  type YouTubeTopicVideo,
  type YouTubeVideo,
} from './youtube-api';
import { Card } from '#components/ui/card';
import {
  AllCheck,
  RowCheck,
  useTickedList,
} from '#components/reach/hand-off-slot';
import { EditTopicsLink, TopicGroupTabs } from './followed-topics';
import {
  topicMarks,
  topicScopeText,
  useTopicGroup,
  type TopicGroup,
} from './followed-topics-scope';
import './data-views.css';
import { formatDate, formatDateTime } from '#lib/format';

type Report = YouTubeStatus &
  CollectorReport & {
    videos: YouTubeVideo[];
    topic?: {
      topics: string[];
      readAt: string | null;
      count: number;
      videos: YouTubeTopicVideo[];
    };
  };

const time = (value: string | null | undefined) => formatDateTime(value);
const summary = (v: Pick<YouTubeVideo, 'views' | 'likes' | 'comments'>) =>
  $t('bilibili.viewsLikesComments', {
    0: countText(v.views),
    1: countText(v.likes),
    2: countText(v.comments),
  });
const SORTS = ['views', 'likes', 'comments'] as const;

// The title cell: the channel and description stay with the video; when it was read is said once, on the source line.
function VideoCell({ v }: { v: YouTubeVideo }) {
  return (
    <div className='flex min-w-0 flex-col' data-video={v.id}>
      <TitleLink href={safeLink(v.url)}>{v.title}</TitleLink>
      {v.channel ? (
        <p className='mt-1 text-xs text-muted-foreground'>{v.channel}</p>
      ) : null}
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
        (v) => `${summary(v)} · ${formatDate(v.publishedAt)}`,
      ),
      ...SORTS.map((key) =>
        countColumn<YouTubeVideo>(key, $t(`collectorView.${key}`), (v) =>
          countText(v[key]),
        ),
      ),
      dateColumn<YouTubeVideo>($t('collectorPage.publishedDate'), (v) =>
        formatDate(v.publishedAt),
      ),
    ],
    [],
  );
  const running = busy || Boolean(data?.syncing);
  // While the month's DataForSEO budget is used up a read would only be refused.
  const paused = data?.pausedUntil
    ? $t('youtube.readNowPaused', { 0: formatDate(data.pausedUntil) })
    : null;
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
  const topic = data?.topic,
    [group, setGroup] = useTopicGroup(Boolean(topic?.topics.length));
  const hasData = Boolean(data && (data.configured || data.total > 0));
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
          data?.configured && data.dataforseo && canSync ? (
            <RefreshButton
              busy={running}
              disabled={Boolean(paused)}
              label={
                running
                  ? $t('youtube.reading')
                  : (paused ?? $t('common.updateNow'))
              }
              onClick={() => void sync()}
            />
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
          {/* Where the videos come from in one line; a read that fails shows in Data sources › Data health. */}
          {data.configured ? (
            <CollectorSourceLine
              parts={[
                topicScopeText({
                  terms: [
                    data.terms.length > 1
                      ? $t('youtube.termsAndMore', {
                          0: data.terms[0],
                          1: data.terms.length,
                        })
                      : data.terms[0],
                  ],
                  topics: topic?.topics.length ?? 0,
                  // Read by hand, nothing runs on a schedule: the line says so instead.
                  cadence: data.autoSync ? 'topicsWeekly' : undefined,
                }),
                !data.autoSync && $t('youtube.manualReading'),
                data.fetchedAt &&
                  $t('youtube.sourceRetrieved', { 0: time(data.fetchedAt) }),
              ]}
              notes={[
                $t('youtube.sourceInfo', {
                  0: new Intl.ListFormat(getCurrentLocale()).format(data.terms),
                }),
                $t('followedTopics.youtubeTopicsNote'),
              ]}
              trailing={<EditTopicsLink />}
            />
          ) : null}
          {!data.configured ? (
            <p role='status' className='nr-footnote'>
              {$t('collectorPage.disconnectedKept')}
            </p>
          ) : null}
          {running ? (
            <p role='status' className='nr-footnote'>
              {$t('youtube.resultsUpdating')}
            </p>
          ) : paused && canSync ? (
            <p role='status' className='nr-footnote'>
              {paused}
            </p>
          ) : null}
          {topic ? (
            <TopicGroupTabs
              group={group}
              onChange={setGroup}
              topics={topic.count}
              mentions={data.matched}
            />
          ) : null}
          {topic && group === 'topics' ? (
            <TopicVideos topic={topic} />
          ) : (
            <MentionsGroup group={group}>
              <ReportMetrics kpis={data.kpis} />
              <CollectorTrendCard trend={data.trend} matched={data.matched} />
              <CollectorBody
                list={
                  <CollectorTable
                    id='youtube-videos'
                    title={$t('collectorPage.videosInRange', {
                      0: data.matched,
                    })}
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
                            meta: `${v.channel} · ${summary(v)} · ${formatDate(v.publishedAt)}`,
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
            </MentionsGroup>
          )}
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

function MentionsGroup({
  group,
  children,
}: {
  group: TopicGroup;
  children: ReactNode;
}) {
  return (
    <div className='contents' data-group={group}>
      {children}
    </div>
  );
}

// Videos on the followed topics in range, the most viewed first; ticked ones go to the Agent like the mentions.
function TopicVideos({ topic }: { topic: NonNullable<Report['topic']> }) {
  const ticked = useTickedList(
    'youtube-topic-videos',
    topic.videos,
    (v) => v.id,
    (list) => ({
      playbookId: 'community-summary',
      description: $t('collectorPage.videosHandOff'),
      draft: () =>
        discussionsDraft(
          'YouTube',
          $t('collectorPage.videos'),
          list.map((v) => ({
            title: v.title,
            url: v.url,
            meta: `${v.channel} · ${topicMarks(v.topics)} · ${summary(v)} · ${formatDate(v.publishedAt)}`,
            excerpt: v.description.slice(0, 300),
          })),
        ),
    }),
  );
  return (
    <Card className='gap-0 py-0' data-group='topics'>
      <div className='flex items-center gap-3 border-b border-border px-4 py-2'>
        <AllCheck selection={ticked} count={topic.videos.length} />
        <h2 className='text-sm font-semibold'>
          {$t('followedTopics.mostViewed')}
        </h2>
      </div>
      {topic.videos.length ? (
        topic.videos.map((v) => (
          <div
            key={v.id}
            className='flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0'
            data-topic-video={v.id}
          >
            <span className='pt-0.5'>
              <RowCheck selection={ticked} k={v.id} label={v.title} />
            </span>
            <div className='min-w-0 flex-1'>
              <a
                className='nr-link font-medium'
                href={safeLink(v.url)}
                target='_blank'
                rel='noreferrer'
              >
                {v.title}
              </a>
              <p className='text-xs text-muted-foreground'>
                {[
                  v.channel,
                  topicMarks(v.topics),
                  summary(v),
                  formatDate(v.publishedAt || v.firstSeenAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
        ))
      ) : (
        <p className='px-4 py-3 text-sm text-muted-foreground'>
          {!topic.topics.length
            ? $t('followedTopics.noTopics')
            : topic.readAt
              ? $t('followedTopics.noTopicPosts')
              : $t('followedTopics.notSearchedYet')}
        </p>
      )}
    </Card>
  );
}
