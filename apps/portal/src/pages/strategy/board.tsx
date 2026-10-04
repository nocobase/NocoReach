import {useState} from 'react';
import {MoreHorizontal} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {summaryMetrics,type StrategyState,type InsightBatch,type Opportunity,type Evidence} from './model';
// An opportunity is pending while it is in the latest analysis and undecided (or restored), becomes a task when
// converted, and is archived otherwise: ignored, or no longer brought up by the latest analysis.
export type OpportunityState='pending'|'task'|'archived';
export function opportunityState(row:Row,state:StrategyState):{state:OpportunityState;reason?:'ignored'|'expired'}{
 if(row.taskId)return {state:'task'};
 const m=state.opportunityMeta?.[row.card.id];
 if(m?.status==='ignored')return {state:'archived',reason:'ignored'};
 if(row.batch===state.insights||m?.restoredAt)return {state:'pending'};
 return {state:'archived',reason:'expired'};
}
export const priorityRank:Record<string,number>={high:0,medium:1,low:2,unrated:3};
// The signals an opportunity cites, as stored with the analysis that produced it.
export function citedSignals(row:Row){const ids=new Set(row.card.signalIds||[]);return (row.batch.evidence.signals?.items||[]).filter(s=>ids.has(s.key));}
// One line for the list: the written reason (one key number), else the cited signals' figures, else the observation.
export function reasonLine(row:Row){const text=row.card.reason||citedSignals(row).flatMap(s=>s.facts).slice(0,2).join(' · ')||row.card.observation;return text.length>60?text.slice(0,60)+'…':text;}
export type Row={card:Opportunity;batch:InsightBatch;priority:string;status:string;manual:boolean;taskId?:number;taskNo?:number;firstSeenAt:string};
export function rowsFor(state:StrategyState):Row[]{const seen=new Set<string>();const batches=[state.insights,...(state.insightHistory||[])].filter(Boolean) as InsightBatch[];return batches.flatMap(batch=>batch.items.filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;}).map(card=>{const m=state.opportunityMeta?.[card.id],task=state.proposals.find(p=>p.taskId&&p.insight?.id===card.id);return {card,batch,priority:m?.priority||card.priority||'unrated',status:task?'task':m?.status||'pending',manual:Boolean(m?.priority),taskId:task?.taskId,taskNo:task?.taskNo,firstSeenAt:card.firstSeenAt||[...batches].reverse().find(b=>b.items.some(c=>c.id===card.id))?.generatedAt||batch.generatedAt};})).sort((a,b)=>['high','medium','low','unrated'].indexOf(a.priority)-['high','medium','low','unrated'].indexOf(b.priority)||b.batch.generatedAt.localeCompare(a.batch.generatedAt)||a.card.id.localeCompare(b.card.id));}
export function sourceLabels(batch:InsightBatch){return new Map<string,string>([...(batch.evidence.summary?.web.days?[['ga4','GA4'] as [string,string]]:[]),...(batch.evidence.summary?.search.days?[['gsc','Search Console'] as [string,string]]:[]),...(batch.evidence.industryCandidates?.length?[['keywords','关键词研究'] as [string,string]]:[]),...(batch.evidence.publicSources||[]).map(s=>[s.id,s.kind==='github'?'GitHub · '+s.title:'官网资料 · '+s.title] as [string,string])]);}
export type Review=(id:string,change:{priority?:string;status?:string})=>Promise<void>;
export function PerformanceSummary({evidence}:{evidence:Evidence}){return <><section className="nr-metrics" aria-label="网站表现摘要">{summaryMetrics(evidence).map(m=><div className="nr-metric nr-overview-metric" key={m.label}><span>{m.label}</span><strong>{m.value===null?'—':m.value.toLocaleString()}</strong><small>{m.value===null?'暂无数据':m.percent!==null?`${m.percent>=0?'+':''}${m.percent.toFixed(1)}% 较前 ${evidence.periodDays} 天`:m.comparable?'前期为零，不计算变化':'前期数据不完整，不计算变化'}</small></div>)}</section></>;}
export const overviewPeriodDays=28;
// The overview shows one list: the latest 28-day analysis, supported evidence only, at most five items.
// The analysis the overview reports on: the newest batch for the period, signal-based (v3) or the earlier v2 format.
// Looking for v2 only made the page show an old run's time after daily analysis switched to v3.
export function latestBatch(state:StrategyState,periodDays:number):InsightBatch|undefined{return ([state.insights,...(state.insightHistory||[])] as (InsightBatch|undefined|null)[]).find(b=>b?.evidence.periodDays===periodDays&&(b.evidence.analysisVersion===2||b.evidence.analysisVersion===3))||undefined;}
export function todaySuggestions(state:StrategyState,limit=5):Row[]{
 // Signal-based batches (analysis v3) replace the list: a suggestion stays while its signal is present.
 if(state.insights?.evidence.analysisVersion===3){const latest=state.insights;return rowsFor({...state,insightHistory:[]}).filter(r=>r.batch===latest&&opportunityState(r,state).state==='pending').sort((a,b)=>(priorityRank[a.priority]??3)-(priorityRank[b.priority]??3)).slice(0,limit);}
 const batches=[state.insights,...(state.insightHistory||[])].filter(b=>b?.evidence.periodDays===overviewPeriodDays&&b.evidence.analysisVersion===2) as InsightBatch[];
 const now=Date.now();
 return rowsFor({...state,insights:batches[0],insightHistory:batches.slice(1)}).filter(r=>['pending','discussing'].includes(r.status)&&r.card.confidence==='supported'&&r.card.lifecycle!=='watch'&&!(r.card.reviewAt&&Date.parse(r.card.reviewAt)<now)).slice(0,limit);
}
export function SuggestionList({rows,busy,convert,review}:{rows:Row[];busy:boolean;convert:(row:Row)=>void;review:Review}){
 const [expanded,setExpanded]=useState<string|null>(null);
 return <div className="nr-suggestions">{rows.map((row,i)=><article className="nr-suggestion" key={row.card.id} data-opportunity-id={row.card.id}>
  <div className="nr-suggestion-line"><div className="nr-suggestion-text"><h3>{row.card.title}</h3><p>{row.card.observation}</p></div>
  <Button variant={i===0?'default':'outline'} disabled={busy} onClick={()=>convert(row)}>转为任务</Button>
  <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`${row.card.title} 更多操作`} disabled={busy}/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end">
   <DropdownMenuItem onClick={()=>setExpanded(e=>e===row.card.id?null:row.card.id)}>{expanded===row.card.id?'收起依据':'查看依据'}</DropdownMenuItem>
   <DropdownMenuItem onClick={()=>void review(row.card.id,{status:'ignored'})}>忽略</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu></div>
  {expanded===row.card.id&&<div className="nr-suggestion-evidence">{(row.card.signalIds||[]).map(k=>row.batch.evidence.signals?.items.find(s=>s.key===k)).filter(Boolean).map(s=><div key={s!.key} className="nr-signal"><strong>{sourceNames[s!.source]||s!.source} · {s!.title}</strong>{s!.facts.map(f=><span key={f} className="nr-block nr-footnote">{f}</span>)}{s!.url&&<a className="nr-link nr-footnote" href={s!.url} target="_blank" rel="noreferrer">打开页面</a>}</div>)}<p><strong>建议：</strong>{row.card.suggestion}</p><p><strong>为什么：</strong>{row.card.meaning}</p><p><strong>依据：</strong>{row.card.evidenceText}</p><p className="nr-footnote">限制：{row.card.limitation}</p></div>}
 </article>)}</div>;
}
// Numbers people say: O-27 for an opportunity, T-41 for a task — both short numbers given in order of creation (task
// record ids are long generated numbers and are never shown).
export const oppNo=(card:{no?:number})=>card.no?`O-${card.no}`:'';
export const taskNo=(no?:number)=>no?`T-${no}`:'';
export const sourceNames:Record<string,string>={gsc:'Search Console',ga4:'GA4',site:'网站内容',github:'GitHub','github-traffic':'GitHub Traffic',discourse:'社区论坛',packages:'下载量',hackernews:'Hacker News',reddit:'Reddit',trends:'Google Trends',competitors:'竞品动态',x:'X','discord-slack':'Discord、Slack',discord:'Discord',slack:'Slack',rank:'排名跟踪','ai-search':'AI 搜索'};
// Where an opportunity comes from: the sources of its cited signals, else the sources the analysis named.
export function sourcesOf(row:Row){const ids=[...new Set(citedSignals(row).map(s=>s.source))];return (ids.length?ids:row.card.sources||[]).map(s=>sourceNames[s]||sourceLabels(row.batch).get(s)||s);}
// "本期观察": a few sentences grounded in signals; shown even when there is nothing to act on.
export function Observations({batch,generating}:{batch?:InsightBatch;generating:boolean}){const obs=batch?.evidence.analysisVersion===3?batch.observations||[]:[];const sig=batch?.evidence.signals;
 return <section className="nr-observations" aria-label="本期观察"><h2>本期观察</h2>{obs.length?<ul>{obs.map(o=><li key={o}>{o}</li>)}</ul>:<p className="nr-muted">{generating?'正在根据各数据源的信号分析…':'还没有基于信号的分析，点“更新机会”生成。'}</p>}
 {sig&&<p className="nr-footnote">本次分析使用：{Object.entries(sig.coverage).filter(([,v])=>v).map(([k,v])=>`${sourceNames[k]||k}（${v}）`).join('、')||'无'}{sig.missing.length?`；未接入或暂无数据：${sig.missing.map(k=>sourceNames[k]||k).join('、')}`:''} · 共 {sig.items.length} 条信号</p>}</section>;}
