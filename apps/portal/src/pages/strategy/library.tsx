import {useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {Button} from '@/components/ui/button';
import {useProject} from '../reach-data';
import {request} from './service';
import {draftFromOpportunity} from './model';
import type {StrategyState} from './model';
import {rowsFor,opportunityState,citedSignals,recommendedFlow,reasonLine,priorityRank,sourceLabels,sourceNames,type OpportunityState,type Row} from './board';
import {flowRequest,executorLabels,type FlowList} from '../flow-model';
import '../reach-workspace.css';
import './strategy.css';
import './opportunities.css';
const tabs:[OpportunityState,string][]=[['pending','待处理'],['task','已转为任务'],['archived','已归档']];
const day=(iso?:string)=>iso?new Date(iso).toLocaleDateString():'—';
// 机会 (SPEC §5): every insight in one list; the only decisions are turning one into a task or ignoring it.
export default function OpportunityLibrary(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [params,setParams]=useSearchParams();
 const [state,setState]=useState<StrategyState>(),[flows,setFlows]=useState<FlowList>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState('');
 useEffect(()=>{if(!project)return;void request<StrategyState>(project.id,'state').then(s=>{setState(s);setError('');}).catch(()=>setError('机会读取失败，请重试。'));void flowRequest<FlowList>('list',project.id).then(setFlows).catch(()=>undefined);},[project?.id]);
 const rows=state?rowsFor(state).map(r=>({...r,...opportunityState(r,state)})):[];
 const linked=rows.find(r=>r.card.id===params.get('item'));
 const tab=(tabs.some(([k])=>k===params.get('tab'))?params.get('tab'):linked?.state||'pending') as OpportunityState;
 const q=query.trim().toLowerCase();
 const visible=rows.filter(r=>r.state===tab&&(!q||`${r.card.title} ${r.card.observation} ${r.card.suggestion}`.toLowerCase().includes(q)))
  .sort((a,b)=>tab==='pending'?(priorityRank[a.priority]??3)-(priorityRank[b.priority]??3)||String(b.firstSeenAt).localeCompare(String(a.firstSeenAt)):String(b.card.updatedAt||b.firstSeenAt).localeCompare(String(a.card.updatedAt||a.firstSeenAt)));
 const selected=visible.find(r=>r.card.id===params.get('item'))||visible[0];
 function go(next:{tab?:string;item?:string}){const p=new URLSearchParams(params);for(const [k,v] of Object.entries(next)){if(v)p.set(k,v);else p.delete(k);}setParams(p,{replace:true});}
 async function decide(row:Row,status:'ignored'|'pending'){if(!state||!project||busy)return;setBusy(true);try{setState(await request<StrategyState>(project.id,'reviewOpportunity',{insightId:row.card.id,status,revision:state.revision,requestId:crypto.randomUUID()}));setError('');go({item:''});}catch{setError('保存失败，请刷新后重试。');}finally{setBusy(false);}}
 async function convert(row:Row){if(!state||!project||busy)return;setBusy(true);try{const next=await request<StrategyState>(project.id,'confirmDirection',{...draftFromOpportunity(row.card),insightId:row.card.id,revision:state.revision,requestId:crypto.randomUUID()});setState(next);const taskId=next.proposals.find(p=>p.insight?.id===row.card.id&&p.taskId)?.taskId;if(taskId)navigate(`/actions/${taskId}`);}catch{setError('转为任务失败，机会仍保留，请稍后重试。');}finally{setBusy(false);}}
 const count=(k:OpportunityState)=>rows.filter(r=>r.state===k).length;
 return <main className="nr-app nr-discovery nr-opportunities-page"><header className="nr-heading"><div><h1>机会</h1><p className="nr-muted">每天分析得出的值得做的事。值得做就转为任务，不值得做就忽略。</p></div></header>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}
  <nav className="nr-tabs nr-board-views" aria-label="机会分类">{tabs.map(([k,v])=><button key={k} aria-pressed={tab===k} onClick={()=>go({tab:k,item:''})}>{v}{state?` ${count(k)}`:''}</button>)}</nav>
  {!state?<p role="status">正在读取机会…</p>:<div className="nr-opp-layout">
   <div className="nr-opp-list">
    <input className="nr-opp-search" aria-label="搜索机会" placeholder="搜索机会" value={query} onChange={e=>setQuery(e.target.value)}/>
    {visible.map(r=><button key={r.card.id} type="button" className="nr-opp-item" aria-current={selected?.card.id===r.card.id} onClick={()=>go({item:r.card.id})}>
     <b>{r.card.title}</b><span>{reasonLine(r)}</span>
     <small>{(r.card.sources||[]).map(s=>sourceNames[s]||sourceLabels(r.batch).get(s)||s).join(' · ')}{tab==='pending'&&r.card.change==='new'?' · 新':''}{r.reason==='ignored'?' · 已忽略':r.reason==='expired'?' · 已过期':''}</small>
    </button>)}
    {!visible.length&&<p className="nr-muted nr-opp-empty">{q?'没有匹配的机会。':tab==='pending'?'今天没有新的机会。数据变化不明显时，不必为了凑数而行动。':tab==='task'?'还没有转为任务的机会。':'没有归档的机会。'}</p>}
   </div>
   {selected&&<Detail row={selected} flows={flows} busy={busy} latest={state.insights?.generatedAt} onConvert={()=>void convert(selected)} onIgnore={()=>void decide(selected,'ignored')} onRestore={()=>void decide(selected,'pending')} onOpen={()=>navigate(`/actions/${selected.taskId}`)}/>}
  </div>}
 </main>;
}
function Detail({row,flows,busy,latest,onConvert,onIgnore,onRestore,onOpen}:{row:Row&{state:OpportunityState;reason?:string};flows?:FlowList;busy:boolean;latest?:string;onConvert:()=>void;onIgnore:()=>void;onRestore:()=>void;onOpen:()=>void}){
 const signals=citedSignals(row),flow=flows?.flows.find(f=>f.id===recommendedFlow(row));
 return <section className="nr-panel nr-opp-detail" aria-label="机会详情">
  <header><h2>{row.card.title}</h2><div className="nr-opp-actions">
   {row.state==='pending'&&<><Button disabled={busy} onClick={onConvert}>转为任务</Button><Button variant="outline" disabled={busy} onClick={onIgnore}>忽略</Button></>}
   {row.state==='task'&&<Button variant="outline" onClick={onOpen}>打开任务</Button>}
   {row.state==='archived'&&<Button variant="outline" disabled={busy} onClick={onRestore}>恢复到待处理</Button>}
  </div></header>
  <p className="nr-footnote">{day(row.firstSeenAt)} 首次发现 · {row.state==='pending'?`来自 ${day(latest)} 的分析`:row.state==='task'?'已转为任务':row.reason==='ignored'?'已忽略，之后的分析不会再提出':'已过期：最新的分析没有再提出'}</p>
  <h3>为什么值得做</h3><p>{row.card.meaning||row.card.observation}</p>
  <h3>依据</h3>{signals.length?<div className="nr-opp-signals">{signals.map(s=><div key={s.key}><span>{sourceNames[s.source]||s.source}</span><b>{s.title}</b>{s.facts.map(f=><small key={f}>{f}</small>)}{s.url&&<a className="nr-link" href={s.url} target="_blank" rel="noreferrer">打开页面</a>}</div>)}</div>:<p>{row.card.evidenceText||row.card.observation}</p>}
  <h3>建议做法</h3><p>{row.card.suggestion}</p>
  {row.state==='pending'&&flow&&<><h3>转为任务后</h3><p>按“{flow.name}”进行：{flow.stages.map(s=>`${s.name}（${executorLabels[s.kind]}）`).join(' → ')}</p></>}
  {row.card.limitation&&<p className="nr-footnote">限制：{row.card.limitation}</p>}
 </section>;
}
