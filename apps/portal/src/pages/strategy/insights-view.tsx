import type {ReactElement} from 'react';
import {useNavigate} from 'react-router';
import {BellIcon,ArrowRightIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Section} from '@/components/reach/page';
import {Tag,type Tone} from '@/components/reach/tag';
import {citedSignals,reasonLine,rowsFor,opportunityState,sourceNames,type Row} from './board';
import type {StrategyState,Signal} from './model';
import {effectItems,effectLine,effectPages,latestEffect} from '../effect-model';
import type {Work} from '../task-execution-types';
// 洞察 building blocks (SPEC §5): numbers and changes first, one line each; no paragraphs.
export type Metric={key:string;label:string;value:number|null;previous:number|null;complete:boolean;change:number|null};
export type SourceCard={id:string;cutoff:string|null;window:{start:string;end:string;days:number};metrics:Metric[];series:{date:string;value:number|null}[];seriesBy?:Record<string,{date:string;value:number|null}[]>};
type Task={id:number;title:string;status:string;updatedAt?:string;evidence?:{work?:Work}};
const pct=(n:number)=>`${Math.abs(n)>=0.095?Math.round(Math.abs(n)*100):(Math.abs(n)*100).toFixed(1)}%`;
function Sparkline({points}:{points:{value:number|null}[]}):ReactElement|null{
 const v=points.map(p=>p.value).filter((x):x is number=>x!==null);if(v.length<2)return null;
 const min=Math.min(...v),max=Math.max(...v),span=max-min||1,step=100/(points.length-1);
 const d=points.map((p,i)=>p.value===null?null:`${(i*step).toFixed(1)},${(18-((p.value-min)/span)*16).toFixed(1)}`).filter(Boolean).join(' ');
 return <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-5 w-full" aria-hidden="true"><polyline points={d} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/></svg>;
}
// Search clicks, search impressions and visits always; the fourth is new stars when GitHub is connected, else key events.
export function KpiCards({cards}:{cards?:SourceCard[]}):ReactElement{
 const navigate=useNavigate(),by=new Map((cards||[]).map(c=>[c.id,c])),gsc=by.get('gsc'),ga4=by.get('ga4'),gh=by.get('github');
 const pick=(c:SourceCard|undefined,key:string)=>({m:c?.metrics.find(x=>x.key===key),s:c?.seriesBy?.[key]||(c?.metrics[0]?.key===key?c.series:undefined)});
 const items=[{label:'搜索点击',...pick(gsc,'clicks'),to:'/seo-opportunities'},{label:'搜索曝光',...pick(gsc,'impressions'),to:'/seo-opportunities'},{label:'访问次数',...pick(ga4,'sessions'),to:'/website'},
  gh?{label:'新增 Star',...pick(gh,'stars'),s:gh.series,to:'/data/github'}:{label:'关键事件',...pick(ga4,'conversions'),to:'/website/conversion'}];
 return <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="关键指标">{items.map(({label,m,s,to})=>{const up=(m?.change??0)>=0;
  return <button key={label} type="button" onClick={()=>navigate(to)} className="flex flex-col gap-1 rounded-lg border bg-card p-4 text-left text-card-foreground transition-colors hover:border-ring">
   <span className="text-xs text-muted-foreground">{label}</span>
   <span className="font-heading text-2xl font-semibold tabular-nums">{m?.value==null?'—':`${label==='新增 Star'&&m.value>0?'+':''}${m.value.toLocaleString()}`}</span>
   <span className="text-xs">{m?.change==null?<span className="text-muted-foreground">{m?.value==null?'暂无数据':'暂无对比'}</span>:<span className={up?'text-nr-ink-green':'text-nr-ink-red'}>{up?'↑':'↓'} {pct(m.change)}</span>}</span>
   {s&&<Sparkline points={s}/>}
  </button>;})}</section>;
}
// The rule signals of the latest analysis, largest first: one line each, the related opportunity one click away.
export function ChangeList({state}:{state:StrategyState}):ReactElement{
 const navigate=useNavigate(),signals=[...(state.insights?.evidence.signals?.items||[])].sort((a,b)=>b.strength-a.strength).slice(0,5);
 const linked=new Map<string,Row>();for(const r of rowsFor(state))if(opportunityState(r,state).state==='pending')for(const s of citedSignals(r))if(!linked.has(s.key))linked.set(s.key,r);
 return <Section title="最新变化" description="来自最近一次分析，按变化大小排序">{signals.length?<ul className="divide-y">{signals.map((s:Signal)=>{const opp=linked.get(s.key);
  return <li key={s.key} className="flex items-center gap-3 py-2" title={s.facts.join('；')}><Tag tone="grey">{sourceNames[s.source]||s.source}</Tag><span className="min-w-0 flex-1 truncate text-sm">{s.title}</span>
   {opp&&<Button size="sm" variant="ghost" onClick={()=>navigate(`/opportunities?item=${encodeURIComponent(opp.card.id)}`)}>有机会<ArrowRightIcon/></Button>}</li>;})}</ul>
  :<p className="text-sm text-muted-foreground">最近一次分析没有发现明显变化。</p>}</Section>;
}
export function Suggestions({rows,total,busy,convert,ignore,empty}:{rows:Row[];total:number;busy:boolean;convert:(r:Row)=>void;ignore:(r:Row)=>void;empty:string}):ReactElement{
 const navigate=useNavigate();
 return <Section title="今天值得做的事" count={total||undefined} actions={total>rows.length||total?<Button size="sm" variant="ghost" onClick={()=>navigate('/opportunities')}>全部机会<ArrowRightIcon/></Button>:undefined}>
  {rows.length?<ul className="divide-y">{rows.map(r=><li key={r.card.id} className="flex items-center gap-3 py-2" data-opportunity-id={r.card.id}>
   <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.card.title}</p><p className="truncate text-xs text-muted-foreground">{reasonLine(r)}</p></div>
   <Button size="sm" variant="outline" disabled={busy} onClick={()=>convert(r)}>转为任务</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>ignore(r)}>忽略</Button></li>)}</ul>
  :<p className="text-sm text-muted-foreground">{empty}</p>}</Section>;
}
const effectTone:Record<string,Tone>={up:'green',down:'red',flat:'grey',insufficient:'grey'};
export function Effects({tasks}:{tasks:Task[]}):ReactElement|null{
 const navigate=useNavigate();if(!tasks.length)return null;
 return <Section title="最近改动的效果"><ul className="divide-y">{tasks.map(t=>{const w=t.evidence!.work!,r=latestEffect(w),next=effectItems(w).find(i=>!i.result);
  return <li key={t.id}><button type="button" className="flex w-full items-center gap-3 py-2 text-left" onClick={()=>navigate(`/actions/${t.id}`)}><span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
   {r?<Tag tone={effectTone[r.conclusion]}>{effectLine(r).replace(/，.*$/,'')}{r.change!==null?` ${r.change>=0?'↑':'↓'} ${Math.round(Math.abs(r.change)*100)}%`:''}</Tag>:<Tag tone="grey">{!effectPages(w).length?'没有关联页面':`约 ${next?.expected} 出结果`}</Tag>}</button></li>;})}</ul></Section>;
}
// Needs-you (§5.4 attention): one line, only when something waits.
export function WaitingStrip({tasks,label}:{tasks:Task[];label:(w?:Work)=>string}):ReactElement|null{
 const navigate=useNavigate();if(!tasks.length)return null;
 return <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-nr-tint-amber px-3 py-2 text-sm text-nr-ink-amber"><BellIcon className="size-4 shrink-0" aria-hidden="true"/><b className="font-medium">{tasks.length} 件事等你处理</b>
  {tasks.slice(0,2).map(t=><button key={t.id} type="button" className="min-w-0 max-w-[24rem] truncate underline-offset-4 hover:underline" onClick={()=>navigate(`/actions/${t.id}`)}>{t.title} · {label(t.evidence?.work)}</button>)}
  <button type="button" className="ml-auto underline-offset-4 hover:underline" onClick={()=>navigate('/actions')}>查看全部</button></div>;
}
