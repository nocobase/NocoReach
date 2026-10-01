import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
// Flows (SPEC §6.0), mirrored from plugins/connections/server/execution/flow.ts.
export type StageKind='ai'|'agent'|'review'|'publish'|'observe';
export type ChecklistItem={key:string;label:string;required:boolean};
export type Stage={key:string;name:string;kind:StageKind;instruction?:string;checklist?:ChecklistItem[]};
export type Flow={id:string;name:string;description:string;system?:boolean;version:number;stages:Stage[];updatedAt?:string;copiedFrom?:string};
export type FlowSnapshot={id:string;name:string;version:number;stages:Stage[]};
export type FlowList={revision:number;flows:Flow[]};
export const kindLabels:Record<StageKind,string>={ai:'在线 AI',agent:'本机 Agent',review:'人工审核',publish:'发布',observe:'观察'};
// Who acts in a stage, as shown on the task page and in the editor.
export const executorLabels:Record<StageKind,string>={ai:'在线 AI',agent:'本机 Agent',review:'你',publish:'你确认 · 系统执行',observe:'系统'};
export const producesOutput=(s?:Stage)=>s?.kind==='ai'||s?.kind==='agent';
export function flowRequest<T>(action:'list'|'save'|'copy'|'remove',projectId:number|string,body:object={}){return api.action<T>('nrFlows',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});}
// The label for the next step on an approve button: who takes over after this review.
export function nextLabel(stages:Stage[],index:number){const next=stages[index+1];if(!next)return '通过并完成';if(next.kind==='observe')return '通过并完成';return `通过，交给${executorLabels[next.kind]}`;}
// Mirrors the server rules so the editor can explain problems before saving; the server check is authoritative.
export function flowProblems(stages:Stage[]):string[]{
 const out:string[]=[];if(!stages.length)return ['至少需要一个阶段'];
 if(!producesOutput(stages[0]))out.push('第一个阶段需要由在线 AI 或本机 Agent 产出内容');
 stages.forEach((s,i)=>{if(!s.name.trim())out.push(`第 ${i+1} 个阶段需要名称`);if(producesOutput(s)&&!s.instruction?.trim())out.push(`“${s.name||i+1}”需要写给 AI 的指令`);if(s.kind==='review'&&i>0&&!producesOutput(stages[i-1]))out.push(`“${s.name}”要放在在线 AI 或本机 Agent 阶段之后`);});
 const last=Math.max(...stages.map((s,i)=>producesOutput(s)?i:-1));if(last>=0&&!stages.slice(last+1).some(s=>s.kind==='review'))out.push('最后一个产出内容的阶段之后需要有人审核');
 const agents=stages.some(s=>s.kind==='agent'),n=stages.length,pub=stages.filter(s=>s.kind==='publish').length,obs=stages.filter(s=>s.kind==='observe').length;
 if(agents&&(pub!==1||obs!==1||stages[n-1]?.kind!=='observe'||stages[n-2]?.kind!=='publish'))out.push('修改仓库的流程必须以“发布”“观察”两个系统阶段结束');
 else if(agents&&stages[n-3]?.kind!=='review')out.push('发布前需要有人审核');
 if(!agents&&(pub||obs))out.push('发布和观察只用于包含本机 Agent 修改仓库的流程');
 return [...new Set(out)];
}
