import { translateSourceError, $t, $tj, $legacyText } from '#i18n';
// Discord or Slack (社区; one page each since 2026-10-04): the chosen channels read once a day — messages and questions in
// the range, per channel, the questions that may be unanswered and the threads with the most replies.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { MessagesSquare } from 'lucide-react';
import { RefreshButton } from '#components/reach/refresh-button';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from '#lib/toast';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, ListSkeleton, LoadError } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { useProject } from './reach-data';
import { useFreshData } from './workspace-cache';
import { RangePicker } from './range-picker';
import { validRange, useRange } from './range-state';
import { MetricTile, metricGrid, type Metric } from './data-parts';
import { safeLink } from './analytics';
import { HandOffBar } from './hand-off-bar';
import { AllCheck, RowCheck, useTickedList, type Selection } from '#components/reach/hand-off-slot';
import { discussionsDraft, replyDraft } from './seo-hand-off';
import './data-views.css';
import { NotesTip } from '#components/reach/info-tip';
import { formatDate, formatDateTime } from '#lib/format';

type Message = { platform: 'discord' | 'slack'; channel: string; text: string; createdAt: string; replies: number; url: string };
type Side = { connected: boolean; name?: string };
type View = { connected: boolean; side?: Side; window?: { start: string; end: string; days: number }; lastRun?: { at: string } | null; kpis?: Metric[]; series?: { date: string; value: number | null }[]; channels?: { platform: string; channel: string; messages: number; questions: number; open: number }[]; open?: Message[]; busiest?: Message[]; notes?: string[] };
const NAME = { discord: 'Discord', slack: 'Slack' } as const;

export function DataChat({ platform }: { platform: 'discord' | 'slack' }) {
  const name = NAME[platform];
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const custom = !validRange(range);
  const { data: view, error } = useFreshData(project && !custom ? `data-view:${platform}:${project.id}:${JSON.stringify(range)}:${nonce}` : null, () => api.action<View>('nrChat', 'view', { method: 'POST', body: { projectId: project!.id, platform, ...range }, unwrap: 'data' }));
  const sync = async () => {
    setBusy(true);
    try { const r = await api.action<{ read: number; errors: string[] }>('nrChat', 'sync', { method: 'POST', body: { projectId: project!.id, platform }, unwrap: 'data' }); toast.success(() => (r.errors.length ? $t('dataChat.partlyNotRead',{0:translateSourceError(r.errors[0])}) : $t('dataChat.read',{0:r.read}))); setNonce((n) => n + 1); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('dataChat.notFullyRead'))); }
    finally { setBusy(false); }
  };
  const w = view?.window, where = view?.side?.name ? `${platform === 'discord' ? $t('common.server') : $t('dataChat.workspace')}：${view.side.name}` : '';
  const asItem = (m: Message) => ({ title: m.text.replace(/\s+/g, ' ').slice(0, 120), url: m.url, meta: `#${m.channel} · ${formatDate(m.createdAt)}` });
  const open = useTickedList(`${platform}-open`, view?.connected ? view.open : undefined, (m) => m.url, (ticked) => ({ playbookId: 'community-reply', description: $t('dataChat.questionsBecomeOneTaskAgent'), draft: () => replyDraft(name, $t('dataChat.unansweredQuestions'), ticked.map(asItem)) }));
  const busiest = useTickedList(`${platform}-busiest`, view?.connected ? view.busiest : undefined, (m) => m.url, (ticked) => ({ playbookId: 'community-summary', description: $t('dataChat.messagesBecomeOneTaskAgent'), draft: () => discussionsDraft(name, $t('dataChat.messages'), ticked.map(asItem)) }));
  const list = (title: string, rows: Message[], empty: string, selection: Selection) => (
    <Card className='gap-0 py-0'>
      <div className='flex items-center gap-3 border-b border-border px-4 py-2'><AllCheck selection={selection} count={rows.length} /><h2 className='text-sm font-semibold'>{title}</h2></div>
      {rows.length ? rows.map((m) => (
        <div key={m.url} className='flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0' data-chat-message>
          <span className='pt-0.5'><RowCheck selection={selection} k={m.url} label={m.text.slice(0, 60)} /></span><div className='min-w-0 flex-1'>
          <p className='line-clamp-2 text-sm'>{m.text}</p>
          <p className='text-xs text-muted-foreground'>#{m.channel} · {formatDate(m.createdAt)}{m.replies ? $t('dataChat.replies',{0:m.replies}) : ''} · <a className='nr-link' href={safeLink(m.url)} target='_blank' rel='noreferrer'>{$t('dataChat.open')}</a></p>
        </div></div>
      )) : <p className='px-4 py-3 text-sm text-muted-foreground'>{empty}</p>}
    </Card>
  );
  return (
    <PageContainer className='nr-data-page'>
      <PageHeader info={<NotesTip notes={view?.notes} />} title={name} description={$t('dataChat.messagesQuestionsSelectedChannelsRead',{0:name})} actions={view?.connected ? <RefreshButton busy={busy} label={busy ? $t('common.loadingLoading') : $t('common.updateNow')} onClick={() => void sync()} /> : undefined} />
      {view && !view.connected ? null : <RangePicker value={range} onChange={setRange} summary={w ? ('all' in w && w.all ? $t('rangePicker.availableRange',{0:formatDate(w.start),1:formatDate(w.end)}) : $t('common.comparedPreviousDays',{0:formatDate(w.start),1:formatDate(w.end),2:w.days})) : undefined} />}
      {error ? <LoadError title={$t('dataChat.notLoad',{0:name})} message={error instanceof Error ? error.message : $t('common.tryAgainLater')} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view && !view.connected ? <EmptyState icon={<MessagesSquare />} title={$t('dataChat.onceConnectedQuestionsChannelsUnanswered',{0:name})} description={platform === 'discord' ? $t('dataChat.usesOwnDiscordBotPaste') : $t('dataChat.usesInternalAppWorkspacePaste')} action={<Button onClick={() => void navigate(`/connections?source=${platform}`)}>{$tj('common.connectValue',{0:name})}</Button>} /> : null}
      {view?.connected ? (
        <>
          <p className='nr-footnote'>{where}{view.lastRun ? $t('dataChat.lastRead',{0:formatDateTime(view.lastRun.at)}) : ''}</p>
          <div className={metricGrid(view.kpis!.length)}>{view.kpis!.map((m) => <Card key={m.key} className='gap-0 p-4' data-metric={m.label}><MetricTile m={m} /></Card>)}</div>
          
          {view.series!.filter((p) => p.value !== null).length > 1 ? (
            <Card className='gap-3 px-4'>
              <h2 className='text-sm font-semibold'>{$t('dataChat.messagesPerDay')}</h2>
              <div className='nr-chart-box'>
                <ResponsiveContainer width='100%' height={200}>
                  <AreaChart data={view.series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray='3 3' vertical={false} />
                    <XAxis dataKey='date' tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={40} />
                    <Tooltip />
                    <Area isAnimationActive={false} type='linear' dataKey='value' name={$t('dataChat.messages')} stroke='var(--chart-3)' fill='var(--chart-3)' fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}
          <div className='grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
            {list($t('dataChat.questionsMayUnanswered'), view.open!, $t('dataChat.noUnansweredQuestionsSelectedPeriod'), open)}
            <Card className='gap-0 py-0'>
              <h2 className='border-b border-border px-4 py-3 text-sm font-semibold'>{$t('dataChat.channel')}</h2>
              {view.channels!.length ? view.channels!.map((c) => (
                <div key={c.platform + c.channel} className='flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-sm last:border-0' data-chat-channel={c.channel}><span className='truncate'>#{c.channel}</span><span className='shrink-0 tabular-nums text-muted-foreground'>{$tj('dataChat.messagesQuestions',{0:c.messages,1:c.questions,2:c.open ? $t('dataChat.unanswered',{0:c.open}) : ''})}</span></div>
              )) : <p className='px-4 py-3 text-sm text-muted-foreground'>{$t('dataChat.noMessagesSelectedPeriod')}</p>}
            </Card>
          </div>
          {list($t('dataChat.mostReplies'), view.busiest!, $t('dataChat.noMessagesRepliesSelectedPeriod'), busiest)}
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
