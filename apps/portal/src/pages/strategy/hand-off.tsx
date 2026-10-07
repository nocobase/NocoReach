import { $t } from "@/i18n";
import {useEffect,type ReactElement} from 'react';
import {useNavigate} from 'react-router';
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
// Every task goes to the Agent (SPEC §6.0); what you check depends on whether it changes the site or writes a document.
export const handOffLabel=(_kind?:PlaybookKind)=>$t("交给 Agent");
export const handOffNote=(kind?:PlaybookKind)=>kind==='plan'?$t("Agent 写好后由你审核"):$t("Agent 先改好，你看过效果才会发布");
export type HandOffResult={text:string;taskId?:number;ok:boolean};
export function handOffResult(row:Row,r:{taskId?:number;started:boolean},kind?:PlaybookKind):HandOffResult{return r.started?{ok:true,text:$t("已{0}：{1}",{0:handOffLabel(kind),1:row.card.title}),taskId:r.taskId}:{ok:false,text:$t("任务已建好，但没能开始：{0}。到任务页点“开始”即可。",{0:row.card.title}),taskId:r.taskId};}
// After handing off, the task page opens at once (2026-10-03 user feedback: a banner on the same page is not enough); a
// task that was created but did not start opens too, with its 开始 button. Only a hand-off that made no task stays here.
export function HandOffNotice({result}:{result?:HandOffResult}):ReactElement|null{
 const navigate=useNavigate();
 useEffect(()=>{if(result?.taskId)navigate(`/actions/${result.taskId}`);},[result]);
 if(!result||result.taskId)return null;
 return <p role="status" className={result.ok?'nr-success':'nr-error'}>{result.text}</p>;
}
