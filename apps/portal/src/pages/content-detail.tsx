import { $t, $tj } from "@/i18n";
import {useMemo,useState} from 'react';
import {Link,useNavigate} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {CartesianGrid,Legend,Line,LineChart,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Tag} from '@/components/reach/tag';
import {InfoTip} from '@/components/reach/info-tip';
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
const stateNames={todo:$t("待开始"),doing:$t("进行中"),review:$t("等你处理"),done:$t("已完成")} as const;
// Tasks that changed or are changing this page: its released pages, the published page or the linked page.
export function tasksForPage(tasks:ContentTask[],url:string){const key=pageKey(url);return tasks.filter(t=>{const w=t.evidence?.work;return w&&!w.archivedAt&&[...effectPages(w),w.page?.url].some(u=>pageKey(u)===key);});}
export const activeTasks=(list:ContentTask[])=>list.filter(t=>{const w=t.evidence?.work;return w&&!w.cancelledAt&&workState(w,t.status)!=='done';});
export function ContentDetail({projectId,page,tasks,range,rangeLabel=$t("所选时间"),onClose}:{projectId:number;page:{url:string;title?:string;type:string;lastmod?:string|null;views?:number|null;clicks?:number|null;impressions?:number|null;position?:number|null;words?:number|null};tasks:ContentTask[];range:string;rangeLabel?:string;onClose:()=>void}){
 const [handing,setHanding]=useState(false),[handed,setHanded]=useState<HandOffResult>(),navigate=useNavigate();
 // At least 90 days, so a change and the weeks after it fit on one chart.
 const span=['7','28'].includes(range)?'90':range;
 const {data,error}=useFreshData<PageView>(`content-page:${projectId}:${page.url}:${span}`,()=>api.action<PageView>('nrDataViews','page',{method:'POST',body:{projectId:String(projectId),url:page.url,range:span},unwrap:'data'}));
 const linked=useMemo(()=>tasksForPage(tasks,page.url).sort((a,b)=>String(b.evidence?.work?.observeFrom||'9').localeCompare(String(a.evidence?.work?.observeFrom||'9'))),[tasks,page.url]);
 const releases=linked.filter(t=>t.evidence?.work?.observeFrom).map(t=>({id:t.id,no:t.evidence?.no,date:new Date(t.evidence!.work!.observeFrom!).toISOString().slice(0,10)}));
 const hasData=Boolean(data?.daily?.some(d=>d.views!==undefined||d.clicks!==undefined));
 return <DetailDrawer open onClose={onClose} title={page.title||page.url} description={`${typeLabels[page.type]||page.type}${page.lastmod?$t(" · 更新于 {0}",{0:page.lastmod.slice(0,10)}):''}`}>
  <div className="space-y-5 text-sm">
   <div className="flex flex-wrap items-center justify-between gap-2"><a className="nr-link block min-w-0 break-all" href={page.url} target="_blank" rel="noreferrer">{page.url}</a><span className="flex gap-2"><Button size="sm" variant="ghost" onClick={()=>navigate(`/audit?lighthouse=${encodeURIComponent(page.url)}`)}>{$t("性能检查")}</Button><Button size="sm" variant="outline" onClick={()=>setHanding(true)}><Bot data-icon="inline-start"/>{$t("交给 Agent")}</Button></span></div>
   <HandOffNotice result={handed}/>
   {handing&&<DraftHandOffDialog projectId={projectId} draft={contentPageDraft(page,rangeLabel)} playbookId="optimize-page" page={page.url} description={$t("这个页面和它最近的访问、搜索数据写进任务说明，确认后立即开始。")} onClose={()=>setHanding(false)} onDone={r=>{setHanding(false);setHanded(r);}}/>}
   <section className="space-y-2"><div className="flex items-center gap-1"><h3 className="text-sm font-semibold">{$t("每日访问与搜索点击")}</h3>{data?.window&&<InfoTip label={$t("图怎么看")}>{$tj("{0} 至 {1}；虚线是改动上线的日子。GA4 截至 {2}，Search Console 截至 {3}，没有数据的日子留空。",{0:data.window.start,1:data.window.end,2:data.ga4Cutoff||'—',3:data.gscCutoff||'—'})}</InfoTip>}</div>
    {error?<p className="nr-error" role="alert">{$t("页面数据没有读出来。")}</p>:!data?<p role="status" className="nr-footnote">{$t("正在读取…")}</p>:!hasData?<p className="text-muted-foreground">{$t("所选时间里这个页面还没有访问或搜索数据。")}</p>:
     <div className="nr-chart-box" data-content-chart><ResponsiveContainer width="100%" height={220}><LineChart data={data.daily} margin={{top:16,right:8,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={(d:string)=>d.slice(5)} minTickGap={24} fontSize={11}/><YAxis yAxisId="v" fontSize={11} width={40} allowDecimals={false}/><YAxis yAxisId="c" orientation="right" fontSize={11} width={32} allowDecimals={false}/><Tooltip/><Legend/>
      {releases.filter(r=>data.window&&r.date>=data.window.start&&r.date<=data.window.end).map(r=><ReferenceLine key={r.id} yAxisId="v" x={r.date} stroke="var(--chart-1)" strokeDasharray="4 3" label={{value:r.no?$t("T-{0} 上线",{0:r.no}):$t("上线"),position:'top',fontSize:10,fill:'var(--muted-foreground)'}}/>)}
      <Line yAxisId="v" isAnimationActive={false} type="linear" dataKey="views" name={$t("访问（GA4 浏览）")} stroke="var(--chart-3)" dot={false} connectNulls={false}/><Line yAxisId="c" isAnimationActive={false} type="linear" dataKey="clicks" name={$t("搜索点击")} stroke="var(--chart-2)" dot={false} connectNulls={false}/></LineChart></ResponsiveContainer></div>}
    
   </section>
   <section className="space-y-2"><div className="flex items-center gap-1"><h3 className="text-sm font-semibold">{$t("任务与效果")}</h3>{releases.length?<InfoTip label={$t("效果怎么算")}>{$tj("效果按上线前后同样长的日子比较；同期还有别的改动时，任务页里会列出来。最近一次：{0}。",{0:monthDay(releases[0].date)})}</InfoTip>:null}</div>
    {!linked.length?<p className="text-muted-foreground">{$t("还没有任务改过这个页面。")}</p>:linked.map(t=>{const w=t.evidence!.work!,state=w.cancelledAt?null:workState(w,t.status),items=effectItems(w);return <div key={t.id} className="space-y-1 rounded-lg border border-border p-3" data-content-task={t.id}>
     <div className="flex flex-wrap items-center gap-2"><Link className="nr-link font-medium" to={`/actions/${t.id}`}>{t.evidence?.no?`T-${t.evidence.no} `:''}{t.title}</Link>{state?<Tag tone={stateTone[state]}>{stateNames[state]}</Tag>:<Tag tone="slate">{$t("已取消")}</Tag>}</div>
     {w.observeFrom?<p className="nr-footnote">{$tj("{0} 上线",{0:new Date(w.observeFrom).toISOString().slice(0,10)})}</p>:null}
     {items.map(i=><p key={i.day} className="text-xs">{i.result?effectLine(i.result):$t("第 {0} 天：预计 {1} 出结果",{0:i.day,1:i.expected})}</p>)}
    </div>;})}
    
   </section>
  </div>
 </DetailDrawer>;
}
