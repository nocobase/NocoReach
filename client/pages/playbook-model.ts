import { $t, $legacyText, getCurrentLocale } from "#i18n";
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {formatDate,formatDateTime} from '#lib/format';
import {playbookForActions} from '../../shared/opportunity-parts.js';
import {SYSTEM_PLAYBOOKS} from '../../shared/playbook-catalog.js';
import {inPlaceLocales} from '../../shared/article-publishing.js';
import {localeName} from './article-targets-api';
// 做法 (SPEC §6.0), mirrored from plugins/connections/server/execution/playbook.ts and flow.ts.
export type StageKind='agent'|'review'|'publish'|'release'|'observe';
export type ChecklistItem={key:string;label:string;required:boolean};
export type Stage={key:string;name:string;kind:StageKind;mode?:'analyze'|'change';instruction?:string;checklist?:ChecklistItem[];skills?:string[]};
export type FlowSnapshot={id:string;name:string;version:number;system?:boolean;edited?:boolean;stages:Stage[]};
// Every step is the Agent's or yours (SPEC §6.0): the Agent analyzes (a document, no repository change) or changes the
// repository; you review. 上线 and 观察 follow by themselves when a step changes the repository. kind is derived.
export type PlaybookKind='plan'|'build';
export type StepKind='analyze'|'change'|'review';
// skills: ids of the Skills an Agent step always uses (see skill-model.ts), at most 5.
export type Step={key:string;name:string;kind:StepKind;instruction?:string;checklist?:ChecklistItem[];skills?:string[]};
export type Category='research'|'create'|'optimize'|'technical';
export const getCategories = (): [Category,string][] => ([['research',$t('common.researchAnalysis')],['create',$t('playbook.contentCreation')],['optimize',$t('playbook.contentOptimization')],['technical',$t('playbook.websiteTechnical')]]);
export const categoryName=(c?:Category)=>getCategories().find(([k])=>k===c)?.[1]||$t('common.other');
export type Playbook={id:string;name:string;category:Category;description:string;steps:Step[];kind:PlaybookKind;next:string[];system?:boolean;edited?:boolean;version:number;updatedAt?:string;copiedFrom?:string};
export type PlaybookSnapshot={id:string;name:string;kind:PlaybookKind;version:number;next:string[];system?:boolean;edited?:boolean};
export type PlaybookList={revision:number;playbooks:Playbook[]};
export const getStepKinds = (): Record<StepKind,{name:string;label:string;hint:string}> => ({analyze:{name:$t('common.analyze'),label:$t('playbook.agentAnalysis'),hint:$t('playbook.writesDocumentWithoutChangingRepository')},change:{name:$t('common.modify'),label:$t('playbook.agentChange'),hint:$t('playbook.changesRepositoryOpensPr')},review:{name:$t('common.review'),label:$t('playbook.review'),hint:$t('playbook.approveRequestChangesAfterReviewing')}});
export const getStageExecutor = (): Record<StageKind,string> => ({agent:$t('common.localAgent'),review:$t('common.you'),publish:$t('playbook.confirmSystemRuns'),release:$t('playbook.automatic'),observe:$t('common.system')});
export const producesOutput=(s?:Stage)=>s?.kind==='agent';
export const readsOnly=(s?:Stage)=>s?.kind==='agent'&&(s.mode==='analyze'||(s.mode===undefined&&s.key==='plan'));
// Same rule as the server: an analysis needs no repository when no step of the playbook changes one.
export const withoutRepo=(s:Stage|undefined,stages:Stage[])=>s?.kind==='agent'&&s.mode==='analyze'&&!stages.some(x=>x.kind==='agent'&&!readsOnly(x));
// Built-in playbooks come from the server in Chinese; an unedited one is shown in the UI language (2026-10-07). Edited
// and custom playbooks keep their own words.
export const localizePlaybook=(p:Playbook):Playbook=>p.system&&!p.edited?{...p,name:$legacyText(p.name),description:$legacyText(p.description),steps:p.steps.map(s=>({...s,name:$legacyText(s.name),...(s.instruction?{instruction:$legacyText(s.instruction)}:{}),...(s.checklist?{checklist:s.checklist.map(c=>({...c,label:$legacyText(c.label)}))}:{})}))}:p;
// Keep stored responses in their original language. Translate only the display copy; an open editor keeps its own draft.
// A playbook named by its id: from the project's list, else the built-in's own name while the list loads, never the
// id itself (2026-10-28: Studio showed "Accept and start optimize-page" before the list arrived). Empty when unknown.
export const playbookNameOf=(id:string,list?:{playbooks:{id:string;name:string}[]}):string=>{
 const own=list?.playbooks.find(p=>p.id===id)?.name;if(own)return own;
 const builtIn=SYSTEM_PLAYBOOKS.find(p=>p.id===id);return builtIn?$legacyText(builtIn.name):'';
};
export const localizePlaybookList = (list?: PlaybookList): PlaybookList | undefined => list && ({...list, playbooks:list.playbooks.map(localizePlaybook)});
export async function playbookRequest<T>(action:'list'|'save'|'copy'|'remove'|'restore'|'draft',projectId:number|string,body:object={}):Promise<T>{return api.action<T>('nrPlaybooks',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});}

// Same stage list as the server's stagesFor, for previews before a task starts.
export function stagesFor(p:Pick<Playbook,'steps'>):Stage[]{
 const stages:Stage[]=p.steps.map(s=>s.kind==='review'?{key:s.key,name:s.name,kind:'review',checklist:s.checklist||[]}:{key:s.key,name:s.name,kind:'agent',mode:s.kind,instruction:s.instruction||'',...(s.skills?.length?{skills:s.skills}:{})});
 return p.steps.some(s=>s.kind==='change')?[...stages,{key:'release',name:$t('common.live'),kind:'release'},{key:'observe',name:$t('common.watch'),kind:'observe'}]:stages;
}
// How a step reads in a one-line preview: “Agent 分析”, “你看方案”, “发布上线”. The release step is named by the interface,
// not by its stored name (Publish since 2026-10-24, so the step after Review says what the system does).
// While an article's other languages are translated from its approved primary one (2026-10-24), the Agent's step the
// task went back to is named Translate wherever the current step is named: the step tags, Tasks and Tasks › By Agent.
// It is Update other languages when the article already has some of them and they get the primary's changes in place
// (2026-10-28).
type StepWork={flow?:{stages:Stage[]};stageIndex?:number;stage?:string;release?:unknown;delivery?:{articleId?:string|null;locales?:string[];translateFrom?:{published?:boolean}|null};article?:{locales?:string[]}};
export const translatingStage=(s:Stage,w?:StepWork)=>Boolean(w?.delivery?.translateFrom&&!w.release&&w.stage!=='done'&&s.kind==='agent'&&w.flow?.stages[w.stageIndex||0]?.key===s.key);
export const stageName=(s:Stage,w?:StepWork)=>translatingStage(s,w)?$t(inPlaceLocales(w!.delivery,w!.article?.locales).length?'articleTask.updateStep':'articleTask.translateStep'):s.kind==='release'?$t('playbook.publishStage'):s.kind==='observe'?$t('common.watch'):s.name;
export const stageLabel=(s:Stage,w?:StepWork)=>s.kind==='review'?$t('common.yourAction',{0:stageName(s)}):s.kind==='agent'?`Agent ${stageName(s,w)}`:stageName(s);
// Same rule as the server's defaultPlaybookId: the actions of the signals an opportunity cites.
export const recommendedPlaybookId=(actions:(string|null)[])=>playbookForActions(actions);
// What a task timeline says for each recorded event.
export function eventText(e:{at?:string;action:string;note?:string;comment?:string;stageKey?:string},stageName:(key?:string)=>string,executor:string,snooze?:{at:string;until:string}|null):{who:string;text:string}|null{
 const s=stageName(e.stageKey);
 const snoozeTime=()=>snooze&&snooze.at===e.at?formatDateTime(snooze.until):formatDate(e.note);
 switch(e.action){
  case 'startTask':return {who:$t('common.you'),text:$t('playbook.startedTask',{0:e.note?$t('playbook.playbook',{0:e.note}):''})};
  // An automatic title that followed the playbook chosen before the start (server task-title.ts).
  case 'retitle':return {who:$t('common.system'),text:$t('playbook.retitled',{0:e.note||''})};
  case 'selectPlaybook':return {who:$t('common.you'),text:$t('playbook.changedPlaybook',{0:(e.note||"")})};
  // Snooze (2026-10-28, server execution/snooze.ts): the day and what it waits for, a new day, ended by hand, by acting
  // on the task, or come back on its day.
  case 'snoozeTask':return {who:$t('common.you'),text:e.comment?$t('playbook.snoozedBecause',{0:snoozeTime(),1:e.comment}):$t('playbook.snoozed',{0:snoozeTime()})};
  case 'snoozeChanged':return {who:$t('common.you'),text:e.comment?$t('playbook.snoozeChangedBecause',{0:snoozeTime(),1:e.comment}):$t('playbook.snoozeChanged',{0:snoozeTime()})};
  case 'unsnoozeTask':return {who:$t('common.you'),text:$t('playbook.unsnoozed')};
  case 'snoozeEnded':return {who:$t('common.you'),text:$t('playbook.snoozeEnded')};
  case 'snoozeDue':return {who:$t('common.system'),text:$t('playbook.snoozeDue')};
  case 'handoff':return {who:$t('common.system'),text:$t('playbook.handedOverTaskDocumentDelivered',{0:(e.note||"")})};
  case 'runQueued':return {who:executor,text:$t('playbook.started',{0:(e.note||$t('common.run'))})};
  case 'runSucceeded':return {who:executor,text:$t('playbook.finishedDeliveredNewVersion')};
  case 'runFailed':return {who:$t('common.system'),text:$t('playbook.runNotCompleteRetried',{0:e.note?`（${$legacyText(e.note)}）`:''})};
  case 'flowWaiting':return {who:$t('common.system'),text:$t('playbook.nextStepNotStart',{0:$legacyText(e.note||"")})};
  // A primary language approved before its translation (2026-10-24) says so instead of handing over.
  case 'approveStage':return {who:$t('common.you'),text:e.note==='translate'?$t('articleTask.approvedPrimary'):e.note==='update'?$t('articleTask.approvedPrimaryUpdate'):$t('playbook.approved',{0:s,1:e.note?$t('playbook.handedContinue',{0:e.note}):''})};
  case 'requestStageChanges':return {who:$t('common.you'),text:$t('playbook.requestedChanges',{0:e.comment||''})};
  // Another primary language before it was approved (2026-10-30): the step wrote a new version in it.
  case 'changePrimary':return {who:$t('common.you'),text:$t('playbook.primaryChanged',{0:localeName(e.note||'',getCurrentLocale())})};
  case 'editStageOutput':return {who:$t('common.you'),text:$t('playbook.editedContentDirectly')};
  case 'recordManual':return {who:$t('common.you'),text:$t('playbook.finishedThemselvesRecorded',{0:s})};
  // The system starts a step again once after NocoReach restarted under it (retryAfterRestart on the server).
  case 'retryStage':return e.note==='serverRestart'?{who:$t('common.system'),text:$t('playbook.retriedAfterRestart',{0:s})}:{who:$t('common.you'),text:$t('playbook.retried',{0:s})};
  case 'confirmPublish':return {who:$t('common.you'),text:$t('common.confirmedPublished')};
  case 'comment':return {who:$t('common.you'),text:e.comment||''};
  case 'linkContent':return {who:$t('common.you'),text:$t('playbook.linkedPage')};
  case 'cancelTask':return {who:$t('common.you'),text:$t('playbook.closedTaskStoppedRun',{0:e.note?`：${$legacyText(e.note)}`:''})};
  case 'archiveTask':return e.note?{who:$t('common.system'),text:$t('playbook.closedTaskValue',{0:$legacyText(e.note)})}:{who:$t('common.you'),text:$t('playbook.closedTask')};
  case 'unarchiveTask':return {who:$t('common.you'),text:$t('playbook.reopenedTask')};
  case 'prClosed':return {who:$t('common.localAgent'),text:$t('playbook.closedBranchKept',{0:e.note||'PR'})};
  case 'merged':return {who:$t('common.localAgent'),text:$t('playbook.merged',{0:e.note||'PR'})};
  case 'revertRelease':return {who:$t('common.you'),text:$t('playbook.reverted',{0:e.note||$t('playbook.change')})};
  case 'revertOpened':return {who:$t('common.localAgent'),text:$t('playbook.openedRevertTakesEffectOnce',{0:e.note||'PR'})};
  case 'simulatedRelease':return {who:$t('common.system'),text:$t('taskDetail.simulatedRelease')};
  case 'live':return {who:$t('common.system'),text:$t('playbook.sawChangeLiveStartedTracking',{0:e.note?`（${$legacyText(e.note)}）`:''})};
  case 'notSeen':return {who:$t('common.system'),text:$t('playbook.changeNotSeenLiveWithin')};
  case 'retryMerge':return {who:$t('common.you'),text:$t('common.mergeAgain')};
  case 'markMerged':return {who:$t('common.you'),text:$t('playbook.mergedGithubThemselves')};
  case 'confirmLive':return {who:$t('common.you'),text:$t('common.confirmedLive')};
  case 'waitLonger':return {who:$t('common.you'),text:$t('common.waitAnother24Hours')};
  case 'linkPage':return {who:$t('common.you'),text:e.note?$t('playbook.linkedPageValue',{0:e.note}):$t('playbook.unlinkedPage')};
  case 'setAgent':return {who:$t('common.you'),text:e.note?$t('playbook.changedExecutionAgent',{0:e.note}):$t('playbook.switchedDefaultProjectAgent')};
  case 'setOwner':return {who:$t('common.you'),text:$t('playbook.changedOwner',{0:e.note})};
  case 'setCollaborators':return {who:$t('common.you'),text:e.note?$t('playbook.setCollaborators',{0:e.note}):$t('playbook.clearedCollaborators')};
  case 'moveWork':return {who:$t('common.you'),text:$t('playbook.movedTaskBoard')};
  // Article delivery (article-flow.ts).
  case 'linkArticle':return {who:$t('common.you'),text:$t('taskDetail.eventLinkArticle')};
  case 'editArticleDraft':return {who:$t('common.you'),text:$t('taskDetail.eventEditArticleDraft')};
  case 'retryPublish':return {who:$t('common.you'),text:$t('taskDetail.eventRetryPublish')};
  case 'rebaseArticle':return {who:$t('common.you'),text:$t('taskDetail.eventRebaseArticle')};
  case 'articlePublished':return {who:$t('common.system'),text:$t('taskDetail.eventArticlePublished')};
  case 'articleConflict':return {who:$t('common.system'),text:$t('taskDetail.eventArticleConflict')};
  case 'articlePublishFailed':return {who:$t('common.system'),text:$t('taskDetail.eventArticlePublishFailed')};
  case 'articleExported':return {who:$t('common.system'),text:$t('taskDetail.eventArticleExported')};
  case 'articleExportLate':return {who:$t('common.system'),text:$t('taskDetail.eventArticleExportLate')};
  case 'articleDrift':return {who:$t('common.system'),text:$t('taskDetail.eventArticleDrift')};
  default:return null;
 }
}
