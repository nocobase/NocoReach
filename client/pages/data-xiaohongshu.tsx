import { $t, useNocoReachLocale } from '#i18n';
// 小红书 (社区): notes found by the project's manual browser search, counted by their estimated publication date, with
// the same parts as the other 社区 pages (collector-content.tsx).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { BookHeart } from 'lucide-react';
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
import { xiaohongshuRequest } from './xiaohongshu-api';
import {
  xiaohongshuErrorMessage,
  xiaohongshuRunMessage,
} from './xiaohongshu-errors';
import type { XiaohongshuNote, XiaohongshuView } from './xiaohongshu-connect';
import './data-views.css';
import { formatCompact, formatDate, formatDateTime } from '#lib/format';

type Report = XiaohongshuView & CollectorReport & { notes: XiaohongshuNote[] };

// Likes as the page showed them: a plain number with separators, and one the page shortened to ten-thousands (with "+"
// for "or more") shortened the reader's way, as other counts are (12K in English); anything else as shown. Sorting
// uses the parsed number on the server.
const SHORTENED = /^(\d+(?:\.\d+)?)\s*([万萬亿億])(\+?)$/u;
const likes = (note: XiaohongshuNote) => {
  const text = note.likesText;
  if (text && /^\d+$/.test(text)) return countText(note.likes ?? Number(text));
  const short = text?.match(SHORTENED);
  if (short)
    return `${formatCompact(Number(short[1]) * ('万萬'.includes(short[2]) ? 1e4 : 1e8))}${short[3]}`;
  return text ?? '—';
};
const summary = (note: XiaohongshuNote) =>
  `${$t('xiaohongshu.displayedLikes', { 0: likes(note) })} · ${
    note.estimatedPublishedAt
      ? $t('xiaohongshu.estimatedPublicationDate', {
          0: formatDate(note.estimatedPublishedAt),
        })
      : $t('xiaohongshu.publicationTimeUnknown')
  }`;
const SORTS = ['likes'] as const;

export default function DataXiaohongshu() {
  const { project } = useProject();
  const navigate = useNavigate();
  useNocoReachLocale();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(20);
  const [sort, setSort] = useCollectorSort(SORTS);
  const { can: canSearch } = useBusinessAccess(
    'nrXiaohongshu.search',
    project?.id ?? null,
  );
  const { data, error, loading, reload, valid } = useCollectorReport<Report>(
    'nrXiaohongshu',
    project?.id,
    range,
    shown,
    (r) => Boolean(r.running),
    sort,
  );
  const columns = useMemo(
    () => [
      titleColumn<XiaohongshuNote>(
        $t('collectorPage.title'),
        (note) => <TitleLink href={safeLink(note.url)}>{note.title}</TitleLink>,
        summary,
      ),
      countColumn<XiaohongshuNote>('likes', $t('collectorView.likes'), likes),
      dateColumn<XiaohongshuNote>(
        $t('collectorPage.estimatedPublished'),
        (note) => formatDate(note.estimatedPublishedAt),
      ),
    ],
    [],
  );
  const running = busy || Boolean(data?.running);
  const search = async () => {
    if (!project || !data) return;
    setBusy(true);
    try {
      const next = await xiaohongshuRequest<{ queued: object | null }>(
        project.id,
        'search',
        { revision: data.revision },
      );
      // A read the busy collector turned away is queued and retried in about ten minutes.
      if (next.queued) toast.info(() => $t('collectorQueue.title'));
      else
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
        info={
          hasData ? (
            <NotesTip
              notes={[
                $t('collectorPage.xiaohongshuDates'),
                $t('collectorPage.unknownNote'),
              ]}
            />
          ) : undefined
        }
        actions={
          data?.connected && canSearch ? (
            <RefreshButton
              busy={running}
              label={
                running ? $t('xiaohongshu.collecting') : $t('common.updateNow')
              }
              onClick={() => void search()}
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
              ? xiaohongshuErrorMessage(error)
              : $t('common.tryAgainLater')
          }
          onRetry={retryable(error) ? () => void reload() : undefined}
        />
      ) : null}
      {!data && !error && valid ? <CollectorSkeleton /> : null}
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
          <CollectorSourceLine
            parts={[
              data.query && $t('common.searchTermValue', { 0: data.query }),
              data.verifiedAt
                ? $t('xiaohongshu.lastSuccessfulCollection', {
                    0: formatDateTime(data.verifiedAt),
                  })
                : $t('xiaohongshu.browserXiaohongshuLoginNotYet'),
            ]}
          />
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
          <CollectorTrendCard trend={data.trend} matched={data.matched} />
          <CollectorBody
            list={
              <CollectorTable
                id='xiaohongshu-notes'
                title={$t('collectorPage.notesInRange', { 0: data.matched })}
                rows={data.notes}
                rowId={(note) => note.id}
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
                  description: $t('collectorPage.notesHandOff'),
                  draft: () =>
                    discussionsDraft(
                      $t('collectorPage.xiaohongshu'),
                      $t('collectorPage.notes'),
                      ticked.map((note) => ({
                        title: note.title,
                        url: note.url,
                        meta: summary(note),
                      })),
                    ),
                })}
              />
            }
            side={
              <CollectorGroupsCard
                title={$t('collectorPage.terms')}
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
