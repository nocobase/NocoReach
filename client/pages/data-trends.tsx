import { $t, $tj, $legacyText } from '#i18n';
import { chipButtonClass, chipClass } from '#components/reach/chip';
import { cn } from '#lib/utils';
import { usePageTab } from '#hooks/use-page-tab';
// 趋势 (搜索): Google Trends once a week through DataForSEO. 产品与竞品: the product and its competitors over the past 12
// months, each term's last four weeks against the four before, and the searches related to the product (rising ones new
// this week marked); picked searches go to the Agent as one content task. 关注的关键词 (2026-10-04): keywords added on
// this page, each on its own line (trends-keywords.tsx).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { ExternalLink, LoaderCircle, TrendingUp } from 'lucide-react';
import { RefreshButton } from '#components/reach/refresh-button';
import { confirmAction } from '#components/reach/confirm';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from '#lib/toast';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, InlineError, ListSkeleton, LoadError } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { Checkbox } from '#components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import { useProject } from './reach-data';
import { useFreshData } from './workspace-cache';
import { HandOffBar } from './hand-off-bar';
import { useHandOffSource } from '#components/reach/hand-off-slot';
import { trendsDraft, type TrendQuery } from './seo-hand-off';
import './data-views.css';
import { Tag } from '#components/reach/tag';
import { InfoTip, NotesTip } from '#components/reach/info-tip';
import { TrendKeywords, type KeywordWatch } from './trends-keywords';
import { formatDateTime } from '#lib/format';
import { Delta } from '#components/reach/delta';

type Query = { query: string; value: number; isNew?: boolean };
type Rival = { id: string; name: string; included: boolean };
type View = KeywordWatch & { connected: boolean; product?: string; competitors?: Rival[]; maxRivals?: number; terms?: string[]; place?: string; checking?: boolean; lastRun?: { at: string; ok: boolean; errors: string[] } | null; checkedAt?: string | null; checkUrl?: string | null; points?: { date: string; values: (number | null)[] }[]; summary?: { term: string; average: number | null; recent: number | null; change: number | null }[]; top?: Query[]; rising?: Query[]; notes?: string[] };
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
const change = (v: number | null) => (v === null ? '—' : <Delta value={v} />);

export default function DataTrends() {
  const { project } = useProject();
 const activeProjectId=project?.id;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Record<string, TrendQuery>>({});
  const [params, setParams] = useSearchParams();
  const load = useCallback(() => api.action<View>('nrTrends', 'view', { method: 'POST', body: { projectId: activeProjectId }, unwrap: 'data' }), [activeProjectId]);
  const { data, error } = useFreshData(project ? `data-view:trends:${project.id}` : null, load);
  // After adding or removing a keyword, and while a new keyword is being queried, the page shows the latest view.
  const [live, setLive] = useState<View>();
  useEffect(() => setLive(undefined), [data]);
  const view = live ?? data;
  const pending = Boolean(view?.checking) || (view?.keywords ?? []).some((k) => k.checking || (!k.lastRun && Date.now() - Date.parse(k.addedAt) < 600000));
  // After an uncertain run the same query is held back; 重新查询 is the user's own decision to ask again.
  const retry = async (keywordId?: string) => {
    if (!(await confirmAction({ title: () => ($t('dataTrends.checkAgain')), description: () => ($t('dataTrends.lastCheckMayChargedChecking')), action: 'common.queryAgain', destructive: false }))) return;
    try { setLive(await api.action<View>('nrTrends', 'retry', { method: 'POST', body: { projectId: project!.id, ...(keywordId ? { keywordId } : {}) }, unwrap: 'data' })); toast.success(() => ($t('dataTrends.checkStartedAgain'))); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.startFailed'))); }
  };
  useEffect(() => { if (!pending || !activeProjectId) return; const t = setInterval(() => void load().then(setLive).catch(() => undefined), 4000); return () => clearInterval(t); }, [load, pending, activeProjectId]);
  const explicit = params.get('tab');
  const tab = explicit === 'brand' || explicit === 'keywords' ? explicit : view && !view.connected ? 'keywords' : 'brand';
  usePageTab(tab === 'keywords' ? $t('dataTrends.keywordsFollow', { 0: '' }) : $t('dataTrends.productCompetitors'));
  const setTab = (t: string) => { const next = new URLSearchParams(params); next.set('tab', t); setParams(next, { replace: true }); };
  const check = async () => {
    setBusy(true);
    try { await api.action('nrTrends', 'check', { method: 'POST', body: { projectId: project!.id }, unwrap: 'data' }); toast.success(() => ($t('common.checkStartedUsuallyMinuteTwo'))); setLive(await load()); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.notFullyChecked'))); }
    finally { setBusy(false); }
  };
  const terms = view?.terms || [], chart = (view?.points || []).map((p) => ({ date: p.date, ...Object.fromEntries(terms.map((t, i) => [t, p.values[i]])) }));
  const toggle = (q: Query, kind: TrendQuery['kind'], on: boolean) => setPicked((cur) => { const next = { ...cur }; if (on) next[kind + q.query] = { query: q.query, value: q.value, kind }; else delete next[kind + q.query]; return next; });
  const list = (title: string, kind: TrendQuery['kind'], rows: Query[], empty: string) => (
    <Card className='gap-0 py-0' data-list={kind}>
      <h2 className='border-b border-border px-4 py-3 text-sm font-semibold'>{title}</h2>
      {rows.length ? rows.map((q) => (
        <label key={q.query} className='flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-0 hover:bg-muted/50' data-query={q.query}>
          <Checkbox checked={Boolean(picked[kind + q.query])} onCheckedChange={(on) => toggle(q, kind, on === true)} />
          <span className='min-w-0 flex-1 truncate'>{q.query}</span>
          {q.isNew ? <Tag tone='blue'>{$t('common.newWeek')}</Tag> : null}
          {kind === 'rising' ? <Delta value={q.value / 100} /> : <span className='tabular-nums text-muted-foreground'>{q.value}</span>}
        </label>
      )) : <p className='px-4 py-3 text-sm text-muted-foreground'>{empty}</p>}
    </Card>
  );
  const chosen = Object.values(picked);
  useHandOffSource('trends-related', tab === 'brand' && view?.connected && terms.length ? { count: chosen.length, playbookId: 'content-outline', description: $t('common.selectedRelatedSearchesBecomeOne'), draft: () => trendsDraft(terms[0], view.place || $t('common.worldwide'), chosen), clear: () => setPicked({}) } : null);
  return (
    <PageContainer className='nr-data-page'>
      <PageHeader info={tab === 'brand' ? <NotesTip notes={view?.notes} /> : undefined} title={$t('dataTrends.trends')} description={$t('dataTrends.googleInterestProductCompetitorsKeywords')} actions={view?.connected || view?.keywords?.length ? <RefreshButton busy={busy || Boolean(view.checking)} label={busy ? $t('common.querying') : $t('common.updateNow')} onClick={() => void check()} /> : undefined} />
      {error ? <LoadError title={$t('dataTrends.notLoadTrends')} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view ? (
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList variant='line' className='h-auto! justify-start'>
            <TabsTrigger value='brand'>{$t('dataTrends.productCompetitors')}</TabsTrigger>
            <TabsTrigger value='keywords'>{$tj('dataTrends.keywordsFollow',{0:view.keywords?.length ? ` ${view.keywords.length}` : ''})}</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {view && project && tab === 'keywords' ? <TrendKeywords projectId={project.id} view={view} onView={(v) => setLive({ ...view, ...v })} onRetry={(id) => void retry(id)} /> : null}
      {view && tab === 'brand' && !view.connected ? <EmptyState icon={<TrendingUp />} title={$t('dataTrends.noProductCompetitorComparisonSet')} description={$t('dataTrends.enterProductNameUp4')} action={<Button onClick={() => void navigate('/connections?source=trends')}>{$t('dataTrends.setUpComparison')}</Button>} /> : null}
      {view?.connected && tab === 'brand' ? (
        <>
          <Rivals projectId={project!.id} view={view} onView={setLive} />
          <p className='nr-footnote'>{$tj('common.past12Months',{0:$legacyText(view.place),1:view.checkedAt ? $t('common.checked',{0:formatDateTime(view.checkedAt)}) : ''})}{view.checkUrl ? <> · <a className='nr-link' href={view.checkUrl} target='_blank' rel='noreferrer'>{$t('common.openGoogleTrends')}<ExternalLink className='ml-0.5 inline size-3' /></a></> : null}</p>
          {view.lastRun && !view.lastRun.ok && !view.checking ? <InlineError action={view.lastRun.errors[0]?.includes('不确定') ? <Button size='sm' variant='outline' onClick={() => void retry()}>{$t('common.queryAgain')}</Button> : undefined}>{$tj('common.lastCheckNotComplete',{0:$legacyText(view.lastRun.errors[0])})}</InlineError> : null}
          {view.checking ? <p role='status' className='flex items-center gap-2 text-sm text-muted-foreground'><LoaderCircle className='size-4 animate-spin' />{$t('dataTrends.checkingGoogleTrendsUsuallyMinute')}</p> : null}
          {!view.checkedAt ? (view.checking ? null : <p role='status' className='text-sm text-muted-foreground'>{!view.lastRun ? $t('dataTrends.firstCheckProgressUsuallyMinute') : $t('common.noDataYet')}</p>) : (
            <>
              <div className='grid grid-cols-2 gap-3 lg:grid-cols-5'>
                {view.summary!.map((s, i) => (
                  <Card key={s.term} className='gap-1 p-4' data-metric={s.term}>
                    <p className='flex items-center gap-1.5 truncate text-xs text-muted-foreground'><span className='inline-block size-2 shrink-0 rounded-full' style={{ background: COLORS[i] }} />{s.term}</p>
                    <p className='text-2xl font-semibold tabular-nums'>{s.recent ?? '—'}</p>
                    <p className='text-xs text-muted-foreground'>{$t('common.last4Weeks')} {change(s.change)}  {$tj('dataTrends.value12MonthAverage',{0:s.average ?? '—'})}</p>
                  </Card>
                ))}
              </div>
              <Card className='gap-3 px-4'>
                <h2 className='flex items-center gap-1 text-sm font-semibold'>{$t('dataTrends.interestWeeklyPeak100')}<InfoTip label={$t('common.info')}>{$t('dataTrends.interestNote')}</InfoTip></h2>
                <div className='nr-chart-box' data-trends-chart>
                  <ResponsiveContainer width='100%' height={260}>
                    <LineChart data={chart} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray='3 3' vertical={false} />
                      <XAxis dataKey='date' tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                      <YAxis domain={[0, 100]} allowDecimals={false} fontSize={11} width={36} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {terms.map((t, i) => <Line key={t} isAnimationActive={false} type='linear' dataKey={t} stroke={COLORS[i]} strokeWidth={i === 0 ? 2.5 : 1.5} dot={false} connectNulls />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <div>
                <h2 className='flex items-center gap-1 text-sm font-semibold'>{$tj('dataTrends.relatedSearches',{0:terms[0],1:chosen.length ? $t('dataTrends.selected',{0:chosen.length}) : ''})}<InfoTip label={$t('common.info')}>{$t('dataTrends.relatedSearchesHelp')}</InfoTip></h2>
              </div>
              <div className='grid gap-4 lg:grid-cols-2'>
                {list($t('common.rising'), 'rising', view.rising || [], $t('common.noClearlyRisingRelatedSearches'))}
                {list($t('common.top'), 'top', view.top || [], $t('common.googleGaveNoRelatedSearches'))}
              </div>
              
            </>
          )}
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

// 对比 (2026-10-05 user choice): the product and the competitors from 竞品. With more than four, chips pick which four
// (Google Trends compares five words at most); the new set is queried once 重新比较 is pressed.
function Rivals({ projectId, view, onView }: { projectId: number; view: View; onView: (v: View) => void }) {
  const navigate = useNavigate();
  const list = view.competitors ?? [], max = view.maxRivals ?? 4, terms = view.terms ?? [];
  // Preserve an unsaved choice when polling returns the same membership.
  const includedKey = JSON.stringify(list.filter((c) => c.included).map((c) => c.id));
  const included = useMemo(() => JSON.parse(includedKey) as string[], [includedKey]);
  const [draft, setDraft] = useState<string[]>(included);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(included), [included]);
  const choosing = list.length > max, changed = draft.join() !== included.join();
  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : d.length < max ? [...list.map((c) => c.id).filter((x) => d.includes(x) || x === id)] : d));
  const apply = async () => {
    setBusy(true);
    try { onView({ ...view, ...(await api.action<View>('nrTrends', 'pick', { method: 'POST', body: { projectId, competitorIds: draft }, unwrap: 'data' })) }); toast.success(() => ($t('dataTrends.comparingAgainNewCompetitors'))); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.notSaved'))); }
    finally { setBusy(false); }
  };
  const chip = (name: string, color: string | null, id?: string) => {
    const on = !id || draft.includes(id), canClick = Boolean(id) && choosing && !busy;
    const body = <><span className='size-2 shrink-0 rounded-full' style={{ background: on && color ? color : 'transparent', border: on ? undefined : '1px dashed var(--muted-foreground)' }} />{name}</>;
    return canClick
      ? <button key={id} type='button' aria-pressed={on} className={cn(chipClass, chipButtonClass, !on && 'border-dashed bg-transparent text-muted-foreground')} onClick={() => toggle(id!)}>{body}</button>
      : <span key={id || name} className={cn(chipClass, !on && 'border-dashed bg-transparent text-muted-foreground')}>{body}</span>;
  };
  return (
    <div className='space-y-1.5' data-rivals>
      <div className='flex flex-wrap items-center gap-1.5'>
        <span className='inline-flex items-center gap-1 text-sm text-muted-foreground'>{$t('dataTrends.compare')}<InfoTip label={$t('dataTrends.howComparisonSet')}><p>{$t('dataTrends.competitorsComeCompetitorsPageComparison')}</p><p>{$t('dataTrends.competitorSelectionHelp')}</p></InfoTip></span>
        {chip(view.product || terms[0] || '', COLORS[0])}
        {list.map((c) => chip(c.name, terms.includes(c.name) ? COLORS[terms.indexOf(c.name)] : 'var(--muted-foreground)', c.id))}
        {!list.length ? <span className='text-sm text-muted-foreground'>{$t('common.noCompetitorsYet')}</span> : null}
        {changed ? <Button size='sm' disabled={busy || !draft.length} onClick={() => void apply()}>{busy ? $t('common.saving') : $t('dataTrends.compareAgain',{0:draft.length})}</Button> : null}
        <Button size='sm' variant='outline' className='ml-auto' onClick={() => void navigate('/competitors')}>{list.length ? $t('dataTrends.manageCompetitors') : $t('dataTrends.addCompetitors')}</Button>
      </div>
    </div>
  );
}
