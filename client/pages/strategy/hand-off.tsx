import { $t } from "@/i18n";
import {useEffect,type ReactElement} from 'react';
import {useNavigate} from 'react-router';
import {nocobaseClient as api} from "@/lib/nocoreach-api";
import {request} from './service';
import {draftFromOpportunity,type StrategyState} from './model';
import {citedSignals,type Row} from './board';
import {recommendedPlaybookId,type Playbook,type PlaybookKind} from '../playbook-model';
// 交给 Agent (SPEC §5; 2026-10-08 user decision): the opportunity becomes a task that has not started; the task page
// opens, and the person starts it there with 确定开始执行 after reading what the Agent will get. The 做法 chosen here
// is preselected on the task.
// ownerId: the person chosen in 交给谁做 when it is not you (who starts a task owns it otherwise).
export async function handOff(projectId:number,state:StrategyState,row:Row,playbookId?:string,ownerId?:string):Promise<{state:StrategyState;taskId?:number;started:boolean}>{
 const next=await request<StrategyState>(projectId,'confirmDirection',{...draftFromOpportunity(row.card),insightId:row.card.id,...(playbookId?{playbookId}:{}),revision:state.revision,requestId:crypto.randomUUID()});
 const taskId=next.proposals.find(p=>p.insight?.id===row.card.id&&p.taskId)?.taskId;
 if(taskId&&ownerId){const work=<T,>(action:string,body:object={})=>api.action<T>('nrTaskWork',action,{method:'POST',body:{projectId:String(projectId),taskId:String(taskId),...body},unwrap:'data'});
  try{const d=await work<{work:{revision:number}}>('get');await work('advance',{revision:d.work.revision,requestId:crypto.randomUUID(),command:'setOwner',userId:ownerId});}catch{/* the task page still lets you choose */}}
 return {state:next,taskId,started:false};
}
// The 做法 the server would pick for this opportunity (same rule as defaultPlaybookId).
export const recommendedFor=(row:Row,playbooks?:Playbook[])=>playbooks?.find(p=>p.id===recommendedPlaybookId(citedSignals(row).map(s=>s.action)));
// Every task goes to the Agent (SPEC §6.0); what you check depends on whether it changes the site or writes a document.
export const handOffLabel=(_kind?:PlaybookKind)=>$t("交给 Agent");
export const handOffNote=(kind?:PlaybookKind)=>kind==='plan'?$t("Agent 写好后由你审核"):$t("Agent 先改好，你看过效果才会发布");
export type HandOffResult={text:string;taskId?:number;ok:boolean};
export function handOffResult(row:Row,r:{taskId?:number;started:boolean},_kind?:PlaybookKind):HandOffResult{return r.taskId?{ok:true,text:$t("已建好任务：{0}。看过后点“确定开始执行”。",{0:row.card.title}),taskId:r.taskId}:{ok:false,text:$t("没能建好任务：{0}，请稍后重试。",{0:row.card.title})};}
// After handing off, the task page opens at once (2026-10-03 user feedback: a banner on the same page is not enough),
// where the task waits for 确定开始执行. Only a hand-off that made no task stays here.
export function HandOffNotice({result}:{result?:HandOffResult}):ReactElement|null{
 const navigate=useNavigate();
 useEffect(()=>{if(result?.taskId)navigate(`/actions/${result.taskId}`);},[result]);
 if(!result||result.taskId)return null;
 return <p role="status" className={result.ok?'nr-success':'nr-error'}>{result.text}</p>;
}
