import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {useProject} from './reach-data';
import {catalog,sourceState,type StatusInput} from './data-sources';
import {RangePicker,Sparkline,useRange} from './range-picker';
import './reach-workspace.css';
import './strategy/strategy.css';
import './data-views.css';
export type Metric={key:string;label:string;value:number|null;previous:number|null;complete:boolean;change:number|null};
export type Card={id:string;title?:string;cutoff:string|null;from:string|null;window:{start:string;end:string;days:number};metrics:Metric[];series:{date:string;value:number|null}[];notes?:string[]};
type Overview={cards:Card[]};
const fmt=(v:number|null)=>v===null?'—':Math.abs(v)>=100000?`${(v/1000).toFixed(0)}K`:v.toLocaleString();
export function Change({m}:{m:Metric}){if(m.change===null)return m.complete||m.value===null?null:<small className="nr-muted">数据不完整</small>;const up=m.change>=0;return <small className={up?'nr-up':'nr-down'}>{up?'+':''}{(m.change*100).toFixed(0)}%</small>;}
// Every catalog source appears: connected ones with data, available ones with what connecting unlocks, planned ones greyed.
export default function DataOverview(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [range,setRange]=useRange();const [data,setData]=useState<Overview>(),[status,setStatus]=useState<StatusInput>({}),[error,setError]=useState('');
 useEffect(()=>{if(!project)return;if(range.range==='custom'&&(!range.from||!range.to))return;setError('');void api.action<Overview>('nrDataViews','overview',{method:'POST',body:{projectId:project.id,...range},unwrap:'data'}).then(setData).catch(e=>setError(e instanceof Error?e.message:'读取数据失败，请重试。'));},[project?.id,range.range,range.from,range.to]);
 useEffect(()=>{if(!project)return;const post=<T,>(r:string,a:string,body:object)=>api.action<T>(r,a,{method:'POST',body,unwrap:'data'}).catch(()=>null);void Promise.all([post<{sources:{kind:string;status:string}[]}>('nrSources','list',{projectId:project.id}),post<StatusInput['google']>('nrGoogle','status',{projectId:String(project.id)}),post<{pages:number}>('nrSiteContent','summary',{projectId:project.id}),post<StatusInput['keyword']>('nrKeywords','status',{projectId:'1'}),post<StatusInput['github']>('nrGitHub','status',{projectId:project.id}),post<StatusInput['community']>('nrCommunity','status',{projectId:project.id})]).then(([list,google,site,keyword,github,community])=>setStatus({publicSources:list?.sources,google,site,keyword,github,community}));},[project?.id]);
 const cards=new Map((data?.cards||[]).map(c=>[c.id,c]));const any=data?.cards[0];
 const summary=any?`${any.window.start} 至 ${any.window.end} · 对比前 ${any.window.days} 天`:undefined;
 const shown=catalog.filter(s=>s.id!=='github-traffic');const connected=shown.filter(s=>cards.has(s.id)),available=shown.filter(s=>!cards.has(s.id)&&s.availability!=='planned'),planned=shown.filter(s=>s.availability==='planned');
 return <main className="nr-app nr-discovery nr-data-page"><header className="nr-heading nr-overview-title"><h1>数据总览</h1></header>
  <RangePicker value={range} onChange={setRange} summary={summary}/>
  {(projectError||error)&&<p className="nr-error" role="alert">{projectError||error}</p>}
  {!data&&!error&&<p role="status">正在读取数据…</p>}
  {data&&<><div className="nr-data-grid">{connected.map(s=>{const c=cards.get(s.id)!;return <article key={s.id} className="nr-data-card" data-source-id={s.id}>
   <header><h2>{s.name}{c.title&&<span>{c.title}</span>}</h2>{c.cutoff&&<span className="nr-footnote">数据截至 {c.cutoff}</span>}</header>
   <div className="nr-data-metrics">{c.metrics.map(m=><div key={m.key}><span>{m.label}</span><strong>{fmt(m.value)}</strong><Change m={m}/></div>)}</div>
   <Sparkline points={c.series} label={`${s.name} 每日趋势`}/>
   {c.notes?.map(n=><p key={n} className="nr-data-note">{n}</p>)}
  </article>;})}</div>
  {available.length>0&&<section className="nr-data-more"><h2>接入后可以看到</h2><div className="nr-data-grid">{available.map(s=>{const st=sourceState(s,status);return <article key={s.id} className="nr-data-card nr-data-available" data-source-id={s.id}><header><h2>{s.name}</h2><span className="nr-footnote">{st==='connected'?'已接入，按需查询':'未接入'}</span></header><p>{s.detects}</p>{st!=='connected'&&<Button size="sm" variant="outline" onClick={()=>navigate(`/connections?source=${s.id}`)}>接入</Button>}</article>;})}</div></section>}
  <section className="nr-data-more"><h2>计划开发</h2><div className="nr-data-grid">{planned.map(s=><article key={s.id} className="nr-data-card nr-data-planned" data-source-id={s.id} aria-disabled="true"><header><h2>{s.name}</h2><span className="nr-pill">计划开发</span></header><p>接入后可以看到：{s.detects}</p></article>)}</div></section></>}
 </main>;
}
