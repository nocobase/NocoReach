import {PerformanceSummary,SuggestionList,Observations,todaySuggestions,latestBatch,overviewPeriodDays,type Row} from './board';
import {HealthAlert} from '../data-health';
import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {Button} from '@/components/ui/button';
import {records,useProject} from '../reach-data';
import {PageSkeleton} from '../workspace-cache';
import {workState,type Work} from '../task-execution-types';
import {draftFromOpportunity,type StrategyState} from './model';
import {request,analysisRequest,type Context,type AnalysisStatus} from './service';
import '../reach-workspace.css';
import './strategy.css';
type Task={id:number;title:string;status:string;updatedAt?:string;evidence?:{work?:Work}};
// 洞察 (SPEC §5): what needs you, how the site is doing, this period's observations and today's opportunities.
// Analysis runs on the server (the daily workflow or “更新机会”); this page has no AI conversation of its own.
export default function StrategyPage(){
 const {project,error:projectError}=useProject();const [state,setState]=useState<StrategyState>(),[context,setContext]=useState<Context>(),[tasks,setTasks]=useState<Task[]>([]),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!project)return;let active=true;setError('');Promise.all([request<StrategyState>(project.id,'state'),request<Context>(project.id,'context')]).then(([s,c])=>{if(active){setState(s);setContext(c);}}).catch(()=>{if(active)setError('无法读取洞察，请重试。');});
  void records<Task>('nrTasks',{projectId:String(project.id)}).then(rows=>{if(active)setTasks(rows);}).catch(()=>undefined);return()=>{active=false;};},[project?.id,attempt]);
 if(!project||!state||!context)return (error||projectError)?<main className="nr-app nr-discovery"><p role="alert">{error||projectError}</p><Button onClick={()=>setAttempt(n=>n+1)}>重新加载</Button></main>:<PageSkeleton title="洞察"/>;
 return <Insights projectId={project.id} state={state} setState={setState} context={context} tasks={tasks}/>;
}
function Insights({projectId,state,setState,context,tasks}:{projectId:number;state:StrategyState;setState:(s:StrategyState)=>void;context:Context;tasks:Task[]}){
 const navigate=useNavigate();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[generating,setGenerating]=useState(false),[analysis,setAnalysis]=useState<AnalysisStatus>();
 const pending=useRef(false),operation=useRef({key:'',id:''}),summary=context.evidence;
 async function mutate(action:string,body:object){const key=JSON.stringify([action,state.revision,body]);if(operation.current.key!==key)operation.current={key,id:crypto.randomUUID()};return request<StrategyState>(projectId,action,{...body,revision:state.revision,requestId:operation.current.id});}
 async function followAnalysis(){setGenerating(true);for(let i=0;i<120;i++){const st=await analysisRequest(projectId,'status').catch(()=>null);if(st){setAnalysis(st);if(!st.running){setGenerating(false);if(st.last&&!st.last.ok)setError(`分析没有完成：${st.runs[0]?.error||'原因未知'}。已有机会保留。`);else{setState(await request<StrategyState>(projectId,'state'));setNotice('机会已更新。');}return;}}await new Promise(r=>setTimeout(r,3000));}setGenerating(false);setError('分析时间较长，请稍后刷新查看结果。');}
 async function generate(){setError('');setNotice('');try{const st=await analysisRequest(projectId,'run');setAnalysis(st);await followAnalysis();}catch(e){setGenerating(false);setError(e instanceof Error?e.message:'无法开始分析，请稍后重试。');}}
 useEffect(()=>{void analysisRequest(projectId,'status').then(st=>{setAnalysis(st);if(st.running)void followAnalysis();}).catch(()=>undefined);},[projectId]);
 async function act(fn:()=>Promise<void>){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await fn();}finally{pending.current=false;setBusy(false);}}
 const convert=(row:Row)=>act(async()=>{try{const next=await mutate('confirmDirection',{...draftFromOpportunity(row.card),insightId:row.card.id});setState(next);const taskId=next.proposals.find(p=>p.taskId&&p.insight?.id===row.card.id)?.taskId;if(taskId)navigate(`/actions/${taskId}`);}catch(e){setError(e instanceof Error?e.message:'转为任务失败，机会仍保留，请稍后重试。');}});
 const review=(id:string,change:{priority?:string;status?:string})=>act(async()=>{try{setState(await mutate('reviewOpportunity',{insightId:id,...change}));}catch{setError('保存失败，请刷新后重试。');}});
 const batch=latestBatch(state,overviewPeriodDays),suggestions=todaySuggestions(state);
 const waiting=tasks.filter(t=>workState(t.evidence?.work,t.status)==='review').sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
 const waitingFor=(w?:Work)=>{const st=w?.flow?.stages[w.stageIndex||0];return st?(st.kind==='publish'?'确认发布':st.name):'待确认';};
 return <main className="nr-app nr-discovery nr-opportunities">
  <header className="nr-heading nr-overview-title"><h1>洞察</h1><span className="nr-muted">近 {summary.periodDays} 天 · 数据截至 {summary.availableThrough||'未知'}</span></header>
  {error&&<p role="alert" className="nr-error">{error}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  <HealthAlert projectId={projectId}/>
  {waiting.length>0&&<section className="nr-panel nr-waiting-list" aria-label="等你处理"><h2>等你处理 {waiting.length}</h2>{waiting.slice(0,5).map(t=><button key={t.id} type="button" onClick={()=>navigate(`/actions/${t.id}`)}><span>{t.title}</span><small>{waitingFor(t.evidence?.work)}</small></button>)}{waiting.length>5&&<Button variant="link" size="sm" onClick={()=>navigate('/actions')}>还有 {waiting.length-5} 个</Button>}</section>}
  <PerformanceSummary evidence={summary}/>
  <Observations batch={state.insights} generating={generating}/>
  <div className="nr-overview-head"><h2>{suggestions.length?`今天值得做的 ${suggestions.length} 件事`:'今天值得做的事'}</h2><span>{generating?'正在分析，通常需要一两分钟…':batch?`上次分析 ${new Date(batch.generatedAt).toLocaleString()}${analysis?.runs[0]?.ok&&analysis.runs[0].trigger==='workflow'?'（每日自动）':''}`:'尚未分析'}{analysis?.schedule?.enabled?' · 每天自动分析':''} <Button variant="link" size="sm" disabled={busy||generating} onClick={()=>void generate()}>更新机会</Button></span></div>
  {suggestions.length?<SuggestionList rows={suggestions} busy={busy||generating} convert={row=>void convert(row)} review={review}/>:<p className="nr-panel nr-muted">{generating?'正在根据最新数据分析，完成后显示在这里。':batch?'没有新的机会。数据变化不明显时，不必为了凑数量采取行动。':'还没有分析结果，点“更新机会”开始第一次分析。'}</p>}
 </main>;
}
