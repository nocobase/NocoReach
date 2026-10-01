import {todaySuggestions,latestBatch,overviewPeriodDays,type Row} from './board';
import {KpiCards,ChangeList,Suggestions,Effects,WaitingStrip,type SourceCard} from './insights-view';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {useFreshData} from '../workspace-cache';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {HealthAlert} from '../data-health';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {records,useProject} from '../reach-data';
import {PageSkeleton} from '../workspace-cache';
import {workState,isClosed,type Work} from '../task-execution-types';
import type {StrategyState} from './model';
import {handOff,handOffLabel,handOffResult,recommendedFor,HandOffNotice,type HandOffResult} from './hand-off';
import {playbookRequest,type PlaybookList} from '../playbook-model';
import {request,analysisRequest,type Context,type AnalysisStatus} from './service';
import '../reach-workspace.css';
import './strategy.css';
type Task={id:number;title:string;status:string;updatedAt?:string;evidence?:{work?:Work}};
// 洞察 (SPEC §5): numbers and changes first — what needs you, the key metrics, the latest changes, today's opportunities
// and the effect of recent changes; one line each.
// Analysis runs on the server (the daily workflow or “更新机会”); this page has no AI conversation of its own.
export default function StrategyPage(){
 const {project,error:projectError}=useProject();const [state,setState]=useState<StrategyState>(),[context,setContext]=useState<Context>(),[tasks,setTasks]=useState<Task[]>([]),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!project)return;let active=true;setError('');Promise.all([request<StrategyState>(project.id,'state'),request<Context>(project.id,'context')]).then(([s,c])=>{if(active){setState(s);setContext(c);}}).catch(()=>{if(active)setError('无法读取洞察，请重试。');});
  void records<Task>('nrTasks',{projectId:String(project.id)}).then(rows=>{if(active)setTasks(rows);}).catch(()=>undefined);return()=>{active=false;};},[project?.id,attempt]);
 if(!project||!state||!context)return (error||projectError)?<PageContainer className="nr-page"><p role="alert">{error||projectError}</p><Button onClick={()=>setAttempt(n=>n+1)}>重新加载</Button></PageContainer>:<PageSkeleton title="洞察"/>;
 return <Insights projectId={project.id} state={state} setState={setState} context={context} tasks={tasks}/>;
}
function Insights({projectId,state,setState,context,tasks}:{projectId:number;state:StrategyState;setState:(s:StrategyState)=>void;context:Context;tasks:Task[]}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[generating,setGenerating]=useState(false),[analysis,setAnalysis]=useState<AnalysisStatus>(),[playbooks,setPlaybooks]=useState<PlaybookList>(),[handed,setHanded]=useState<HandOffResult>();
 const pending=useRef(false),operation=useRef({key:'',id:''}),summary=context.evidence;
 async function mutate(action:string,body:object){const key=JSON.stringify([action,state.revision,body]);if(operation.current.key!==key)operation.current={key,id:crypto.randomUUID()};return request<StrategyState>(projectId,action,{...body,revision:state.revision,requestId:operation.current.id});}
 async function followAnalysis(){setGenerating(true);for(let i=0;i<120;i++){const st=await analysisRequest(projectId,'status').catch(()=>null);if(st){setAnalysis(st);if(!st.running){setGenerating(false);if(st.last&&!st.last.ok)setError(`分析没有完成：${st.runs[0]?.error||'原因未知'}。已有机会保留。`);else{setState(await request<StrategyState>(projectId,'state'));setNotice('机会已更新。');}return;}}await new Promise(r=>setTimeout(r,3000));}setGenerating(false);setError('分析时间较长，请稍后刷新查看结果。');}
 async function generate(){setError('');setNotice('');try{const st=await analysisRequest(projectId,'run');setAnalysis(st);await followAnalysis();}catch(e){setGenerating(false);setError(e instanceof Error?e.message:'无法开始分析，请稍后重试。');}}
 useEffect(()=>{void analysisRequest(projectId,'status').then(st=>{setAnalysis(st);if(st.running)void followAnalysis();}).catch(()=>undefined);},[projectId]);
 async function act(fn:()=>Promise<void>){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await fn();}finally{pending.current=false;setBusy(false);}}
 useEffect(()=>{void playbookRequest<PlaybookList>('list',projectId).then(setPlaybooks).catch(()=>undefined);},[projectId]);
 const kindOf=(row:Row)=>recommendedFor(row,playbooks?.playbooks)?.kind;
 // 交给 Agent: the task is created and started; the page stays with a link to it (same as 机会).
 const convert=(row:Row)=>act(async()=>{setHanded(undefined);try{const r=await handOff(projectId,state,row,recommendedFor(row,playbooks?.playbooks)?.id);setState(r.state);setHanded(handOffResult(row,r,kindOf(row)));}catch{setError('没能交出去，机会仍保留，请稍后重试。');}});
 const review=(id:string,change:{priority?:string;status?:string})=>act(async()=>{try{setState(await mutate('reviewOpportunity',{insightId:id,...change}));}catch{setError('保存失败，请刷新后重试。');}});
 const batch=latestBatch(state,overviewPeriodDays),suggestions=todaySuggestions(state);
 const waiting=tasks.filter(t=>!isClosed(t.evidence?.work)&&workState(t.evidence?.work,t.status)==='review').sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
 // Changes that went live in the last 60 days and what their observation says so far.
 const effects=tasks.filter(t=>!isClosed(t.evidence?.work)&&t.evidence?.work?.observeFrom&&Date.now()-Date.parse(t.evidence.work.observeFrom)<60*86400000).sort((a,b)=>String(b.evidence!.work!.observeFrom).localeCompare(String(a.evidence!.work!.observeFrom))).slice(0,5);
 const waitingFor=(w?:Work)=>{const st=w?.flow?.stages[w.stageIndex||0];return st?(st.kind==='publish'?'确认发布':st.name):'待确认';};
 const overview=useFreshData<{cards:SourceCard[]}>(`data-view:overview:${projectId}:${JSON.stringify({range:'28'})}`,()=>api.action<{cards:SourceCard[]}>('nrDataViews','overview',{method:'POST',body:{projectId,range:'28'},unwrap:'data'}));
 const last=generating?'正在分析…':batch?`上次分析 ${new Date(batch.generatedAt).toLocaleString(undefined,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}${analysis?.runs[0]?.ok&&analysis.runs[0].trigger==='workflow'?'（每日自动）':''}`:'尚未分析';
 return <PageContainer className="nr-page">
  <PageHeader title="洞察" description={`近 ${summary.periodDays} 天 · 数据截至 ${summary.availableThrough||'未知'} · ${last}`} actions={<Button variant="outline" disabled={busy||generating} onClick={()=>void generate()}>{generating?'正在分析…':'更新分析'}</Button>}/>
  {error&&<p role="alert" className="nr-error">{error}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}<HandOffNotice result={handed}/>
  <HealthAlert projectId={projectId}/>
  <WaitingStrip tasks={waiting} label={waitingFor}/>
  <KpiCards cards={overview.data?.cards}/>
  <ChangeList state={state}/>
  <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
   <Suggestions rows={suggestions.slice(0,3)} total={suggestions.length} labelOf={row=>handOffLabel(kindOf(row))} busy={busy||generating} convert={row=>void convert(row)} ignore={row=>review(row.card.id,{status:'ignored'})}
    empty={generating?'正在根据最新数据分析，完成后显示在这里。':batch?'今天没有值得做的事。数据变化不明显时，不必为了凑数量行动。':'还没有分析结果，点“更新分析”开始第一次分析。'}/>
   <Effects tasks={effects}/>
  </div>
 </PageContainer>;
}
