import type {ReactElement} from 'react';
import {useNavigate} from 'react-router';
import {ArrowRightIcon} from 'lucide-react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {request} from './service';
import {draftFromOpportunity,type StrategyState} from './model';
import {citedSignals,type Row} from './board';
import {recommendedPlaybookId,type Playbook,type PlaybookKind} from '../playbook-model';
// 交给 Agent (SPEC §5): the opportunity becomes a task and starts at once with the chosen 做法; the person still
// reviews before anything is published. If the start does not go through, the task stays unstarted with its 开始 button.
const work=<T,>(projectId:number,taskId:number,action:string,body:object={})=>api.action<T>('nrTaskWork',action,{method:'POST',body:{projectId:String(projectId),taskId:String(taskId),...body},unwrap:'data'});
export async function handOff(projectId:number,state:StrategyState,row:Row,playbookId?:string):Promise<{state:StrategyState;taskId?:number;started:boolean}>{
 const next=await request<StrategyState>(projectId,'confirmDirection',{...draftFromOpportunity(row.card),insightId:row.card.id,revision:state.revision,requestId:crypto.randomUUID()});
 const taskId=next.proposals.find(p=>p.insight?.id===row.card.id&&p.taskId)?.taskId;
 if(!taskId)return {state:next,started:false};
 try{const d=await work<{work:{revision:number}}>(projectId,taskId,'get');
  await work(projectId,taskId,'advance',{revision:d.work.revision,requestId:crypto.randomUUID(),command:'startTask',...(playbookId?{playbookId}:{})});
  return {state:next,taskId,started:true};}
 catch{return {state:next,taskId,started:false};}
}
// The 做法 the server would pick for this opportunity (same rule as defaultPlaybookId).
export const recommendedFor=(row:Row,playbooks?:Playbook[])=>playbooks?.find(p=>p.id===recommendedPlaybookId(citedSignals(row).map(s=>s.action)));
// Who it goes to: the local Agent changes the site; the online AI writes a document.
export const handOffLabel=(kind?:PlaybookKind)=>kind==='plan'?'交给 AI':'交给 Agent';
export const handOffNote=(kind?:PlaybookKind)=>kind==='plan'?'AI 写好后由你审核':'Agent 先改好，你看过效果才会发布';
export type HandOffResult={text:string;taskId?:number;ok:boolean};
export function handOffResult(row:Row,r:{taskId?:number;started:boolean},kind?:PlaybookKind):HandOffResult{return r.started?{ok:true,text:`已${handOffLabel(kind)}：${row.card.title}`,taskId:r.taskId}:{ok:false,text:`任务已建好，但没能开始：${row.card.title}。到任务页点“开始”即可。`,taskId:r.taskId};}
// One line after handing off, with the way to the task; the page stays so the next opportunity can be decided.
export function HandOffNotice({result}:{result?:HandOffResult}):ReactElement|null{
 const navigate=useNavigate();if(!result)return null;
 return <p role="status" className={result.ok?'nr-success':'nr-error'}>{result.text}{result.taskId&&<button type="button" className="ml-auto inline-flex items-center gap-1 underline-offset-4 hover:underline" onClick={()=>navigate(`/actions/${result.taskId}`)}>查看任务<ArrowRightIcon className="size-3.5"/></button>}</p>;
}
