import { $t } from "@/i18n";
import {nocobaseClient as api} from "@/lib/nocoreach-api";
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
export const categories:[Category,string][]=[['research',$t("调研分析")],['create',$t("内容创作")],['optimize',$t("内容优化")],['technical',$t("网站技术")]];
export const categoryName=(c?:Category)=>categories.find(([k])=>k===c)?.[1]||$t("其他");
export type Playbook={id:string;name:string;category:Category;description:string;steps:Step[];kind:PlaybookKind;next:string[];system?:boolean;edited?:boolean;version:number;updatedAt?:string;copiedFrom?:string};
export type PlaybookSnapshot={id:string;name:string;kind:PlaybookKind;version:number;next:string[]};
export type PlaybookList={revision:number;playbooks:Playbook[]};
export const stepKinds:Record<StepKind,{name:string;label:string;hint:string}>={analyze:{name:$t("分析"),label:$t("Agent 分析"),hint:$t("不改仓库，写出一份文档")},change:{name:$t("修改"),label:$t("Agent 修改"),hint:$t("改仓库、开 PR")},review:{name:$t("审核"),label:$t("你审核"),hint:$t("看过后通过或要求修改")}};
export const stageExecutor:Record<StageKind,string>={ai:$t("在线 AI"),agent:$t("本机 Agent"),review:$t("你"),publish:$t("你确认 · 系统执行"),release:$t("自动"),observe:$t("系统")};
export const producesOutput=(s?:Stage)=>s?.kind==='ai'||s?.kind==='agent';
export const readsOnly=(s?:Stage)=>s?.kind==='agent'&&(s.mode==='analyze'||(s.mode===undefined&&s.key==='plan'));
// Same rule as the server: an analysis needs no repository when no step of the playbook changes one.
export const withoutRepo=(s:Stage|undefined,stages:Stage[])=>s?.kind==='agent'&&s.mode==='analyze'&&!stages.some(x=>x.kind==='agent'&&!readsOnly(x));
// Built-in playbooks come from the server in Chinese; an unedited one is shown in the UI language (2026-10-07). Edited
// and custom playbooks keep their own words.
const shown=(p:Playbook):Playbook=>p.system&&!p.edited?{...p,name:$t(p.name),description:$t(p.description),steps:p.steps.map(s=>({...s,name:$t(s.name),...(s.instruction?{instruction:$t(s.instruction)}:{}),...(s.checklist?{checklist:s.checklist.map(c=>({...c,label:$t(c.label)}))}:{})}))}:p;
export async function playbookRequest<T>(action:'list'|'save'|'copy'|'remove'|'restore'|'draft',projectId:number|string,body:object={}):Promise<T>{const r=await api.action<T>('nrPlaybooks',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});const list=r as unknown as PlaybookList;return Array.isArray(list?.playbooks)?{...list,playbooks:list.playbooks.map(shown)} as T:r;}
// Same stage list as the server's stagesFor, for previews before a task starts.
export function stagesFor(p:Pick<Playbook,'steps'>):Stage[]{
 const stages:Stage[]=p.steps.map(s=>s.kind==='review'?{key:s.key,name:s.name,kind:'review',checklist:s.checklist||[]}:{key:s.key,name:s.name,kind:'agent',mode:s.kind,instruction:s.instruction||'',...(s.skills?.length?{skills:s.skills}:{})});
 return p.steps.some(s=>s.kind==='change')?[...stages,{key:'release',name:$t("上线"),kind:'release'},{key:'observe',name:$t("观察"),kind:'observe'}]:stages;
}
// How a step reads in a one-line preview: “Agent 分析”, “你看方案”, “上线”.
export const stageLabel=(s:Stage)=>s.kind==='review'?$t("你{0}",{0:$t(s.name)}):s.kind==='agent'?`Agent ${$t(s.name)}`:s.kind==='ai'?$t("在线 AI {0}",{0:$t(s.name)}):$t(s.name);
// Same rule as the server's defaultPlaybookId: the actions of the signals an opportunity cites.
export function recommendedPlaybookId(actions:(string|null)[]){if(actions.includes('optimize'))return 'optimize-page';if(actions.includes('technical'))return 'tech-fix';if(actions.includes('reply'))return 'community-reply';if(actions.includes('create'))return 'content-outline';if(actions.includes('distribute'))return 'release-notes';return actions.length?'change-research':'optimize-page';}
// What a task timeline says for each recorded event.
export function eventText(e:{action:string;note?:string;comment?:string;stageKey?:string},stageName:(key?:string)=>string,executor:string):{who:string;text:string}|null{
 const s=$t(stageName(e.stageKey));
 switch(e.action){
  case 'startTask':return {who:$t("你"),text:$t("开始任务{0}",{0:e.note?$t("，做法：{0}",{0:$t(e.note)}):''})};
  case 'selectPlaybook':return {who:$t("你"),text:$t("把做法改为“{0}”",{0:$t(e.note||"")})};
  case 'handoff':return {who:$t("系统"),text:$t("由“{0}”任务交接而来，它交付的文档是这个任务的说明",{0:$t(e.note||"")})};
  case 'runQueued':return {who:executor,text:$t("开始{0}",{0:$t(e.note||$t("执行"))})};
  case 'runSucceeded':return {who:executor,text:$t("完成，交付了新版本")};
  case 'runFailed':return {who:$t("系统"),text:$t("运行没有完成{0}，可以重试",{0:e.note?`（${$t(e.note)}）`:''})};
  case 'flowWaiting':return {who:$t("系统"),text:$t("下一步没能开始：{0}",{0:$t(e.note||"")})};
  case 'approveStage':return {who:$t("你"),text:$t("通过了“{0}”{1}",{0:s,1:e.note?$t("，交给“{0}”接着做",{0:$t(e.note)}):''})};
  case 'requestStageChanges':return {who:$t("你"),text:$t("要求修改：{0}",{0:e.comment||''})};
  case 'editStageOutput':return {who:$t("你"),text:$t("直接编辑了内容")};
  case 'recordManual':return {who:$t("你"),text:$t("自己完成了“{0}”并记录",{0:s})};
  case 'retryStage':return {who:$t("你"),text:$t("重试“{0}”",{0:s})};
  case 'confirmPublish':return {who:$t("你"),text:$t("确认已发布")};
  case 'comment':return {who:$t("你"),text:e.comment||''};
  case 'linkContent':return {who:$t("你"),text:$t("关联了页面")};
  case 'cancelTask':return {who:$t("你"),text:$t("关闭了任务，执行停下{0}",{0:e.note?`：${$t(e.note)}`:''})};
  case 'archiveTask':return e.note?{who:$t("系统"),text:$t("关闭了任务（{0}）",{0:$t(e.note)})}:{who:$t("你"),text:$t("关闭了任务")};
  case 'unarchiveTask':return {who:$t("你"),text:$t("重新打开了任务")};
  case 'prClosed':return {who:$t("本机 Agent"),text:$t("关闭了 {0}，分支保留",{0:e.note||'PR'})};
  case 'merged':return {who:$t("本机 Agent"),text:$t("合并了 {0}",{0:e.note||'PR'})};
  case 'revertRelease':return {who:$t("你"),text:$t("撤回 {0}",{0:e.note||$t("这次改动")})};
  case 'revertOpened':return {who:$t("本机 Agent"),text:$t("开了回退 {0}，在 GitHub 合并后生效",{0:e.note||'PR'})};
  case 'live':return {who:$t("系统"),text:$t("在线上看到了改动，开始观察效果{0}",{0:e.note?`（${$t(e.note)}）`:''})};
  case 'notSeen':return {who:$t("系统"),text:$t("24 小时内没有在线上看到改动")};
  case 'retryMerge':return {who:$t("你"),text:$t("重新合并")};
  case 'markMerged':return {who:$t("你"),text:$t("已在 GitHub 上自己合并")};
  case 'confirmLive':return {who:$t("你"),text:$t("确认已上线")};
  case 'waitLonger':return {who:$t("你"),text:$t("再等 24 小时")};
  case 'linkPage':return {who:$t("你"),text:e.note?$t("关联了页面“{0}”",{0:e.note}):$t("取消了关联页面")};
  case 'setOwner':return {who:$t("你"),text:$t("把负责人改为 {0}",{0:e.note})};
  case 'setCollaborators':return {who:$t("你"),text:e.note?$t("把协作人设为 {0}",{0:e.note}):$t("清空了协作人")};
  case 'moveWork':return {who:$t("你"),text:$t("在看板上移动了任务")};
  default:return null;
 }
}
