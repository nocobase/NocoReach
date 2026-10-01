import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
// 做法 (SPEC §6.0), mirrored from plugins/connections/server/execution/playbook.ts and flow.ts.
export type StageKind='ai'|'agent'|'review'|'publish'|'observe';
export type ChecklistItem={key:string;label:string;required:boolean};
export type Stage={key:string;name:string;kind:StageKind;instruction?:string;checklist?:ChecklistItem[]};
export type FlowSnapshot={id:string;name:string;version:number;stages:Stage[]};
export type PlaybookKind='plan'|'build';
export type Playbook={id:string;name:string;kind:PlaybookKind;description:string;instructions:string;planFirst?:boolean;checklist:ChecklistItem[];next:string[];system?:boolean;version:number;updatedAt?:string;copiedFrom?:string};
export type PlaybookSnapshot={id:string;name:string;kind:PlaybookKind;version:number;next:string[]};
export type PlaybookList={revision:number;playbooks:Playbook[]};
export const kindLabels:Record<PlaybookKind,string>={plan:'方案类',build:'落地类'};
export const executorOf:Record<PlaybookKind,string>={plan:'在线 AI',build:'本机 Agent'};
export const deliverableOf:Record<PlaybookKind,string>={plan:'交付文档，你接受后完成',build:'交付 PR，合并前你确认'};
export const stageExecutor:Record<StageKind,string>={ai:'在线 AI',agent:'本机 Agent',review:'你',publish:'你确认 · 系统执行',observe:'系统'};
export const producesOutput=(s?:Stage)=>s?.kind==='ai'||s?.kind==='agent';
export function playbookRequest<T>(action:'list'|'save'|'copy'|'remove',projectId:number|string,body:object={}){return api.action<T>('nrPlaybooks',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});}
// Same stage list as the server's stagesFor, for previews before a task starts.
export function stagesFor(p:Pick<Playbook,'kind'|'planFirst'>):Pick<Stage,'key'|'name'|'kind'>[]{
 if(p.kind==='plan')return [{key:'draft',name:'撰写',kind:'ai'},{key:'accept',name:'审核',kind:'review'}];
 const work:Pick<Stage,'key'|'name'|'kind'>[]=[{key:'build',name:'修改并开 PR',kind:'agent'},{key:'review',name:'审核 PR',kind:'review'},{key:'publish',name:'发布',kind:'publish'},{key:'observe',name:'观察',kind:'observe'}];
 return p.planFirst?[{key:'plan',name:'出方案',kind:'agent'},{key:'approve-plan',name:'看方案',kind:'review'},...work]:work;
}
// Same rule as the server's defaultPlaybookId: the actions of the signals an opportunity cites.
export function recommendedPlaybookId(actions:(string|null)[]){if(actions.includes('optimize'))return 'optimize-page';if(actions.includes('create'))return 'content-outline';if(actions.includes('distribute'))return 'release-notes';return actions.length?'change-research':'optimize-page';}
// What a task timeline says for each recorded event.
export function eventText(e:{action:string;note?:string;comment?:string;stageKey?:string},stageName:(key?:string)=>string,executor:string):{who:string;text:string}|null{
 const s=stageName(e.stageKey);
 switch(e.action){
  case 'startTask':return {who:'你',text:`开始任务${e.note?`，做法：${e.note}`:''}`};
  case 'selectPlaybook':return {who:'你',text:`把做法改为“${e.note}”`};
  case 'handoff':return {who:'系统',text:`由“${e.note}”任务交接而来，它交付的文档是这个任务的说明`};
  case 'runQueued':return {who:executor,text:`开始${e.note||'执行'}`};
  case 'runSucceeded':return {who:executor,text:'完成，交付了新版本'};
  case 'runFailed':return {who:'系统',text:`运行没有完成${e.note?`（${e.note}）`:''}，可以重试`};
  case 'flowWaiting':return {who:'系统',text:`下一步没能开始：${e.note}`};
  case 'approveStage':return {who:'你',text:`通过了“${s}”${e.note?`，交给“${e.note}”接着做`:''}`};
  case 'requestStageChanges':return {who:'你',text:`要求修改：${e.comment||''}`};
  case 'editStageOutput':return {who:'你',text:'直接编辑了内容'};
  case 'recordManual':return {who:'你',text:`自己完成了“${s}”并记录`};
  case 'retryStage':return {who:'你',text:`重试“${s}”`};
  case 'confirmPublish':return {who:'你',text:'确认已发布'};
  case 'comment':return {who:'你',text:e.comment||''};
  case 'linkContent':return {who:'你',text:'关联了页面'};
  case 'moveWork':return {who:'你',text:'在看板上移动了任务'};
  default:return null;
 }
}
