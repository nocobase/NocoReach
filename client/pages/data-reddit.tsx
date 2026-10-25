import { getCurrentLocale, $t, $tj, $legacyText } from '#i18n';
// Reddit (社区): threads that name the product, found once a week through a Google search of reddit.com, with their
// subreddits; visits from Reddit when GA4 is connected.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { MessageCircle } from 'lucide-react';
import { RefreshButton } from '#components/reach/refresh-button';
import { toast } from '#lib/toast';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, ListSkeleton, LoadError } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { StatTile } from '#components/seo/stat-tile';
import { useProject } from './reach-data';
import { useFreshData } from './workspace-cache';
import { RangePicker } from './range-picker';
import { validRange, useRange } from './range-state';
import { MetricTile, metricGrid, type Metric } from './data-parts';
import { safeLink } from './analytics';
import { HandOffBar } from './hand-off-bar';
import { AllCheck, RowCheck, useTickedList } from '#components/reach/hand-off-slot';
import { discussionsDraft } from './seo-hand-off';
import './data-views.css';
import { NotesTip } from '#components/reach/info-tip';
import { RedditTiming, type RedditTimingState } from './reddit-timing';
import { formatDate } from '#lib/format';

type Post = { id: string; title: string; url: string; subreddit: string; snippet: string; postedAt: string | null; firstSeenAt: string; term: string };
type View = RedditTimingState & { connected: boolean; terms?: string[]; window?: { start: string; end: string; days: number }; retainedFrom?: string | null; lastRun?: { at: string; ok: boolean; errors: string[] } | null; total?: number; visits?: { sessions: number; views: number; conversions: number; previous: number } | null; kpis?: Metric[]; notes?: string[]; subreddits?: { name: string; count: number }[]; posts?: Post[] };

export default function DataReddit() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const custom = !validRange(range);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:reddit:${project.id}:${JSON.stringify(range)}:${nonce}` : null, () => api.action<View>('nrReddit', 'view', { method: 'POST', body: { projectId: project!.id, ...range }, unwrap: 'data' }));
  const check = async () => {
    setBusy(true);
    try { const r = await api.action<RedditTimingState & { added: number; errors: string[] }>('nrReddit', 'check', { method: 'POST', body: { projectId: project!.id }, unwrap: 'data' }); if (r.errors.length) toast.error(() => $t('reddit.searchIncomplete',{0:r.diagnostics?.find(d=>d.reason!=='success') ? $t(`redditDiagnostic.${r.diagnostics.find(d=>d.reason!=='success')!.reason}`) : $legacyText(r.errors[0])})); else toast.success(() => (r.added ? $t('dataReddit.newPostsFound',{0:r.added}) : $t('common.noNewPosts'))); setNonce((n) => n + 1); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.notFullyChecked'))); }
    finally { setBusy(false); }
  };
  const w = view?.window, visits = view?.visits;
  const posts = useTickedList('reddit-posts', view?.connected ? view.posts : undefined, (p) => String(p.id), (ticked) => ({ playbookId: 'community-summary', description: $t('dataReddit.postsBecomeOneTaskAgent'), draft: () => discussionsDraft('Reddit', $t('common.posts'), ticked.map((p) => ({ title: p.title, url: p.url, meta: `r/${p.subreddit} · ${p.postedAt || p.firstSeenAt.slice(0, 10)}`, excerpt: p.snippet }))) }));
  return (
    <PageContainer className='nr-data-page'>
      <PageHeader info={<NotesTip notes={view?.notes} />} title='Reddit' description={$t('dataReddit.redditPostsMentioningProductSearched')} actions={view?.connected ? <RefreshButton busy={busy} label={busy ? $t('common.searching') : $t('common.updateNow')} onClick={() => void check()} /> : undefined} />
      <RangePicker value={range} onChange={setRange} summary={w ? ('all' in w && w.all ? $t('rangePicker.availableRange',{0:formatDate(w.start),1:formatDate(w.end)}) : $t('common.comparedPreviousDays',{0:formatDate(w.start),1:formatDate(w.end),2:w.days})) : undefined} />
      {error ? <LoadError title={$t('dataReddit.notLoadRedditDiscussions')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<MessageCircle />} title={$t('dataReddit.onceRedditDiscussionsConnectedPosts')} description={$t('dataReddit.searchedGoogleOnceWeekThrough')} action={<Button onClick={() => void navigate('/connections?source=reddit')}>{$t('dataReddit.connectRedditDiscussions')}</Button>} /> : null}
      {view?.connected ? (
        <>
          <RedditTiming state={view} lead={$tj('dataReddit.searchTerm',{0:view.terms!.join('、'),1:''})}/>
          {!view.diagnostics?.length && view.lastRun?.errors?.length ? <div className='nr-error' role='alert'>{view.lastRun.errors.map((message) => <p key={message}>{$tj('reddit.searchIncomplete',{0:$legacyText(message)})}</p>)}</div> : null}
          <div className={metricGrid(view.kpis!.length + (visits ? 1 : 0))}>
            {view.kpis!.map((m) => <Card key={m.key} className='gap-0 p-4' data-metric={m.label}><MetricTile m={m} /></Card>)}
            {visits ? <Card className='gap-0 p-4' data-metric={$t('dataReddit.trafficReddit')}><StatTile label={$t('dataReddit.trafficReddit')} value={visits.sessions.toLocaleString(getCurrentLocale())} delta={visits.previous ? { change: (visits.sessions - visits.previous) / visits.previous, better: visits.sessions >= visits.previous } : null} hint={$t('dataReddit.viewsKeyEvents',{0:visits.views.toLocaleString(getCurrentLocale()),1:visits.conversions.toLocaleString(getCurrentLocale())})} /></Card> : null}
          </div>
          
          <div className='grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
            <Card className='gap-0 py-0'>
              <div className='flex items-center gap-3 border-b border-border px-4 py-2'><AllCheck selection={posts} count={view.posts!.length} /><h2 className='text-sm font-semibold'>{$t('common.posts')}</h2></div>
              {view.posts!.length ? view.posts!.map((p) => (
                <div key={p.id} className='flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0' data-post={p.id}>
                  <span className='pt-0.5'><RowCheck selection={posts} k={String(p.id)} label={p.title || p.url} /></span><div className='min-w-0 flex-1'>
                  <a className='nr-link font-medium' href={safeLink(p.url)} target='_blank' rel='noreferrer'>{p.title || p.url}</a>
                  {p.snippet ? <p className='line-clamp-2 text-sm text-muted-foreground'>{p.snippet}</p> : null}
                  <p className='text-xs text-muted-foreground'>r/{p.subreddit} · {p.postedAt ? $t('dataReddit.posted',{0:formatDate(p.postedAt)}) : $t('dataReddit.postDateUnknownFound',{0:formatDate(p.firstSeenAt)})}</p>
                </div></div>
              )) : <p className='px-4 py-3 text-sm text-muted-foreground'>{$t('dataReddit.noNewPostsSelectedPeriod')}</p>}
            </Card>
            <Card className='gap-0 py-0'>
              <h2 className='border-b border-border px-4 py-3 text-sm font-semibold'>{$t('dataReddit.subreddit')}</h2>
              {view.subreddits!.length ? view.subreddits!.map((s) => (
                <a key={s.name} className='flex items-center justify-between border-b border-border px-4 py-2 text-sm last:border-0 hover:bg-muted/50' href={`https://www.reddit.com/r/${s.name}/`} target='_blank' rel='noreferrer'><span>r/{s.name}</span><span className='tabular-nums text-muted-foreground'>{$tj('common.itemCount',{0:s.count})}</span></a>
              )) : <p className='px-4 py-3 text-sm text-muted-foreground'>{$t('dataReddit.noneSelectedPeriod')}</p>}
            </Card>
          </div>
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
