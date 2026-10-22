import { translateSourceError, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
// X (社区): posts naming the product, read once a day with the project's own X API key within a monthly cap — the daily
// count, engagement, the posts people engaged with most and the newest ones.
import { useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { AtSign } from "lucide-react";
import { RefreshButton } from '#components/reach/refresh-button';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "#lib/toast";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { RangePicker } from './range-picker';
import { validRange, useRange } from './range-state';
import { MetricTile, metricGrid, type Metric } from "./data-parts";
import { safeLink } from "./analytics";
import { HandOffBar } from "./hand-off-bar";
import { AllCheck, RowCheck, useTickedList, type Selection } from "#components/reach/hand-off-slot";
import { discussionsDraft } from "./seo-hand-off";
import "./data-views.css";
import { InfoTip, NotesTip } from "#components/reach/info-tip";
import { formatDate, formatDateTime } from '#lib/format';

type Post = { id: string; text: string; createdAt: string; url: string; metrics: { likes: number; reposts: number; replies: number; quotes: number; views: number | null } };
type View = { connected: boolean; terms?: string[]; handle?: string; window?: { start: string; end: string; days: number }; lastRun?: { at: string; ok: boolean; errors: string[]; capped: boolean } | null; spend?: { usd: number; posts: number; cap: number }; kpis?: Metric[]; series?: { date: string; value: number | null }[]; notes?: string[]; top?: Post[]; latest?: Post[] };
const stats = (m: Post["metrics"]) => $t('dataX.repostsReplies',{0:m.likes.toLocaleString(getCurrentLocale()),1:m.reposts.toLocaleString(getCurrentLocale()),2:m.replies.toLocaleString(getCurrentLocale()),3:m.views != null ? $t('dataX.views',{0:m.views.toLocaleString(getCurrentLocale())}) : ""});

// A post that is only a shortened link has no text worth showing; the row says so and keeps the Open on X link.
const postText = (text: string) => text.replace(/https?:\/\/t\.co\/\S+/g, "").trim();

export default function DataX() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const custom = !validRange(range);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:x:${project.id}:${JSON.stringify(range)}:${nonce}` : null, () => api.action<View>("nrX", "view", { method: "POST", body: { projectId: project!.id, ...range }, unwrap: "data" }));
  const check = async () => {
    setBusy(true);
    try { const r = await api.action<{ added: number; capped: boolean; errors: string[] }>("nrX", "check", { method: "POST", body: { projectId: project!.id }, unwrap: "data" }); toast.success(() => (r.errors.length ? $t('common.notFullyCheckedValue',{0:translateSourceError(r.errors[0])}) : r.capped ? $t('dataX.monthlyCapReached') : r.added ? $t('dataX.new',{0:r.added}) : $t('common.noNewPosts'))); setNonce((n) => n + 1); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.notFullyChecked'))); }
    finally { setBusy(false); }
  };
  const w = view?.window, sp = view?.spend;
  const source = (ticked: Post[]) => ({ playbookId: "community-summary", description: $t('common.postsBecomeOneTaskAgent'), draft: () => discussionsDraft("X", $t('common.posts'), ticked.map((p) => ({ title: p.text.replace(/\s+/g, " ").slice(0, 120), url: p.url, meta: $t('dataX.likes',{0:p.createdAt.slice(0, 10),1:p.metrics.likes}) }))) });
  const top = useTickedList("x-top", view?.connected ? view.top : undefined, (p) => String(p.id), source);
  const latest = useTickedList("x-latest", view?.connected ? view.latest : undefined, (p) => String(p.id), source);
  const list = (title: string, rows: Post[], empty: string, selection: Selection) => (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2"><AllCheck selection={selection} count={rows.length} /><h2 className="text-sm font-semibold">{title}</h2></div>
      {rows.length ? rows.map((p) => (
        <div key={p.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0" data-x-post={p.id}>
          <span className="pt-0.5"><RowCheck selection={selection} k={String(p.id)} label={p.text.slice(0, 60)} /></span><div className="min-w-0 flex-1">
          {postText(p.text) ? <p className="line-clamp-3 whitespace-pre-wrap text-sm">{postText(p.text)}</p> : <p className="text-sm text-muted-foreground">{$t('dataX.linkOnly')}</p>}
          <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)} · {stats(p.metrics)} · <a className="nr-link" href={safeLink(p.url)} target="_blank" rel="noreferrer">{$t('dataX.openX')}</a></p>
        </div></div>
      )) : <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>}
    </Card>
  );
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={<NotesTip notes={view?.notes} />} title="X" description={$t('dataX.postsXMentioningProductChecked')} actions={view?.connected ? <RefreshButton busy={busy} label={busy ? $t('common.searching') : $t('common.updateNow')} onClick={() => void check()} /> : undefined} />
      {view && !view.connected ? null : <RangePicker value={range} onChange={setRange} summary={w ? ('all' in w && w.all ? $t('rangePicker.availableRange',{0:formatDate(w.start),1:formatDate(w.end)}) : $t('common.comparedPreviousDays',{0:formatDate(w.start),1:formatDate(w.end),2:w.days})) : undefined} />}
      {error ? <LoadError title={$t('dataX.notLoadXMentions')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<AtSign />} title={$t('dataX.onceXConnectedPostsMentioning')} description={$t('dataX.needsOwnXApiPaid')} action={<Button onClick={() => navigate("/connections?source=social")}>{$t('dataX.connectX')}</Button>} /> : null}
      {view?.connected ? (
        <>
          <p className="nr-footnote">{$tj('dataX.searchTerm',{0:view.terms!.join("、"),1:view.handle ? $t('common.excluding',{0:view.handle}) : "",2:view.lastRun ? $t('common.lastSearched',{0:formatDateTime(view.lastRun.at)}) : ""})}</p>
          <div className={metricGrid(view.kpis!.length + 1)}>
            {view.kpis!.map((m) => <Card key={m.key} className="gap-0 p-4" data-metric={m.label}><MetricTile m={m} /></Card>)}
            <Card className="gap-1 p-4" data-metric={$t('dataX.spentMonth')}><p className="text-xs text-muted-foreground">{$t('dataX.spentMonthEstimated')}</p><p className="text-2xl font-semibold tabular-nums">${sp!.usd.toFixed(2)}<span className="text-sm font-normal text-muted-foreground"> / ${sp!.cap}</span></p><p className="text-xs text-muted-foreground">{$tj('dataX.read',{0:sp!.posts.toLocaleString(getCurrentLocale())})}</p></Card>
          </div>
          
          {view.series!.filter((p) => p.value !== null).length > 1 ? (
            <Card className="gap-3 px-4">
              <h2 className="flex items-center gap-1 text-sm font-semibold">{$t('dataX.postsMentioningProductPerDay')}<InfoTip label={$t('common.info')}>{$t('dataX.postsPerDayNote')}</InfoTip></h2>
              <div className="nr-chart-box">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={view.series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={40} />
                    <Tooltip />
                    <Area isAnimationActive={false} type="linear" dataKey="value" name={$t('common.posts')} stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-2">
            {list($t('dataX.mostEngagement'), view.top!, $t('dataX.noPostsReadSelectedPeriod'), top)}
            {list($t('dataX.latest'), view.latest!, $t('dataX.noPostsReadSelectedPeriod'), latest)}
          </div>
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
