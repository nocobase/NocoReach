import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
// 做法 (SPEC §6.0), mirrored from plugins/connections/server/execution/playbook.ts and flow.ts.
export type StageKind='ai'|'agent'|'review'|'publish'|'release'|'observe';
export type ChecklistItem={key:string;label:string;required:boolean};
export type Stage={key:string;name:string;kind:StageKind;mode?:'analyze'|'change';instruction?:string;checklist?:ChecklistItem[];skills?:string[]};
export type FlowSnapshot={id:string;name:string;version:number;stages:Stage[]};
// Every step is the Agent's or yours (SPEC §6.0): the Agent analyzes (a document, no repository change) or changes the
// repository; you review. 上线 and 观察 follow by themselves when a step changes the repository. kind is derived.
export type PlaybookKind='plan'|'build';
export type StepKind='analyze'|'change'|'review';
// skills: ids of the Skills an Agent step always uses (see skill-model.ts), at most 5.
export type Step={key:string;name:string;kind:StepKind;instruction?:string;checklist?:ChecklistItem[];skills?:string[]};
export type Category='research'|'create'|'optimize'|'technical';
export const categories:[Category,string][]=[['research','调研分析'],['create','内容创作'],['optimize','内容优化'],['technical','网站技术']];
export const categoryName=(c?:Category)=>categories.find(([k])=>k===c)?.[1]||'其他';
export type Playbook={id:string;name:string;category:Category;description:string;steps:Step[];kind:PlaybookKind;next:string[];system?:boolean;edited?:boolean;version:number;updatedAt?:string;copiedFrom?:string};
export type PlaybookSnapshot={id:string;name:string;kind:PlaybookKind;version:number;next:string[]};
export type PlaybookList={revision:number;playbooks:Playbook[]};
export const stepKinds:Record<StepKind,{name:string;label:string;hint:string}>={analyze:{name:'分析',label:'Agent 分析',hint:'不改仓库，写出一份文档'},change:{name:'修改',label:'Agent 修改',hint:'改仓库、开 PR'},review:{name:'审核',label:'你审核',hint:'看过后通过或要求修改'}};
export const stageExecutor:Record<StageKind,string>={ai:'在线 AI',agent:'本机 Agent',review:'你',publish:'你确认 · 系统执行',release:'自动',observe:'系统'};
export const producesOutput=(s?:Stage)=>s?.kind==='ai'||s?.kind==='agent';
export const readsOnly=(s?:Stage)=>s?.kind==='agent'&&(s.mode==='analyze'||(s.mode===undefined&&s.key==='plan'));
export function playbookRequest<T>(action:'list'|'save'|'copy'|'remove'|'restore'|'draft',projectId:number|string,body:object={}){return api.action<T>('nrPlaybooks',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});}
// Same stage list as the server's stagesFor, for previews before a task starts.
export function stagesFor(p:Pick<Playbook,'steps'>):Stage[]{
 const stages:Stage[]=p.steps.map(s=>s.kind==='review'?{key:s.key,name:s.name,kind:'review',checklist:s.checklist||[]}:{key:s.key,name:s.name,kind:'agent',mode:s.kind,instruction:s.instruction||'',...(s.skills?.length?{skills:s.skills}:{})});
 return p.steps.some(s=>s.kind==='change')?[...stages,{key:'release',name:'上线',kind:'release'},{key:'observe',name:'观察',kind:'observe'}]:stages;
}
// How a step reads in a one-line preview: “Agent 分析”, “你看方案”, “上线”.
export const stageLabel=(s:Stage)=>s.kind==='review'?`你${s.name}`:s.kind==='agent'?`Agent ${s.name}`:s.kind==='ai'?`在线 AI ${s.name}`:s.name;
// Same rule as the server's defaultPlaybookId: the actions of the signals an opportunity cites.
export function recommendedPlaybookId(actions:(string|null)[]){if(actions.includes('optimize'))return 'optimize-page';if(actions.includes('technical'))return 'tech-fix';if(actions.includes('create'))return 'content-outline';if(actions.includes('distribute'))return 'release-notes';return actions.length?'change-research':'optimize-page';}
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
  case 'cancelTask':return {who:'你',text:`关闭了任务，执行停下${e.note?`：${e.note}`:''}`};
  case 'archiveTask':return e.note?{who:'系统',text:`关闭了任务（${e.note}）`}:{who:'你',text:'关闭了任务'};
  case 'unarchiveTask':return {who:'你',text:'重新打开了任务'};
  case 'prClosed':return {who:'本机 Agent',text:`关闭了 ${e.note||'PR'}，分支保留`};
  case 'merged':return {who:'本机 Agent',text:`合并了 ${e.note||'PR'}`};
  case 'live':return {who:'系统',text:`在线上看到了改动，开始观察效果${e.note?`（${e.note}）`:''}`};
  case 'notSeen':return {who:'系统',text:'24 小时内没有在线上看到改动'};
  case 'retryMerge':return {who:'你',text:'重新合并'};
  case 'markMerged':return {who:'你',text:'已在 GitHub 上自己合并'};
  case 'confirmLive':return {who:'你',text:'确认已上线'};
  case 'waitLonger':return {who:'你',text:'再等 24 小时'};
  case 'linkPage':return {who:'你',text:e.note?`关联了页面“${e.note}”`:'取消了关联页面'};
  case 'setOwner':return {who:'你',text:`把负责人改为 ${e.note}`};
  case 'setCollaborators':return {who:'你',text:e.note?`把协作人设为 ${e.note}`:'清空了协作人'};
  case 'moveWork':return {who:'你',text:'在看板上移动了任务'};
  default:return null;
 }
}
