import { getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
// Reddit (社区): threads that name the product, found once a week through a Google search of reddit.com, with their
// subreddits; visits from Reddit when GA4 is connected.
import { useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "#lib/toast";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { StatTile } from "#components/seo/stat-tile";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker, useRange } from "./range-picker";
import { MetricTile, type Metric } from "./data-parts";
import { safeLink } from "./analytics";
import { HandOffBar } from "./hand-off-bar";
import { AllCheck, RowCheck, useTickedList } from "#components/reach/hand-off-slot";
import { discussionsDraft } from "./seo-hand-off";
import "./data-views.css";
import { NotesTip } from "#components/reach/info-tip";

type Post = { id: string; title: string; url: string; subreddit: string; snippet: string; postedAt: string | null; firstSeenAt: string; term: string };
type View = { connected: boolean; terms?: string[]; window?: { start: string; end: string; days: number }; retainedFrom?: string | null; lastRun?: { at: string; ok: boolean; errors: string[] } | null; total?: number; visits?: { sessions: number; views: number; conversions: number; previous: number } | null; kpis?: Metric[]; notes?: string[]; subreddits?: { name: string; count: number }[]; posts?: Post[] };

export default function DataReddit() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const custom = range.range === "custom" && (!range.from || !range.to);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:reddit:${project.id}:${JSON.stringify(range)}:${nonce}` : null, () => api.action<View>("nrReddit", "view", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const check = async () => {
    setBusy(true);
    try { const r = await api.action<{ added: number; errors: string[] }>("nrReddit", "check", { method: "POST", body: { projectId: project!.id }, unwrap: "data" }); toast.success(() => (r.errors.length ? $t('dataReddit.partlyNotSearched',{0:$legacyText(r.errors[0])}) : r.added ? $t('dataReddit.newPostsFound',{0:r.added}) : $t('common.noNewPosts'))); setNonce((n) => n + 1); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.notFullyChecked'))); }
    finally { setBusy(false); }
  };
  const w = view?.window, visits = view?.visits;
  const posts = useTickedList("reddit-posts", view?.connected ? view.posts : undefined, (p) => String(p.id), (ticked) => ({ playbookId: "community-summary", description: $t('dataReddit.postsBecomeOneTaskAgent'), draft: () => discussionsDraft("Reddit", $t('common.posts'), ticked.map((p) => ({ title: p.title, url: p.url, meta: `r/${p.subreddit} · ${p.postedAt || p.firstSeenAt.slice(0, 10)}`, excerpt: p.snippet }))) }));
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title="Reddit" description={$t('dataReddit.redditPostsMentioningProductSearched')} actions={view?.connected ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void check()}><RefreshCw data-icon="inline-start" />{busy ? $t('common.searching') : $t('common.searchNow')}</Button> : undefined} />
      <RangePicker value={range} onChange={setRange} summary={w ? $t('common.comparedPreviousDays',{0:w.start,1:w.end,2:w.days}) : undefined} />
      {error ? <LoadError title={$t('dataReddit.notLoadRedditDiscussions')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<MessageCircle />} title={$t('dataReddit.onceRedditDiscussionsConnectedPosts')} description={$t('dataReddit.searchedGoogleOnceWeekThrough')} action={<Button onClick={() => navigate("/connections?source=reddit")}>{$t('dataReddit.connectRedditDiscussions')}</Button>} /> : null}
      {view?.connected ? (
        <>
          <p className="nr-footnote">{$tj('dataReddit.searchTerm',{0:view.terms!.join("、"),1:view.lastRun ? $t('common.lastSearched',{0:new Date(view.lastRun.at).toLocaleString(getCurrentLocale())}) : ""})}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}
            {visits ? <Card className="gap-0 p-4" data-metric={$t('dataReddit.trafficReddit')}><StatTile label={$t('dataReddit.trafficReddit')} value={visits.sessions.toLocaleString(getCurrentLocale())} delta={visits.previous ? { change: (visits.sessions - visits.previous) / visits.previous, better: visits.sessions >= visits.previous } : null} hint={$t('dataReddit.viewsKeyEvents',{0:visits.views.toLocaleString(getCurrentLocale()),1:visits.conversions.toLocaleString(getCurrentLocale())})} /></Card> : null}
          </div>
          
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="gap-0 py-0">
              <div className="flex items-center gap-3 border-b border-border px-4 py-2"><AllCheck selection={posts} count={view.posts!.length} /><h2 className="text-sm font-semibold">{$t('common.posts')}</h2></div>
              {view.posts!.length ? view.posts!.map((p) => (
                <div key={p.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0" data-post={p.id}>
                  <span className="pt-0.5"><RowCheck selection={posts} k={String(p.id)} label={p.title || p.url} /></span><div className="min-w-0 flex-1">
                  <a className="nr-link font-medium" href={safeLink(p.url)} target="_blank" rel="noreferrer">{p.title || p.url}</a>
                  {p.snippet ? <p className="line-clamp-2 text-sm text-muted-foreground">{p.snippet}</p> : null}
                  <p className="text-xs text-muted-foreground">r/{p.subreddit} · {p.postedAt ? $t('dataReddit.posted',{0:p.postedAt}) : $t('dataReddit.postDateUnknownFound',{0:p.firstSeenAt.slice(0, 10)})}</p>
                </div></div>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">{$t('dataReddit.noNewPostsSelectedPeriod')}</p>}
            </Card>
            <Card className="gap-0 py-0">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{$t('dataReddit.subreddit')}</h2>
              {view.subreddits!.length ? view.subreddits!.map((s) => (
                <a key={s.name} className="flex items-center justify-between border-b border-border px-4 py-2 text-sm last:border-0 hover:bg-muted/50" href={`https://www.reddit.com/r/${s.name}/`} target="_blank" rel="noreferrer"><span>r/{s.name}</span><span className="tabular-nums text-muted-foreground">{$tj('common.itemCount',{0:s.count})}</span></a>
              )) : <p className="px-4 py-3 text-sm text-muted-foreground">{$t('dataReddit.noneSelectedPeriod')}</p>}
            </Card>
          </div>
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
