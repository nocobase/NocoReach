import { googleLocalFreshness } from '../../shared/google-cache.js';
import { $t, $tj } from "#i18n";
import {useMemo,useState} from 'react';
import {Link,useNavigate} from 'react-router';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {CartesianGrid,Legend,Line,LineChart,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Tag} from '#components/reach/tag';
import {InfoTip} from '#components/reach/info-tip';
import {DetailDrawer} from './detail-drawer';
import {useFreshData} from './workspace-cache';
import {workState,type Work} from './task-execution-types';
import {effectItems,effectLine,effectPages,monthDay} from './effect-model';
import {stateTone} from './task-list-model';
import {getTypeLabels} from './site-content-connect';
import {Bot} from 'lucide-react';
import {Button} from '#components/ui/button';
import {DraftHandOffDialog} from './keyword-hand-off';
import {HandOffNotice,type HandOffResult} from './strategy/hand-off';
import {contentPageDraft} from './seo-hand-off';
import { formatDate } from '#lib/format';
// 内容 详情 (SPEC §5): the page's daily views and search clicks with each change's go-live day marked, and the tasks
// that worked on it with their effect checks.
export type ContentTask={id:number;title:string;status:string;evidence?:{no?:number;work?:Work}};
type PageView={connected:boolean;window?:{start:string;end:string;days:number}|null;gscCutoff?:string|null;ga4Cutoff?:string|null;daily?:{date:string;views?:number;clicks?:number;impressions?:number}[]};
const pageKey=(u?:string)=>{try{const x=new URL(String(u));return `${x.host.toLowerCase().replace(/^www\./,'')}${x.pathname.replace(/\/+$/,'')||'/'}`;}catch{return '';}};
const getStateNames = () => ({todo:$t('contentDetail.notStarted'),doing:$t('common.inProgress'),review:$t('common.needsAction'),done:$t('common.completed')} as const);
// Tasks that changed or are changing this page: its released pages, the published page or the linked page.
export function tasksForPage(tasks:ContentTask[],url:string){const key=pageKey(url);return tasks.filter(t=>{const w=t.evidence?.work;return w&&!w.archivedAt&&[...effectPages(w),w.page?.url].some(u=>pageKey(u)===key);});}
export const activeTasks=(list:ContentTask[])=>list.filter(t=>{const w=t.evidence?.work;return w&&!w.cancelledAt&&workState(w,t.status)!=='done';});
export function ContentDetail({projectId,googleScope,page,tasks,range,from,to,rangeLabel=$t('common.selectedPeriod'),onClose}:{projectId:number;googleScope?:string;page:{url:string;title?:string;type:string;lastmod?:string|null;views?:number|null;clicks?:number|null;impressions?:number|null;position?:number|null;words?:number|null};tasks:ContentTask[];range:string;from?:string;to?:string;rangeLabel?:string;onClose:()=>void}){
 const [handing,setHanding]=useState(false),[handed,setHanded]=useState<HandOffResult>(),navigate=useNavigate();
 // At least 90 days, so a change and the weeks after it fit on one chart.
 const span=['7','28'].includes(range)?'90':range;
 const {data,error}=useFreshData<PageView>(`data-view:content-page:${projectId}:${googleScope||''}:${page.url}:${span}:${from||''}:${to||''}`,()=>api.action<PageView>('nrDataViews','page',{method:'POST',body:{projectId:String(projectId),url:page.url,range:span,from,to},unwrap:'data'}),googleLocalFreshness);
 const linked=useMemo(()=>tasksForPage(tasks,page.url).sort((a,b)=>String(b.evidence?.work?.observeFrom||'9').localeCompare(String(a.evidence?.work?.observeFrom||'9'))),[tasks,page.url]);
 const releases=linked.filter(t=>t.evidence?.work?.observeFrom).map(t=>({id:t.id,no:t.evidence?.no,date:new Date(t.evidence!.work!.observeFrom!).toISOString().slice(0,10)}));
 const hasData=Boolean(data?.daily?.some(d=>d.views!==undefined||d.clicks!==undefined));
 return <DetailDrawer open onClose={onClose} title={page.title||page.url} description={`${getTypeLabels()[page.type]||page.type}${page.lastmod?$t('contentDetail.updated',{0:page.lastmod.slice(0,10)}):''}`} actions={<Button size="sm" onClick={()=>setHanding(true)}><Bot data-icon="inline-start"/>{$t('common.handOffAgent')}</Button>}>
  <div className="space-y-5 text-sm">
   <div className="flex flex-wrap items-center justify-between gap-2"><a className="nr-link block min-w-0 break-all" href={page.url} target="_blank" rel="noreferrer">{page.url}</a><Button size="sm" variant="outline" onClick={()=>navigate(`/audit?lighthouse=${encodeURIComponent(page.url)}`)}>{$t('contentDetail.performanceCheck')}</Button></div>
   <HandOffNotice result={handed}/>
   {handing&&<DraftHandOffDialog projectId={projectId} draft={contentPageDraft(page,rangeLabel)} playbookId="optimize-page" page={page.url} description={$t('contentDetail.pageRecentTrafficSearchData')} onClose={()=>setHanding(false)} onDone={r=>{setHanding(false);setHanded(r);}}/>}
   <section className="space-y-2"><div className="flex items-center gap-1"><h3 className="text-sm font-semibold">{$t('contentDetail.dailyTrafficSearchClicks')}</h3>{data?.window&&<InfoTip label={$t('common.howReadChart')}>{$tj('contentDetail.dashedLinesMarkDaysChanges',{0:formatDate(data.window.start),1:formatDate(data.window.end),2:formatDate(data.ga4Cutoff),3:formatDate(data.gscCutoff)})}</InfoTip>}</div>
    {error?<p className="nr-error" role="alert">{$t('contentDetail.notLoadPageData')}</p>:!data?<p role="status" className="nr-footnote">{$t('common.loadingLoading')}</p>:!hasData?<p className="text-muted-foreground">{$t('contentDetail.noTrafficSearchDataPage')}</p>:
     <div className="nr-chart-box" data-content-chart><ResponsiveContainer width="100%" height={220}><LineChart data={data.daily} margin={{top:16,right:8,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={(d:string)=>d.slice(5)} minTickGap={24} fontSize={11}/><YAxis yAxisId="v" fontSize={11} width={40} allowDecimals={false}/><YAxis yAxisId="c" orientation="right" fontSize={11} width={32} allowDecimals={false}/><Tooltip/><Legend/>
      {releases.filter(r=>data.window&&r.date>=data.window.start&&r.date<=data.window.end).map(r=><ReferenceLine key={r.id} yAxisId="v" x={r.date} stroke="var(--chart-1)" strokeDasharray="4 3" label={{value:r.no?$t('contentDetail.tLive',{0:r.no}):$t('common.live'),position:'top',fontSize:10,fill:'var(--muted-foreground)'}}/>)}
      <Line yAxisId="v" isAnimationActive={false} type="linear" dataKey="views" name={$t('contentDetail.trafficGa4Views')} stroke="var(--chart-3)" dot={false} connectNulls={false}/><Line yAxisId="c" isAnimationActive={false} type="linear" dataKey="clicks" name={$t('common.searchClicks')} stroke="var(--chart-2)" dot={false} connectNulls={false}/></LineChart></ResponsiveContainer></div>}
    
   </section>
   <section className="space-y-2"><div className="flex items-center gap-1"><h3 className="text-sm font-semibold">{$t('contentDetail.tasksImpact')}</h3>{releases.length?<InfoTip label={$t('contentDetail.howImpactMeasured')}>{$tj('contentDetail.impactComparesEqualPeriodsBefore',{0:monthDay(releases[0].date)})}</InfoTip>:null}</div>
    {!linked.length?<p className="text-muted-foreground">{$t('contentDetail.noTaskChangedPageYet')}</p>:linked.map(t=>{const w=t.evidence!.work!,state=w.cancelledAt?null:workState(w,t.status),items=effectItems(w);return <div key={t.id} className="space-y-1 rounded-lg border border-border p-3" data-content-task={t.id}>
     <div className="flex flex-wrap items-center gap-2"><Link className="nr-link font-medium" to={`/actions/${t.id}`}>{t.evidence?.no?`T-${t.evidence.no} `:''}{t.title}</Link>{state?<Tag tone={stateTone[state]}>{getStateNames()[state]}</Tag>:<Tag tone="slate">{$t('contentDetail.cancelled')}</Tag>}</div>
     {w.observeFrom?<p className="nr-footnote">{$tj('contentDetail.live',{0:formatDate(new Date(w.observeFrom).toISOString().slice(0,10))})}</p>:null}
     {items.map(i=><p key={i.day} className="text-xs">{i.result?effectLine(i.result):$t('contentDetail.dayResultsExpected',{0:i.day,1:i.expected})}</p>)}
    </div>;})}
    
   </section>
  </div>
 </DetailDrawer>;
}
