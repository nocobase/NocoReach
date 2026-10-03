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
// The one coloured fact of a change (server-computed; read from the wording for signals stored before chips existed).
export function chipOf(s:Signal):{tone:Tone;text:string}|null{
 if(s.chip)return {tone:s.chip.tone as Tone,text:s.chip.text};
 const t=s.title,f=s.facts.join(' '),m=(re:RegExp,src=t)=>src.match(re);let x;
 if((x=m(/(上升|增加|增长)\s*\+?(\d+(?:\.\d+)?%)/)))return {tone:'green',text:`↑ ${x[2]}`};
 if((x=m(/(下降|减少)\s*-?(\d+(?:\.\d+)?%)/)))return {tone:'red',text:`↓ ${x[2]}`};
 if((x=m(/是平时的 ([\d.]+) 倍/)))return {tone:'green',text:`↑ ${x[1]} 倍`};
 if((x=m(/平均排名 ([\d.]+)/)))return {tone:'blue',text:`排名 ${x[1]}`};
 if((x=m(/其中 (\d+) 个未标记为已解决/)))return {tone:'amber',text:`${x[1]} 个未解决`};
 if((x=m(/(\d+) 个主题无人回复/)))return {tone:'amber',text:`${x[1]} 个无人回复`};
 if((x=m(/(\d+) 个主题/)))return {tone:'amber',text:`${x[1]} 个主题`};
 if((x=m(/已 (\d+) 个月未更新/)))return {tone:'amber',text:`${x[1]} 个月未更新`};
 if(/内容很短/.test(t))return {tone:'amber',text:(x=m(/正文约 (\d+) 字/,f))?`正文 ${x[1]} 字`:'内容很短'};
 if(/曝光多、点击少/.test(t))return {tone:'amber',text:'点击少'};
 if(/访问多但关键事件少/.test(t))return {tone:'amber',text:'关键事件少'};
 if(/分类讨论增加/.test(t)&&(x=m(/近 14 天 (\d+) 个主题，此前 14 天 (\d+) 个/,f)))return {tone:'green',text:`↑ ${+x[2]?(+x[1]/+x[2]).toFixed(1)+' 倍':x[1]+' 个'}`};
 if(/正式版/.test(t))return {tone:'violet',text:'新版本'};
 if(/预发布/.test(t))return {tone:'violet',text:'预发布'};
 return null;
}
export const titleOf=(s:Signal)=>s.title.replace(/(下降|减少)\s*-(\d)/,'$1 $2').replace(/(上升|增加)\s*\+(\d)/,'$1 $2');
const pct=(n:number)=>`${Math.abs(n)>=0.095?Math.round(Math.abs(n)*100):(Math.abs(n)*100).toFixed(1)}%`;
function Sparkline({points,change}:{points:{value:number|null}[];change?:number|null}):ReactElement|null{
 const v=points.map(p=>p.value).filter((x):x is number=>x!==null);if(v.length<2)return null;
 const min=Math.min(...v),max=Math.max(...v),span=max-min||1,step=100/(points.length-1);
 const d=points.map((p,i)=>p.value===null?null:`${(i*step).toFixed(1)},${(18-((p.value-min)/span)*16).toFixed(1)}`).filter(Boolean).join(' ');
 return <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-5 w-full" aria-hidden="true"><polyline points={d} fill="none" stroke={change==null||change===0?'var(--muted-foreground)':change>0?'var(--nr-ink-green)':'var(--nr-ink-red)'} strokeWidth="1.2" vectorEffect="non-scaling-stroke"/></svg>;
}
// One tile per connected source (2026-10-03: every source, not four): search, visits and key events, then GitHub stars,
// downloads, forum topics, Hacker News and Reddit when connected; each opens its page.
export function KpiCards({cards}:{cards?:SourceCard[]}):ReactElement{
 const navigate=useNavigate(),by=new Map((cards||[]).map(c=>[c.id,c]));
 const pick=(c:SourceCard|undefined,key:string)=>({m:c?.metrics.find(x=>x.key===key),s:c?.seriesBy?.[key]||(c?.metrics[0]?.key===key?c.series:undefined)});
 const gsc=by.get('gsc'),ga4=by.get('ga4');
 const items=[{label:'搜索点击',...pick(gsc,'clicks'),to:'/seo-opportunities'},{label:'搜索曝光',...pick(gsc,'impressions'),to:'/seo-opportunities'},{label:'访问次数',...pick(ga4,'sessions'),to:'/website'},{label:'关键事件',...pick(ga4,'conversions'),to:'/website/conversion'},
  ...([['github','stars','新增 Star','/data/github'],['packages','downloads','下载量','/data/downloads'],['discourse','topics','论坛新主题','/data/community'],['mentions','mentions','Hacker News 提及','/data/hackernews'],['reddit','posts','Reddit 新帖','/data/reddit']] as const).flatMap(([id,key,label,to])=>by.get(id)?[{label,...pick(by.get(id),key),s:by.get(id)!.series,to}]:[])];
 return <section className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-4" aria-label="关键指标">{items.map(({label,m,s,to})=>{const up=(m?.change??0)>=0;
  return <button key={label} type="button" onClick={()=>navigate(to)} className="flex flex-col gap-1 rounded-lg border bg-card p-4 text-left text-card-foreground transition-colors hover:border-ring">
   <span className="text-xs text-muted-foreground">{label}</span>
   <span className="font-heading text-2xl font-semibold tabular-nums">{m?.value==null?'—':`${label==='新增 Star'&&m.value>0?'+':''}${m.value.toLocaleString()}`}</span>
   <span className="text-xs">{m?.change==null?<span className="text-muted-foreground">{m?.value==null?'暂无数据':'暂无对比'}</span>:<span className={up?'text-nr-ink-green':'text-nr-ink-red'}>{up?'↑':'↓'} {pct(m.change)}</span>}</span>
   {s&&<Sparkline points={s} change={m?.change}/>}
  </button>;})}</section>;
}
// 各方面一览: a few numbers per area from every connected source (server: nrInsights:summary), each opening its page.
export type AreaItem={key:string;label:string;value:string;detail?:string;to:string;tone?:Tone};
export type Area={id:string;title:string;items:AreaItem[]};
const valueTone:Partial<Record<Tone,string>>={red:'text-nr-ink-red',green:'text-nr-ink-green',amber:'text-nr-ink-amber',blue:'text-nr-ink-blue'};
export function AreaCards({areas}:{areas?:Area[]}):ReactElement|null{
 const navigate=useNavigate();if(!areas?.length)return null;
 return <Section title="各方面一览" description="每个数据源最值得看的几个数字，点开看细节">
  <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">{areas.map(a=><div key={a.id} className="rounded-lg border bg-card text-card-foreground" data-area={a.id}>
   <h3 className="border-b px-4 py-2.5 text-sm font-semibold">{a.title}</h3>
   <ul className="divide-y">{a.items.map(i=><li key={i.key}><button type="button" onClick={()=>navigate(i.to)} className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/50" data-item={i.key}>
    <span className="min-w-0"><span className="block text-sm">{i.label}</span>{i.detail?<span className="block truncate text-xs text-muted-foreground" title={i.detail}>{i.detail}</span>:null}</span>
    <span className={`shrink-0 font-heading text-lg font-semibold tabular-nums ${(i.tone&&valueTone[i.tone])||''}`}>{i.value}</span></button></li>)}</ul>
  </div>)}</div>
 </Section>;
}
// The rule signals of the latest analysis, largest first: one line each, the related opportunity one click away.
export function ChangeList({state}:{state:StrategyState}):ReactElement{
 const navigate=useNavigate(),signals=[...(state.insights?.evidence.signals?.items||[])].sort((a,b)=>b.strength-a.strength).slice(0,8);
 const linked=new Map<string,Row>();for(const r of rowsFor(state))if(opportunityState(r,state).state==='pending')for(const s of citedSignals(r))if(!linked.has(s.key))linked.set(s.key,r);
 return <Section title="最新变化" description="来自最近一次分析，按变化大小排序">{signals.length?<ul className="divide-y">{signals.map((s:Signal)=>{const opp=linked.get(s.key);
  return <li key={s.key} className="flex items-center gap-3 py-2" title={s.facts.join('；')}><Tag tone="grey">{sourceNames[s.source]||s.source}</Tag><span className="min-w-0 flex-1 truncate text-sm">{titleOf(s)}</span>{(()=>{const c=chipOf(s);return c?<Tag tone={c.tone}>{c.text}</Tag>:null;})()}
   {opp&&<Button size="sm" variant="ghost" onClick={()=>navigate(`/opportunities?item=${encodeURIComponent(opp.card.id)}`)}>有机会<ArrowRightIcon/></Button>}</li>;})}</ul>
  :<p className="text-sm text-muted-foreground">最近一次分析没有发现明显变化。</p>}</Section>;
}
export function Suggestions({rows,total,busy,convert,ignore,empty,labelOf}:{rows:Row[];total:number;busy:boolean;convert:(r:Row)=>void;ignore:(r:Row)=>void;empty:string;labelOf:(r:Row)=>string}):ReactElement{
 const navigate=useNavigate();
 return <Section title="今天值得做的事" count={total||undefined} actions={total>rows.length||total?<Button size="sm" variant="ghost" onClick={()=>navigate('/opportunities')}>全部机会<ArrowRightIcon/></Button>:undefined}>
  {rows.length?<ul className="divide-y">{rows.map(r=><li key={r.card.id} className="flex items-center gap-3 py-2" data-opportunity-id={r.card.id}>
   <div className="min-w-0 flex-1"><p className="flex items-center gap-2 text-sm font-medium"><span className="truncate">{r.card.title}</span>{(()=>{const lead=citedSignals(r)[0],c=lead&&chipOf(lead);return c?<Tag tone={c.tone}>{c.text}</Tag>:null;})()}</p><p className="truncate text-xs text-muted-foreground">{reasonLine(r)}</p></div>
   <Button size="sm" variant="outline" disabled={busy} onClick={()=>convert(r)}>{labelOf(r)}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>ignore(r)}>忽略</Button></li>)}</ul>
  :<p className="text-sm text-muted-foreground">{empty}</p>}</Section>;
}
const effectTone:Record<string,Tone>={up:'green',down:'red',flat:'grey',insufficient:'grey'};
export function Effects({tasks}:{tasks:Task[]}):ReactElement{
 const navigate=useNavigate();
 // Kept when empty so the row stays two columns and says what will appear here.
 if(!tasks.length)return <Section title="最近改动的效果"><p className="text-sm text-muted-foreground">还没有上线的改动。任务发布后，这里会显示改动前后的数字对比。</p></Section>;
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
