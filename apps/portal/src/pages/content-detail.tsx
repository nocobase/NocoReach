import {useMemo,useState} from 'react';
import {Link,useNavigate} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {CartesianGrid,Legend,Line,LineChart,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Tag} from '@/components/reach/tag';
import {DetailDrawer} from './detail-drawer';
import {useFreshData} from './workspace-cache';
import {workState,type Work} from './task-execution-types';
import {effectItems,effectLine,effectPages,monthDay} from './effect-model';
import {stateTone} from './task-list-model';
import {typeLabels} from './site-content-connect';
import {Bot} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {DraftHandOffDialog} from './keyword-hand-off';
import {HandOffNotice,type HandOffResult} from './strategy/hand-off';
import {contentPageDraft} from './seo-hand-off';
// 内容 详情 (SPEC §5): the page's daily views and search clicks with each change's go-live day marked, and the tasks
// that worked on it with their effect checks.
export type ContentTask={id:number;title:string;status:string;evidence?:{no?:number;work?:Work}};
type PageView={connected:boolean;window?:{start:string;end:string;days:number}|null;gscCutoff?:string|null;ga4Cutoff?:string|null;daily?:{date:string;views?:number;clicks?:number;impressions?:number}[]};
const pageKey=(u?:string)=>{try{const x=new URL(String(u));return `${x.host.toLowerCase().replace(/^www\./,'')}${x.pathname.replace(/\/+$/,'')||'/'}`;}catch{return '';}};
const stateNames={todo:'待开始',doing:'进行中',review:'等你处理',done:'已完成'} as const;
// Tasks that changed or are changing this page: its released pages, the published page or the linked page.
export function tasksForPage(tasks:ContentTask[],url:string){const key=pageKey(url);return tasks.filter(t=>{const w=t.evidence?.work;return w&&!w.archivedAt&&[...effectPages(w),w.page?.url].some(u=>pageKey(u)===key);});}
export const activeTasks=(list:ContentTask[])=>list.filter(t=>{const w=t.evidence?.work;return w&&!w.cancelledAt&&workState(w,t.status)!=='done';});
export function ContentDetail({projectId,page,tasks,range,rangeLabel='所选时间',onClose}:{projectId:number;page:{url:string;title?:string;type:string;lastmod?:string|null;views?:number|null;clicks?:number|null;impressions?:number|null;position?:number|null;words?:number|null};tasks:ContentTask[];range:string;rangeLabel?:string;onClose:()=>void}){
 const [handing,setHanding]=useState(false),[handed,setHanded]=useState<HandOffResult>(),navigate=useNavigate();
 // At least 90 days, so a change and the weeks after it fit on one chart.
 const span=['7','28'].includes(range)?'90':range;
 const {data,error}=useFreshData<PageView>(`content-page:${projectId}:${page.url}:${span}`,()=>api.action<PageView>('nrDataViews','page',{method:'POST',body:{projectId:String(projectId),url:page.url,range:span},unwrap:'data'}));
 const linked=useMemo(()=>tasksForPage(tasks,page.url).sort((a,b)=>String(b.evidence?.work?.observeFrom||'9').localeCompare(String(a.evidence?.work?.observeFrom||'9'))),[tasks,page.url]);
 const releases=linked.filter(t=>t.evidence?.work?.observeFrom).map(t=>({id:t.id,no:t.evidence?.no,date:new Date(t.evidence!.work!.observeFrom!).toISOString().slice(0,10)}));
 const hasData=Boolean(data?.daily?.some(d=>d.views!==undefined||d.clicks!==undefined));
 return <DetailDrawer open onClose={onClose} title={page.title||page.url} description={`${typeLabels[page.type]||page.type}${page.lastmod?` · 更新于 ${page.lastmod.slice(0,10)}`:''}`}>
  <div className="space-y-5 text-sm">
   <div className="flex flex-wrap items-center justify-between gap-2"><a className="nr-link block min-w-0 break-all" href={page.url} target="_blank" rel="noreferrer">{page.url}</a><span className="flex gap-2"><Button size="sm" variant="ghost" onClick={()=>navigate(`/audit?lighthouse=${encodeURIComponent(page.url)}`)}>性能检查</Button><Button size="sm" variant="outline" onClick={()=>setHanding(true)}><Bot data-icon="inline-start"/>交给 Agent</Button></span></div>
   <HandOffNotice result={handed}/>
   {handing&&<DraftHandOffDialog projectId={projectId} draft={contentPageDraft(page,rangeLabel)} playbookId="optimize-page" page={page.url} description="这个页面和它最近的访问、搜索数据写进任务说明，确认后立即开始。" onClose={()=>setHanding(false)} onDone={r=>{setHanding(false);setHanded(r);}}/>}
   <section className="space-y-2"><h3 className="text-sm font-semibold">每日访问与搜索点击</h3>
    {error?<p className="nr-error" role="alert">页面数据没有读出来。</p>:!data?<p role="status" className="nr-footnote">正在读取…</p>:!hasData?<p className="text-muted-foreground">所选时间里这个页面还没有访问或搜索数据。</p>:
     <div className="nr-chart-box" data-content-chart><ResponsiveContainer width="100%" height={220}><LineChart data={data.daily} margin={{top:16,right:8,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={(d:string)=>d.slice(5)} minTickGap={24} fontSize={11}/><YAxis yAxisId="v" fontSize={11} width={40} allowDecimals={false}/><YAxis yAxisId="c" orientation="right" fontSize={11} width={32} allowDecimals={false}/><Tooltip/><Legend/>
      {releases.filter(r=>data.window&&r.date>=data.window.start&&r.date<=data.window.end).map(r=><ReferenceLine key={r.id} yAxisId="v" x={r.date} stroke="var(--chart-1)" strokeDasharray="4 3" label={{value:r.no?`T-${r.no} 上线`:'上线',position:'top',fontSize:10,fill:'var(--muted-foreground)'}}/>)}
      <Line yAxisId="v" isAnimationActive={false} type="linear" dataKey="views" name="访问（GA4 浏览）" stroke="var(--chart-3)" dot={false} connectNulls={false}/><Line yAxisId="c" isAnimationActive={false} type="linear" dataKey="clicks" name="搜索点击" stroke="var(--chart-2)" dot={false} connectNulls={false}/></LineChart></ResponsiveContainer></div>}
    {data?.window&&<p className="nr-footnote">{data.window.start} 至 {data.window.end}；虚线是改动上线的日子。GA4 截至 {data.ga4Cutoff||'—'}，Search Console 截至 {data.gscCutoff||'—'}，没有数据的日子留空。</p>}
   </section>
   <section className="space-y-2"><h3 className="text-sm font-semibold">任务与效果</h3>
    {!linked.length?<p className="text-muted-foreground">还没有任务改过这个页面。</p>:linked.map(t=>{const w=t.evidence!.work!,state=w.cancelledAt?null:workState(w,t.status),items=effectItems(w);return <div key={t.id} className="space-y-1 rounded-lg border border-border p-3" data-content-task={t.id}>
     <div className="flex flex-wrap items-center gap-2"><Link className="nr-link font-medium" to={`/actions/${t.id}`}>{t.evidence?.no?`T-${t.evidence.no} `:''}{t.title}</Link>{state?<Tag tone={stateTone[state]}>{stateNames[state]}</Tag>:<Tag tone="slate">已取消</Tag>}</div>
     {w.observeFrom?<p className="nr-footnote">{new Date(w.observeFrom).toISOString().slice(0,10)} 上线</p>:null}
     {items.map(i=><p key={i.day} className="text-xs">{i.result?effectLine(i.result):`第 ${i.day} 天：预计 ${i.expected} 出结果`}</p>)}
    </div>;})}
    {releases.length?<p className="nr-footnote">效果按上线前后同样长的日子比较；同期还有别的改动时，任务页里会列出来。最近一次：{monthDay(releases[0].date)}。</p>:null}
   </section>
  </div>
 </DetailDrawer>;
}
