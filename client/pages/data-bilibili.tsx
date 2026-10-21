import { $t, isChinese } from '#i18n';
// Bilibili (社区): public videos found by the project's search terms and BV IDs, counted by publication date, with the
// same parts as the other 社区 pages (collector-content.tsx).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { RefreshCw, TvMinimalPlay } from 'lucide-react';
import { toast } from '#lib/toast';
import { useBusinessAccess } from '#hooks/use-business-access';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, LoadError } from '#components/reach/states';
import { NotesTip } from '#components/reach/info-tip';
import { Button } from '#components/ui/button';
import { useProject } from './reach-data';
import { RangePicker } from './range-picker';
import { useRange } from './range-state';
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
  shortDate,
  titleColumn,
} from './collector-columns';
import { HandOffBar } from './hand-off-bar';
import { discussionsDraft } from './seo-hand-off';
import {
  bilibiliErrorMessage,
  bilibiliMessage,
  bilibiliRequest,
  isBilibiliCancellation,
  type BilibiliStatus,
  type BilibiliVideo,
} from './bilibili-api';
import './data-views.css';
import { formatDateTime } from '#lib/format';

type Report = Omit<BilibiliStatus, 'recent'> &
  CollectorReport & { videos: BilibiliVideo[] };

const stamp = (value: string | null) => formatDateTime(value);
const videoUrl = (id: string) =>
  `https://www.bilibili.com/video/${encodeURIComponent(id)}`;
// Unknown counts stay "—"; Bilibili's search summaries never report a missing count as zero.
const summary = (v: BilibiliVideo) =>
  $t('bilibili.viewsLikesComments', {
    0: countText(v.views),
    1: countText(v.likes),
    2: countText(v.comments),
  });
// Bilibili gives publication times to the minute (UTC); they show in the reader's time zone.
const published = (v: BilibiliVideo) => formatDateTime(v.publishedAt);
const SORTS = ['views', 'likes', 'comments'] as const;

export default function DataBilibili() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(20);
  const [sort, setSort] = useCollectorSort(SORTS);
  const { can: canSync } = useBusinessAccess(
    'nrBilibili.sync',
    project?.id ?? null,
  );
  const { data, error, loading, reload, valid } = useCollectorReport<Report>(
    'nrBilibili',
    project?.id,
    range,
    shown,
    (r) => r.checking,
    sort,
  );
  const columns = useMemo(
    () => [
      titleColumn<BilibiliVideo>(
        $t('collectorPage.title'),
        (v) => (
          <TitleLink href={videoUrl(v.id)} earlier={v.fromEarlierConfig}>
            {v.title || v.id}
          </TitleLink>
        ),
        (v) => `${summary(v)} · ${published(v)}`,
      ),
      ...SORTS.map((key) =>
        countColumn<BilibiliVideo>(key, $t(`collectorView.${key}`), (v) =>
          countText(v[key]),
        ),
      ),
      dateColumn<BilibiliVideo>(
        $t('collectorPage.publishedAt'),
        published,
        (v) =>
          $t('collectorPage.collectedShort', { 0: shortDate(v.collectedAt) }),
      ),
    ],
    [],
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
        info={
          hasData ? (
            <NotesTip
              notes={[
                $t('bilibili.searchCoversReturnedFirstPage'),
                $t('collectorPage.datesNote'),
                $t('collectorPage.bilibiliTimeNote'),
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
              disabled={running || cooling}
              onClick={() => void sync()}
            >
              <RefreshCw data-icon='inline-start' />
              {running ? $t('common.loadingLoading') : $t('common.updateNow')}
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
              ? bilibiliErrorMessage(error)
              : $t('common.tryAgainLater')
          }
          onRetry={retryable(error) ? () => void reload() : undefined}
        />
      ) : null}
      {!data && !error && valid ? <CollectorSkeleton /> : null}
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
          <CollectorTrendCard trend={data.trend} matched={data.matched} />
          <CollectorBody
            list={
              <CollectorTable
                id='bilibili-videos'
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
                      'Bilibili',
                      $t('collectorPage.videos'),
                      ticked.map((v) => ({
                        title: v.title || v.id,
                        url: videoUrl(v.id),
                        meta: `${summary(v)} · ${published(v)}`,
                      })),
                    ),
                })}
              />
            }
            side={
              <CollectorGroupsCard
                title={$t('collectorPage.sources')}
                note={$t('collectorPage.sourcesNote')}
                groups={data.groups}
                kinds
                linkOf={(g) =>
                  g.kind === 'video'
                    ? videoUrl(g.name)
                    : `https://search.bilibili.com/all?keyword=${encodeURIComponent(g.name)}`
                }
              />
            }
          />
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
